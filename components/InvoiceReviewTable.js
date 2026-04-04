'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Check, X, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

function EditableCell({ value, onChange, type = 'text', className = '' }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value ?? '');

  const commit = () => { onChange(local); setEditing(false); };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type={type}
          className="border border-tea-400 rounded px-1.5 py-0.5 text-xs w-full min-w-[80px] focus:outline-none focus:ring-1 focus:ring-tea-400"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          autoFocus
        />
        <button onClick={commit} className="text-green-600"><Check className="w-3.5 h-3.5" /></button>
        <button onClick={() => setEditing(false)} className="text-stone-400"><X className="w-3.5 h-3.5" /></button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setLocal(value ?? ''); setEditing(true); }}
      className={clsx('group flex items-center gap-1 text-left hover:text-tea-700 transition-colors', className)}
    >
      <span className="truncate max-w-[160px]">{value || <span className="text-stone-300 italic">—</span>}</span>
      <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-stone-400 flex-shrink-0" />
    </button>
  );
}

export default function InvoiceReviewTable({ invoices, onChange }) {
  // invoices = array of { invoice_no, customer_name, customer_city, ... items: [...] }
  const [expanded, setExpanded] = useState(() => new Set(invoices.map((_, i) => i)));

  const updateInvoice = (idx, field, value) => {
    const next = invoices.map((inv, i) => i === idx ? { ...inv, [field]: value } : inv);
    onChange(next);
  };

  const updateItem = (invIdx, itemIdx, field, value) => {
    const next = invoices.map((inv, i) => {
      if (i !== invIdx) return inv;
      const items = inv.items.map((it, j) => j === itemIdx ? { ...it, [field]: value } : it);
      return { ...inv, items };
    });
    onChange(next);
  };

  const removeItem = (invIdx, itemIdx) => {
    const next = invoices.map((inv, i) => {
      if (i !== invIdx) return inv;
      return { ...inv, items: inv.items.filter((_, j) => j !== itemIdx) };
    });
    onChange(next);
  };

  const toggleExpanded = (i) => {
    setExpanded((prev) => {
      const s = new Set(prev);
      s.has(i) ? s.delete(i) : s.add(i);
      return s;
    });
  };

  return (
    <div className="space-y-3">
      {invoices.map((inv, invIdx) => (
        <div key={invIdx} className="card overflow-hidden">
          {/* Invoice header */}
          <button
            onClick={() => toggleExpanded(invIdx)}
            className="w-full flex items-center justify-between px-4 py-3 bg-tea-50 border-b border-tea-100 hover:bg-tea-100 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              {expanded.has(invIdx)
                ? <ChevronDown className="w-4 h-4 text-tea-600" />
                : <ChevronRight className="w-4 h-4 text-tea-600" />}
              <div>
                <span className="font-semibold text-stone-800 text-sm">Invoice #{inv.invoice_no}</span>
                <span className="text-xs text-stone-500 ml-3">{inv.customer_name}</span>
                <span className="text-xs text-stone-400 ml-2">{inv.customer_city}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {(!inv.invoice_no || !inv.customer_name) && (
                <span className="flex items-center gap-1 text-amber-600 text-xs">
                  <AlertCircle className="w-3.5 h-3.5" /> Missing data
                </span>
              )}
              <span className="text-sm font-medium text-tea-700">
                ₹{Number(inv.total_amount || 0).toLocaleString('en-IN')}
              </span>
              <span className="text-xs text-stone-400">{inv.items?.length || 0} items</span>
            </div>
          </button>

          {expanded.has(invIdx) && (
            <div className="p-4 space-y-4">
              {/* Customer details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {[
                  ['invoice_no', 'Invoice No', 'text'],
                  ['invoice_date', 'Date', 'text'],
                  ['customer_name', 'Customer Name', 'text'],
                  ['customer_city', 'City', 'text'],
                  ['customer_state', 'State', 'text'],
                  ['customer_pin', 'PIN', 'text'],
                  ['customer_phone', 'Phone', 'text'],
                  ['customer_email', 'Email', 'text'],
                  ['payment_method', 'Payment', 'text'],
                  ['total_amount', 'Total (₹)', 'number'],
                  ['discount_amount', 'Discount (₹)', 'number'],
                  ['tax_amount', 'Tax (₹)', 'number'],
                ].map(([field, label, type]) => (
                  <div key={field}>
                    <div className="text-stone-400 mb-0.5">{label}</div>
                    <EditableCell
                      value={inv[field]}
                      type={type}
                      onChange={(v) => updateInvoice(invIdx, field, v)}
                      className="text-stone-700 text-xs font-medium"
                    />
                  </div>
                ))}
              </div>

              {/* Items */}
              <div>
                <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Line Items</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-stone-100">
                        <th className="text-left pb-1.5 text-stone-400 font-medium pr-4">Product Name</th>
                        <th className="text-center pb-1.5 text-stone-400 font-medium w-16">Qty</th>
                        <th className="text-right pb-1.5 text-stone-400 font-medium w-24">Unit Price</th>
                        <th className="text-right pb-1.5 text-stone-400 font-medium w-24">Total</th>
                        <th className="w-6"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {(inv.items || []).map((item, itemIdx) => (
                        <tr key={itemIdx}>
                          <td className="py-1.5 pr-4">
                            <EditableCell
                              value={item.name}
                              onChange={(v) => updateItem(invIdx, itemIdx, 'name', v)}
                              className="text-stone-700"
                            />
                          </td>
                          <td className="py-1.5 text-center">
                            <EditableCell
                              value={item.qty}
                              type="number"
                              onChange={(v) => updateItem(invIdx, itemIdx, 'qty', Number(v))}
                              className="text-stone-700 justify-center"
                            />
                          </td>
                          <td className="py-1.5 text-right">
                            <EditableCell
                              value={item.price}
                              type="number"
                              onChange={(v) => updateItem(invIdx, itemIdx, 'price', Number(v))}
                              className="text-stone-700 justify-end"
                            />
                          </td>
                          <td className="py-1.5 text-right text-stone-600">
                            ₹{((item.qty || 1) * (item.price || 0)).toLocaleString('en-IN')}
                          </td>
                          <td className="py-1.5 pl-2">
                            <button
                              onClick={() => removeItem(invIdx, itemIdx)}
                              className="text-stone-300 hover:text-red-500 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
