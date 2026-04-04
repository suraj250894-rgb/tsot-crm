'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import ProductCard from '@/components/ProductCard';
import PhotoUpload from '@/components/PhotoUpload';
import OrderComments from '@/components/OrderComments';
import {
  ArrowLeft, LayoutGrid, List, Search, CheckCircle2,
  Loader2, AlertTriangle, ImageOff, ChevronDown, ChevronRight,
  MessageSquare, FileText, Upload
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const TABS = ['Godown View', 'Pack by Invoice'];

export default function LotDetailPage() {
  const { lotId } = useParams();
  const router = useRouter();

  const [lot, setLot] = useState(null);
  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const [confirmModal, setConfirmModal] = useState(false);
  const [marking, setMarking] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState(new Set());
  const [labelUploading, setLabelUploading] = useState(false);
  const labelInputRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (!lotId) return;
    try {
      const [{ data: lotData }, { data: ordersData }] = await Promise.all([
        supabase
          .from('invoice_lots')
          .select('id, lot_name, status, label_pdf_url, delivery_partner:delivery_partners(name)')
          .eq('id', lotId)
          .single(),
        supabase
          .from('orders')
          .select(`
            id, invoice_no, customer_name, customer_city, picking_status, packing_photo_url,
            order_items(id, product_name, quantity, unit_price, matched_catalog_image, matched_catalog_name, is_collected),
            comment_count:order_comments(count)
          `)
          .eq('lot_id', lotId)
          .order('invoice_no'),
      ]);

      setLot(lotData);
      const enriched = (ordersData || []).map((o) => ({
        ...o,
        _commentCount: Array.isArray(o.comment_count) ? (o.comment_count[0]?.count ?? 0) : 0,
      }));
      setOrders(enriched);

      const flat = [];
      for (const order of enriched) {
        for (const item of order.order_items || []) {
          flat.push({ ...item, order_id: order.id });
        }
      }
      setItems(flat);
      setExpandedOrders(new Set(enriched.map((o) => o.id)));
    } catch {
      toast.error('Failed to load lot data');
    } finally {
      setLoading(false);
    }
  }, [lotId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel(`lot-${lotId}-rt`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_comments' }, fetchData)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [lotId, fetchData]);

  const uniqueProducts = useMemo(() => {
    const map = {};
    for (const item of items) {
      const key = (item.matched_catalog_name || item.product_name).toLowerCase().trim();
      if (!map[key]) {
        map[key] = {
          key,
          product_name: item.product_name,
          matched_catalog_name: item.matched_catalog_name,
          matched_catalog_image: item.matched_catalog_image,
          totalQty: 0,
          itemIds: [],
          is_collected: true,
        };
      }
      map[key].totalQty += item.quantity || 1;
      map[key].itemIds.push(item.id);
      if (!item.is_collected) map[key].is_collected = false;
    }
    return Object.values(map).sort((a, b) => Number(a.is_collected) - Number(b.is_collected));
  }, [items]);

  const filteredProducts = useMemo(() => {
    if (!search) return uniqueProducts;
    const q = search.toLowerCase();
    return uniqueProducts.filter((p) =>
      p.product_name.toLowerCase().includes(q) || (p.matched_catalog_name || '').toLowerCase().includes(q)
    );
  }, [uniqueProducts, search]);

  const allCollected = items.length > 0 && items.every((i) => i.is_collected);
  const collectedCount = items.filter((i) => i.is_collected).length;

  const toggleProduct = async (product) => {
    const { error } = await supabase.from('order_items').update({ is_collected: !product.is_collected }).in('id', product.itemIds);
    if (error) { toast.error('Update failed'); return; }
    fetchData();
  };

  const toggleItem = async (item) => {
    const { error } = await supabase.from('order_items').update({ is_collected: !item.is_collected }).eq('id', item.id);
    if (error) { toast.error('Update failed'); return; }
    fetchData();
  };

  const toggleOrderExpand = (orderId) => {
    setExpandedOrders((s) => {
      const ns = new Set(s);
      ns.has(orderId) ? ns.delete(orderId) : ns.add(orderId);
      return ns;
    });
  };

  const uploadLabel = async (file) => {
    if (!file) return;
    setLabelUploading(true);
    try {
      const path = `labels/${lotId}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('packing-photos')
        .upload(path, file, { contentType: 'application/pdf', upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('packing-photos').getPublicUrl(path);

      const { error: updateError } = await supabase
        .from('invoice_lots')
        .update({ label_pdf_url: publicUrl })
        .eq('id', lotId);
      if (updateError) throw updateError;

      toast.success('Label PDF uploaded');
      fetchData();
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setLabelUploading(false);
    }
  };

  const markAllCollected = async () => {
    setMarking(true);
    try {
      await supabase.from('order_items').update({ is_collected: true }).in('id', items.map((i) => i.id));
      await supabase.from('orders').update({ picking_status: 'picked' }).eq('lot_id', lotId);
      await supabase.from('invoice_lots').update({ status: 'picked' }).eq('id', lotId);
      toast.success('Lot marked as fully picked!');
      router.push('/picking');
    } catch (err) {
      toast.error('Failed: ' + err.message);
    } finally {
      setMarking(false);
      setConfirmModal(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-tea-400" />
      </div>
    );
  }

  if (!lot) {
    return (
      <div className="text-center py-20 text-stone-400">
        <AlertTriangle className="w-10 h-10 mx-auto mb-2 text-tea-200" />
        <p>Lot not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-32">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <button onClick={() => router.push('/picking')} className="btn-secondary text-sm px-2 py-2 mt-0.5 min-h-[44px] min-w-[44px]">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-xl text-tea-800 leading-tight">{lot.lot_name}</h1>
          <p className="text-sm text-stone-400 mt-0.5">{lot.delivery_partner?.name} · {orders.length} orders</p>

          {/* Label PDF */}
          <div className="mt-2">
            <input
              ref={labelInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => uploadLabel(e.target.files[0])}
            />
            {lot.label_pdf_url ? (
              <a
                href={lot.label_pdf_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-tea-500 hover:text-tea-700 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                View Label PDF
              </a>
            ) : (
              <button
                onClick={() => labelInputRef.current?.click()}
                disabled={labelUploading}
                className="inline-flex items-center gap-1.5 text-xs text-stone-400 hover:text-tea-600 transition-colors disabled:opacity-50"
              >
                {labelUploading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Upload className="w-3.5 h-3.5" />}
                Upload Label PDF
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="card p-4 mb-4">
        <div className="flex justify-between text-sm font-medium text-tea-700 mb-2">
          <span>Items collected</span>
          <span className={allCollected ? 'text-brand-success' : ''}>{collectedCount} / {items.length}</span>
        </div>
        <div className="w-full bg-tea-100 rounded-full h-3">
          <div
            className={clsx('h-3 rounded-full transition-all duration-500', allCollected ? 'bg-brand-success' : 'bg-tea-400')}
            style={{ width: items.length ? `${(collectedCount / items.length) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-tea-100 rounded-xl p-1 mb-4">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={clsx(
              'flex-1 py-2.5 text-sm font-medium rounded-lg transition-all min-h-[44px]',
              tab === i ? 'bg-white text-tea-700 shadow-warm-sm' : 'text-stone-500 hover:text-stone-700'
            )}
          >
            {i === 0
              ? <><LayoutGrid className="w-4 h-4 inline mr-1.5" />{t}</>
              : <><List className="w-4 h-4 inline mr-1.5" />{t}</>}
          </button>
        ))}
      </div>

      {/* Godown search */}
      {tab === 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input className="input pl-9" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}

      {/* Godown View */}
      {tab === 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filteredProducts.length === 0 ? (
            <div className="col-span-full text-center py-12 text-stone-400">No products found</div>
          ) : (
            filteredProducts.map((p) => (
              <ProductCard key={p.key} product={p} onToggle={() => toggleProduct(p)} />
            ))
          )}
        </div>
      )}

      {/* Pack by Invoice View */}
      {tab === 1 && (
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="card overflow-hidden">
              {/* Order header row */}
              <button
                onClick={() => toggleOrderExpand(order.id)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-tea-50 transition-colors min-h-[60px]"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-tea-800 text-sm">#{order.invoice_no}</span>
                    <span className={order.picking_status === 'picked' ? 'badge-picked' : 'badge-pending'}>
                      {order.picking_status === 'picked' ? 'Picked' : 'Pending'}
                    </span>
                    {order._commentCount > 0 && (
                      <span className="flex items-center gap-0.5 text-xs text-tea-500">
                        <MessageSquare className="w-3 h-3" />{order._commentCount}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-400 mt-0.5 truncate">{order.customer_name} · {order.customer_city}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {order.packing_photo_url ? (
                    <div className="relative w-8 h-8 rounded overflow-hidden">
                      <Image src={order.packing_photo_url} alt="photo" fill className="object-cover" />
                    </div>
                  ) : (
                    <ImageOff className="w-4 h-4 text-stone-200" />
                  )}
                  <span className="text-xs text-stone-400">
                    {(order.order_items || []).filter((i) => i.is_collected).length}/{(order.order_items || []).length}
                  </span>
                  {expandedOrders.has(order.id)
                    ? <ChevronDown className="w-4 h-4 text-stone-400" />
                    : <ChevronRight className="w-4 h-4 text-stone-400" />}
                </div>
              </button>

              {expandedOrders.has(order.id) && (
                <div className="border-t border-tea-100">
                  {/* Items */}
                  <div className="divide-y divide-tea-50">
                    {(order.order_items || []).map((item) => (
                      <div key={item.id} className="px-4 py-3">
                        <ProductCard
                          product={{ ...item, totalQty: item.quantity }}
                          onToggle={() => toggleItem(item)}
                          compact
                        />
                      </div>
                    ))}
                  </div>

                  {/* Packing photo */}
                  <div className="px-4 py-3 flex items-center justify-between bg-tea-50/50 border-t border-tea-100">
                    <span className="text-xs text-stone-500 font-medium">Packing Photo</span>
                    <PhotoUpload orderId={order.id} existingUrl={order.packing_photo_url} onUploaded={fetchData} />
                  </div>

                  {/* Comments */}
                  <OrderComments orderId={order.id} initialCount={order._commentCount} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Fixed bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-tea-200 px-4 py-3 flex items-center justify-between gap-3 shadow-warm-lg z-20">
        <div className="text-sm text-stone-600">
          <span className={clsx('font-bold', allCollected ? 'text-brand-success' : 'text-tea-800')}>
            {collectedCount}/{items.length}
          </span>
          <span className="text-stone-400 ml-1 hidden sm:inline">items collected</span>
        </div>
        <button
          onClick={() => setConfirmModal(true)}
          disabled={!allCollected || marking || lot.status === 'picked'}
          className={clsx(
            'text-sm font-medium px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 min-h-[44px]',
            lot.status === 'picked'
              ? 'bg-brand-success text-white cursor-default opacity-80'
              : allCollected
              ? 'bg-brand-success text-white hover:shadow-warm-md active:scale-[0.98]'
              : 'bg-tea-100 text-stone-400 cursor-not-allowed'
          )}
        >
          <CheckCircle2 className="w-4 h-4" />
          {lot.status === 'picked' ? 'Already Picked' : 'Mark All Collected'}
        </button>
      </div>

      {/* Confirm modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-warm-lg w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <CheckCircle2 className="w-12 h-12 text-brand-success mx-auto mb-3" />
              <h3 className="font-serif text-xl text-tea-800">Confirm Lot Complete?</h3>
              <p className="text-sm text-stone-500 mt-2">
                This will mark <strong>{orders.length} orders</strong> as picked and update the lot status to &ldquo;Picked&rdquo;.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={markAllCollected}
                disabled={marking}
                className="flex-1 bg-brand-success text-white px-4 py-2.5 rounded-xl font-medium hover:shadow-warm-md disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
              >
                {marking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
