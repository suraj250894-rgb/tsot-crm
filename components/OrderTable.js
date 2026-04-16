'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import DeleteLotModal from '@/components/DeleteLotModal';
import { CommentsModal, CommentsBadge } from '@/components/OrderComments';
import {
  Search, Download, ChevronUp, ChevronDown,
  ChevronLeft, ChevronRight, ImageOff, RefreshCw,
  ExternalLink, Trash2, Clock, AlertCircle, FileText, XCircle, Pencil
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const PAGE_SIZE = 50;

function fmtRupees(val) {
  if (val == null) return '—';
  return '₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(val) {
  if (!val) return '—';
  try { return format(parseISO(val), 'd MMM yy'); } catch { return val; }
}
function isPendingDispatch(o) {
  return o.picking_status === 'picked' && !o.courier_picked_up;
}

function getDisplayStatus(o) {
  if (o.courier_picked_up) return 'dispatched';
  if (o.is_packed) return 'packed';
  if (isPendingDispatch(o)) return 'dispatch_pending';
  const items = o.order_items || [];
  if (items.length === 0) return o.picking_status === 'picked' ? 'picked' : 'pending';
  const statuses = items.map((i) => i.item_status || 'pending');
  if (statuses.every((s) => s === 'picked')) return 'picked';
  if (statuses.some((s) => s === 'not_found')) return 'not_found';
  if (statuses.some((s) => s === 'picked')) return 'picking';
  return 'pending';
}

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <ChevronUp className="w-3 h-3 opacity-25" />;
  return sortDir === 'asc'
    ? <ChevronUp className="w-3 h-3 text-tea-400" />
    : <ChevronDown className="w-3 h-3 text-tea-400" />;
}

export default function OrderTable() {
  const [orders, setOrders] = useState([]);
  const [lots, setLots] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [filterLot, setFilterLot] = useState('');
  const [filterPartner, setFilterPartner] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Sorting
  const [sortCol, setSortCol] = useState('invoice_date');
  const [sortDir, setSortDir] = useState('desc');

  // Stats
  const [stats, setStats] = useState({ total: 0, pending: 0, picked: 0, dispatched: 0, pendingDispatch: 0, revenue: 0 });

  // Modals
  const [photoModal, setPhotoModal] = useState(null);
  const [deleteLot, setDeleteLot] = useState(null); // { id, lot_name, total_orders }
  const [commentsModal, setCommentsModal] = useState(null); // { orderId, label }
  const [editBarcode, setEditBarcode] = useState(null); // { orderId, value }

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('orders')
        .select(`
          id, invoice_no, invoice_date, customer_name, customer_city,
          total_amount, picking_status, courier_picked_up, is_packed,
          packing_photo_url, invoice_pdf_url, label_pdf_url, courier_barcode, notes,
          lot:invoice_lots(id, lot_name, status, label_pdf_url, delivery_partner:delivery_partners(name)),
          comment_count:order_comments(count),
          order_items(item_status)
        `, { count: 'exact' });

      if (search) {
        q = q.or(`customer_name.ilike.%${search}%,invoice_no.ilike.%${search}%,customer_city.ilike.%${search}%`);
      }
      if (filterLot) q = q.eq('lot_id', filterLot);
      if (filterStatus === 'pending')          q = q.eq('picking_status', 'pending');
      if (filterStatus === 'picked')           q = q.eq('picking_status', 'picked').eq('courier_picked_up', false);
      if (filterStatus === 'dispatched')       q = q.eq('courier_picked_up', true);
      if (filterStatus === 'dispatch_pending') q = q.eq('picking_status', 'picked').eq('courier_picked_up', false);
      // not_found and packed are computed client-side; fetch wider range so filter is complete
      if (filterStatus === 'not_found')        q = q.range(0, 999);
      if (filterStatus === 'packed')           q = q.eq('is_packed', true);
      if (dateFrom) q = q.gte('invoice_date', dateFrom);
      if (dateTo)   q = q.lte('invoice_date', dateTo);

      q = q
        .order(sortCol, { ascending: sortDir === 'asc' })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      const { data, count, error } = await q;
      if (error) throw error;

      const rows = (data || []).map((o) => ({
        ...o,
        _commentCount: Array.isArray(o.comment_count) ? (o.comment_count[0]?.count ?? 0) : 0,
        _displayStatus: getDisplayStatus(o),
      }));

      // Client-side filter for not_found (can't be expressed server-side without a join)
      const filtered = filterStatus === 'not_found'
        ? rows.filter((o) => o._displayStatus === 'not_found')
        : rows;

      // Sort pending-dispatch rows to top when not filtering
      if (!filterStatus) {
        filtered.sort((a, b) => Number(isPendingDispatch(b)) - Number(isPendingDispatch(a)));
      }

      setOrders(filtered);
      setTotal(filterStatus === 'not_found' ? filtered.length : (count || 0));
    } catch (err) {
      toast.error('Failed to load orders');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [search, filterLot, filterStatus, dateFrom, dateTo, sortCol, sortDir, page]);

  const fetchMeta = useCallback(async () => {
    const [{ data: lotData }, { data: partnerData }] = await Promise.all([
      supabase.from('invoice_lots').select('id, lot_name, status, total_orders').order('created_at', { ascending: false }),
      supabase.from('delivery_partners').select('id, name').eq('is_active', true),
    ]);
    setLots(lotData || []);
    setPartners(partnerData || []);
  }, []);

  const fetchStats = useCallback(async () => {
    const { data } = await supabase.from('orders').select('picking_status, courier_picked_up, total_amount');
    if (!data) return;
    setStats({
      total: data.length,
      pending: data.filter((o) => o.picking_status === 'pending').length,
      picked: data.filter((o) => o.picking_status === 'picked' && !o.courier_picked_up).length,
      dispatched: data.filter((o) => o.courier_picked_up).length,
      pendingDispatch: data.filter((o) => isPendingDispatch(o)).length,
      revenue: data.reduce((s, o) => s + (Number(o.total_amount) || 0), 0),
    });
  }, []);

  useEffect(() => { fetchMeta(); fetchStats(); }, [fetchMeta, fetchStats]);
  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Real-time
  useEffect(() => {
    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { fetchOrders(); fetchStats(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, fetchOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_comments' }, fetchOrders)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchOrders, fetchStats]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
    setPage(0);
  };

  const toggleCourierPickup = async (order) => {
    const newVal = !order.courier_picked_up;
    const { error } = await supabase.from('orders').update({ courier_picked_up: newVal }).eq('id', order.id);
    if (error) { toast.error('Update failed'); return; }
    toast.success(newVal ? 'Courier pickup confirmed ✓' : 'Courier pickup unmarked');
    fetchOrders(); fetchStats();
  };

  const saveCourierBarcode = async () => {
    if (!editBarcode) return;
    const { error } = await supabase
      .from('orders')
      .update({ courier_barcode: editBarcode.value || null })
      .eq('id', editBarcode.orderId);
    if (error) { toast.error('Update failed'); return; }
    toast.success('Courier code updated');
    setEditBarcode(null);
    fetchOrders();
  };

  const exportCsv = async () => {
    const { data } = await supabase.from('orders').select(
      `invoice_no, invoice_date, customer_name, customer_city, total_amount, picking_status, courier_picked_up, lot:invoice_lots(lot_name, delivery_partner:delivery_partners(name))`
    );
    if (!data) return;
    const rows = [
      ['Invoice No', 'Date', 'Customer', 'City', 'Amount', 'Pick Status', 'Courier Pickup', 'Lot', 'Partner'],
      ...data.map((o) => [
        o.invoice_no, o.invoice_date, o.customer_name, o.customer_city,
        o.total_amount, o.picking_status, o.courier_picked_up ? 'Yes' : 'No',
        o.lot?.lot_name, o.lot?.delivery_partner?.name,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tsot-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const resetFilters = () => {
    setSearch(''); setFilterLot(''); setFilterPartner('');
    setFilterStatus(''); setDateFrom(''); setDateTo(''); setPage(0);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const Th = ({ col, label, className = '' }) => (
    <th
      className={clsx('px-3 py-2.5 text-left text-xs font-semibold text-stone-400 uppercase tracking-wide cursor-pointer select-none hover:text-tea-600 whitespace-nowrap transition-colors', className)}
      onClick={() => col && handleSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        {col && <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />}
      </span>
    </th>
  );

  return (
    <div className="space-y-4">
      {/* ── Stats row ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Orders',      value: stats.total,          color: 'text-tea-700',     bg: 'bg-tea-50' },
          { label: 'Pending Pick',       value: stats.pending,        color: 'text-brand-error', bg: 'bg-red-50' },
          { label: 'Picked',             value: stats.picked,         color: 'text-brand-success',bg: 'bg-green-50' },
          { label: 'Dispatched',         value: stats.dispatched,     color: 'text-purple-700',  bg: 'bg-purple-50' },
          { label: 'Pending Dispatch',   value: stats.pendingDispatch,color: 'text-amber-700',   bg: 'bg-amber-50', action: () => setFilterStatus('dispatch_pending') },
          { label: 'Total Revenue',      value: fmtRupees(stats.revenue),  color: 'text-tea-600',     bg: 'bg-tea-50', wide: true },
        ].map((s) => (
          <div
            key={s.label}
            className={clsx(
              'card px-4 py-3 transition-all',
              s.wide && 'col-span-2 sm:col-span-1 lg:col-span-1',
              s.action && 'cursor-pointer hover:shadow-warm-md hover:border-tea-300'
            )}
            onClick={s.action}
          >
            <div className={clsx('text-xl font-bold', s.color)}>{s.value}</div>
            <div className="text-xs text-stone-400 mt-0.5 flex items-center gap-1">
              {s.label}
              {s.action && <span className="text-tea-400 text-[10px]">↗ filter</span>}
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ───────────────────────────────────── */}
      <div className="card p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              className="input pl-9"
              placeholder="Customer, invoice no, city…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>

          <div className="flex items-center gap-1 min-w-0">
            <select className="input w-auto text-sm" value={filterLot} onChange={(e) => { setFilterLot(e.target.value); setPage(0); }}>
              <option value="">All Lots</option>
              {lots.map((l) => <option key={l.id} value={l.id}>{l.lot_name}</option>)}
            </select>
            {/* Delete lot shortcut when a specific lot is selected */}
            {filterLot && (() => {
              const lot = lots.find((l) => l.id === filterLot);
              return lot && lot.status !== 'dispatched' ? (
                <button
                  onClick={() => setDeleteLot(lot)}
                  className="p-2 text-stone-300 hover:text-brand-error hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                  title={`Delete lot: ${lot.lot_name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              ) : null;
            })()}
          </div>

          <select className="input w-auto text-sm" value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}>
            <option value="">All Statuses</option>
            <option value="pending">Pending Pick</option>
            <option value="picking">Picking</option>
            <option value="not_found">⚠ Not Found Items</option>
            <option value="picked">Picked</option>
            <option value="packed">Packed</option>
            <option value="dispatch_pending">⚡ Pending Dispatch</option>
            <option value="dispatched">Dispatched</option>
          </select>

          <input type="date" className="input w-auto text-sm" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} />
          <span className="text-stone-400 text-xs">–</span>
          <input type="date" className="input w-auto text-sm" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} />

          <button className="btn-secondary text-sm" onClick={resetFilters}>
            <RefreshCw className="w-3.5 h-3.5" /> Reset
          </button>
          <button className="btn-secondary text-sm sm:ml-auto" onClick={exportCsv}>
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>

        {filterStatus === 'dispatch_pending' && (
          <div className="mt-2 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            Showing orders that are fully picked but not yet dispatched — please arrange courier pickup.
          </div>
        )}
      </div>

      {/* ── Desktop Table ─────────────────────────────── */}
      <div className="card overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-tea-50 border-b border-tea-200">
              <tr>
                <Th col="invoice_date"   label="Date" />
                <Th col="invoice_no"     label="Invoice" />
                <Th col="customer_name"  label="Customer" />
                <Th col="customer_city"  label="City" />
                <Th col="total_amount"   label="Amount" />
                <Th                      label="Lot" />
                <Th                      label="Partner" />
                <Th col="picking_status" label="Status" />
                <Th                      label="Photo" />
                <Th                      label="Notes" />
              </tr>
            </thead>
            <tbody className="divide-y divide-tea-100">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j} className="px-3 py-3">
                        <div className="h-4 bg-tea-100 rounded animate-pulse" style={{ width: j === 2 ? '120px' : '60px' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-16 text-stone-400">
                    <Search className="w-8 h-8 mx-auto mb-2 text-stone-200" />
                    No orders match your filters
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const pendingDispatch = isPendingDispatch(order);
                  const lotCanDelete = order.lot && order.lot.status !== 'dispatched';
                  return (
                    <tr
                      key={order.id}
                      className={clsx(
                        'transition-colors group',
                        pendingDispatch
                          ? 'bg-brand-warning-bg hover:bg-amber-100 border-l-4 border-l-tea-400'
                          : 'hover:bg-tea-50'
                      )}
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap text-stone-500 text-xs">{fmtDate(order.invoice_date)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs text-stone-600">{order.invoice_no}</span>
                          {order.invoice_pdf_url && (
                            <a href={order.invoice_pdf_url} target="_blank" rel="noreferrer" title="View Invoice PDF"
                              className="text-stone-300 hover:text-tea-500 transition-colors">
                              <FileText className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-medium text-tea-800 max-w-[150px] truncate">{order.customer_name}</td>
                      <td className="px-3 py-2.5 text-stone-500 whitespace-nowrap text-xs">{order.customer_city || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-tea-700">{fmtRupees(order.total_amount)}</td>
                      <td className="px-3 py-2.5 max-w-[180px]">
                        <div className="flex items-center gap-1 flex-wrap">
                          <a href={`/picking/${order.lot?.id}`} className="text-tea-500 hover:text-tea-700 hover:underline text-xs truncate">
                            {order.lot?.lot_name}
                          </a>
                          {order.lot?.label_pdf_url && (
                            <a
                              href={order.lot.label_pdf_url}
                              target="_blank"
                              rel="noreferrer"
                              title="View lot label PDF"
                              className="text-stone-300 hover:text-tea-500 transition-colors flex-shrink-0"
                            >
                              <FileText className="w-3 h-3" />
                            </a>
                          )}
                          {lotCanDelete && (
                            <button
                              onClick={() => setDeleteLot(order.lot)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-stone-300 hover:text-brand-error transition-all flex-shrink-0"
                              title="Delete this lot"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          {order.courier_barcode && (
                            order.label_pdf_url ? (
                              <a
                                href={order.label_pdf_url}
                                target="_blank"
                                rel="noreferrer"
                                title="View shipping label"
                                className="font-mono text-[10px] text-tea-500 hover:text-tea-700 hover:underline transition-colors"
                              >
                                {order.courier_barcode}
                              </a>
                            ) : (
                              <span className="font-mono text-[10px] text-stone-400">{order.courier_barcode}</span>
                            )
                          )}
                          {order.courier_barcode && order.label_pdf_url && (
                            <a href={order.label_pdf_url} target="_blank" rel="noreferrer" title="Shipping label"
                              className="text-stone-300 hover:text-tea-500 transition-colors flex-shrink-0">
                              <FileText className="w-2.5 h-2.5" />
                            </a>
                          )}
                          <button
                            onClick={() => setEditBarcode({ orderId: order.id, value: order.courier_barcode || '' })}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-stone-300 hover:text-tea-600 transition-all flex-shrink-0"
                            title="Edit courier code"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-stone-500 text-xs">{order.lot?.delivery_partner?.name || '—'}</td>
                      <td className="px-3 py-2.5">
                        {order._displayStatus === 'dispatched' ? (
                          <span className="badge-dispatched">Dispatched</span>
                        ) : order._displayStatus === 'packed' ? (
                          <span className="badge-packed">Packed</span>
                        ) : order._displayStatus === 'dispatch_pending' ? (
                          <span className="badge-dispatch-pending flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Pending Dispatch
                          </span>
                        ) : order._displayStatus === 'not_found' ? (
                          <span className="badge-not-found flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> Not Found
                          </span>
                        ) : order._displayStatus === 'picked' ? (
                          <span className="badge-picked">Picked</span>
                        ) : order._displayStatus === 'picking' ? (
                          <span className="badge-picking-partial">Picking</span>
                        ) : (
                          <span className="badge-pending">Pending</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {order.packing_photo_url ? (
                          <button
                            onClick={() => setPhotoModal(order.packing_photo_url)}
                            className="relative w-9 h-9 rounded-lg overflow-hidden border-2 border-tea-100 hover:border-tea-400 transition-colors"
                          >
                            <Image src={order.packing_photo_url} alt="Packing" fill className="object-cover" />
                          </button>
                        ) : (
                          <ImageOff className="w-4 h-4 text-stone-200" />
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <CommentsBadge
                          orderId={order.id}
                          count={order._commentCount}
                          onClick={() => setCommentsModal({ orderId: order.id, label: `#${order.invoice_no} — ${order.customer_name}` })}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-tea-100 bg-tea-50/30">
          <span className="text-xs text-stone-400">
            {total > 0 ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total} orders` : '0 orders'}
          </span>
          <div className="flex items-center gap-2">
            <button className="btn-secondary text-xs px-2 py-1.5" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-stone-500">{page + 1} / {Math.max(totalPages, 1)}</span>
            <button className="btn-secondary text-xs px-2 py-1.5" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile Cards ──────────────────────────────── */}
      <div className="md:hidden space-y-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card p-4 space-y-2 animate-pulse">
              <div className="h-4 bg-tea-100 rounded w-1/2" />
              <div className="h-3 bg-tea-100 rounded w-3/4" />
              <div className="h-3 bg-tea-100 rounded w-1/3" />
            </div>
          ))
        ) : orders.length === 0 ? (
          <div className="card p-8 text-center text-stone-400">
            <Search className="w-8 h-8 mx-auto mb-2 text-stone-200" />
            <p>No orders found</p>
          </div>
        ) : (
          <>
            {orders.map((order) => {
              const pendingDispatch = isPendingDispatch(order);
              return (
                <div
                  key={order.id}
                  className={clsx(
                    'card overflow-hidden',
                    pendingDispatch && 'border-l-4 border-l-tea-400'
                  )}
                >
                  <div className={clsx('px-4 py-3', pendingDispatch ? 'bg-brand-warning-bg' : 'bg-white')}>
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-tea-800 truncate">{order.customer_name}</p>
                        <p className="text-xs text-stone-400 mt-0.5">
                          #{order.invoice_no} · {order.customer_city} · {fmtDate(order.invoice_date)}
                        </p>
                      </div>
                      <span className="font-bold text-tea-700 text-sm flex-shrink-0">{fmtRupees(order.total_amount)}</span>
                    </div>

                    {/* Status row */}
                    <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                      {order._displayStatus === 'dispatched' ? (
                        <span className="badge-dispatched">Dispatched</span>
                      ) : order._displayStatus === 'packed' ? (
                        <span className="badge-packed">Packed</span>
                      ) : order._displayStatus === 'dispatch_pending' ? (
                        <span className="badge-dispatch-pending flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Pending Dispatch
                        </span>
                      ) : order._displayStatus === 'not_found' ? (
                        <span className="badge-not-found flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> Not Found
                        </span>
                      ) : order._displayStatus === 'picked' ? (
                        <span className="badge-picked">Picked</span>
                      ) : order._displayStatus === 'picking' ? (
                        <span className="badge-picking-partial">Picking</span>
                      ) : (
                        <span className="badge-pending">Pending</span>
                      )}
                      <span className="text-xs text-stone-400 truncate max-w-[120px]">
                        {order.lot?.delivery_partner?.name}
                      </span>
                    </div>

                    {/* Action row */}
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-tea-100">
                      {/* Courier pickup */}
                      <label className="flex items-center gap-1.5 cursor-pointer min-h-[44px]">
                        <input
                          type="checkbox"
                          checked={!!order.courier_picked_up}
                          onChange={() => toggleCourierPickup(order)}
                          className="w-4 h-4 rounded accent-tea-600"
                        />
                        <span className="text-xs text-stone-500">Courier picked up</span>
                      </label>

                      <div className="ml-auto flex items-center gap-2">
                        {/* Photo */}
                        {order.packing_photo_url ? (
                          <button onClick={() => setPhotoModal(order.packing_photo_url)} className="relative w-8 h-8 rounded overflow-hidden border border-tea-200">
                            <Image src={order.packing_photo_url} alt="" fill className="object-cover" />
                          </button>
                        ) : (
                          <ImageOff className="w-4 h-4 text-stone-200" />
                        )}
                        {/* Comments */}
                        <CommentsBadge
                          orderId={order.id}
                          count={order._commentCount}
                          onClick={() => setCommentsModal({ orderId: order.id, label: `#${order.invoice_no} — ${order.customer_name}` })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Mobile pagination */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-stone-400">{total} orders</span>
              <div className="flex gap-2">
                <button className="btn-secondary text-xs px-3 py-2" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  ← Prev
                </button>
                <span className="text-xs text-stone-500 self-center">{page + 1}/{Math.max(totalPages, 1)}</span>
                <button className="btn-secondary text-xs px-3 py-2" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                  Next →
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Courier Barcode Edit Modal ───────────────── */}
      {editBarcode && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setEditBarcode(null)}
        >
          <div
            className="bg-white rounded-xl shadow-warm-lg w-full max-w-xs p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <Pencil className="w-4 h-4 text-tea-500" />
              <h3 className="font-semibold text-tea-800 text-sm">Edit Courier Code</h3>
            </div>
            <input
              className="input font-mono text-sm"
              value={editBarcode.value}
              onChange={(e) => setEditBarcode((prev) => ({ ...prev, value: e.target.value }))}
              placeholder="Enter courier barcode"
              onKeyDown={(e) => { if (e.key === 'Enter') saveCourierBarcode(); if (e.key === 'Escape') setEditBarcode(null); }}
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => setEditBarcode(null)} className="btn-secondary text-sm flex-1 justify-center">
                Cancel
              </button>
              <button onClick={saveCourierBarcode} className="btn-primary text-sm flex-1 justify-center">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Photo Modal ───────────────────────────────── */}
      {photoModal && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4" onClick={() => setPhotoModal(null)}>
          <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <img src={photoModal} alt="Packing" className="w-full h-auto rounded-2xl object-contain shadow-warm-lg" />
            <a href={photoModal} target="_blank" rel="noreferrer"
              className="absolute top-3 right-3 bg-white/90 rounded-full p-2 hover:bg-white transition-colors shadow">
              <ExternalLink className="w-4 h-4 text-tea-700" />
            </a>
          </div>
        </div>
      )}

      {/* ── Delete Lot Modal ──────────────────────────── */}
      {deleteLot && (
        <DeleteLotModal
          lot={deleteLot}
          onClose={() => setDeleteLot(null)}
          onDeleted={() => { fetchOrders(); fetchStats(); fetchMeta(); setFilterLot(''); }}
        />
      )}

      {/* ── Comments Modal ────────────────────────────── */}
      {commentsModal && (
        <CommentsModal
          orderId={commentsModal.orderId}
          orderLabel={commentsModal.label}
          onClose={() => setCommentsModal(null)}
        />
      )}
    </div>
  );
}
