/**
 * Catalog fetch + session cache.
 * Priority: Supabase storage → public/catalog.json fallback
 * Cached in sessionStorage to avoid repeated network fetches.
 */

const CACHE_KEY = 'tsot_catalog_v1';
const CACHE_TS_KEY = 'tsot_catalog_ts';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

let memCache = null; // in-memory for SSR / same-tab speed

export async function fetchCatalog() {
  // 1. In-memory cache (fastest)
  if (memCache) return memCache;

  // 2. sessionStorage cache
  if (typeof window !== 'undefined') {
    try {
      const ts = parseInt(sessionStorage.getItem(CACHE_TS_KEY) || '0', 10);
      if (Date.now() - ts < CACHE_TTL_MS) {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (raw) {
          memCache = JSON.parse(raw);
          return memCache;
        }
      }
    } catch {}
  }

  // 3. Try Supabase catalog via API route
  try {
    const res = await fetch('/api/catalog');
    if (res.ok) {
      const json = await res.json();
      if (json.catalog && Array.isArray(json.catalog)) {
        memCache = json.catalog;
        _saveToSession(memCache);
        return memCache;
      }
    }
  } catch {}

  // 4. Fallback: public/catalog.json
  try {
    const res = await fetch('/catalog.json');
    if (res.ok) {
      const data = await res.json();
      memCache = data;
      _saveToSession(memCache);
      return memCache;
    }
  } catch {}

  return [];
}

function _saveToSession(data) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
    sessionStorage.setItem(CACHE_TS_KEY, String(Date.now()));
  } catch {}
}

export function invalidateCatalogCache() {
  memCache = null;
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(CACHE_KEY);
    sessionStorage.removeItem(CACHE_TS_KEY);
  }
}
