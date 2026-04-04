-- ============================================================
-- TSOT CRM — Migration: Order Comments + Catalog Metadata
-- Run this in Supabase SQL Editor BEFORE deploying the app
-- ============================================================

-- 1. Order Comments Table
CREATE TABLE IF NOT EXISTS order_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  comment_text TEXT NOT NULL CHECK (char_length(comment_text) <= 500),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE order_comments DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_order_comments_order_id ON order_comments(order_id);

-- 2. Catalog Metadata Table
CREATE TABLE IF NOT EXISTS catalog_metadata (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_count INTEGER NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  file_url TEXT
);

ALTER TABLE catalog_metadata DISABLE ROW LEVEL SECURITY;

-- 3. Supabase Storage Bucket for Catalog
-- Run this in Supabase Dashboard → Storage → New Bucket
-- Name: catalog
-- Public: YES
-- (Cannot be done via SQL in Supabase free tier — do it manually in the dashboard)

-- Alternatively, via the Supabase API / CLI:
-- supabase storage create catalog --public

-- 4. Label PDF URL column on invoice_lots
-- (Run this if you already ran the previous migration — safe to run multiple times)
ALTER TABLE invoice_lots ADD COLUMN IF NOT EXISTS label_pdf_url TEXT;

-- ============================================================
-- VERIFICATION QUERIES (run after migration to confirm)
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('order_comments', 'catalog_metadata');
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'invoice_lots' AND column_name = 'label_pdf_url';
