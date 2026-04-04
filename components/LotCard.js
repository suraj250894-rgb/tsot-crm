'use client';

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Truck, Package, ChevronRight, Trash2, Clock, FileText } from 'lucide-react';
import clsx from 'clsx';

function StatusBadge({ status }) {
  const map = {
    uploaded:   'badge-uploaded',
    picking:    'badge-picking',
    picked:     'badge-picked',
    dispatched: 'badge-dispatched',
  };
  return (
    <span className={map[status] || 'badge-uploaded'}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function LotCard({ lot, onDelete }) {
  const { id, lot_name, status, upload_date, total_orders, delivery_partner, picked_orders = 0, label_pdf_url } = lot;
  const progress = total_orders > 0 ? Math.round((picked_orders / total_orders) * 100) : 0;
  const readyToDispatch = status === 'picked';
  const canDelete = status !== 'dispatched';

  return (
    <div className={clsx(
      'card block p-4 transition-all relative group/card',
      readyToDispatch ? 'border-tea-400 bg-brand-warning-bg shadow-warm-md' : 'hover:border-tea-300 hover:shadow-warm-md'
    )}>
      {/* Ready-to-dispatch banner */}
      {readyToDispatch && (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 mb-3 bg-amber-100/80 -mx-4 -mt-4 px-4 py-2 rounded-t-xl border-b border-tea-200">
          <Clock className="w-3.5 h-3.5" />
          Ready to Dispatch — awaiting courier pickup
        </div>
      )}

      <Link href={`/picking/${id}`} className="block group">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={status} />
              <span className="text-xs text-stone-400">
                {upload_date ? format(parseISO(upload_date), 'd MMM yyyy') : ''}
              </span>
            </div>
            <h3 className="font-semibold text-tea-800 mt-1 text-sm leading-snug truncate">{lot_name}</h3>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-stone-500">
              <span className="flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-tea-400" />
                {delivery_partner?.name || 'Unknown'}
              </span>
              <span className="flex items-center gap-1">
                <Package className="w-3.5 h-3.5 text-tea-400" />
                {total_orders} orders
              </span>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-stone-300 group-hover:text-tea-500 transition-colors flex-shrink-0 mt-1" />
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex justify-between text-xs text-stone-400 mb-1">
            <span>{picked_orders} / {total_orders} picked</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-tea-100 rounded-full h-2">
            <div
              className={clsx(
                'h-2 rounded-full transition-all duration-500',
                progress === 100 ? 'bg-brand-success' : 'bg-tea-400'
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </Link>

      {/* Label PDF link */}
      {label_pdf_url && (
        <a
          href={label_pdf_url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-2.5 flex items-center gap-1.5 text-xs text-tea-500 hover:text-tea-700 transition-colors"
        >
          <FileText className="w-3.5 h-3.5 flex-shrink-0" />
          View Label PDF
        </a>
      )}

      {/* Delete button — absolute positioned, non-link */}
      {canDelete && onDelete && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(lot); }}
          className="absolute bottom-3 right-3 p-1.5 text-stone-300 hover:text-brand-error hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover/card:opacity-100 focus:opacity-100"
          title="Delete lot"
          aria-label="Delete lot"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
