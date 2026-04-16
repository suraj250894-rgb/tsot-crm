'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import LotCard from '@/components/LotCard';
import DeleteLotModal from '@/components/DeleteLotModal';
import { PackageCheck, Loader2, RefreshCw, Inbox } from 'lucide-react';
import { format, parseISO } from 'date-fns';
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
          id, lot_name, status, upload_date, total_orders, label_pdf_url, created_at,
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

  // Group lots by calendar date (newest first — query already orders by created_at desc)
  const dateGroupMap = new Map();
  for (const lot of lots) {
    const dateKey = lot.created_at
      ? format(parseISO(lot.created_at), 'd MMM yyyy')
      : 'Unknown Date';
    if (!dateGroupMap.has(dateKey)) dateGroupMap.set(dateKey, []);
    dateGroupMap.get(dateKey).push(lot);
  }
  const dateGroups = [...dateGroupMap.entries()]; // [[dateKey, [lot, ...]], ...]

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
      ) : lots.length === 0 ? (
        <div className="card p-10 text-center text-stone-400">
          <Inbox className="w-10 h-10 mx-auto mb-3 text-tea-200" />
          <p className="font-medium">No lots yet</p>
          <p className="text-sm mt-1">Upload invoice PDFs to create a picking lot.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {dateGroups.map(([dateKey, dateLots]) => {
            const totalLots      = dateLots.length;
            const pendingLots    = dateLots.filter((l) => l.status !== 'dispatched').length;
            const dispatchedLots = dateLots.filter((l) => l.status === 'dispatched').length;
            const totalOrders    = dateLots.reduce((s, l) => s + (l.total_orders || 0), 0);

            return (
              <section key={dateKey}>
                {/* Date header */}
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-sm font-semibold text-tea-800">{dateKey}</h2>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-tea-100 text-tea-700 font-medium">
                      {totalLots} lot{totalLots !== 1 ? 's' : ''}
                    </span>
                    {pendingLots > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                        {pendingLots} pending
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 font-medium">
                      {totalOrders} orders
                    </span>
                    {dispatchedLots > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                        {dispatchedLots} dispatched
                      </span>
                    )}
                  </div>
                  <div className="flex-1 h-px bg-tea-100" />
                </div>

                {/* Lot cards — horizontal flow */}
                <div className="flex flex-wrap gap-4">
                  {dateLots.map((lot) => (
                    <div key={lot.id} className={lot.status === 'dispatched' ? 'opacity-50' : ''}>
                      <LotCard lot={lot} onDelete={lot.status !== 'dispatched' ? setDeleteLot : undefined} />
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
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
