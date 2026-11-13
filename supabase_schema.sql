-- ============================================================================
-- ETHEREUM BIRD — SUPABASE POSTGRESQL SCHEMA & REALTIME SETUP
-- Jalankan seluruh script ini di Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================================

-- 1. TABEL ADMIN
CREATE TABLE IF NOT EXISTS public.admin_users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Akun admin bawaan
INSERT INTO public.admin_users (id, username, password)
VALUES ('adm1', 'admin', '123')
ON CONFLICT (username) DO NOTHING;

-- 3. TABEL STOK BURUNG (HARGA BELI & HARGA JUAL)
CREATE TABLE IF NOT EXISTS public.stok_burung (
  id TEXT PRIMARY KEY,
  jenis_burung TEXT NOT NULL,
  jumlah INTEGER NOT NULL DEFAULT 1 CHECK (jumlah > 0),
  harga_beli BIGINT NOT NULL DEFAULT 0,
  harga_jual BIGINT NOT NULL DEFAULT 0,
  tanggal DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TABEL BURUNG TERJUAL
CREATE TABLE IF NOT EXISTS public.burung_terjual (
  id TEXT PRIMARY KEY,
  jenis_burung TEXT NOT NULL,
  jumlah INTEGER NOT NULL DEFAULT 1 CHECK (jumlah > 0),
  harga_jual BIGINT NOT NULL DEFAULT 0,
  tanggal DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5A. TABEL LAIN-LAIN: STATUS BURUNG (MATI / LEPAS / HILANG)
CREATE TABLE IF NOT EXISTS public.status_burung (
  id TEXT PRIMARY KEY,
  jenis_burung TEXT NOT NULL,
  jumlah INTEGER NOT NULL DEFAULT 1 CHECK (jumlah > 0),
  status TEXT NOT NULL CHECK (status IN ('Mati', 'Lepas', 'Hilang')),
  total_harga BIGINT NOT NULL DEFAULT 0,
  tanggal DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5B. TABEL LAIN-LAIN: HPP (OPERASIONAL)
CREATE TABLE IF NOT EXISTS public.hpp (
  id TEXT PRIMARY KEY,
  kategori TEXT NOT NULL CHECK (kategori IN ('Makanan & Vitamin', 'Ongkos Kirim')),
  nominal BIGINT NOT NULL DEFAULT 0,
  tanggal DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. VIEW DASHBOARD (RINGKASAN REALTIME)
-- ============================================================================
CREATE OR REPLACE VIEW public.v_dashboard_summary AS
SELECT
  GREATEST(
    0,
    COALESCE((SELECT SUM(jumlah) FROM public.stok_burung), 0)
    - COALESCE((SELECT SUM(jumlah) FROM public.burung_terjual), 0)
    - COALESCE((SELECT SUM(jumlah) FROM public.status_burung), 0)
  ) AS total_stok_hidup,
  COALESCE((SELECT SUM(jumlah * harga_beli) FROM public.stok_burung), 0) AS total_modal_pembelian,
  COALESCE((SELECT SUM(jumlah * harga_jual) FROM public.burung_terjual), 0) AS total_penjualan,
  COALESCE((SELECT SUM(total_harga) FROM public.status_burung), 0) AS total_kerugian_status,
  COALESCE((SELECT SUM(nominal) FROM public.hpp), 0) AS total_hpp,
  (
    COALESCE((SELECT SUM(jumlah * harga_jual) FROM public.burung_terjual), 0)
    - COALESCE((SELECT SUM(jumlah * harga_beli) FROM public.stok_burung), 0)
    - COALESCE((SELECT SUM(total_harga) FROM public.status_burung), 0)
    - COALESCE((SELECT SUM(nominal) FROM public.hpp), 0)
  ) AS laba_keuntungan_bersih;

-- ============================================================================
-- 6. VIEW LAPORAN KEUANGAN LENGKAP
-- ============================================================================
CREATE OR REPLACE VIEW public.v_laporan_keuangan AS
SELECT
  total_stok_hidup,
  total_modal_pembelian AS total_pembelian,
  total_penjualan,
  total_kerugian_status,
  total_hpp AS total_biaya_hpp,
  laba_keuntungan_bersih,
  NOW() AS generated_at
FROM public.v_dashboard_summary;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) — AKSES API PUBLIK UNTUK DASHBOARD WEB
-- ============================================================================
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stok_burung ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.burung_terjual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_burung ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hpp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all anon admin_users" ON public.admin_users;
CREATE POLICY "Allow all anon admin_users" ON public.admin_users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all anon stok_burung" ON public.stok_burung;
CREATE POLICY "Allow all anon stok_burung" ON public.stok_burung FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all anon burung_terjual" ON public.burung_terjual;
CREATE POLICY "Allow all anon burung_terjual" ON public.burung_terjual FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all anon status_burung" ON public.status_burung;
CREATE POLICY "Allow all anon status_burung" ON public.status_burung FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all anon hpp" ON public.hpp;
CREATE POLICY "Allow all anon hpp" ON public.hpp FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- AKTIFKAN SUPABASE REALTIME UNTUK SINKRONISASI OTOMATIS
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'stok_burung'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stok_burung;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'burung_terjual'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.burung_terjual;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'status_burung'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.status_burung;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'hpp'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hpp;
  END IF;
END $$;
