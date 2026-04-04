'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Trash2, Loader2, AlertTriangle, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DeleteLotModal({ lot, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);

  if (!lot) return null;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // 1. Get all order IDs in this lot (to delete storage photos)
      const { data: orders } = await supabase
        .from('orders')
        .select('id, packing_photo_url')
        .eq('lot_id', lot.id);

      // 2. Delete packing photos from storage
      const photoKeys = (orders || [])
        .filter((o) => o.packing_photo_url)
        .map((o) => {
          // Extract path from URL: .../storage/v1/object/public/packing-photos/{path}
          const match = o.packing_photo_url.match(/packing-photos\/(.+)$/);
          return match ? match[1] : null;
        })
        .filter(Boolean);

      if (photoKeys.length > 0) {
        await supabase.storage.from('packing-photos').remove(photoKeys);
      }

      // 3. Delete order_items (cascade would handle this but being explicit)
      if (orders?.length) {
        const orderIds = orders.map((o) => o.id);
        await supabase.from('order_items').delete().in('order_id', orderIds);
        await supabase.from('order_comments').delete().in('order_id', orderIds);
        await supabase.from('orders').delete().in('id', orderIds);
      }

      // 4. Delete the lot
      const { error } = await supabase.from('invoice_lots').delete().eq('id', lot.id);
      if (error) throw error;

      toast.success('Lot deleted successfully');
      onDeleted?.();
      onClose();
    } catch (err) {
      toast.error('Delete failed: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const orderCount = lot.total_orders || 0;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-warm-lg w-full max-w-sm p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon + header */}
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
            <Trash2 className="w-7 h-7 text-brand-error" />
          </div>
          <h3 className="font-serif text-xl text-tea-800">Delete Lot?</h3>
          <p className="text-sm text-stone-500 mt-2 leading-relaxed">
            This will permanently remove{' '}
            <strong className="text-tea-800">{lot.lot_name}</strong>
            {' '}including{' '}
            <strong>{orderCount} order{orderCount !== 1 ? 's' : ''}</strong>
            {' '}and all their items. Packing photos will also be deleted.
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">This action cannot be undone.</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={deleting}
            className="btn-secondary flex-1"
          >
            <X className="w-4 h-4" /> Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="btn-danger flex-1"
          >
            {deleting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</>
              : <><Trash2 className="w-4 h-4" /> Delete Lot</>}
          </button>
        </div>
      </div>
    </div>
  );
}
