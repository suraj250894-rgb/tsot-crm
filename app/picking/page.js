'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import LotCard from '@/components/LotCard';
import DeleteLotModal from '@/components/DeleteLotModal';
import { PackageCheck, Loader2, RefreshCw, Inbox } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PickingPage() {
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteLot, setDeleteLot] = useState(null);

  const fetchLots = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('invoice_lots')
        .select(`
          id, lot_name, status, upload_date, total_orders, label_pdf_url,
          delivery_partner:delivery_partners(name),
          orders(id, picking_status)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const enriched = (data || []).map((lot) => ({
        ...lot,
        picked_orders: (lot.orders || []).filter((o) => o.picking_status === 'picked').length,
        total_orders: lot.total_orders || (lot.orders || []).length,
      }));
      setLots(enriched);
    } catch {
      toast.error('Failed to load lots');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLots(); }, [fetchLots]);

  useEffect(() => {
    const channel = supabase
      .channel('picking-lots-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoice_lots' }, fetchLots)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchLots)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchLots]);

  const activeLots = lots.filter((l) => l.status !== 'dispatched');
  const doneLots = lots.filter((l) => l.status === 'dispatched');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <PackageCheck className="w-5 h-5 text-tea-500" />
          <h1 className="page-heading">Picking</h1>
        </div>
        <button onClick={fetchLots} className="btn-secondary text-sm min-h-[44px]">
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-tea-400" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Active lots */}
          <section>
            <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-3">
              Active ({activeLots.length})
            </h2>
            {activeLots.length === 0 ? (
              <div className="card p-10 text-center text-stone-400">
                <Inbox className="w-10 h-10 mx-auto mb-3 text-tea-200" />
                <p className="font-medium">No active lots</p>
                <p className="text-sm mt-1">Upload invoice PDFs to create a picking lot.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeLots.map((lot) => (
                  <LotCard key={lot.id} lot={lot} onDelete={setDeleteLot} />
                ))}
              </div>
            )}
          </section>

          {/* Dispatched lots */}
          {doneLots.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-stone-300 uppercase tracking-widest mb-3">
                Dispatched ({doneLots.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-50">
                {doneLots.map((lot) => (
                  <LotCard key={lot.id} lot={lot} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {deleteLot && (
        <DeleteLotModal
          lot={deleteLot}
          onClose={() => setDeleteLot(null)}
          onDeleted={fetchLots}
        />
      )}
    </div>
  );
}
