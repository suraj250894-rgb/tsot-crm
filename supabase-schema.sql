-- ============================================================
-- TSOT CRM — Supabase Database Schema
-- Run this in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Delivery partners (dynamic, editable by Samrandar)
CREATE TABLE IF NOT EXISTS delivery_partners (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default partners
INSERT INTO delivery_partners (name) VALUES ('Shiprocket'), ('Amazon Delivery')
ON CONFLICT DO NOTHING;

-- Invoice lots (a batch of invoices uploaded together)
CREATE TABLE IF NOT EXISTS invoice_lots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lot_name TEXT NOT NULL,
  delivery_partner_id UUID REFERENCES delivery_partners(id),
  uploaded_by TEXT DEFAULT 'Samrandar',
  upload_date DATE DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'picking', 'picked', 'dispatched')),
  total_orders INTEGER DEFAULT 0,
  total_items INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Individual orders (one per invoice)
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lot_id UUID REFERENCES invoice_lots(id) ON DELETE CASCADE,
  invoice_no TEXT NOT NULL,
  invoice_date DATE,
  customer_name TEXT NOT NULL,
  customer_city TEXT,
  customer_state TEXT,
  customer_pin TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  payment_method TEXT,
  subtotal DECIMAL(10,2),
  tax_amount DECIMAL(10,2),
  shipping_amount DECIMAL(10,2),
  discount_amount DECIMAL(10,2),
  total_amount DECIMAL(10,2),
  picking_status TEXT DEFAULT 'pending' CHECK (picking_status IN ('pending', 'picked')),
  courier_picked_up BOOLEAN DEFAULT false,
  packing_photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Order line items (products within each order)
CREATE TABLE IF NOT EXISTS order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2),
  total_price DECIMAL(10,2),
  matched_catalog_name TEXT,
  matched_catalog_image TEXT,
  is_collected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orders_lot_id ON orders(lot_id);
CREATE INDEX IF NOT EXISTS idx_orders_picking_status ON orders(picking_status);
CREATE INDEX IF NOT EXISTS idx_orders_invoice_date ON orders(invoice_date);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_is_collected ON order_items(is_collected);

-- ============================================================
-- Enable Realtime (run these separately in Supabase dashboard
-- under Database > Replication > Tables)
-- ============================================================
-- ALTER TABLE orders REPLICA IDENTITY FULL;
-- ALTER TABLE order_items REPLICA IDENTITY FULL;
-- ALTER TABLE invoice_lots REPLICA IDENTITY FULL;

-- ============================================================
-- Supabase Storage — run in SQL Editor
-- (Or create manually in Storage dashboard)
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('packing-photos', 'packing-photos', true)
-- ON CONFLICT DO NOTHING;

-- Storage policy: allow all reads and writes (MVP — no auth)
-- CREATE POLICY "Public read" ON storage.objects FOR SELECT USING (bucket_id = 'packing-photos');
-- CREATE POLICY "Public upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'packing-photos');
-- CREATE POLICY "Public update" ON storage.objects FOR UPDATE USING (bucket_id = 'packing-photos');
-- CREATE POLICY "Public delete" ON storage.objects FOR DELETE USING (bucket_id = 'packing-photos');
