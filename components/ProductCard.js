'use client';

import Image from 'next/image';
import { CheckCircle2, Circle, ImageOff, XCircle } from 'lucide-react';
import clsx from 'clsx';

export default function ProductCard({ product, onToggle, onMarkNotFound, compact = false }) {
  const {
    product_name, matched_catalog_name, matched_catalog_image,
    totalQty, is_collected,
    item_status: rawStatus,
  } = product;

  // Backward-compat: derive status from is_collected if item_status not set
  const status = rawStatus || (is_collected ? 'picked' : 'pending');
  const isNotFound = status === 'not_found';
  const isPicked   = status === 'picked';

  /* ── COMPACT (Pack by Invoice) ──────────────────────────────── */
  if (compact) {
    return (
      <div className={clsx(
        'flex items-center gap-3 rounded-lg transition-all',
        isNotFound && 'bg-red-50 border border-red-100 px-2 py-1 -mx-2 -my-0.5'
      )}>
        {/* Main tap area → toggle */}
        <button
          onClick={onToggle}
          className="flex items-center gap-3 flex-1 text-left min-h-[44px] active:scale-[0.98]"
        >
          {/* Thumbnail */}
          <div className={clsx(
            'relative w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-stone-100',
            isNotFound && 'grayscale opacity-50'
          )}>
            {matched_catalog_image ? (
              <Image src={matched_catalog_image} alt={matched_catalog_name || product_name} fill className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-stone-300">
                <ImageOff className="w-5 h-5" />
              </div>
            )}
          </div>

          {/* Name + badge */}
          <div className="flex-1 min-w-0">
            <p className={clsx(
              'text-sm font-medium leading-snug line-clamp-2',
              isNotFound ? 'text-red-700 line-through decoration-red-400' : 'text-stone-800'
            )}>
              {product_name}
            </p>
            {isNotFound && (
              <span className="badge-not-found mt-0.5 inline-flex text-[10px] px-1.5 py-0">Not Found</span>
            )}
          </div>

          {/* Qty + status icon */}
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <span className={clsx(
              'text-xs font-bold rounded-full w-8 h-8 flex items-center justify-center',
              isNotFound ? 'bg-red-100 text-red-600' : 'bg-stone-100 text-stone-600'
            )}>
              ×{totalQty || 1}
            </span>
            {isNotFound
              ? <XCircle className="w-5 h-5 text-red-400" />
              : isPicked
                ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                : <Circle className="w-5 h-5 text-stone-300" />}
          </div>
        </button>

        {/* Not Found button — only when pending */}
        {!isPicked && !isNotFound && onMarkNotFound && (
          <button
            onClick={(e) => { e.stopPropagation(); onMarkNotFound(); }}
            title="Mark as Not Found"
            className="p-2 text-stone-200 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <XCircle className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  /* ── GODOWN CARD — Not Found state ─────────────────────────── */
  if (isNotFound) {
    return (
      <div className="w-full rounded-xl border-2 border-red-200 bg-red-50 p-3 flex flex-col gap-2">
        {/* Image — grayscale */}
        <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-stone-100">
          {matched_catalog_image ? (
            <Image
              src={matched_catalog_image}
              alt={matched_catalog_name || product_name}
              fill
              className="object-cover grayscale opacity-40"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-stone-300 gap-2">
              <ImageOff className="w-10 h-10" />
            </div>
          )}
          <div className="absolute top-2 right-2 bg-red-600 text-white text-sm font-bold rounded-full w-8 h-8 flex items-center justify-center shadow">
            ×{totalQty || 1}
          </div>
          <div className="absolute inset-0 bg-red-500/10 flex items-center justify-center">
            <XCircle className="w-14 h-14 text-red-500/60" />
          </div>
        </div>

        <p className="text-sm font-medium text-stone-600 leading-snug line-clamp-3">{product_name}</p>
        <span className="badge-not-found self-start">Not Found in Godown</span>

        <button
          onClick={onToggle}
          className="w-full text-xs font-medium text-brand-success hover:bg-green-50 border border-green-200 rounded-lg py-2 px-3 transition-colors min-h-[40px] flex items-center justify-center gap-1.5"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Found It — Mark as Picked
        </button>
      </div>
    );
  }

  /* ── GODOWN CARD — Picked / Pending states ──────────────────── */
  return (
    <div className={clsx(
      'w-full rounded-xl border-2 p-3 transition-all flex flex-col gap-2',
      isPicked
        ? 'border-green-300 bg-green-50 opacity-60'
        : 'border-stone-200 bg-white hover:border-tea-300 hover:shadow-md'
    )}>
      {/* Main tap area */}
      <button onClick={onToggle} className="w-full text-left flex flex-col gap-2 active:scale-[0.98]">
        <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-stone-100">
          {matched_catalog_image ? (
            <Image src={matched_catalog_image} alt={matched_catalog_name || product_name} fill className="object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-stone-300 gap-2">
              <ImageOff className="w-10 h-10" />
              <span className="text-xs">No image</span>
            </div>
          )}
          <div className="absolute top-2 right-2 bg-tea-700 text-white text-sm font-bold rounded-full w-8 h-8 flex items-center justify-center shadow">
            ×{totalQty || 1}
          </div>
          {isPicked && (
            <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-green-600" />
            </div>
          )}
        </div>

        <p className="text-sm font-medium text-stone-800 leading-snug line-clamp-3">{product_name}</p>

        <div className={clsx('flex items-center gap-2 text-sm font-medium', isPicked ? 'text-green-600' : 'text-stone-400')}>
          {isPicked
            ? <><CheckCircle2 className="w-4 h-4" /> Collected</>
            : <><Circle className="w-4 h-4" /> Tap to collect</>}
        </div>
      </button>

      {/* Not Found button — only when pending */}
      {!isPicked && onMarkNotFound && (
        <button
          onClick={onMarkNotFound}
          className="w-full text-xs text-stone-400 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-lg py-1.5 px-3 transition-all min-h-[36px] flex items-center justify-center gap-1.5"
        >
          <XCircle className="w-3.5 h-3.5" />
          Not Found
        </button>
      )}
    </div>
  );
}
