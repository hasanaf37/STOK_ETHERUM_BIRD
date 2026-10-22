# Kicau Makmur — Website Manajemen Toko Burung

Website manajemen inventaris, kedatangan burung, penjualan, dan laporan analitik untuk toko burung **Kicau Makmur**.

---

## 1. Cara Menjalankan Website Secara Lokal

Proyek ini menggunakan HTML5, CSS3, dan Vanilla JavaScript modular tanpa proses *build*.

1. Buka folder proyek:
   `C:\Users\Muhammad Hasan\.gemini\antigravity\scratch\dashboard-stok-burung`
2. Klik dua kali file `index.html` untuk membukanya langsung di browser, atau jalankan server lokal melalui terminal:
   ```bash
   npx serve .
   ```

---

## 2. Akun Demo Login Admin & Catatan Keamanan

- **Username Admin:** `hasan`
- **Password Admin:** `HASANH1J1`

> **Penting (Mode Simulasi Frontend):**
> - Autentikasi pada aplikasi ini merupakan **simulasi frontend lokal** untuk keperluan pengembangan dan demonstrasi antarmuka.
> - Password **tidak pernah disimpan dalam teks biasa** di kode maupun di `localStorage` (melainkan diverifikasi terhadap hash SHA-256 pada `js/config.js`), dan sesi disimpan di `sessionStorage`.
> - Karena belum terhubung ke server autentikasi backend pada mode demo ini, mekanisme login frontend **belum cocok untuk melindungi data sensitif di lingkungan produksi**.
> - Seluruh data burung, kedatangan, dan penjualan disimpan pada `localStorage` browser perangkat masing-masing (bukan basis data terpusat).

---

## 3. Struktur Proyek

- `index.html` — Kerangka utama aplikasi, sidebar responsif, topbar breadcrumb, dan pemuatan modul.
- `css/styles.css` — Desain modern bertema cokelat tua, krem, putih, dan aksen emas/karamel, animasi halus, dukungan `prefers-reduced-motion`, serta *stylesheet* cetak laporan.
- `js/utils.js` — Fungsi utilitas: format Rupiah (`Rp10.000`), tanggal Indonesia (`21 Oktober 2026`), dan fungsi hash SHA-256.
- `js/config.js` — Konfigurasi toko, hash kredensial admin demo, dan batas validasi.
- `js/seed.js` — Generator data simulasi awal yang terstruktur dan diberi label jelas sebagai data simulasi.
- `js/auth.js` — Pengelolaan sesi login admin, penguncian sementara saat gagal berulang, dan penjaga hak akses (`TB.auth.requireAdmin()`).
- `js/store.js` — Sumber data tunggal (*single source of truth*) untuk inventaris burung, burung datang, dan penjualan beserta validasi stok.
- `js/calc.js` — Perhitungan terpusat untuk stok, status stok, filter periode laporan, omzet, biaya pembelian, dan estimasi laba kotor.
- `js/ui.js` — Komponen antarmuka: modal, dialog konfirmasi hapus, toast notification, skeleton loading, counter animation, dan tabel data (pencarian, filter, urut, pagination).
- `js/charts.js` — Empat grafik laporan interaktif dan grafik ringkasan dashboard menggunakan Chart.js.
- `js/pages.js` — Render tampilan setiap menu (`Dashboard`, `Data Burung`, `Burung Datang`, `Burung Terjual`, `Laporan`, `Akun Admin`).
- `js/forms.js` — Form modal tambah/edit serta konfirmasi hapus yang dilindungi hak akses admin.
- `js/app.js` — Routing, state sidebar (diperluas, diperkecil/ikon saja, disembunyikan, dan *drawer* pada HP), serta delegasi event.

---

## 4. Lampiran Opsional: Query SQL & Kode Penghubung Database (Untuk Disalin Mandiri Nanti)

Aplikasi frontend saat ini **100% berjalan secara lokal tanpa dependensi eksternal**. Apabila di kemudian hari Anda ingin membuat tabel sendiri di SQL Editor backend eksternal, berikut skema SQL yang sesuai dengan struktur data proyek ini:

```sql
-- 1. Tabel Data Burung
CREATE TABLE IF NOT EXISTS public.data_burung (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  kategori TEXT NOT NULL,
  asal TEXT NOT NULL,
  tanggal_masuk DATE NOT NULL DEFAULT CURRENT_DATE,
  harga_beli BIGINT NOT NULL CHECK (harga_beli > 0),
  harga_jual BIGINT NOT NULL CHECK (harga_jual > 0),
  min_stok INTEGER NOT NULL DEFAULT 5 CHECK (min_stok >= 0),
  foto TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabel Burung Datang (Stok Masuk)
CREATE TABLE IF NOT EXISTS public.burung_datang (
  id TEXT PRIMARY KEY,
  tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
  bird_id TEXT NOT NULL REFERENCES public.data_burung(id) ON DELETE CASCADE,
  jumlah INTEGER NOT NULL CHECK (jumlah > 0),
  harga_beli BIGINT NOT NULL CHECK (harga_beli > 0),
  pemasok TEXT NOT NULL,
  catatan TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabel Burung Terjual (Transaksi Penjualan)
CREATE TABLE IF NOT EXISTS public.burung_terjual (
  id TEXT PRIMARY KEY,
  no_transaksi TEXT NOT NULL UNIQUE,
  tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
  bird_id TEXT NOT NULL REFERENCES public.data_burung(id) ON DELETE RESTRICT,
  jumlah INTEGER NOT NULL CHECK (jumlah > 0),
  harga_jual BIGINT NOT NULL CHECK (harga_jual > 0),
  harga_pokok BIGINT NOT NULL CHECK (harga_pokok >= 0),
  pembeli TEXT DEFAULT '',
  metode TEXT NOT NULL DEFAULT 'Tunai',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
# STOK_ETHERUM_BIRD
