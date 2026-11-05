-- ==============================================================
-- SKRIP DATABASE SUPABASE POSTGRESQL: WARUNG METAL 🤘
-- Salin dan jalankan seluruh isi file ini di menu "SQL Editor" Supabase
-- ==============================================================

-- 1. TABEL PRODUK / KATALOG BARANG
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Lainnya',
    unit TEXT NOT NULL DEFAULT 'pcs',
    cost_price NUMERIC NOT NULL DEFAULT 0,
    sell_price NUMERIC NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER NOT NULL DEFAULT 5,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 2. TABEL PENJUALAN / NOTA KASIR
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    total NUMERIC NOT NULL DEFAULT 0,
    paid NUMERIC NOT NULL DEFAULT 0,
    change NUMERIC NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'cash', -- 'cash' atau 'qris'
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 3. TABEL DETAIL BARANG TERJUAL
CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    qty INTEGER NOT NULL DEFAULT 1,
    sell_price NUMERIC NOT NULL DEFAULT 0,
    cost_price NUMERIC NOT NULL DEFAULT 0
);

-- 4. TABEL RIWAYAT MUTASI STOK
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'sale', 'restock', 'adjust'
    qty_change INTEGER NOT NULL, -- negatif untuk keluar/sale, positif untuk masuk/restock
    reason TEXT NOT NULL DEFAULT '',
    sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- INDEX UNTUK PERFORMA QUERY
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON public.sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_prod ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON public.stock_movements(created_at DESC);

-- 5. FUNGSI TRANSAKSI ATOMIK: CHECKOUT KASIR (ACID TRANSACTION)
-- Menjamin pencatatan nota, item, mutasi, dan pemotongan stok berjalan 1 paket utuh.
CREATE OR REPLACE FUNCTION public.checkout_sale(
    p_sale JSONB,
    p_items JSONB,
    p_movements JSONB
) RETURNS JSONB AS $$
DECLARE
    v_sale_id UUID;
    v_item RECORD;
    v_movement RECORD;
    v_current_stock INT;
BEGIN
    -- Masukkan data penjualan utama
    INSERT INTO public.sales (
        id, total, paid, change, payment_method, created_at
    ) VALUES (
        (p_sale->>'id')::UUID,
        (p_sale->>'total')::NUMERIC,
        (p_sale->>'paid')::NUMERIC,
        (p_sale->>'change')::NUMERIC,
        COALESCE(p_sale->>'payment_method', 'cash'),
        COALESCE((p_sale->>'created_at')::TIMESTAMPTZ, timezone('utc', now()))
    ) RETURNING id INTO v_sale_id;

    -- Masukkan semua item nota & kurangi stok
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        id UUID, product_id UUID, name TEXT, qty INT, sell_price NUMERIC, cost_price NUMERIC
    ) LOOP
        -- Periksa stok produk saat ini
        SELECT stock INTO v_current_stock FROM public.products WHERE id = v_item.product_id FOR UPDATE;
        IF v_current_stock < v_item.qty THEN
            RAISE EXCEPTION 'Stok untuk barang % tidak mencukupi (sisa: %, diminta: %)', v_item.name, v_current_stock, v_item.qty;
        END IF;

        -- Kurangi stok produk
        UPDATE public.products 
        SET stock = stock - v_item.qty, updated_at = timezone('utc', now())
        WHERE id = v_item.product_id;

        -- Catat item nota
        INSERT INTO public.sale_items (
            id, sale_id, product_id, name, qty, sell_price, cost_price
        ) VALUES (
            COALESCE(v_item.id, gen_random_uuid()),
            v_sale_id,
            v_item.product_id,
            v_item.name,
            v_item.qty,
            v_item.sell_price,
            v_item.cost_price
        );
    END LOOP;

    -- Masukkan rekaman mutasi stok
    FOR v_movement IN SELECT * FROM jsonb_to_recordset(p_movements) AS y(
        id UUID, product_id UUID, type TEXT, qty_change INT, reason TEXT, created_at TIMESTAMPTZ
    ) LOOP
        INSERT INTO public.stock_movements (
            id, product_id, type, qty_change, reason, sale_id, created_at
        ) VALUES (
            COALESCE(v_movement.id, gen_random_uuid()),
            v_movement.product_id,
            v_movement.type,
            v_movement.qty_change,
            COALESCE(v_movement.reason, 'Penjualan Kasir'),
            v_sale_id,
            COALESCE(v_movement.created_at, timezone('utc', now()))
        );
    END LOOP;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. REALTIME REPLICATION (Agar sinkron otomatis di multi-perangkat)
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;

-- 7. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- Kebijakan RLS: Izinkan pengguna terautentikasi (Kasir / Pemilik Warung yang login)
DROP POLICY IF EXISTS "Authenticated users full access to products" ON public.products;
CREATE POLICY "Authenticated users full access to products" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users full access to sales" ON public.sales;
CREATE POLICY "Authenticated users full access to sales" ON public.sales FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users full access to sale_items" ON public.sale_items;
CREATE POLICY "Authenticated users full access to sale_items" ON public.sale_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users full access to stock_movements" ON public.stock_movements;
CREATE POLICY "Authenticated users full access to stock_movements" ON public.stock_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Juga izinkan akses anon untuk kemudahan transisi/testing awal
DROP POLICY IF EXISTS "Anon read access products" ON public.products;
CREATE POLICY "Anon read access products" ON public.products FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anon read access sales" ON public.sales;
CREATE POLICY "Anon read access sales" ON public.sales FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anon read access sale_items" ON public.sale_items;
CREATE POLICY "Anon read access sale_items" ON public.sale_items FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anon read access stock_movements" ON public.stock_movements;
CREATE POLICY "Anon read access stock_movements" ON public.stock_movements FOR ALL TO anon USING (true) WITH CHECK (true);
