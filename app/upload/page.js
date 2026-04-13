'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { splitPdfIntoBatches, splitIntoIndividualPages } from '@/lib/pdf-utils';
import {
  Upload, Loader2, CheckCircle2, ChevronRight, ChevronLeft,
  FilePlus, X, AlertTriangle, FileText, Package, ChevronDown, Sparkles,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

const STEPS = ['Upload', 'Review', 'Save'];

const PARTNER_NAMES = {
  'BLUEDART':     'BlueDart',
  'BLUE DART':    'BlueDart',
  'DELHIVERY':    'Delhivery',
  'DTDC':         'DTDC',
  'AMAZON':       'Amazon Delivery',
  'ECOM EXPRESS': 'Ecom Express',
  'ECOM':         'Ecom Express',
  'SHIPROCKET':   'Shiprocket',
  'INDIA POST':   'India Post',
  'XPRESSBEES':   'XpressBees',
};

function normalizeInvoiceNo(val) {
  if (!val) return '';
  return String(val).replace(/[^0-9]/g, '').trim();
}

function normalizePartnerName(raw) {
  if (!raw) return null;
  const upper = raw.toUpperCase().trim();
  for (const [key, val] of Object.entries(PARTNER_NAMES)) {
    if (upper.includes(key)) return val;
  }
  return raw.trim().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function parseInvoiceDate(str) {
  if (!str) return null;
  try {
    const m = str.match(/([A-Za-z]+)\s+(\d+),?\s+(\d{2,4})/);
    if (m) {
      const months = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
      const mn = months[m[1].toLowerCase().slice(0, 3)];
      if (mn === undefined) return str;
      const yr = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
      return format(new Date(yr, mn, parseInt(m[2])), 'yyyy-MM-dd');
    }
  } catch {}
  return str;
}

// ── File drop zone ─────────────────────────────────────────────────────────
function FileDropZone({ label, description, files, onAdd, onRemove }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const addFiles = (fileList) => {
    const pdfs = Array.from(fileList).filter((f) => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (!pdfs.length) { toast.error('Only PDF files accepted'); return; }
    onAdd(pdfs);
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
          dragging ? 'border-tea-400 bg-tea-50' : 'border-tea-200 hover:border-tea-400 hover:bg-tea-50/50'
        }`}
      >
        <input ref={inputRef} type="file" accept=".pdf,application/pdf" multiple className="hidden"
          onChange={(e) => addFiles(e.target.files)} />
        <FilePlus className="w-8 h-8 text-tea-300 mx-auto mb-2" />
        <p className="text-sm font-medium text-stone-600">{label}</p>
        <p className="text-xs text-stone-400 mt-0.5">{description}</p>
      </div>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-tea-50 border border-tea-200 px-2.5 py-1 rounded-full text-xs text-tea-700">
              <FileText className="w-3 h-3 flex-shrink-0" />
              <span className="max-w-[140px] truncate">{f.name}</span>
              <button onClick={(e) => { e.stopPropagation(); onRemove(i); }} className="text-stone-400 hover:text-red-400">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Invoice review table for one group ────────────────────────────────────
function GroupInvoiceTable({ invoices, onUpdate, onRemove }) {
  const [expandedIdx, setExpandedIdx] = useState(null);

  // Reset expanded row when invoices are removed
  useEffect(() => { setExpandedIdx(null); }, [invoices.length]);

  const updateField = (idx, field, value) => {
    onUpdate(invoices.map((inv, i) => i === idx ? { ...inv, [field]: value } : inv));
  };

  return (
    <div className="divide-y divide-tea-50">
      {/* Table header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-stone-50 text-xs text-stone-400 font-medium">
        <span className="w-5" />
        <span className="w-16">Invoice</span>
        <span className="flex-1">Customer</span>
        <span className="w-24 hidden sm:block">City</span>
        <span className="w-16 text-right hidden sm:block">Amount</span>
        <span className="w-36">Label</span>
        <span className="w-8" />
      </div>

      {invoices.map((inv, idx) => (
        <div key={inv.invoice_no || idx}>
          {/* Summary row */}
          <div
            className="flex items-center gap-2 px-3 py-2.5 hover:bg-tea-50/50 transition-colors cursor-pointer"
            onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
          >
            <span className="text-xs text-stone-400 w-5 text-right flex-shrink-0">{idx + 1}</span>
            <span className="text-sm font-medium text-tea-800 w-16 flex-shrink-0 truncate">#{inv.invoice_no}</span>
            <span className="text-xs text-stone-600 flex-1 min-w-0 truncate">{inv.customer_name}</span>
            <span className="text-xs text-stone-400 w-24 flex-shrink-0 truncate hidden sm:block">{inv.customer_city}</span>
            <span className="text-xs text-stone-500 w-16 flex-shrink-0 text-right hidden sm:block">
              {inv.total_amount ? `₹${Number(inv.total_amount).toLocaleString('en-IN')}` : '—'}
            </span>
            <div className="w-36 flex-shrink-0">
              {inv.labelMatched
                ? <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 max-w-full truncate">
                    <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate font-mono">{inv.courier_barcode || 'Matched'}</span>
                  </span>
                : <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    Label Missing
                  </span>
              }
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 w-8 justify-end">
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(idx); }}
                className="p-0.5 text-stone-300 hover:text-red-400 transition-colors"
                title="Remove invoice"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              {expandedIdx === idx
                ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
                : <ChevronRight className="w-3.5 h-3.5 text-stone-400" />}
            </div>
          </div>

          {/* Expanded edit form */}
          {expandedIdx === idx && (
            <div className="px-4 pb-3 pt-2 bg-stone-50/50 border-t border-tea-100 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  ['Invoice #',  'invoice_no'],
                  ['Customer',   'customer_name'],
                  ['City',       'customer_city'],
                  ['State',      'customer_state'],
                  ['Pincode',    'customer_pin'],
                  ['Phone',      'customer_phone'],
                  ['Email',      'customer_email'],
                  ['Payment',    'payment_method'],
                  ['Amount',     'total_amount'],
                ].map(([lbl, field]) => (
                  <div key={field}>
                    <label className="text-xs text-stone-400 block mb-0.5">{lbl}</label>
                    <input
                      className="input text-sm py-1.5"
                      value={inv[field] || ''}
                      onChange={(e) => updateField(idx, field, e.target.value)}
                    />
                  </div>
                ))}
              </div>

              {inv.items?.length > 0 && (
                <div>
                  <p className="text-xs text-stone-400 mb-1">Items ({inv.items.length})</p>
                  <div className="space-y-0.5">
                    {inv.items.map((item, ii) => (
                      <div key={ii} className="flex items-center gap-2 text-xs text-stone-600">
                        <span className="flex-1 truncate">{item.name}</span>
                        <span className="text-stone-400 flex-shrink-0">×{item.qty}</span>
                        <span className="text-stone-400 flex-shrink-0">₹{item.price}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {inv.labelMatched && (inv.courier_barcode || inv.tracking_number) && (
                <p className="text-xs text-stone-400">
                  {inv.courier_barcode && <span className="mr-3">Barcode: <span className="font-mono text-stone-600">{inv.courier_barcode}</span></span>}
                  {inv.tracking_number && <span>Tracking: <span className="font-mono text-stone-600">{inv.tracking_number}</span></span>}
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step indicator ─────────────────────────────────────────────────────────
function StepIndicator({ current }) {
  return (
    <div className="flex items-center gap-1 sm:gap-2 mb-8">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border-2 transition-all ${
            i < current  ? 'bg-tea-600 border-tea-600 text-white'
            : i === current ? 'bg-white border-tea-600 text-tea-600 shadow-warm-sm'
            : 'bg-white border-tea-200 text-stone-400'
          }`}>
            {i < current ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
          </div>
          <span className={`text-xs font-medium ${i === current ? 'text-tea-700' : i < current ? 'text-stone-400' : 'text-stone-300'}`}>
            {label}
          </span>
          {i < STEPS.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-tea-200 mx-0.5" />}
        </div>
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function UploadPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Step 0 — file selection
  const [invoiceFiles, setInvoiceFiles] = useState([]);
  const [labelFiles,   setLabelFiles]   = useState([]);

  // Processing progress
  const [processing,       setProcessing]       = useState(false);
  const [processStatus,    setProcessStatus]    = useState('');
  const [processProgress,  setProcessProgress]  = useState({ current: 0, total: 0 });

  // Step 1 — review groups
  // group: { partnerName, lotName, invoices: [...invoice objects with labelMatched, _labelPageFile] }
  const [groups,         setGroups]         = useState([]);
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  // Invoice page-file mapping (parse order → page File, for invoice PDF storage)
  const [invoiceParseOrder, setInvoiceParseOrder] = useState([]);

  // Step 2 — saving
  const [saving,     setSaving]     = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  // ── Processing ────────────────────────────────────────────────────────
  const processAll = async () => {
    if (!invoiceFiles.length) { toast.error('Upload at least one invoice PDF'); return; }
    setProcessing(true);
    setProcessStatus('');
    setProcessProgress({ current: 0, total: 0 });

    try {
      // ── 1. Split invoice PDFs into batches and parse ─────────────────
      setProcessStatus('Splitting invoices into batches...');
      const allBatches = [];
      for (const file of invoiceFiles) {
        const batches = await splitPdfIntoBatches(file, 3);
        batches.forEach((b) => allBatches.push(b));
      }
      setProcessProgress({ current: 0, total: allBatches.length });

      const rawItems = [];
      for (let i = 0; i < allBatches.length; i++) {
        setProcessStatus(`Parsing invoices... (batch ${i + 1} of ${allBatches.length})`);
        setProcessProgress({ current: i + 1, total: allBatches.length });
        try {
          const fd = new FormData();
          fd.append('file', allBatches[i]);
          const res = await fetch('/api/parse-invoice', { method: 'POST', body: fd });
          const json = await res.json();
          if (res.ok) rawItems.push(...(json.data || []));
        } catch (e) { console.error(`Batch ${i + 1} failed:`, e); }
      }

      // Group raw line-items by invoice_no
      const invoiceMap = {};
      for (const item of rawItems) {
        const key = item.invoice_no || `unknown-${Object.keys(invoiceMap).length}`;
        if (!invoiceMap[key]) {
          invoiceMap[key] = {
            invoice_no:      item.invoice_no,
            invoice_date:    item.invoice_date,
            customer_name:   item.customer_name,
            customer_city:   item.customer_city,
            customer_state:  item.customer_state,
            customer_pin:    item.customer_pin,
            customer_phone:  item.customer_phone,
            customer_email:  item.customer_email,
            payment_method:  item.payment_method,
            total_amount:    item.total_amount,
            discount_amount: item.discount_amount,
            tax_amount:      item.tax_amount,
            shipping_amount: item.shipping_amount,
            items:           [],
            // label fields:
            courier_barcode:  null,
            tracking_number:  null,
            courier_name:     null,
            labelMatched:     false,
            _labelPageFile:   null,
          };
        }
        invoiceMap[key].items.push({ name: item.name, qty: item.qty, price: item.price });
      }
      // Preserve parse order for invoice PDF page mapping during save
      setInvoiceParseOrder(Object.values(invoiceMap));

      // ── 2. Split label PDFs and send each page to Claude as a PDF document ─
      // Uses pdf-lib (same as invoice splitting) — no pdfjs-dist needed.
      // Collect results into a Map keyed by normalizedInvoiceNo, then attach
      // to invoices in a separate pass. Never use positional/index matching.
      // labelExtracted: Map<normalizedInvoiceNo → { courier_barcode, tracking_number, courier_name, pageFile }>
      const labelExtracted = new Map();

      if (labelFiles.length > 0) {
        setProcessStatus('Splitting label PDFs...');
        const allLabelPages = []; // one File per label page across all label PDFs
        for (const labelFile of labelFiles) {
          try {
            const pages = await splitIntoIndividualPages(labelFile);
            allLabelPages.push(...pages);
          } catch (e) {
            console.warn(`Label split failed for ${labelFile.name}:`, e);
          }
        }

        setProcessProgress({ current: 0, total: allLabelPages.length });

        for (let pi = 0; pi < allLabelPages.length; pi++) {
          setProcessStatus(`Parsing labels... (page ${pi + 1} of ${allLabelPages.length})`);
          setProcessProgress({ current: pi + 1, total: allLabelPages.length });

          try {
            const bytes  = await allLabelPages[pi].arrayBuffer();
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
              const ld = await res.json();
              const rawNo  = ld.invoice_no ?? null;
              const normNo = normalizeInvoiceNo(rawNo);
              const matched = normNo !== '' && normalizeInvoiceNo !== null;
              console.log(
                `[labels] page ${pi + 1}: raw="${rawNo}" → norm="${normNo}" — ${matched ? 'will match' : 'NO invoice_no, skipping'}`
              );
              if (matched) {
                labelExtracted.set(normNo, {
                  courier_barcode: ld.courier_barcode || null,
                  tracking_number: ld.tracking_number || null,
                  courier_name:    ld.courier_name    || null,
                  pageFile:        allLabelPages[pi],
                });
              }
            } else {
              const errText = await res.text().catch(() => '');
              console.warn(`[labels] page ${pi + 1}: HTTP ${res.status}`, errText.slice(0, 200));
            }
          } catch (e) {
            console.error(`[labels] page ${pi + 1} failed:`, e);
          }
        }
      }

      // ── 3. Attach label data to invoices by normalised invoice_no only ──
      // No index fallback — if there's no label match the invoice stays unmatched.
      setProcessStatus('Matching labels to invoices...');
      for (const inv of Object.values(invoiceMap)) {
        const normKey = normalizeInvoiceNo(inv.invoice_no);
        const label   = labelExtracted.get(normKey);
        console.log(
          `[labels] invoice "${inv.invoice_no}" (norm="${normKey}") → ${label ? `MATCHED barcode=${label.courier_barcode}` : 'no label'}`
        );
        if (label) {
          inv.courier_barcode  = label.courier_barcode;
          inv.tracking_number  = label.tracking_number;
          inv.courier_name     = label.courier_name;
          inv.labelMatched     = true;
          inv._labelPageFile   = label.pageFile;
        }
      }

      setProcessStatus('Grouping by delivery partner...');
      const partnerGroups = {};
      for (const inv of Object.values(invoiceMap)) {
        const partnerName = inv.labelMatched
          ? (normalizePartnerName(inv.courier_name) || 'Unknown Courier')
          : 'No Label';
        if (!partnerGroups[partnerName]) partnerGroups[partnerName] = [];
        partnerGroups[partnerName].push(inv);
      }

      // ── 4. Auto-generate lot names ───────────────────────────────────
      const dateStr    = format(new Date(), 'd MMM');
      const builtGroups = [];
      for (const [partnerName, partnerInvoices] of Object.entries(partnerGroups)) {
        const { data: existing } = await supabase
          .from('invoice_lots')
          .select('lot_name')
          .ilike('lot_name', `${dateStr} - ${partnerName} - Lot %`);
        const nums = (existing || []).map((l) => {
          const m = l.lot_name.match(/Lot (\d+)$/);
          return m ? parseInt(m[1]) : 0;
        });
        const n = nums.length > 0 ? Math.max(...nums) + 1 : 1;
        builtGroups.push({
          partnerName,
          lotName:  `${dateStr} - ${partnerName} - Lot ${n}`,
          invoices: partnerInvoices,
        });
      }

      setGroups(builtGroups);
      setExpandedGroups(new Set(builtGroups.map((_, i) => i)));
      setStep(1);

      const total = Object.keys(invoiceMap).length;
      toast.success(`Processed ${total} invoices → ${builtGroups.length} lot(s)`);
    } catch (err) {
      toast.error('Processing failed: ' + err.message);
      console.error(err);
    } finally {
      setProcessing(false);
      setProcessStatus('');
      setProcessProgress({ current: 0, total: 0 });
    }
  };

  // ── Saving ────────────────────────────────────────────────────────────
  const saveAll = async () => {
    setSaving(true);
    setSaveStatus('Preparing...');
    const createdLots = [];

    try {
      // Build invoice_no → page File map by re-parsing each page individually.
      // Positional mapping is unreliable when multiple PDFs are uploaded or when
      // pages don't correspond 1-to-1 with invoices.
      const invoicePageByNo = {};
      try {
        setSaveStatus('Splitting invoice PDFs for storage...');
        const pagesFlat = [];
        for (const file of invoiceFiles) {
          const pages = await splitIntoIndividualPages(file);
          pagesFlat.push(...pages);
        }
        setSaveStatus(`Mapping invoice pages... (0 of ${pagesFlat.length})`);
        for (let i = 0; i < pagesFlat.length; i++) {
          setSaveStatus(`Mapping invoice pages... (${i + 1} of ${pagesFlat.length})`);
          try {
            const fd = new FormData();
            fd.append('file', pagesFlat[i]);
            const res = await fetch('/api/parse-invoice', { method: 'POST', body: fd });
            if (res.ok) {
              const json = await res.json();
              const invoiceNo = (json.data?.[0]?.invoice_no) ?? null;
              if (invoiceNo) {
                const key = normalizeInvoiceNo(invoiceNo);
                invoicePageByNo[key] = pagesFlat[i];
                console.log(`[invoice-pages] page ${i + 1}: invoice_no="${invoiceNo}" → key="${key}"`);
              } else {
                console.warn(`[invoice-pages] page ${i + 1}: no invoice_no in response`, json);
              }
            } else {
              console.warn(`[invoice-pages] page ${i + 1}: HTTP ${res.status}`);
            }
          } catch (e) {
            console.warn(`[invoice-pages] page ${i + 1} failed:`, e);
          }
        }
      } catch (e) { console.warn('Invoice PDF split non-critical:', e); }

      for (const group of groups) {
        setSaveStatus(`Creating lot: ${group.partnerName} (${group.invoices.length} orders)…`);

        // Find or create delivery partner
        let partnerId = null;
        if (group.partnerName !== 'No Label') {
          const { data: found } = await supabase
            .from('delivery_partners')
            .select('id')
            .ilike('name', group.partnerName)
            .maybeSingle();
          if (found) {
            partnerId = found.id;
          } else {
            const { data: created } = await supabase
              .from('delivery_partners')
              .insert({ name: group.partnerName, is_active: true })
              .select()
              .single();
            partnerId = created?.id ?? null;
          }
        }

        // Create lot record
        const { data: lot, error: lotErr } = await supabase
          .from('invoice_lots')
          .insert({
            lot_name:            group.lotName,
            delivery_partner_id: partnerId,
            total_orders:        group.invoices.length,
            total_items:         group.invoices.reduce((s, inv) => s + (inv.items?.length || 0), 0),
            status:              'uploaded',
          })
          .select()
          .single();
        if (lotErr) throw lotErr;

        // Create orders + order_items
        const orderIdByInvoiceNo = {};
        for (const inv of group.invoices) {
          const { data: order, error: oErr } = await supabase
            .from('orders')
            .insert({
              lot_id:          lot.id,
              invoice_no:      inv.invoice_no,
              invoice_date:    parseInvoiceDate(inv.invoice_date),
              customer_name:   inv.customer_name,
              customer_city:   inv.customer_city,
              customer_state:  inv.customer_state,
              customer_pin:    inv.customer_pin,
              customer_phone:  inv.customer_phone,
              customer_email:  inv.customer_email,
              payment_method:  inv.payment_method,
              total_amount:    Number(inv.total_amount)    || null,
              discount_amount: Number(inv.discount_amount) || null,
              tax_amount:      Number(inv.tax_amount)      || null,
              shipping_amount: Number(inv.shipping_amount) || null,
              courier_barcode: inv.courier_barcode || null,
              tracking_number: inv.tracking_number || null,
            })
            .select()
            .single();
          if (oErr) throw oErr;
          orderIdByInvoiceNo[inv.invoice_no] = order.id;

          if (inv.items?.length) {
            await supabase.from('order_items').insert(
              inv.items.map((it) => ({
                order_id:    order.id,
                product_name: it.name,
                quantity:    Number(it.qty)   || 1,
                unit_price:  Number(it.price) || null,
                total_price: (Number(it.qty) || 1) * (Number(it.price) || 0) || null,
              }))
            );
          }
        }

        // Fuzzy match products
        try {
          await fetch('/api/fuzzy-match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lotId: lot.id }),
          });
        } catch (e) { console.warn('Fuzzy match non-critical:', e); }

        // Upload invoice PDFs
        setSaveStatus(`Uploading invoice PDFs for ${group.partnerName}…`);
        for (const inv of group.invoices) {
          const orderId  = orderIdByInvoiceNo[inv.invoice_no];
          const pageFile = invoicePageByNo[normalizeInvoiceNo(inv.invoice_no)];
          if (!orderId || !pageFile) continue;
          try {
            const safe = String(inv.invoice_no).replace(/[^a-zA-Z0-9]/g, '_');
            const path = `invoices/${lot.id}/${safe}.pdf`;
            const { error } = await supabase.storage
              .from('packing-photos')
              .upload(path, pageFile, { contentType: 'application/pdf', upsert: true });
            if (!error) {
              const { data: { publicUrl } } = supabase.storage.from('packing-photos').getPublicUrl(path);
              await supabase.from('orders').update({ invoice_pdf_url: publicUrl }).eq('id', orderId);
            }
          } catch (e) { console.warn('Invoice PDF upload non-critical:', e); }
        }

        // Upload label PDFs
        setSaveStatus(`Uploading label PDFs for ${group.partnerName}…`);
        for (const inv of group.invoices) {
          if (!inv._labelPageFile) continue;
          const orderId = orderIdByInvoiceNo[inv.invoice_no];
          if (!orderId) continue;
          try {
            const safe = String(inv.invoice_no).replace(/[^a-zA-Z0-9]/g, '_');
            const path = `labels/${lot.id}/label_${safe}.pdf`;
            const { error } = await supabase.storage
              .from('packing-photos')
              .upload(path, inv._labelPageFile, { contentType: 'application/pdf', upsert: true });
            if (!error) {
              const { data: { publicUrl } } = supabase.storage.from('packing-photos').getPublicUrl(path);
              await supabase.from('orders').update({ label_pdf_url: publicUrl }).eq('id', orderId);
            }
          } catch (e) { console.warn('Label PDF upload non-critical:', e); }
        }

        createdLots.push({ name: group.partnerName, count: group.invoices.length });
      }

      const summary = createdLots.map((l) => `${l.name} (${l.count})`).join(', ');
      toast.success(`Created ${createdLots.length} lot(s): ${summary}`);
      router.push('/');
    } catch (err) {
      toast.error('Save failed: ' + err.message);
      console.error(err);
    } finally {
      setSaving(false);
      setSaveStatus('');
    }
  };

  // ── Group helpers ─────────────────────────────────────────────────────
  const updateGroup = (gi, updater) =>
    setGroups((prev) => prev.map((g, i) => (i === gi ? updater(g) : g)));

  const toggleGroup = (idx) =>
    setExpandedGroups((prev) => {
      const ns = new Set(prev);
      ns.has(idx) ? ns.delete(idx) : ns.add(idx);
      return ns;
    });

  const totalInvoices = groups.reduce((s, g) => s + g.invoices.length, 0);
  const totalMatched  = groups.reduce((s, g) => s + g.invoices.filter((inv) => inv.labelMatched).length, 0);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Upload className="w-5 h-5 text-tea-500" />
        <h1 className="page-heading">Upload Invoice Lot</h1>
      </div>

      <StepIndicator current={step} />

      {/* ── STEP 0: UPLOAD ─────────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Invoice PDFs */}
            <div className="card p-4 space-y-3">
              <div>
                <h2 className="font-semibold text-tea-800 text-sm">Invoice PDFs</h2>
                <p className="text-xs text-stone-400 mt-0.5">Upload all invoice PDFs for today</p>
              </div>
              <FileDropZone
                label="Drop invoice PDFs here"
                description="Multiple files supported"
                files={invoiceFiles}
                onAdd={(newFiles) => setInvoiceFiles((prev) => {
                  const existing = new Set(prev.map((f) => f.name));
                  return [...prev, ...newFiles.filter((f) => !existing.has(f.name))];
                })}
                onRemove={(i) => setInvoiceFiles((prev) => prev.filter((_, j) => j !== i))}
              />
            </div>

            {/* Label PDFs */}
            <div className="card p-4 space-y-3">
              <div>
                <h2 className="font-semibold text-tea-800 text-sm flex items-center gap-2">
                  Label PDFs
                  <span className="text-xs font-normal text-stone-400">(optional)</span>
                </h2>
                <p className="text-xs text-stone-400 mt-0.5">Used to auto-detect delivery partners</p>
              </div>
              <FileDropZone
                label="Drop label PDFs here"
                description="Courier barcodes extracted automatically"
                files={labelFiles}
                onAdd={(newFiles) => setLabelFiles((prev) => {
                  const existing = new Set(prev.map((f) => f.name));
                  return [...prev, ...newFiles.filter((f) => !existing.has(f.name))];
                })}
                onRemove={(i) => setLabelFiles((prev) => prev.filter((_, j) => j !== i))}
              />
            </div>
          </div>

          {processing ? (
            <div className="card p-5 space-y-3">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-tea-500 flex-shrink-0" />
                <span className="text-sm text-stone-600 font-medium">{processStatus || 'Processing…'}</span>
              </div>
              {processProgress.total > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-stone-400 mb-1.5">
                    <span>{processProgress.current} of {processProgress.total}</span>
                    <span>{Math.round((processProgress.current / processProgress.total) * 100)}%</span>
                  </div>
                  <div className="w-full bg-tea-100 rounded-full h-2">
                    <div
                      className="bg-tea-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(processProgress.current / processProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={processAll}
              disabled={invoiceFiles.length === 0}
              className="btn-primary w-full justify-center py-3 text-base"
            >
              <Sparkles className="w-5 h-5" />
              Process{labelFiles.length > 0 ? ' Invoices & Labels' : ' Invoices'}
            </button>
          )}
        </div>
      )}

      {/* ── STEP 1: REVIEW ─────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Summary + actions */}
          <div className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-tea-800">
                <span className="text-tea-600">{totalInvoices}</span> invoices
                {' '}across{' '}
                <span className="text-tea-600">{groups.length}</span> lot{groups.length !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-stone-400 mt-0.5">
                {totalMatched > 0 && (
                  <span className="text-green-600">{totalMatched} with labels</span>
                )}
                {totalMatched > 0 && totalMatched < totalInvoices && ' · '}
                {totalMatched < totalInvoices && (
                  <span className="text-red-500">{totalInvoices - totalMatched} label{totalInvoices - totalMatched !== 1 ? 's' : ''} missing</span>
                )}
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => setStep(0)} className="btn-secondary text-sm">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={saveAll}
                disabled={saving || totalInvoices === 0}
                className="btn-primary text-sm"
              >
                {saving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> {saveStatus || 'Saving…'}</>
                  : <><CheckCircle2 className="w-4 h-4" /> Save All Lots</>}
              </button>
            </div>
          </div>

          {/* One card per delivery partner group */}
          {groups.map((group, gi) => {
            const matched  = group.invoices.filter((inv) => inv.labelMatched).length;
            const missing  = group.invoices.length - matched;
            const expanded = expandedGroups.has(gi);
            const noLabel  = group.partnerName === 'No Label';

            return (
              <div key={group.partnerName} className={`card overflow-hidden ${noLabel ? 'border-amber-200' : ''}`}>
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(gi)}
                  className={`w-full flex items-center gap-3 p-4 text-left transition-colors ${
                    noLabel ? 'hover:bg-amber-50/50' : 'hover:bg-tea-50'
                  }`}
                >
                  <Package className={`w-5 h-5 flex-shrink-0 ${noLabel ? 'text-amber-400' : 'text-tea-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-tea-800">{group.partnerName}</span>
                      <span className="text-xs text-stone-400">{group.invoices.length} invoices</span>
                      {matched > 0 && (
                        <span className="text-xs text-green-600 flex items-center gap-0.5">
                          <CheckCircle2 className="w-3 h-3" />{matched} matched
                        </span>
                      )}
                      {missing > 0 && (
                        <span className="text-xs text-amber-600 flex items-center gap-0.5">
                          <AlertTriangle className="w-3 h-3" />{missing} missing
                        </span>
                      )}
                    </div>
                    {/* Editable lot name */}
                    <div onClick={(e) => e.stopPropagation()} className="mt-1">
                      <input
                        className="text-xs text-stone-500 bg-transparent border-b border-transparent hover:border-tea-300 focus:border-tea-400 focus:outline-none w-full max-w-xs transition-colors"
                        value={group.lotName}
                        onChange={(e) => updateGroup(gi, (g) => ({ ...g, lotName: e.target.value }))}
                        title="Click to edit lot name"
                      />
                    </div>
                  </div>
                  {expanded
                    ? <ChevronDown className="w-4 h-4 text-stone-400 flex-shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-stone-400 flex-shrink-0" />}
                </button>

                {/* Invoice table */}
                {expanded && (
                  <div className="border-t border-tea-100">
                    <GroupInvoiceTable
                      invoices={group.invoices}
                      onUpdate={(updated) => updateGroup(gi, (g) => ({ ...g, invoices: updated }))}
                      onRemove={(idx) => updateGroup(gi, (g) => ({
                        ...g,
                        invoices: g.invoices.filter((_, i) => i !== idx),
                      }))}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
