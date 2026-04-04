'use client';

import { useState, useRef } from 'react';
import { Upload, CheckCircle2, AlertCircle, Loader2, FileJson, X } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export default function CatalogUploader({ onUploaded }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null); // { total, valid, sample[] }
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFile = async (f) => {
    if (!f || !f.name.endsWith('.json')) {
      toast.error('Please upload a .json file');
      return;
    }
    setFile(f);
    setPreview(null);

    // Parse and preview
    try {
      const text = await f.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('File must be a JSON array');
      const valid = data.filter((p) => p && (p.n || p.title) && (p.i || p.image));
      setPreview({
        total: data.length,
        valid: valid.length,
        sample: valid.slice(0, 3),
      });
    } catch (err) {
      toast.error('Invalid JSON: ' + err.message);
      setFile(null);
    }
  };

  const handleUpload = async () => {
    if (!file || !preview) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/catalog', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      toast.success(`Catalog updated — ${json.productCount} products saved`);
      onUploaded?.(json);
      setFile(null);
      setPreview(null);
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
          dragging
            ? 'border-tea-400 bg-tea-50'
            : 'border-tea-200 hover:border-tea-300 hover:bg-tea-50/50'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />
        <FileJson className="w-10 h-10 text-tea-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-stone-600">Drop catalog.json here</p>
        <p className="text-xs text-stone-400 mt-1">
          Must be an array of products with n/title and i/image fields
        </p>
      </div>

      {/* Preview */}
      {file && preview && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileJson className="w-4 h-4 text-tea-500" />
              <span className="text-sm font-medium text-tea-800">{file.name}</span>
            </div>
            <button onClick={() => { setFile(null); setPreview(null); }} className="text-stone-400 hover:text-stone-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-tea-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-tea-700">{preview.total}</div>
              <div className="text-xs text-stone-500 mt-0.5">Total Products</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-brand-success">{preview.valid}</div>
              <div className="text-xs text-stone-500 mt-0.5">Valid Products</div>
            </div>
          </div>

          {preview.valid !== preview.total && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {preview.total - preview.valid} products missing name or image URL
            </div>
          )}

          {preview.sample.length > 0 && (
            <div>
              <p className="text-xs text-stone-400 mb-2">Sample products:</p>
              <ul className="space-y-1">
                {preview.sample.map((p, i) => (
                  <li key={i} className="text-xs text-stone-600 flex items-center gap-2">
                    {(p.i || p.image) && (
                      <img src={p.i || p.image} alt="" className="w-8 h-8 rounded object-cover border border-tea-100" />
                    )}
                    <span className="truncate">{p.n || p.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={uploading || preview.valid === 0}
            className="btn-primary w-full justify-center"
          >
            {uploading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
              : <><CheckCircle2 className="w-4 h-4" /> Save {preview.valid} Products to Catalog</>}
          </button>
        </div>
      )}
    </div>
  );
}
