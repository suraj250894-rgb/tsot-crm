'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import ProductCard from '@/components/ProductCard';
import PhotoUpload from '@/components/PhotoUpload';
import OrderComments from '@/components/OrderComments';
import { splitIntoIndividualPages } from '@/lib/pdf-utils';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { format } from 'date-fns';
import {
  ArrowLeft, LayoutGrid, List, Search, CheckCircle2,
  Loader2, AlertTriangle, ImageOff, ChevronDown, ChevronRight,
  MessageSquare, FileText, Upload, XCircle, Circle,
  Download, Truck, Tag, Printer,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const TABS = ['Godown View', 'Pack by Invoice', 'Dispatch'];

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
  const [mergingInvoices, setMergingInvoices] = useState(false);
  const [mergingLabels,   setMergingLabels]   = useState(false);
  const [labelParseProgress, setLabelParseProgress] = useState({ current: 0, total: 0 });
  const [packingOrderId, setPackingOrderId] = useState(null);
  const [dispatchSelected, setDispatchSelected] = useState(new Set());
  const [confirmDispatch, setConfirmDispatch] = useState(false);
  const [dispatching, setDispatching] = useState(false);
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
            id, invoice_no, customer_name, customer_city, customer_pin, picking_status,
            packing_photo_url, invoice_pdf_url, label_pdf_url,
            is_packed, packed_at, courier_picked_up, tracking_number, courier_barcode,
            order_items(id, product_name, quantity, unit_price, matched_catalog_image, matched_catalog_name, is_collected, item_status),
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
      // Expand unpacked orders by default; packed orders start collapsed
      setExpandedOrders(new Set(enriched.filter((o) => !o.is_packed).map((o) => o.id)));
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

  // ── Godown derived data ───────────────────────────────────────────────
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
          _anyNotFound: false,
        };
      }
      map[key].totalQty += item.quantity || 1;
      map[key].itemIds.push(item.id);
      if (!item.is_collected) map[key].is_collected = false;
      if (item.item_status === 'not_found') map[key]._anyNotFound = true;
    }
    for (const g of Object.values(map)) {
      if (g.is_collected) g.item_status = 'picked';
      else if (g._anyNotFound) g.item_status = 'not_found';
      else g.item_status = 'pending';
    }
    const statusOrder = { pending: 0, not_found: 1, picked: 2 };
    return Object.values(map).sort((a, b) => (statusOrder[a.item_status] ?? 0) - (statusOrder[b.item_status] ?? 0));
  }, [items]);

  const filteredProducts = useMemo(() => {
    if (!search) return uniqueProducts;
    const q = search.toLowerCase();
    return uniqueProducts.filter((p) =>
      p.product_name.toLowerCase().includes(q) || (p.matched_catalog_name || '').toLowerCase().includes(q)
    );
  }, [uniqueProducts, search]);

  const pickedCount   = items.filter((i) => i.item_status === 'picked').length;
  const notFoundCount = items.filter((i) => i.item_status === 'not_found').length;
  const allDone  = items.length > 0 && items.every((i) => i.item_status === 'picked' || i.item_status === 'not_found');
  const allPicked = items.length > 0 && items.every((i) => i.item_status === 'picked');
  const packedCount = orders.filter((o) => o.is_packed).length;

  // ── Godown actions ────────────────────────────────────────────────────
  const toggleProduct = async (product) => {
    const markPicked = product.item_status !== 'picked';
    const { error } = await supabase.from('order_items')
      .update({ is_collected: markPicked, item_status: markPicked ? 'picked' : 'pending' })
      .in('id', product.itemIds);
    if (error) { toast.error('Update failed'); return; }
    fetchData();
  };

  const markProductNotFound = async (product) => {
    const { error } = await supabase.from('order_items')
      .update({ is_collected: false, item_status: 'not_found' })
      .in('id', product.itemIds);
    if (error) { toast.error('Update failed'); return; }
    fetchData();
  };

  const markAllCollected = async () => {
    setMarking(true);
    try {
      const toPickIds = items.filter((i) => i.item_status !== 'not_found').map((i) => i.id);
      if (toPickIds.length > 0) {
        await supabase.from('order_items')
          .update({ is_collected: true, item_status: 'picked' })
          .in('id', toPickIds);
      }
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

  // ── Pack by Invoice actions ───────────────────────────────────────────
  const toggleOrderExpand = (orderId) => {
    setExpandedOrders((s) => {
      const ns = new Set(s);
      ns.has(orderId) ? ns.delete(orderId) : ns.add(orderId);
      return ns;
    });
  };

  const markAsPacked = async (orderId) => {
    setPackingOrderId(orderId);
    try {
      const { error } = await supabase.from('orders')
        .update({ is_packed: true, packed_at: new Date().toISOString() })
        .eq('id', orderId);
      if (error) throw error;
      toast.success('Order marked as packed ✓');
      fetchData();
    } catch (err) {
      toast.error('Failed: ' + err.message);
    } finally {
      setPackingOrderId(null);
    }
  };

  // ── Dispatch actions ──────────────────────────────────────────────────
  const toggleDispatchSelect = (orderId) => {
    setDispatchSelected((s) => {
      const ns = new Set(s);
      ns.has(orderId) ? ns.delete(orderId) : ns.add(orderId);
      return ns;
    });
  };

  const markAsDispatched = async () => {
    setDispatching(true);
    try {
      const selectedIds = Array.from(dispatchSelected);
      const { error } = await supabase.from('orders')
        .update({ courier_picked_up: true, dispatched_at: new Date().toISOString() })
        .in('id', selectedIds);
      if (error) throw error;
      toast.success(`${selectedIds.length} orders marked as dispatched`);
      setDispatchSelected(new Set());
      setConfirmDispatch(false);
      fetchData();
    } catch (err) {
      toast.error('Failed: ' + err.message);
    } finally {
      setDispatching(false);
    }
  };

  const downloadHandoverPDF = async () => {
    const selectedOrders = orders.filter((o) => dispatchSelected.has(o.id) && o.is_packed);
    if (selectedOrders.length === 0) return;
    try {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const pageW = 595.28;
      const pageH = 841.89;
      const margin = 40;
      // Sr | Order ID | Courier Code | Product | City | Pincode
      const colWidths = [28, 60, 110, 52, 110, 55];
      const colHeaders = ['Sr.', 'Order ID', 'Courier Code', 'Product', 'City', 'Pincode'];
      const rowH = 20;
      const partnerName = lot.delivery_partner?.name || 'Unknown';
      const dateStr = format(new Date(), 'dd.MM.yyyy');

      const drawTableHeader = (pg, startY) => {
        pg.drawRectangle({ x: margin, y: startY - 4, width: pageW - margin * 2, height: 18, color: rgb(0.95, 0.91, 0.86) });
        let hx = margin;
        for (let i = 0; i < colWidths.length; i++) {
          pg.drawText(colHeaders[i], { x: hx + 3, y: startY + 2, size: 8, font: boldFont, color: rgb(0.3, 0.22, 0.14) });
          hx += colWidths[i];
        }
        return startY - 20;
      };

      let page = pdfDoc.addPage([pageW, pageH]);
      let y = pageH - margin;

      // Header line 1
      page.drawText('DISPATCH HANDOVER SHEET', { x: margin, y, size: 14, font: boldFont, color: rgb(0.2, 0.12, 0.06) });
      y -= 22;

      // Header line 2: Date + Partner
      page.drawText(`Date: ${dateStr}`, { x: margin, y, size: 10, font: boldFont, color: rgb(0.2, 0.12, 0.06) });
      page.drawText(partnerName, { x: pageW / 2, y, size: 10, font: boldFont, color: rgb(0.2, 0.12, 0.06) });
      y -= 14;

      page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: 0.5, color: rgb(0.7, 0.65, 0.58) });
      y -= 14;

      y = drawTableHeader(page, y);

      for (let i = 0; i < selectedOrders.length; i++) {
        if (y < margin + 90) {
          page = pdfDoc.addPage([pageW, pageH]);
          y = pageH - margin;
          y = drawTableHeader(page, y);
        }

        const order = selectedOrders[i];
        const rowData = [
          String(i + 1),
          String(order.invoice_no || ''),
          String(order.courier_barcode || '—'),
          'TEA',
          (order.customer_city || '').toUpperCase(),
          String(order.customer_pin || ''),
        ];

        if (i % 2 === 0) {
          page.drawRectangle({ x: margin, y: y - 4, width: pageW - margin * 2, height: rowH, color: rgb(0.99, 0.97, 0.95) });
        }

        let x = margin;
        for (let j = 0; j < colWidths.length; j++) {
          let text = rowData[j];
          const maxChars = Math.floor(colWidths[j] / 5.2);
          if (text.length > maxChars) text = text.slice(0, maxChars - 1) + '…';
          page.drawText(text, { x: x + 3, y: y + 2, size: 8.5, font, color: rgb(0.2, 0.15, 0.1) });
          x += colWidths[j];
        }

        page.drawLine({
          start: { x: margin, y: y - 4 },
          end: { x: pageW - margin, y: y - 4 },
          thickness: 0.3,
          color: rgb(0.85, 0.82, 0.78),
        });

        y -= rowH;
      }

      // Footer
      y -= 24;
      page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: 0.5, color: rgb(0.7, 0.65, 0.58) });
      y -= 16;
      page.drawText(`Total: ${selectedOrders.length} packages`, { x: margin, y, size: 10, font: boldFont, color: rgb(0.2, 0.12, 0.06) });
      y -= 28;
      page.drawText('Handed over by: _____________________________', { x: margin, y, size: 9, font, color: rgb(0.3, 0.22, 0.14) });
      page.drawText('Received by: _____________________________', { x: margin + 260, y, size: 9, font, color: rgb(0.3, 0.22, 0.14) });
      y -= 24;
      page.drawText('Signature: _____________________________', { x: margin, y, size: 9, font, color: rgb(0.3, 0.22, 0.14) });
      page.drawText(`Date: _____________________________`, { x: margin + 260, y, size: 9, font, color: rgb(0.3, 0.22, 0.14) });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Handover_${partnerName.replace(/\s+/g, '_')}_${format(new Date(), 'ddMMMyyyy')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('PDF generation failed: ' + err.message);
      console.error(err);
    }
  };

  // ── Label upload — split, parse, match by invoice_no ─────────────────
  const uploadLabel = async (file) => {
    if (!file) return;
    setLabelUploading(true);
    try {
      // Upload the full lot-level label PDF first
      const lotPath = `labels/${lotId}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('packing-photos')
        .upload(lotPath, file, { contentType: 'application/pdf', upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl: lotUrl } } = supabase.storage.from('packing-photos').getPublicUrl(lotPath);
      const { error: updateError } = await supabase.from('invoice_lots').update({ label_pdf_url: lotUrl }).eq('id', lotId);
      if (updateError) throw updateError;

      // Split and save individual pages; map to orders by page index (sorted by invoice_no)
      try {
        const pages = await splitIntoIndividualPages(file);
        const sortedOrders = [...orders].sort((a, b) => (a.invoice_no || '').localeCompare(b.invoice_no || ''));
        for (let i = 0; i < pages.length && i < sortedOrders.length; i++) {
          const pagePath = `labels/${lotId}/label_p${i + 1}.pdf`;
          const { error: pageErr } = await supabase.storage
            .from('packing-photos')
            .upload(pagePath, pages[i], { contentType: 'application/pdf', upsert: true });
          if (pageErr) continue;
          const { data: { publicUrl: pageUrl } } = supabase.storage.from('packing-photos').getPublicUrl(pagePath);
          await supabase.from('orders').update({ label_pdf_url: pageUrl }).eq('id', sortedOrders[i].id);
        }
      } catch (e) {
        console.warn('Label page split non-critical:', e);
      }

      // Split label PDF into individual pages (pdf-lib) and send each as a
      // PDF document to Claude via /api/parse-labels — no pdfjs-dist needed.
      // Match by normalized invoice_no only — never by array index.
      try {
        const normInv = (v) => (v ? String(v).replace(/[^0-9]/g, '').trim() : '');

        // Build lookup: normalizedInvoiceNo → orderId
        const byInvoiceNo = new Map();
        for (const o of orders) {
          if (o.invoice_no) byInvoiceNo.set(normInv(o.invoice_no), o.id);
        }

        const labelPages = await splitIntoIndividualPages(file);
        setLabelParseProgress({ current: 0, total: labelPages.length });

        for (let pi = 0; pi < labelPages.length; pi++) {
          setLabelParseProgress({ current: pi + 1, total: labelPages.length });
          try {
            const bytes  = await labelPages[pi].arrayBuffer();
            const b64arr = new Uint8Array(bytes);
            let binary   = '';
            for (let i = 0; i < b64arr.length; i++) binary += String.fromCharCode(b64arr[i]);
            const pdfBase64 = btoa(binary);

            const res = await fetch('/api/parse-labels', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pdfBase64 }),
            });
            if (res.ok) {
              const item   = await res.json();
              const rawNo  = item.invoice_no ?? null;
              const normNo = normInv(rawNo);
              const orderId = normNo ? byInvoiceNo.get(normNo) : undefined;
              console.log(
                `[labels] picking page ${pi + 1}: raw="${rawNo}" norm="${normNo}" → orderId="${orderId ?? 'NOT FOUND'}"`
              );
              if (orderId) {
                await supabase.from('orders').update({
                  courier_barcode: item.courier_barcode || null,
                  tracking_number: item.tracking_number || null,
                }).eq('id', orderId);
              } else if (!normNo) {
                console.warn(`[labels] picking page ${pi + 1}: no invoice_no returned`, item);
              }
            } else {
              const errText = await res.text().catch(() => '');
              console.warn(`[labels] picking page ${pi + 1}: HTTP ${res.status}`, errText.slice(0, 200));
            }
          } catch (e) {
            console.error(`[labels] picking page ${pi + 1} failed:`, e);
          }
        }
      } catch (e) {
        console.warn('Label data extraction non-critical:', e);
      } finally {
        setLabelParseProgress({ current: 0, total: 0 });
      }

      toast.success('Label PDF uploaded');
      fetchData();
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setLabelUploading(false);
    }
  };

  // ── Print helpers ─────────────────────────────────────────────────────
  const printMergedPdfs = async (urlKey, setMerging, label) => {
    const urls = orders.map((o) => o[urlKey]).filter(Boolean);
    if (urls.length === 0) {
      toast.error(`No ${label} available for this lot`);
      return;
    }
    setMerging(true);
    try {
      const merged = await PDFDocument.create();
      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (!res.ok) { console.warn(`Skipping ${url}: HTTP ${res.status}`); continue; }
          const bytes = await res.arrayBuffer();
          const src   = await PDFDocument.load(bytes);
          const copied = await merged.copyPages(src, src.getPageIndices());
          copied.forEach((p) => merged.addPage(p));
        } catch (e) {
          console.warn(`Failed to fetch/merge ${url}:`, e);
        }
      }
      const pdfBytes = await merged.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      // Revoke after a short delay to allow the tab to load
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
    } catch (err) {
      toast.error(`Merge failed: ${err.message}`);
    } finally {
      setMerging(false);
    }
  };

  const printLabels4up = async () => {
    const urls = orders.map((o) => o.label_pdf_url).filter(Boolean);
    if (urls.length === 0) { toast.error('No labels available for this lot'); return; }
    setMergingLabels(true);
    try {
      // Fetch and embed every label page
      const embeddable = []; // { doc, pageIndex }[] — one entry per label
      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (!res.ok) { console.warn(`Skipping label ${url}: HTTP ${res.status}`); continue; }
          const src = await PDFDocument.load(await res.arrayBuffer());
          embeddable.push({ src, pageIndex: 0 });
        } catch (e) {
          console.warn(`Failed to fetch label ${url}:`, e);
        }
      }

      // 2×2 grid positions on an A4 page (595 × 842 pt, y is bottom-up in pdf-lib)
      const CELL_W = 297;
      const CELL_H = 421;
      const GRID = [
        { x: 0,   y: CELL_H },   // top-left
        { x: 298, y: CELL_H },   // top-right
        { x: 0,   y: 0      },   // bottom-left
        { x: 298, y: 0      },   // bottom-right
      ];

      const merged = await PDFDocument.create();
      for (let i = 0; i < embeddable.length; i += 4) {
        const page = merged.addPage([595, 842]);
        for (let slot = 0; slot < 4 && i + slot < embeddable.length; slot++) {
          const { src, pageIndex } = embeddable[i + slot];
          const [embedded] = await merged.embedPdf(src, [pageIndex]);
          const { x, y } = GRID[slot];
          page.drawPage(embedded, { x, y, width: CELL_W, height: CELL_H });
        }
      }

      const pdfBytes = await merged.save();
      const blobUrl  = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
    } catch (err) {
      toast.error(`Merge failed: ${err.message}`);
    } finally {
      setMergingLabels(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────
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

          {/* Print buttons */}
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              onClick={() => printMergedPdfs('invoice_pdf_url', setMergingInvoices, 'invoices')}
              disabled={mergingInvoices}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-tea-700 text-white text-xs rounded hover:bg-tea-800 disabled:opacity-60 transition-colors"
            >
              {mergingInvoices ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
              {mergingInvoices ? 'Merging…' : 'Print All Invoices'}
            </button>
            <button
              onClick={printLabels4up}
              disabled={mergingLabels}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-tea-700 text-white text-xs rounded hover:bg-tea-800 disabled:opacity-60 transition-colors"
            >
              {mergingLabels ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
              {mergingLabels ? 'Merging…' : 'Print All Labels'}
            </button>
          </div>

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
                <Loader2 className={`w-3.5 h-3.5 ${labelUploading ? 'animate-spin' : 'hidden'}`} />
                {!labelUploading && <Upload className="w-3.5 h-3.5" />}
                {labelParseProgress.total > 0
                  ? `Extracting courier codes… (${labelParseProgress.current}/${labelParseProgress.total})`
                  : labelUploading ? 'Uploading…' : 'Upload Label PDF'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar (godown picking progress) */}
      <div className="card p-4 mb-4">
        <div className="flex justify-between text-sm font-medium text-tea-700 mb-2">
          <span>Items collected</span>
          <span className="flex items-center gap-2">
            <span className={allPicked ? 'text-brand-success' : ''}>{pickedCount} / {items.length}</span>
            {notFoundCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
                <XCircle className="w-3 h-3" />{notFoundCount} not found
              </span>
            )}
          </span>
        </div>
        <div className="relative w-full bg-tea-100 rounded-full h-3 overflow-hidden">
          <div
            className={clsx('absolute left-0 h-3 transition-all duration-500 rounded-l-full', allPicked ? 'bg-brand-success rounded-r-full' : 'bg-brand-success')}
            style={{ width: items.length ? `${(pickedCount / items.length) * 100}%` : '0%' }}
          />
          {notFoundCount > 0 && (
            <div
              className="absolute h-3 bg-red-400 transition-all duration-500"
              style={{
                left: items.length ? `${(pickedCount / items.length) * 100}%` : '0%',
                width: items.length ? `${(notFoundCount / items.length) * 100}%` : '0%',
              }}
            />
          )}
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
            {i === 0 && <><LayoutGrid className="w-4 h-4 inline mr-1" />{t}</>}
            {i === 1 && <><List className="w-4 h-4 inline mr-1" />{t}</>}
            {i === 2 && <><Truck className="w-4 h-4 inline mr-1" />{t}</>}
          </button>
        ))}
      </div>

      {/* ── GODOWN VIEW ───────────────────────────────────── */}
      {tab === 0 && (
        <>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input className="input pl-9" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredProducts.length === 0 ? (
              <div className="col-span-full text-center py-12 text-stone-400">No products found</div>
            ) : (
              filteredProducts.map((p) => (
                <ProductCard
                  key={p.key}
                  product={p}
                  onToggle={() => toggleProduct(p)}
                  onMarkNotFound={p.item_status !== 'picked' ? () => markProductNotFound(p) : undefined}
                />
              ))
            )}
          </div>
        </>
      )}

      {/* ── PACK BY INVOICE VIEW ──────────────────────────── */}
      {tab === 1 && (
        <div className="space-y-3">
          {orders.map((order) => {
            const orderItems = order.order_items || [];
            const isPacked = order.is_packed;

            // ── Packed card (collapsed by default) ──
            if (isPacked) {
              return (
                <div key={order.id} className="card overflow-hidden border-green-200">
                  <button
                    onClick={() => toggleOrderExpand(order.id)}
                    className="w-full flex items-center justify-between p-4 bg-green-50 hover:bg-green-100 transition-colors text-left min-h-[60px]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-tea-800 text-sm">#{order.invoice_no}</span>
                        <span className="badge-packed flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Packed
                        </span>
                      </div>
                      <p className="text-xs text-stone-400 mt-0.5 truncate">{order.customer_name} · {order.customer_city}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {order.packing_photo_url && (
                        <div className="relative w-8 h-8 rounded overflow-hidden">
                          <Image src={order.packing_photo_url} alt="photo" fill className="object-cover" />
                        </div>
                      )}
                      {order.invoice_pdf_url && (
                        <a href={order.invoice_pdf_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                          className="text-stone-300 hover:text-tea-500 transition-colors" title="Invoice PDF">
                          <FileText className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {order.label_pdf_url && (
                        <a href={order.label_pdf_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                          className="text-stone-300 hover:text-tea-500 transition-colors" title="Shipping Label">
                          <Tag className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {expandedOrders.has(order.id)
                        ? <ChevronDown className="w-4 h-4 text-stone-400" />
                        : <ChevronRight className="w-4 h-4 text-stone-400" />}
                    </div>
                  </button>

                  {/* Expandable reference */}
                  {expandedOrders.has(order.id) && (
                    <div className="border-t border-green-200 divide-y divide-green-100 bg-green-50/30">
                      {orderItems.map((item) => (
                        <PackItemRow key={item.id} item={item} />
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            // ── Unpacked card ──
            return (
              <div key={order.id} className="card overflow-hidden">
                {/* Header */}
                <button
                  onClick={() => toggleOrderExpand(order.id)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-tea-50 transition-colors min-h-[60px]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-tea-800 text-sm">#{order.invoice_no}</span>
                      {order.invoice_pdf_url && (
                        <a href={order.invoice_pdf_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-0.5 text-xs text-tea-400 hover:text-tea-600 transition-colors" title="Invoice PDF">
                          <FileText className="w-3 h-3" />PDF
                        </a>
                      )}
                      {order.label_pdf_url && (
                        <a href={order.label_pdf_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-0.5 text-xs text-tea-400 hover:text-tea-600 transition-colors" title="Shipping Label">
                          <Tag className="w-3 h-3" />Label
                        </a>
                      )}
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
                    <span className="text-xs text-stone-400">{orderItems.length} items</span>
                    {expandedOrders.has(order.id)
                      ? <ChevronDown className="w-4 h-4 text-stone-400" />
                      : <ChevronRight className="w-4 h-4 text-stone-400" />}
                  </div>
                </button>

                {expandedOrders.has(order.id) && (
                  <div className="border-t border-tea-100">
                    {/* Read-only items list */}
                    <div className="divide-y divide-tea-50">
                      {orderItems.map((item) => (
                        <PackItemRow key={item.id} item={item} />
                      ))}
                    </div>

                    {/* Packing photo */}
                    <div className="px-4 py-3 flex items-center justify-between bg-tea-50/50 border-t border-tea-100">
                      <span className="text-xs text-stone-500 font-medium">Packing Photo</span>
                      <PhotoUpload orderId={order.id} existingUrl={order.packing_photo_url} onUploaded={fetchData} />
                    </div>

                    {/* Mark as Packed — enabled after photo upload */}
                    {order.packing_photo_url ? (
                      <div className="px-4 py-3 border-t border-tea-100">
                        <button
                          onClick={() => markAsPacked(order.id)}
                          disabled={packingOrderId === order.id}
                          className="w-full bg-brand-success text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-2 hover:shadow-warm-md active:scale-[0.99] transition-all disabled:opacity-60 min-h-[48px]"
                        >
                          {packingOrderId === order.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <CheckCircle2 className="w-4 h-4" />}
                          Mark as Packed ✓
                        </button>
                      </div>
                    ) : (
                      <div className="px-4 py-2 border-t border-tea-100 bg-stone-50/50">
                        <p className="text-xs text-stone-400 text-center">Upload packing photo to mark as packed</p>
                      </div>
                    )}

                    {/* Comments */}
                    <OrderComments orderId={order.id} initialCount={order._commentCount} />
                  </div>
                )}
              </div>
            );
          })}

          {/* Packing progress summary */}
          {orders.length > 0 && (
            <div className="card p-3 text-center text-sm text-stone-500">
              <span className="font-bold text-green-700">{packedCount}</span> / {orders.length} orders packed
            </div>
          )}
        </div>
      )}

      {/* ── DISPATCH VIEW ─────────────────────────────────── */}
      {tab === 2 && (() => {
        const packedOrders = orders.filter((o) => o.is_packed);
        const readyOrders = packedOrders.filter((o) => !o.courier_picked_up);
        return (
          <div className="space-y-4 pb-4">
            {/* Summary */}
            <div className="text-sm text-stone-500">
              <span className="font-bold text-green-700">{packedOrders.length}</span> of {orders.length} orders ready for dispatch
            </div>

            {packedOrders.length === 0 ? (
              <div className="card p-10 text-center text-stone-400 space-y-2">
                <Truck className="w-10 h-10 mx-auto text-stone-200" />
                <p className="font-medium">No orders are ready for dispatch yet.</p>
                <p className="text-xs">Pack orders first in the &ldquo;Pack by Invoice&rdquo; tab.</p>
              </div>
            ) : (
              <>
                {/* Select controls */}
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDispatchSelected(new Set(readyOrders.map((o) => o.id)))}
                      className="btn-secondary text-xs"
                    >
                      Select All
                    </button>
                    <button onClick={() => setDispatchSelected(new Set())} className="btn-secondary text-xs">
                      Deselect All
                    </button>
                  </div>
                  <span className="text-sm text-stone-500 font-medium">{dispatchSelected.size} selected</span>
                </div>

                {/* Packed orders checklist */}
                <div className="card overflow-hidden">
                  <div className="divide-y divide-tea-50">
                    {packedOrders.map((order, idx) => (
                      <label
                        key={order.id}
                        className={clsx(
                          'flex items-center gap-3 px-4 py-3 transition-colors',
                          order.courier_picked_up
                            ? 'opacity-50 cursor-not-allowed bg-stone-50'
                            : 'cursor-pointer hover:bg-tea-50'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={dispatchSelected.has(order.id)}
                          onChange={() => !order.courier_picked_up && toggleDispatchSelect(order.id)}
                          disabled={order.courier_picked_up}
                          className="w-4 h-4 rounded accent-tea-600 flex-shrink-0"
                        />
                        <span className="text-xs text-stone-400 w-6 flex-shrink-0 text-right">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-tea-800">{order.invoice_no}</span>
                            {order.courier_barcode && (
                              <span className="text-xs font-mono text-stone-500">{order.courier_barcode}</span>
                            )}
                            {order.courier_picked_up && <span className="badge-dispatched">Dispatched</span>}
                          </div>
                          <p className="text-xs text-stone-400 truncate">{order.customer_name} · {order.customer_city} {order.customer_pin}</p>
                        </div>
                        {order.label_pdf_url && (
                          <a
                            href={order.label_pdf_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-stone-300 hover:text-tea-500 transition-colors flex-shrink-0"
                            title="Shipping Label"
                          >
                            <Tag className="w-4 h-4" />
                          </a>
                        )}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={downloadHandoverPDF}
                    disabled={dispatchSelected.size === 0}
                    className="btn-secondary flex-1 justify-center"
                  >
                    <Download className="w-4 h-4" /> Download Handover PDF
                  </button>
                  <button
                    onClick={() => setConfirmDispatch(true)}
                    disabled={dispatchSelected.size === 0}
                    className="btn-primary flex-1 justify-center"
                  >
                    <Truck className="w-4 h-4" /> Mark as Dispatched ({dispatchSelected.size})
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* Fixed bottom bar — Godown View only */}
      {tab === 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-tea-200 px-4 py-3 flex items-center justify-between gap-3 shadow-warm-lg z-20">
          <div className="text-sm text-stone-600">
            <span className={clsx('font-bold', allPicked ? 'text-brand-success' : notFoundCount > 0 ? 'text-red-500' : 'text-tea-800')}>
              {pickedCount}/{items.length}
            </span>
            <span className="text-stone-400 ml-1 hidden sm:inline">picked</span>
            {notFoundCount > 0 && (
              <span className="text-red-500 ml-2 text-xs font-medium">{notFoundCount} not found</span>
            )}
          </div>
          <button
            onClick={() => setConfirmModal(true)}
            disabled={!allDone || marking || lot.status === 'picked'}
            className={clsx(
              'text-sm font-medium px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 min-h-[44px]',
              lot.status === 'picked'
                ? 'bg-brand-success text-white cursor-default opacity-80'
                : allDone
                ? notFoundCount > 0
                  ? 'bg-tea-600 text-white hover:shadow-warm-md active:scale-[0.98]'
                  : 'bg-brand-success text-white hover:shadow-warm-md active:scale-[0.98]'
                : 'bg-tea-100 text-stone-400 cursor-not-allowed'
            )}
          >
            <CheckCircle2 className="w-4 h-4" />
            {lot.status === 'picked' ? 'Already Picked' : notFoundCount > 0 ? 'Mark Complete' : 'Mark All Collected'}
          </button>
        </div>
      )}

      {/* Confirm godown complete modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-warm-lg w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <CheckCircle2 className="w-12 h-12 text-brand-success mx-auto mb-3" />
              <h3 className="font-serif text-xl text-tea-800">Confirm Lot Complete?</h3>
              <p className="text-sm text-stone-500 mt-2">
                This will mark <strong>{orders.length} orders</strong> as picked and update the lot status to &ldquo;Picked&rdquo;.
              </p>
              {notFoundCount > 0 && (
                <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-left">
                  <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">
                    <strong>{notFoundCount} item(s) could not be found</strong> and will be recorded as &ldquo;Not Found&rdquo;.
                  </p>
                </div>
              )}
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

      {/* Confirm dispatch modal */}
      {confirmDispatch && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-warm-lg w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <Truck className="w-12 h-12 text-tea-500 mx-auto mb-3" />
              <h3 className="font-serif text-xl text-tea-800">Confirm Dispatch?</h3>
              <p className="text-sm text-stone-500 mt-2">
                Mark <strong>{dispatchSelected.size} orders</strong> as picked up by courier?
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDispatch(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={markAsDispatched}
                disabled={dispatching}
                className="flex-1 bg-tea-600 text-white px-4 py-2.5 rounded-xl font-medium hover:shadow-warm-md disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
              >
                {dispatching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                Confirm Dispatch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Read-only item row for Pack by Invoice view
function PackItemRow({ item }) {
  const status = item.item_status || 'pending';
  return (
    <div className="px-4 py-2.5 flex items-center gap-3">
      <div className="relative w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden bg-stone-100">
        {item.matched_catalog_image ? (
          <Image src={item.matched_catalog_image} alt={item.product_name} fill className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-300">
            <ImageOff className="w-4 h-4" />
          </div>
        )}
      </div>
      <p className={clsx(
        'flex-1 text-sm font-medium leading-snug min-w-0 truncate',
        status === 'not_found' ? 'text-red-600 line-through' : 'text-stone-800'
      )}>
        {item.product_name}
      </p>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={clsx(
          'text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center',
          status === 'not_found' ? 'bg-red-100 text-red-600' : 'bg-stone-100 text-stone-600'
        )}>
          ×{item.quantity || 1}
        </span>
        {status === 'not_found'
          ? <XCircle className="w-4 h-4 text-red-400" />
          : status === 'picked'
          ? <CheckCircle2 className="w-4 h-4 text-green-500" />
          : <Circle className="w-4 h-4 text-stone-300" />}
      </div>
    </div>
  );
}
