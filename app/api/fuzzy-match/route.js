import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { matchOrderItems } from '@/lib/fuzzyMatch';
import { readFileSync } from 'fs';
import path from 'path';

// Load catalog once at module level (cached by Node.js module cache)
let catalogCache = null;
function getCatalog() {
  if (catalogCache) return catalogCache;
  try {
    const catalogPath = path.join(process.cwd(), 'public', 'catalog.json');
    const raw = readFileSync(catalogPath, 'utf-8');
    catalogCache = JSON.parse(raw);
    return catalogCache;
  } catch (err) {
    console.error('Failed to load catalog.json:', err.message);
    return [];
  }
}

export async function POST(request) {
  try {
    const { lotId } = await request.json();
    if (!lotId) return NextResponse.json({ error: 'lotId required' }, { status: 400 });

    const supabase = createServerClient();
    const catalog = getCatalog();

    if (catalog.length === 0) {
      return NextResponse.json({ warning: 'Catalog is empty — no fuzzy matching performed', matched: 0 });
    }

    // Get all order_items for this lot
    const { data: items, error } = await supabase
      .from('order_items')
      .select('id, product_name, orders!inner(lot_id)')
      .eq('orders.lot_id', lotId);

    if (error) throw error;
    if (!items?.length) return NextResponse.json({ matched: 0 });

    // Run fuzzy match
    const matches = await matchOrderItems(items, catalog);

    // Batch update in chunks of 100
    const CHUNK = 100;
    let updatedCount = 0;
    for (let i = 0; i < matches.length; i += CHUNK) {
      const chunk = matches.slice(i, i + CHUNK);
      const updatePromises = chunk
        .filter((m) => m.matched_catalog_name) // only update if we found a match
        .map((m) =>
          supabase
            .from('order_items')
            .update({
              matched_catalog_name: m.matched_catalog_name,
              matched_catalog_image: m.matched_catalog_image,
            })
            .eq('id', m.id)
        );
      await Promise.all(updatePromises);
      updatedCount += updatePromises.length;
    }

    return NextResponse.json({ matched: updatedCount, total: items.length });
  } catch (err) {
    console.error('fuzzy-match error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
