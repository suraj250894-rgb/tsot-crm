import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const BUCKET = 'catalog';
const FILE_PATH = 'catalog.json';

/** GET — return latest catalog from Supabase storage, or nothing if not uploaded yet */
export async function GET() {
  try {
    const supabase = createServerClient();

    // Check if catalog exists in storage
    const { data: files } = await supabase.storage.from(BUCKET).list('', { search: 'catalog.json' });
    if (!files?.length) {
      return NextResponse.json({ catalog: null, metadata: null });
    }

    // Get public URL and fetch content
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(FILE_PATH);
    const res = await fetch(publicUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch catalog from storage');

    const catalog = await res.json();

    // Get metadata
    const { data: meta } = await supabase
      .from('catalog_metadata')
      .select('*')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ catalog, metadata: meta });
  } catch (err) {
    console.error('catalog GET error:', err);
    return NextResponse.json({ catalog: null, metadata: null, error: err.message });
  }
}

/** POST — upload new catalog.json, validate, save to Supabase storage + metadata table */
export async function POST(request) {
  try {
    const supabase = createServerClient();
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const text = await file.text();
    let products;
    try {
      products = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON file' }, { status: 400 });
    }

    if (!Array.isArray(products)) {
      return NextResponse.json({ error: 'JSON must be an array of products' }, { status: 400 });
    }

    // Validate + normalise: accept both {n, i} and {title, image} shapes
    const normalised = products
      .filter((p) => p && (p.n || p.title) && (p.i || p.image))
      .map((p) => ({
        n: p.n || p.title,
        s: p.s || p.sku || '',
        p: p.p || p.price || 0,
        i: p.i || p.image,
        w: p.w || p.weight || '',
        v: p.v || p.vendor || '',
      }));

    if (normalised.length === 0) {
      return NextResponse.json({ error: 'No valid products found. Each product needs a name and image URL.' }, { status: 400 });
    }

    // Upload to Supabase storage
    const bytes = Buffer.from(JSON.stringify(normalised));
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(FILE_PATH, bytes, {
        contentType: 'application/json',
        upsert: true,
      });
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(FILE_PATH);

    // Save metadata record
    await supabase.from('catalog_metadata').insert({
      product_count: normalised.length,
      file_url: publicUrl,
      uploaded_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      productCount: normalised.length,
      fileUrl: publicUrl,
    });
  } catch (err) {
    console.error('catalog POST error:', err);
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
