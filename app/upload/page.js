'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { splitIntoIndividualPages } from '@/lib/pdf-utils';
import { PDFDocument } from 'pdf-lib';
import {
  Upload, Loader2, CheckCircle2, ChevronRight, ChevronLeft,
  FilePlus, X, AlertTriangle, FileText, Package, ChevronDown, Sparkles,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

const STEPS = ['Upload', 'Review', 'Save'];

function normalizeInvoiceNo(val) {
  if (!val) return '';
  return String(val).replace(/[^0-9]/g, '').trim();
}

function normalizeCourierName(raw) {
  if (!raw) return 'Unknown';
  const lower = raw.toLowerCase().trim();

  // Service-tier codes that are actually DTDC services
  const serviceTypeMap = {
    'sf':                    'DTDC',
    'ar':                    'DTDC',
    'b2c smart express':     'DTDC',
    'b2c priority':          'DTDC',
    'sf b2c smart express':  'DTDC',
    'ar b2c priority':       'DTDC',
  };
  if (serviceTypeMap[lower]) return serviceTypeMap[lower];

  // Brand normalisation (order matters — check substrings)
  if (lower.includes('dtdc'))                                    return 'DTDC';
  if (lower.includes('bluedart') || lower.includes('blue dart')) return 'BlueDart';
  if (lower.includes('delhivery'))                               return 'Delhivery';
  if (lower.includes('ekart'))                                   return 'Ekart';
  if (lower.includes('shadowfax'))                               return 'Shadowfax';
  if (lower.includes('ecom express') || lower.includes('ecomexpress')) return 'Ecom Express';
  if (lower.includes('xpressbees'))                              return 'XpressBees';
  if (lower.includes('india post') || lower.includes('speed post')) return 'India Post';
  if (lower.includes('amazon'))                                  return 'Amazon Delivery';
  if (lower.includes('shiprocket'))                              return 'Shiprocket';

  // Fallback: title-case the raw value
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
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

  // Duplicate detection modal
  const [duplicateModal, setDuplicateModal] = useState(null);
  // null | { duplicates: [{invoice_no, lot_name, status}], pendingMap: {} }

  // ── Processing ────────────────────────────────────────────────────────

  // Continues after duplicate check resolves (label parsing → grouping → review step).
  const continueAfterCheck = async (invoiceMap) => {
    try {
      // ── 2. Split label PDFs and send each page to Claude as a PDF document ─
      const labelExtracted = new Map();

      if (labelFiles.length > 0) {
        setProcessStatus('Splitting label PDFs...');
        const allLabelPages = [];
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
              const matched = normNo !== '';
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
          ? normalizeCourierName(inv.courier_name)
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

  const processAll = async () => {
    console.log('[DUPE CHECK] processAll STARTED');
    alert('processAll started - check console');
    if (!invoiceFiles.length) { toast.error('Upload at least one invoice PDF'); return; }
    setProcessing(true);
    setProcessStatus('');
    setProcessProgress({ current: 0, total: 0 });

    try {
      // ── 1. Split all invoice PDFs into individual pages ──────────────
      setProcessStatus('Splitting invoices into pages...');
      const pagesFlat = [];
      for (const file of invoiceFiles) {
        const pages = await splitIntoIndividualPages(file);
        pagesFlat.push(...pages);
      }

      // ── 2. Detect invoice header on each page to find boundaries ─────
      setProcessStatus('Detecting invoice boundaries...');
      setProcessProgress({ current: 0, total: pagesFlat.length });
      const invoiceGroups = []; // [{ invoiceNo, pages: [File, ...] }]
      let currentGroup = null;
      for (let i = 0; i < pagesFlat.length; i++) {
        setProcessStatus(`Detecting invoice boundaries... (page ${i + 1} of ${pagesFlat.length})`);
        setProcessProgress({ current: i + 1, total: pagesFlat.length });
        try {
          const fd = new FormData();
          fd.append('file', pagesFlat[i]);
          const res       = await fetch('/api/detect-invoice-header', { method: 'POST', body: fd });
          const detection = res.ok ? await res.json() : { has_invoice_header: false, invoice_no: null };
          if (detection.has_invoice_header && detection.invoice_no) {
            currentGroup = { invoiceNo: detection.invoice_no, pages: [pagesFlat[i]] };
            invoiceGroups.push(currentGroup);
            console.log(`[invoice-groups] page ${i + 1}: NEW invoice ${detection.invoice_no}`);
          } else if (currentGroup) {
            currentGroup.pages.push(pagesFlat[i]);
            console.log(`[invoice-groups] page ${i + 1}: continuation of ${currentGroup.invoiceNo}`);
          } else {
            console.warn(`[invoice-groups] page ${i + 1}: orphan page with no previous invoice — skipping`);
          }
        } catch (e) {
          console.warn(`[invoice-groups] page ${i + 1} detection failed:`, e);
        }
      }
      console.log(`[invoice-groups] detected ${invoiceGroups.length} invoices across ${pagesFlat.length} pages`);
      invoiceGroups.forEach((g) =>
        console.log(`[invoice-groups] invoice ${g.invoiceNo}: ${g.pages.length} page(s)`)
      );

      // ── 3. Parse each invoice group as one merged PDF ─────────────────
      setProcessProgress({ current: 0, total: invoiceGroups.length });
      const invoiceMap = {};
      for (let gi = 0; gi < invoiceGroups.length; gi++) {
        const group = invoiceGroups[gi];
        setProcessStatus(`Parsing invoice ${gi + 1} of ${invoiceGroups.length} (#${group.invoiceNo})...`);
        setProcessProgress({ current: gi + 1, total: invoiceGroups.length });
        try {
          // Merge all pages for this invoice into a single PDF
          const mergedPdf = await PDFDocument.create();
          for (const pageFile of group.pages) {
            const src    = await PDFDocument.load(await pageFile.arrayBuffer());
            const copied = await mergedPdf.copyPages(src, src.getPageIndices());
            copied.forEach((p) => mergedPdf.addPage(p));
          }
          const mergedBytes = await mergedPdf.save();
          const mergedFile  = new File(
            [mergedBytes],
            `invoice-${group.invoiceNo}.pdf`,
            { type: 'application/pdf' }
          );
          console.log(`[invoice-parse] parsing invoice ${group.invoiceNo} (${group.pages.length} page(s) merged)`);

          const fd  = new FormData();
          fd.append('file', mergedFile);
          const res = await fetch('/api/parse-invoice', { method: 'POST', body: fd });
          if (!res.ok) {
            console.error(`[invoice-parse] HTTP ${res.status} for invoice ${group.invoiceNo}`);
            continue;
          }
          const json  = await res.json();
          const items = json.data || [];
          if (!items.length) {
            console.warn(`[invoice-parse] no items returned for invoice ${group.invoiceNo}`);
            continue;
          }

          const rawNo  = items[0].invoice_no || group.invoiceNo;
          const normKey = normalizeInvoiceNo(rawNo);
          invoiceMap[normKey] = {
            invoice_no:      rawNo,
            invoice_date:    items[0].invoice_date,
            customer_name:   items[0].customer_name,
            customer_city:   items[0].customer_city,
            customer_state:  items[0].customer_state,
            customer_pin:    items[0].customer_pin,
            customer_phone:  items[0].customer_phone,
            customer_email:  items[0].customer_email,
            payment_method:  items[0].payment_method,
            total_amount:    items[0].total_amount,
            discount_amount: items[0].discount_amount,
            tax_amount:      items[0].tax_amount,
            shipping_amount: items[0].shipping_amount,
            items:           items.map((it) => ({ name: it.name, qty: it.qty, price: it.price })),
            // label fields (populated later):
            courier_barcode:  null,
            tracking_number:  null,
            courier_name:     null,
            labelMatched:     false,
            _labelPageFile:   null,
            // pre-merged PDF for upload (no re-merge needed in saveAll):
            _mergedPdfFile:   mergedFile,
          };
        } catch (e) {
          console.error(`[invoice-parse] failed for invoice ${group.invoiceNo}:`, e);
        }
      }
      setInvoiceParseOrder(Object.values(invoiceMap));

      // ── Duplicate detection ──────────────────────────────────────────
      // Fetch ALL orders and normalize both sides in JS to avoid .in() format mismatches.
      setProcessStatus('Checking for duplicate invoices...');
      const uploadedNorms = [...new Set(
        Object.keys(invoiceMap).map(normalizeInvoiceNo).filter(Boolean)
      )];
      console.log('[DUPE CHECK] normalized invoice nos to check:', uploadedNorms);

      console.log('[DUPE CHECK] about to query orders table');
      const { data: allOrders, error: dupeErr } = await supabase
        .from('orders')
        .select('invoice_no, is_packed, courier_picked_up, lot_id, invoice_lots(lot_name)');
      console.log('[DUPE CHECK] supabase response:', { data: allOrders, error: dupeErr });

      const dupeSet = new Map();
      for (const o of allOrders || []) {
        const norm = normalizeInvoiceNo(o.invoice_no);
        if (norm) dupeSet.set(norm, o);
      }

      const dupes = [];
      for (const invNo of Object.keys(invoiceMap)) {
        const norm = normalizeInvoiceNo(invNo);
        if (norm && dupeSet.has(norm)) {
          const row    = dupeSet.get(norm);
          const status = row.courier_picked_up ? 'Dispatched' : row.is_packed ? 'Packed' : 'Uploaded';
          dupes.push({
            invoice_no: invNo,
            lot_name:   row.invoice_lots?.lot_name || 'Unknown Lot',
            status,
          });
        }
      }
      console.log('[DUPE CHECK] duplicates found:', dupes);

      if (dupes.length > 0) {
        // Pause processing — show modal and wait for user choice.
        setDuplicateModal({ duplicates: dupes, pendingMap: invoiceMap });
        setProcessing(false);
        setProcessStatus('');
        setProcessProgress({ current: 0, total: 0 });
        return;
      }

      // No duplicates — proceed directly to label parsing + review.
      await continueAfterCheck(invoiceMap);
    } catch (err) {
      toast.error('Processing failed: ' + err.message);
      console.error(err);
      setProcessing(false);
      setProcessStatus('');
      setProcessProgress({ current: 0, total: 0 });
    }
  };

  // ── Duplicate modal handlers ─────────────────────────────────────────
  const handleSkipDuplicates = () => {
    if (!duplicateModal) return;
    const { duplicates, pendingMap } = duplicateModal;
    const dupeNorms = new Set(duplicates.map((d) => normalizeInvoiceNo(d.invoice_no)));
    const filteredMap = Object.fromEntries(
      Object.entries(pendingMap).filter(([, inv]) => !dupeNorms.has(normalizeInvoiceNo(inv.invoice_no)))
    );
    if (Object.keys(filteredMap).length === 0) {
      toast.error('All invoices are duplicates — nothing left to upload.');
      return;
    }
    setDuplicateModal(null);
    setProcessing(true);
    continueAfterCheck(filteredMap);
  };

  const handleCancelDuplicates = () => {
    setDuplicateModal(null);
  };

  // ── Saving ────────────────────────────────────────────────────────────
  const saveAll = async () => {
    setSaving(true);
    setSaveStatus('Preparing...');
    const createdLots = [];

    try {
      // Invoice PDFs are already merged per-invoice as _mergedPdfFile during processAll.
      // No re-splitting or re-parsing needed here.

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

        // Upload invoice PDFs — use pre-merged file produced during processAll
        setSaveStatus(`Uploading invoice PDFs for ${group.partnerName}…`);
        for (const inv of group.invoices) {
          const orderId = orderIdByInvoiceNo[inv.invoice_no];
          if (!orderId || !inv._mergedPdfFile) continue;
          try {
            const safe = String(inv.invoice_no).replace(/[^a-zA-Z0-9]/g, '_');
            const path = `invoices/${lot.id}/${safe}.pdf`;
            const { error } = await supabase.storage
              .from('packing-photos')
              .upload(path, inv._mergedPdfFile, { contentType: 'application/pdf', upsert: true });
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

      {/* ── DUPLICATE DETECTION MODAL ──────────────────────── */}
      {duplicateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl shadow-warm-lg w-full max-w-lg">
            {/* Header */}
            <div className="flex items-start gap-3 p-5 border-b border-amber-200">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="font-semibold text-stone-800 text-base">Duplicate Invoices Detected</h2>
                <p className="text-sm text-stone-500 mt-0.5">
                  {duplicateModal.duplicates.length} invoice{duplicateModal.duplicates.length !== 1 ? 's' : ''} already exist{duplicateModal.duplicates.length === 1 ? 's' : ''} in the system.
                </p>
              </div>
            </div>

            {/* Duplicate list */}
            <div className="p-5 max-h-64 overflow-y-auto space-y-2">
              {duplicateModal.duplicates.map((d, i) => (
                <div key={i} className="flex items-center gap-3 bg-white border border-amber-100 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-tea-800">#{d.invoice_no}</span>
                    <span className="text-xs text-stone-400 ml-2 truncate">→ {d.lot_name}</span>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                    d.status === 'Dispatched' ? 'bg-green-100 text-green-700'
                    : d.status === 'Packed'   ? 'bg-blue-100 text-blue-700'
                    : 'bg-stone-100 text-stone-600'
                  }`}>
                    {d.status}
                  </span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2 p-4 border-t border-amber-200 rounded-b-2xl">
              <button onClick={handleCancelDuplicates} className="flex-1 btn-secondary text-sm justify-center">
                Cancel Upload
              </button>
              <button onClick={handleSkipDuplicates} className="flex-1 btn-primary text-sm justify-center">
                Skip Duplicates &amp; Continue
              </button>
            </div>
          </div>
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
