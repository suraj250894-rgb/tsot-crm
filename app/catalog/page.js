'use client';

import { useState, useEffect, useCallback } from 'react';
import CatalogUploader from '@/components/CatalogUploader';
import { invalidateCatalogCache } from '@/lib/catalog';
import {
  BookOpen, Package, Clock, RefreshCw, Download,
  HelpCircle, Loader2, ExternalLink
} from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

export default function CatalogPage() {
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showHelp, setShowHelp] = useState(false);

  const fetchMeta = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/catalog');
      const json = await res.json();
      setMetadata(json.metadata || null);
    } catch {
      toast.error('Failed to load catalog info');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  const handleUploaded = (result) => {
    invalidateCatalogCache();
    fetchMeta();
  };

  const downloadCurrent = async () => {
    try {
      const res = await fetch('/api/catalog');
      const json = await res.json();
      if (!json.catalog) { toast.error('No catalog uploaded yet — using local fallback'); return; }
      const blob = new Blob([JSON.stringify(json.catalog, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'catalog.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-tea-600" />
            <h1 className="page-heading">Product Catalog</h1>
          </div>
          <p className="page-subheading mt-1">
            Manage the product catalog used for image matching during picking.
          </p>
        </div>
        <button
          onClick={() => setShowHelp((s) => !s)}
          className="btn-secondary text-sm"
        >
          <HelpCircle className="w-4 h-4" /> Help
        </button>
      </div>

      {/* Help panel */}
      {showHelp && (
        <div className="card p-4 border-tea-300 bg-tea-50/50 space-y-2">
          <h3 className="font-semibold text-tea-800 text-sm">How to Update the Catalog</h3>
          <ol className="text-sm text-stone-600 space-y-1 list-decimal list-inside">
            <li>Export your product list from Shopify Admin → Products → Export (CSV)</li>
            <li>Run the catalog scraper script to convert CSV → catalog.json</li>
            <li>Upload the new catalog.json using the uploader below</li>
            <li>The system will immediately use the new catalog for fuzzy image matching</li>
          </ol>
          <p className="text-xs text-stone-400 mt-2">
            Repeat weekly or whenever you add new products.
            The local <code>public/catalog.json</code> is used as a fallback if no catalog has been uploaded yet.
          </p>
        </div>
      )}

      {/* Current catalog stats */}
      <div className="card p-5">
        <h2 className="font-serif text-tea-800 mb-4">Current Catalog</h2>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-tea-400" />
          </div>
        ) : metadata ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-tea-50 rounded-xl p-4 text-center">
                <Package className="w-6 h-6 text-tea-500 mx-auto mb-1" />
                <div className="text-3xl font-bold text-tea-700">
                  {metadata.product_count.toLocaleString()}
                </div>
                <div className="text-xs text-stone-500 mt-0.5">Products</div>
              </div>
              <div className="bg-tea-50 rounded-xl p-4 text-center">
                <Clock className="w-6 h-6 text-tea-500 mx-auto mb-1" />
                <div className="text-base font-semibold text-tea-700">
                  {formatDistanceToNow(parseISO(metadata.uploaded_at), { addSuffix: true })}
                </div>
                <div className="text-xs text-stone-500 mt-0.5">
                  {format(parseISO(metadata.uploaded_at), 'd MMM yyyy, h:mm a')}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={downloadCurrent} className="btn-secondary text-sm flex-1 justify-center">
                <Download className="w-4 h-4" /> Download Current
              </button>
              {metadata.file_url && (
                <a
                  href={metadata.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary text-sm px-3"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
              <button onClick={fetchMeta} className="btn-secondary text-sm px-3">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-stone-400">
            <Package className="w-10 h-10 mx-auto mb-2 text-stone-200" />
            <p className="text-sm">No catalog uploaded yet.</p>
            <p className="text-xs mt-1">Using <code>public/catalog.json</code> as fallback.</p>
          </div>
        )}
      </div>

      {/* Uploader */}
      <div className="card p-5">
        <h2 className="font-serif text-tea-800 mb-1">Upload New Catalog</h2>
        <p className="text-sm text-stone-500 mb-4">
          Upload a <code>catalog.json</code> to replace the current product catalog. The new catalog will be used immediately for all future lot uploads.
        </p>
        <CatalogUploader onUploaded={handleUploaded} />
      </div>
    </div>
  );
}
