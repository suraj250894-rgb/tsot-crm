'use client';

import Image from 'next/image';
import { CheckCircle2, Circle, ImageOff } from 'lucide-react';
import clsx from 'clsx';

export default function ProductCard({ product, onToggle, compact = false }) {
  const { product_name, matched_catalog_name, matched_catalog_image, totalQty, is_collected } = product;

  return (
    <button
      onClick={onToggle}
      className={clsx(
        'w-full text-left rounded-xl border-2 p-3 transition-all active:scale-[0.98]',
        is_collected
          ? 'border-green-300 bg-green-50 opacity-60'
          : 'border-stone-200 bg-white hover:border-tea-300 hover:shadow-md',
        compact ? 'flex items-center gap-3' : 'flex flex-col gap-2'
      )}
    >
      {compact ? (
        <>
          {/* Image */}
          <div className="relative w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-stone-100">
            {matched_catalog_image ? (
              <Image src={matched_catalog_image} alt={matched_catalog_name || product_name} fill className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-stone-300">
                <ImageOff className="w-5 h-5" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-stone-800 leading-snug line-clamp-2">{product_name}</p>
          </div>
          <div className="flex-shrink-0 flex flex-col items-center gap-1">
            <span className="text-xs font-bold text-stone-600 bg-stone-100 rounded-full w-8 h-8 flex items-center justify-center">
              ×{totalQty || 1}
            </span>
            {is_collected
              ? <CheckCircle2 className="w-5 h-5 text-green-500" />
              : <Circle className="w-5 h-5 text-stone-300" />}
          </div>
        </>
      ) : (
        <>
          {/* Large image for godown view */}
          <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-stone-100">
            {matched_catalog_image ? (
              <Image
                src={matched_catalog_image}
                alt={matched_catalog_name || product_name}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-stone-300 gap-2">
                <ImageOff className="w-10 h-10" />
                <span className="text-xs">No image</span>
              </div>
            )}
            {/* Qty badge */}
            <div className="absolute top-2 right-2 bg-tea-700 text-white text-sm font-bold rounded-full w-8 h-8 flex items-center justify-center shadow">
              ×{totalQty || 1}
            </div>
            {/* Collected overlay */}
            {is_collected && (
              <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-12 h-12 text-green-600" />
              </div>
            )}
          </div>
          <p className="text-sm font-medium text-stone-800 leading-snug line-clamp-3">
            {product_name}
          </p>
          <div className={clsx(
            'flex items-center gap-2 text-sm font-medium',
            is_collected ? 'text-green-600' : 'text-stone-400'
          )}>
            {is_collected
              ? <><CheckCircle2 className="w-4 h-4" /> Collected</>
              : <><Circle className="w-4 h-4" /> Tap to collect</>}
          </div>
        </>
      )}
    </button>
  );
}
