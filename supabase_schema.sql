-- =========================================================
-- Skrip Pembuatan Tabel Toko Burung (Kicau Makmur) di Supabase
--
-- Cara menjalankan:
-- 1. Buka dashboard Supabase: https://supabase.com/dashboard/project/edyeugvyfbblkbljyowt
-- 2. Pilih menu "SQL Editor" di bilah sisi kiri
-- 3. Klik "New Query", tempel seluruh isi file ini, lalu klik "Run"
-- =========================================================

-- 1. Tabel Burung (Master Data & Stok)
CREATE TABLE IF NOT EXISTS public.birds (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  kategori TEXT NOT NULL,
  asal TEXT NOT NULL,
  keterangan TEXT,
  "tanggalMasuk" DATE NOT NULL,
  "hargaBeli" BIGINT NOT NULL,
  "hargaJual" BIGINT NOT NULL,
  "minStok" INTEGER DEFAULT 5,
  foto TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabel Burung Datang (Riwayat Kedatangan)
CREATE TABLE IF NOT EXISTS public.arrivals (
  id TEXT PRIMARY KEY,
  tanggal DATE NOT NULL,
  "birdId" TEXT REFERENCES public.birds(id) ON DELETE CASCADE,
  nama TEXT NOT NULL,
  kategori TEXT NOT NULL,
  jumlah INTEGER NOT NULL,
  "hargaBeli" BIGINT NOT NULL,
  pemasok TEXT,
  catatan TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabel Burung Terjual (Riwayat Transaksi Penjualan)
CREATE TABLE IF NOT EXISTS public.sales (
  id TEXT PRIMARY KEY,
  tanggal DATE NOT NULL,
  "noTransaksi" TEXT NOT NULL,
  "birdId" TEXT REFERENCES public.birds(id) ON DELETE CASCADE,
  nama TEXT NOT NULL,
  kategori TEXT NOT NULL,
  jumlah INTEGER NOT NULL,
  "hargaJual" BIGINT NOT NULL,
  "hargaPokok" BIGINT NOT NULL,
  pembeli TEXT,
  metode TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabel HPP (Pencatatan Biaya Pakan & Burung Mati/Lepas)
CREATE TABLE IF NOT EXISTS public.hpp (
  id TEXT PRIMARY KEY,
  tanggal DATE NOT NULL,
  "pakanBurung" TEXT,
  "biayaPakan" BIGINT DEFAULT 0,
  "matiAtauLepas" TEXT,
  "biayaMatiLepas" BIGINT DEFAULT 0,
  "totalBiaya" BIGINT DEFAULT 0,
  catatan TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabel User Admin (Manajemen Akun Admin)
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT DEFAULT 'kicau-makmur-demo',
  role TEXT DEFAULT 'admin',
  nama_lengkap TEXT DEFAULT 'Admin Toko',
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Masukkan user admin bawaan (username: hasan | password: HASANH1J1)
INSERT INTO public.admin_users (username, email, password_hash, salt, role, nama_lengkap)
VALUES (
  'hasan',
  'hasan@kicaumakmur.com',
  'be9254846c704eb9d4ed5193164428b153946fedb9786453558c895ca3376487',
  'kicau-makmur-demo',
  'admin',
  'Muhammad Hasan'
)
ON CONFLICT (username) DO NOTHING;

-- Mengaktifkan Row Level Security (RLS)
ALTER TABLE public.birds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arrivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hpp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Kebijakan Akses (RLS Policies): Mengizinkan dashboard membaca & menulis data
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Akses Publik Birds') THEN
    CREATE POLICY "Akses Publik Birds" ON public.birds FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Akses Publik Arrivals') THEN
    CREATE POLICY "Akses Publik Arrivals" ON public.arrivals FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Akses Publik Sales') THEN
    CREATE POLICY "Akses Publik Sales" ON public.sales FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Akses Publik HPP') THEN
    CREATE POLICY "Akses Publik HPP" ON public.hpp FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Akses Publik Admin Users') THEN
    CREATE POLICY "Akses Publik Admin Users" ON public.admin_users FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
