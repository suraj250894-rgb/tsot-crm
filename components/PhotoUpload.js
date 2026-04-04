'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/image-utils';
import { Camera, Upload, Loader2, CheckCircle2, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PhotoUpload({ orderId, existingUrl, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(existingUrl || null);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const path = `${orderId}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('packing-photos')
        .upload(path, compressed, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('packing-photos').getPublicUrl(path);

      const { error: updateError } = await supabase
        .from('orders')
        .update({ packing_photo_url: publicUrl })
        .eq('id', orderId);
      if (updateError) throw updateError;

      setPreview(publicUrl);
      onUploaded?.(publicUrl);
      toast.success('Packing photo uploaded!');
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    const { error } = await supabase.from('orders').update({ packing_photo_url: null }).eq('id', orderId);
    if (error) { toast.error('Failed to remove photo'); return; }
    setPreview(null);
    onUploaded?.(null);
    toast.success('Photo removed');
  };

  if (preview) {
    return (
      <div className="relative inline-block">
        <a href={preview} target="_blank" rel="noreferrer">
          <Image
            src={preview}
            alt="Packing proof"
            width={80}
            height={80}
            className="rounded-lg object-cover border-2 border-green-300"
          />
          <CheckCircle2 className="absolute -top-2 -right-2 w-5 h-5 text-green-500 bg-white rounded-full" />
        </a>
        <button
          onClick={removePhoto}
          className="absolute -bottom-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {/* Camera capture (mobile) */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files[0])}
      />
      {/* File picker */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files[0])}
      />

      <button
        onClick={() => cameraRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1.5 bg-tea-600 text-white text-xs px-3 py-2 rounded-lg hover:bg-tea-700 disabled:opacity-50"
      >
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
        Photo
      </button>

      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1.5 bg-white border border-stone-300 text-stone-700 text-xs px-3 py-2 rounded-lg hover:bg-stone-50 disabled:opacity-50"
      >
        <Upload className="w-4 h-4" />
        Upload
      </button>
    </div>
  );
}
