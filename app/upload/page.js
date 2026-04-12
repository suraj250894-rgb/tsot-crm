'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { splitPdfIntoBatches, splitIntoIndividualPages } from '@/lib/pdf-utils';
import InvoiceReviewTable from '@/components/InvoiceReviewTable';
import DeliveryPartnerModal from '@/components/DeliveryPartnerModal';
import {
  Upload, Loader2, CheckCircle2, ChevronRight, ChevronLeft,
  FilePlus, X, Settings2, AlertCircle, Sparkles, FileText
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

const STEPS = ['Partner', 'Name', 'PDFs', 'Review', 'Save'];
const STEPS_FULL = ['Select Partner', 'Name Lot', 'Upload PDFs', 'Review', 'Save'];

function StepIndicator({ current }) {
  return (
    <div className="flex items-center gap-1 sm:gap-2 mb-8 overflow-x-auto pb-1">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <div className={`flex items-center justify-center w-8 h-8 sm:w-7 sm:h-7 rounded-full text-xs font-bold border-2 transition-all ${
            i < current  ? 'bg-tea-600 border-tea-600 text-white'
            : i === current ? 'bg-white border-tea-600 text-tea-600 shadow-warm-sm'
            : 'bg-white border-tea-200 text-stone-400'
          }`}>
            {i < current ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
          </div>
          {/* Full label on sm+, short label on mobile */}
          <span className={`text-xs font-medium sm:hidden ${i === current ? 'text-tea-700' : i < current ? 'text-stone-400' : 'text-stone-300'}`}>
            {label}
          </span>
          <span className={`text-xs font-medium hidden sm:inline ${i === current ? 'text-tea-700' : i < current ? 'text-stone-400' : 'text-stone-300'}`}>
            {STEPS_FULL[i]}
          </span>
          {i < STEPS.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-tea-200 mx-0.5" />}
        </div>
      ))}
    </div>
  );
}

function FileDrop({ files, onAdd, onRemove }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const addFiles = (fileList) => {
    const pdfs = Array.from(fileList).filter((f) => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (pdfs.length === 0) { toast.error('Only PDF files are accepted'); return; }
    onAdd(pdfs);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
        dragging ? 'border-tea-400 bg-tea-50' : 'border-tea-200 hover:border-tea-400 hover:bg-tea-50/50'
      }`}
    >
      <input ref={inputRef} type="file" accept=".pdf,application/pdf" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
      <FilePlus className="w-10 h-10 text-tea-300 mx-auto mb-3" />
      <p className="text-sm font-medium text-stone-600">Drop PDF invoices here</p>
      <p className="text-xs text-stone-400 mt-1">or click to browse — multiple files supported</p>
    </div>
  );
}

export default function UploadPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Step 0 — partner
  const [partners, setPartners] = useState([]);
  const [partnerId, setPartnerId] = useState('');
  const [showPartnerModal, setShowPartnerModal] = useState(false);

  // Step 1 — lot name
  const [lotName, setLotName] = useState('');

  // Step 2 — files
  const [files, setFiles] = useState([]);
  const [labelFile, setLabelFile] = useState(null);
  const labelInputRef = useRef(null);

  // Step 3 — parsed data
  const [parsed, setParsed] = useState([]); // [{invoice_no, customer_name, ..., items:[]}]
  const [parsing, setParsing] = useState(false);
  const [parseErrors, setParseErrors] = useState([]);

  // Step 4 — saving
  const [saving, setSaving] = useState(false);

  // Batch parse progress: { current, total } — 0/0 means idle
  const [parseProgress, setParseProgress] = useState({ current: 0, total: 0 });

  // Label courier-code extraction progress: { current, total } — 0/0 means idle
  const [labelParseProgress, setLabelParseProgress] = useState({ current: 0, total: 0 });

  const fetchPartners = useCallback(async () => {
    const { data } = await supabase.from('delivery_partners').select('id, name').eq('is_active', true).order('name');
    setPartners(data || []);
  }, []);

  useEffect(() => { fetchPartners(); }, [fetchPartners]);

  // Auto-generate lot name when partner is selected
  useEffect(() => {
    if (!partnerId || !partners.length) return;
    const pName = partners.find((p) => p.id === partnerId)?.name || '';
    const dateStr = format(new Date(), 'd MMM');
    setLotName(`${dateStr} - ${pName} - Lot 1`);
  }, [partnerId, partners]);

  const handleAddFiles = (newFiles) => {
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      return [...prev, ...newFiles.filter((f) => !existing.has(f.name))];
    });
  };

  const parseInvoices = async () => {
    if (files.length === 0) { toast.error('No files to parse'); return; }
    setParsing(true);
    setParsed([]);
    setParseErrors([]);
    setParseProgress({ current: 0, total: 0 });

    const results = [];
    const errors = [];

    // Step 1 — split every PDF into 3-page batches client-side
    const allBatches = []; // [{ batchFile, originalName }]
    for (const file of files) {
      try {
        const batches = await splitPdfIntoBatches(file, 3);
        batches.forEach((b) => allBatches.push({ batchFile: b, originalName: file.name }));
      } catch (err) {
        errors.push({ file: file.name, error: 'Failed to split PDF: ' + err.message });
      }
    }

    setParseProgress({ current: 0, total: allBatches.length });

    // Step 2 — send each batch to the API sequentially
    for (let i = 0; i < allBatches.length; i++) {
      const { batchFile, originalName } = allBatches[i];
      setParseProgress({ current: i + 1, total: allBatches.length });

      try {
        const formData = new FormData();
        formData.append('file', batchFile);
        const res = await fetch('/api/parse-invoice', { method: 'POST', body: formData });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Parse failed');
        results.push(...json.data);
      } catch (err) {
        // Record error once per original file
        if (!errors.find((e) => e.file === originalName)) {
          errors.push({ file: originalName, error: err.message });
        }
      }
    }

    // Step 3 — group line-items by invoice_no (same logic as before)
    const grouped = {};
    for (const item of results) {
      const key = item.invoice_no || `unknown-${Math.random()}`;
      if (!grouped[key]) {
        grouped[key] = {
          invoice_no: item.invoice_no,
          invoice_date: item.invoice_date,
          customer_name: item.customer_name,
          customer_city: item.customer_city,
          customer_state: item.customer_state,
          customer_pin: item.customer_pin,
          customer_phone: item.customer_phone,
          customer_email: item.customer_email,
          payment_method: item.payment_method,
          total_amount: item.total_amount,
          discount_amount: item.discount_amount,
          tax_amount: item.tax_amount,
          shipping_amount: item.shipping_amount,
          items: [],
        };
      }
      grouped[key].items.push({ name: item.name, qty: item.qty, price: item.price });
    }

    setParsed(Object.values(grouped));
    setParseErrors(errors);
    setSaving(false);

    if (errors.length > 0) {
      toast.error(`${errors.length} batch(es) failed to parse`);
    } else {
      toast.success(`Parsed ${Object.keys(grouped).length} invoices from ${allBatches.length} batch(es)`);
    }
    setStep(3);
    setParsing(false);
    setParseProgress({ current: 0, total: 0 });
  };

  const saveLot = async () => {
    if (!partnerId || !lotName.trim() || parsed.length === 0) {
      toast.error('Missing required data');
      return;
    }
    setSaving(true);

    try {
      // Create lot
      const { data: lot, error: lotErr } = await supabase
        .from('invoice_lots')
        .insert({
          lot_name: lotName.trim(),
          delivery_partner_id: partnerId,
          total_orders: parsed.length,
          total_items: parsed.reduce((s, inv) => s + (inv.items?.length || 0), 0),
          status: 'uploaded',
        })
        .select()
        .single();
      if (lotErr) throw lotErr;

      // Upload label PDF if provided (non-critical — don't fail lot creation)
      if (labelFile) {
        try {
          const path = `labels/${lot.id}/${labelFile.name}`;
          const { error: labelUploadErr } = await supabase.storage
            .from('packing-photos')
            .upload(path, labelFile, { contentType: 'application/pdf', upsert: true });
          if (!labelUploadErr) {
            const { data: { publicUrl } } = supabase.storage.from('packing-photos').getPublicUrl(path);
            await supabase.from('invoice_lots').update({ label_pdf_url: publicUrl }).eq('id', lot.id);
          }
        } catch (e) {
          console.warn('Label upload failed (non-critical):', e);
        }
      }

      // Insert orders + items — track IDs for invoice page upload
      const ordersByInvoiceNo = {};
      for (const inv of parsed) {
        const { data: order, error: orderErr } = await supabase
          .from('orders')
          .insert({
            lot_id: lot.id,
            invoice_no: inv.invoice_no,
            invoice_date: parseInvoiceDate(inv.invoice_date),
            customer_name: inv.customer_name,
            customer_city: inv.customer_city,
            customer_state: inv.customer_state,
            customer_pin: inv.customer_pin,
            customer_phone: inv.customer_phone,
            customer_email: inv.customer_email,
            payment_method: inv.payment_method,
            total_amount: Number(inv.total_amount) || null,
            discount_amount: Number(inv.discount_amount) || null,
            tax_amount: Number(inv.tax_amount) || null,
            shipping_amount: Number(inv.shipping_amount) || null,
          })
          .select()
          .single();
        if (orderErr) throw orderErr;

        ordersByInvoiceNo[inv.invoice_no] = order.id;

        if (inv.items?.length) {
          const { error: itemsErr } = await supabase.from('order_items').insert(
            inv.items.map((it) => ({
              order_id: order.id,
              product_name: it.name,
              quantity: Number(it.qty) || 1,
              unit_price: Number(it.price) || null,
              total_price: (Number(it.qty) || 1) * (Number(it.price) || 0) || null,
            }))
          );
          if (itemsErr) throw itemsErr;
        }
      }

      // Run fuzzy match server-side
      try {
        await fetch('/api/fuzzy-match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lotId: lot.id }),
        });
      } catch (e) {
        console.warn('Fuzzy match failed (non-critical):', e);
      }

      // Upload individual invoice pages: parsed[i] → page i of flat pages array
      // Non-critical — never blocks lot creation
      try {
        const pagesFlat = [];
        for (const file of files) {
          const pages = await splitIntoIndividualPages(file);
          pagesFlat.push(...pages);
        }
        for (let i = 0; i < parsed.length && i < pagesFlat.length; i++) {
          const inv = parsed[i];
          const orderId = ordersByInvoiceNo[inv.invoice_no];
          if (!orderId) continue;
          const safeName = String(inv.invoice_no || `inv-${i + 1}`).replace(/[^a-zA-Z0-9]/g, '_');
          const path = `invoices/${lot.id}/${safeName}.pdf`;
          const { error: upErr } = await supabase.storage
            .from('packing-photos')
            .upload(path, pagesFlat[i], { contentType: 'application/pdf', upsert: true });
          if (!upErr) {
            const { data: { publicUrl } } = supabase.storage.from('packing-photos').getPublicUrl(path);
            await supabase.from('orders').update({ invoice_pdf_url: publicUrl }).eq('id', orderId);
          }
        }
      } catch (e) {
        console.warn('Invoice page upload non-critical:', e);
      }

      // Label PDF processing (non-critical — never blocks lot creation)
      if (labelFile) {
        try {
          // Step 1 — split and save individual pages; map to orders by page index
          const labelPages = await splitIntoIndividualPages(labelFile);
          for (let i = 0; i < labelPages.length && i < parsed.length; i++) {
            const pagePath = `labels/${lot.id}/label_p${i + 1}.pdf`;
            const { error: pageErr } = await supabase.storage
              .from('packing-photos')
              .upload(pagePath, labelPages[i], { contentType: 'application/pdf', upsert: true });
            if (pageErr) continue;
            const { data: { publicUrl: pageUrl } } = supabase.storage.from('packing-photos').getPublicUrl(pagePath);
            const orderId = ordersByInvoiceNo[parsed[i].invoice_no];
            if (orderId) {
              await supabase.from('orders').update({ label_pdf_url: pageUrl }).eq('id', orderId);
            }
          }

          // Step 2 — render full PDF via pdfjs-dist, send each page as JPEG to Claude,
          // match extracted invoice_no to orders and save courier_barcode + tracking_number
          const pdfjsLib = await import('pdfjs-dist');
          pdfjsLib.GlobalWorkerOptions.workerSrc =
            `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
          const labelPdf = await pdfjsLib.getDocument({ data: new Uint8Array(await labelFile.arrayBuffer()) }).promise;
          setLabelParseProgress({ current: 0, total: labelPdf.numPages });
          for (let pi = 1; pi <= labelPdf.numPages; pi++) {
            setLabelParseProgress({ current: pi, total: labelPdf.numPages });
            try {
              const page = await labelPdf.getPage(pi);
              const viewport = page.getViewport({ scale: 2.0 });
              const canvas = document.createElement('canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
              const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
              const res = await fetch('/api/parse-labels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: base64 }),
              });
              if (res.ok) {
                const item = await res.json();
                if (item.invoice_no) {
                  const invoiceNo = String(item.invoice_no).replace(/^#/, '').trim();
                  const orderId = ordersByInvoiceNo[invoiceNo];
                  if (orderId) {
                    await supabase.from('orders').update({
                      courier_barcode: item.courier_barcode || null,
                      tracking_number: item.tracking_number || null,
                    }).eq('id', orderId);
                  }
                }
              } else {
                console.warn(`parse-labels page ${pi}: HTTP ${res.status}`);
              }
            } catch (e) {
              console.error(`Label extraction page ${pi} failed:`, e);
            }
          }
        } catch (e) {
          console.warn('Label processing non-critical:', e);
        }
      }

      toast.success(`Lot saved! ${parsed.length} orders created.`);
      router.push('/');
    } catch (err) {
      toast.error('Save failed: ' + err.message);
      console.error(err);
    } finally {
      setSaving(false);
      setLabelParseProgress({ current: 0, total: 0 });
    }
  };

  // Parse dates like "Apr 01, 26" -> "2026-04-01"
  function parseInvoiceDate(str) {
    if (!str) return null;
    try {
      // Handle "Mon DD, YY" format
      const m = str.match(/([A-Za-z]+)\s+(\d+),?\s+(\d{2,4})/);
      if (m) {
        const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
        const monthNum = months[m[1].toLowerCase().slice(0, 3)];
        if (monthNum === undefined) return str;
        const year = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
        const date = new Date(year, monthNum, parseInt(m[2]));
        return format(date, 'yyyy-MM-dd');
      }
    } catch {}
    return str;
  }

  const canAdvance = [
    !!partnerId,
    !!lotName.trim(),
    files.length > 0,
    parsed.length > 0,
  ];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Upload className="w-5 h-5 text-tea-500" />
        <h1 className="page-heading">Upload Invoice Lot</h1>
      </div>

      <StepIndicator current={step} />

      {/* Step 0: Select Partner */}
      {step === 0 && (
        <div className="card p-5 sm:p-6 space-y-4">
          <h2 className="font-serif text-tea-800 text-lg">Select Delivery Partner</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {partners.map((p) => (
              <button
                key={p.id}
                onClick={() => setPartnerId(p.id)}
                className={`p-4 rounded-xl border-2 text-sm font-medium transition-all min-h-[56px] ${
                  partnerId === p.id
                    ? 'border-tea-500 bg-tea-50 text-tea-700 shadow-warm-sm'
                    : 'border-tea-200 text-stone-600 hover:border-tea-400 hover:bg-tea-50/50'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
          <button onClick={() => setShowPartnerModal(true)} className="btn-secondary text-sm w-full sm:w-auto justify-center">
            <Settings2 className="w-4 h-4" /> Manage Partners
          </button>
          <div className="flex justify-end">
            <button onClick={() => setStep(1)} disabled={!canAdvance[0]} className="btn-primary w-full sm:w-auto justify-center">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 1: Name Lot */}
      {step === 1 && (
        <div className="card p-5 sm:p-6 space-y-4">
          <h2 className="font-serif text-tea-800 text-lg">Name This Lot</h2>
          <p className="text-sm text-stone-500">Give this batch of invoices a descriptive name.</p>
          <input
            className="input text-base"
            value={lotName}
            onChange={(e) => setLotName(e.target.value)}
            placeholder="e.g. 2nd April - Shiprocket - Lot 1"
          />
          <div className="flex gap-3">
            <button onClick={() => setStep(0)} className="btn-secondary flex-1 sm:flex-none justify-center">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button onClick={() => setStep(2)} disabled={!canAdvance[1]} className="btn-primary flex-1 sm:flex-none justify-center">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Upload PDFs */}
      {step === 2 && (
        <div className="card p-5 sm:p-6 space-y-4">
          <h2 className="font-serif text-tea-800 text-lg">Upload Invoice PDFs</h2>
          <FileDrop files={files} onAdd={handleAddFiles} onRemove={() => {}} />

          {files.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-tea-700">{files.length} file(s) selected:</h3>
              <div className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-tea-50 border border-tea-200 px-3 py-1.5 rounded-full text-sm text-tea-700">
                    <span className="max-w-[180px] truncate">{f.name}</span>
                    <button
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="text-stone-400 hover:text-brand-error"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Label PDF — optional */}
          <div className="border-t border-tea-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-medium text-tea-700">Label PDF <span className="text-stone-400 font-normal">(optional)</span></h3>
                <p className="text-xs text-stone-400 mt-0.5">Upload the shipping label PDF for this lot</p>
              </div>
              {!labelFile && (
                <button
                  onClick={() => labelInputRef.current?.click()}
                  className="btn-secondary text-xs px-3 py-1.5"
                >
                  <FileText className="w-3.5 h-3.5" /> Choose PDF
                </button>
              )}
            </div>
            <input
              ref={labelInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => setLabelFile(e.target.files[0] || null)}
            />
            {labelFile && (
              <div className="flex items-center gap-2 bg-tea-50 border border-tea-200 px-3 py-2 rounded-lg">
                <FileText className="w-4 h-4 text-tea-500 flex-shrink-0" />
                <span className="text-sm text-tea-700 truncate flex-1">{labelFile.name}</span>
                <button onClick={() => setLabelFile(null)} className="text-stone-400 hover:text-brand-error flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="btn-secondary flex-1 sm:flex-none justify-center">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={parseInvoices}
              disabled={!canAdvance[2] || parsing}
              className="btn-primary flex-1 sm:flex-none justify-center"
            >
              {parsing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {parseProgress.total > 1
                    ? `Batch ${parseProgress.current} of ${parseProgress.total}…`
                    : 'Parsing…'}
                </>
              ) : (
                <><Sparkles className="w-4 h-4" /> Parse Invoices</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <h2 className="font-serif text-tea-800">Review Parsed Data</h2>
                <p className="text-sm text-stone-500 mt-0.5">
                  {parsed.length} invoice(s) detected. Tap any field to edit before saving.
                </p>
              </div>
              <button onClick={() => setStep(2)} className="btn-secondary text-sm w-full sm:w-auto justify-center">
                <ChevronLeft className="w-3.5 h-3.5" /> Re-parse
              </button>
            </div>
            {parseErrors.length > 0 && (
              <div className="mt-3 space-y-1">
                {parseErrors.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span><strong>{e.file}</strong>: {e.error}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <InvoiceReviewTable invoices={parsed} onChange={setParsed} />

          <div className="card p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="text-sm text-stone-600 flex-1">
              <span className="font-semibold text-tea-700">{parsed.length}</span> orders ·{' '}
              <span className="font-semibold text-tea-700">{parsed.reduce((s, i) => s + (i.items?.length || 0), 0)}</span> items ·{' '}
              <span className="text-stone-500">{lotName}</span>
            </div>
            <button
              onClick={saveLot}
              disabled={saving || parsed.length === 0}
              className="btn-primary w-full sm:w-auto justify-center"
            >
              {saving
                ? labelParseProgress.total > 0
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Extracting courier codes… ({labelParseProgress.current}/{labelParseProgress.total})</>
                  : <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                : <><CheckCircle2 className="w-4 h-4" /> Save Lot</>}
            </button>
          </div>
        </div>
      )}

      {showPartnerModal && (
        <DeliveryPartnerModal
          onClose={() => setShowPartnerModal(false)}
          onUpdate={fetchPartners}
        />
      )}
    </div>
  );
}
