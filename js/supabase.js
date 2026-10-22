/**
 * Modul Integrasi Supabase:
 * - Menghubungkan aplikasi ke proyek Supabase (URL & Publishable/Anon Key).
 * - Mendukung autentikasi Supabase Auth & sinkronisasi data tabel (birds, arrivals, sales, hpp).
 * - Menyediakan deteksi koneksi otomatis, fallback aman, dan skrip SQL migrasi.
 */
window.TB = window.TB || {};

TB.supabase = (() => {
  const cfg = () => TB.config.supabase;
  let client = null;
  let connectionStatus = {
    connected: false,
    checked: false,
    tablesReady: false,
    error: null,
    latencyMs: null
  };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(connectionStatus); } catch {} });
  const onChange = (fn) => listeners.add(fn);

  /** Inisialisasi Supabase JS Client */
  function init() {
    const conf = cfg();
    if (!conf || !conf.url || !conf.anonKey) return null;
    if (client) return client;
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      try {
        client = window.supabase.createClient(conf.url, conf.anonKey, {
          auth: {
            persistSession: true,
            storageKey: 'kicau_makmur_supabase_auth'
          }
        });
      } catch (err) {
        console.warn('Gagal menginisialisasi Supabase Client:', err);
      }
    }
    return client;
  }

  /**
   * Menguji koneksi langsung ke endpoint Supabase.
   * Berjalan baik di lingkungan browser menggunakan fetch.
   */
  async function testConnection() {
    const conf = cfg();
    const start = Date.now();
    try {
      // Tes koneksi ke API settings Supabase Auth (selalu tersedia jika proyek aktif)
      const res = await fetch(`${conf.url}/auth/v1/settings`, {
        headers: { 'apikey': conf.anonKey }
      });
      const latencyMs = Date.now() - start;
      if (res.ok) {
        connectionStatus.connected = true;
        connectionStatus.latencyMs = latencyMs;
        connectionStatus.error = null;

        // Periksa apakah tabel data sudah dibuat di schema public
        const [tableBirds, tableUsers] = await Promise.all([
          fetch(`${conf.url}/rest/v1/birds?select=id&limit=1`, {
            headers: { 'apikey': conf.anonKey, 'Authorization': `Bearer ${conf.anonKey}` }
          }).catch(() => ({ ok: false })),
          fetch(`${conf.url}/rest/v1/admin_users?select=id&limit=1`, {
            headers: { 'apikey': conf.anonKey, 'Authorization': `Bearer ${conf.anonKey}` }
          }).catch(() => ({ ok: false }))
        ]);
        connectionStatus.tablesReady = tableBirds.ok;
        connectionStatus.adminUsersReady = tableUsers.ok;
      } else {
        connectionStatus.connected = false;
        connectionStatus.error = `HTTP ${res.status}`;
      }
    } catch (err) {
      connectionStatus.connected = false;
      connectionStatus.error = err.message || 'Gagal terhubung';
    }
    connectionStatus.checked = true;
    emit();
    return connectionStatus;
  }

  /**
   * Percobaan login melalui Supabase:
   * 1. Memeriksa tabel `public.admin_users` di database Supabase (mencocokkan hash password & salt).
   * 2. Jika tabel belum ada, mencoba endpoint Supabase Auth.
   */
  async function signInWithSupabase(usernameOrEmail, password) {
    const conf = cfg();
    const raw = (usernameOrEmail || '').trim();
    if (!raw || !password) return { success: false, error: 'Data login tidak lengkap' };

    // 1. Cek langsung ke tabel public.admin_users di Supabase
    try {
      const userRes = await fetch(
        `${conf.url}/rest/v1/admin_users?select=*&or=(username.eq.${encodeURIComponent(raw)},email.eq.${encodeURIComponent(raw)})&limit=1`,
        {
          headers: {
            'apikey': conf.anonKey,
            'Authorization': `Bearer ${conf.anonKey}`
          }
        }
      );
      if (userRes.ok) {
        const rows = await userRes.json();
        if (Array.isArray(rows) && rows.length > 0) {
          const userRec = rows[0];
          if (userRec.is_active === false) {
            return { success: false, error: 'Akun admin ini dinonaktifkan.' };
          }
          const salt = userRec.salt || 'kicau-makmur-demo';
          const calcHash = TB.utils.sha256(`${salt}:${password}`);
          if (calcHash === userRec.password_hash) {
            // Perbarui waktu login terakhir di Supabase
            fetch(`${conf.url}/rest/v1/admin_users?id=eq.${userRec.id}`, {
              method: 'PATCH',
              headers: {
                'apikey': conf.anonKey,
                'Authorization': `Bearer ${conf.anonKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ last_login: new Date().toISOString() })
            }).catch(() => {});

            return {
              success: true,
              user: userRec.username,
              role: userRec.role || 'admin',
              fullName: userRec.nama_lengkap || userRec.username,
              method: 'supabase-table'
            };
          } else {
            return { success: false, error: 'Password salah untuk akun admin Supabase.' };
          }
        }
      }
    } catch (err) {
      // Abaikan jika tabel belum ada atau jaringan terputus
    }

    // 2. Coba melalui Supabase Auth Client Library
    init();
    const email = raw.includes('@') ? raw : (conf.adminEmailDefault || `${raw}@kicaumakmur.com`);
    if (client && client.auth) {
      try {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (!error && data && data.user) {
          return { success: true, user: data.user.email || raw, method: 'supabase-auth' };
        }
      } catch (e) {}
    }

    // 3. Coba melalui REST endpoint Supabase Auth
    try {
      const res = await fetch(`${conf.url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'apikey': conf.anonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
      if (res.ok) {
        const data = await res.json();
        return { success: true, user: data.user?.email || raw, method: 'supabase-rest', token: data.access_token };
      }
    } catch (err) {}

    return { success: false };
  }

  /**
   * Menarik data dari Supabase jika tabel sudah dibuat.
   * Mengembalikan null jika tabel belum ada atau gagal.
   */
  async function fetchAllFromSupabase() {
    const conf = cfg();
    try {
      const headers = {
        'apikey': conf.anonKey,
        'Authorization': `Bearer ${conf.anonKey}`
      };
      const [resBirds, resArr, resSales, resHpp] = await Promise.all([
        fetch(`${conf.url}/rest/v1/birds?select=*`, { headers }),
        fetch(`${conf.url}/rest/v1/arrivals?select=*`, { headers }),
        fetch(`${conf.url}/rest/v1/sales?select=*`, { headers }),
        fetch(`${conf.url}/rest/v1/hpp?select=*`, { headers })
      ]);

      if (resBirds.ok && resArr.ok && resSales.ok) {
        const birds = await resBirds.json();
        const arrivals = await resArr.json();
        const sales = await resSales.json();
        const hpp = resHpp.ok ? await resHpp.json() : [];
        return { birds, arrivals, sales, hpp };
      }
    } catch (err) {
      console.warn('Gagal membaca data dari Supabase:', err);
    }
    return null;
  }

  /**
   * Menghapus satu record dari tabel Supabase berdasarkan id.
   */
  async function deleteRecord(table, id) {
    const conf = cfg();
    if (!conf || !conf.url || !conf.anonKey || !id) return false;
    try {
      const res = await fetch(`${conf.url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          'apikey': conf.anonKey,
          'Authorization': `Bearer ${conf.anonKey}`
        }
      });
      return res.ok;
    } catch (err) {
      console.warn(`Gagal menghapus record [${table} - ${id}] di Supabase:`, err);
      return false;
    }
  }

  /**
   * Menghapus beberapa record dari tabel Supabase berdasarkan array id.
   * Menggunakan chunking per 40 ID untuk mencegah batas URL.
   */
  async function deleteRecords(table, ids) {
    const conf = cfg();
    if (!conf || !conf.url || !conf.anonKey || !Array.isArray(ids) || !ids.length) return false;
    try {
      const chunkSize = 40;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const inClause = chunk.map((id) => encodeURIComponent(id)).join(',');
        await fetch(`${conf.url}/rest/v1/${table}?id=in.(${inClause})`, {
          method: 'DELETE',
          headers: {
            'apikey': conf.anonKey,
            'Authorization': `Bearer ${conf.anonKey}`
          }
        });
      }
      return true;
    } catch (err) {
      console.warn(`Gagal menghapus records [${table}] di Supabase:`, err);
      return false;
    }
  }

  /**
   * Mengosongkan satu tabel di Supabase.
   */
  async function clearTable(table) {
    const conf = cfg();
    if (!conf || !conf.url || !conf.anonKey) return false;
    try {
      const res = await fetch(`${conf.url}/rest/v1/${table}?id=not.is.null`, {
        method: 'DELETE',
        headers: {
          'apikey': conf.anonKey,
          'Authorization': `Bearer ${conf.anonKey}`
        }
      });
      return res.ok;
    } catch (err) {
      console.warn(`Gagal mengosongkan tabel [${table}] di Supabase:`, err);
      return false;
    }
  }

  /**
   * Mengosongkan seluruh tabel data transaksi & master di Supabase
   * Dihapus dengan urutan anak -> induk untuk menghormati foreign key.
   */
  async function clearAllTables() {
    const conf = cfg();
    if (!conf || !conf.url || !conf.anonKey) return false;
    const tables = ['sales', 'arrivals', 'hpp', 'birds'];
    try {
      for (const t of tables) {
        await clearTable(t);
      }
      return true;
    } catch (err) {
      console.warn('Gagal mengosongkan seluruh tabel di Supabase:', err);
      return false;
    }
  }

  /**
   * Upsert (insert atau update) satu record ke tabel Supabase.
   */
  async function upsertRecord(table, record) {
    const conf = cfg();
    if (!conf || !conf.url || !conf.anonKey || !record) return false;
    try {
      const res = await fetch(`${conf.url}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
          'apikey': conf.anonKey,
          'Authorization': `Bearer ${conf.anonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(record)
      });
      return res.ok;
    } catch (err) {
      console.warn(`Gagal upsert record [${table}] di Supabase:`, err);
      return false;
    }
  }

  /**
   * Mengunggah data lokal ke Supabase (upsert) bila tabel sudah ada.
   * Mendukung opsi prune: jika true, menghapus record di Supabase yang sudah tidak ada di lokal.
   */
  async function pushAllToSupabase(data, options = {}) {
    const conf = cfg();
    if (!data || !conf || !conf.url || !conf.anonKey) return false;
    try {
      const headers = {
        'apikey': conf.anonKey,
        'Authorization': `Bearer ${conf.anonKey}`
      };
      const upsertHeaders = {
        ...headers,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      };

      // 1. Opsi prune (pembersihan data lama/terhapus yang masih tertinggal di Supabase)
      if (options.prune) {
        const pruneOrder = [
          { table: 'sales', localList: data.sales || [] },
          { table: 'arrivals', localList: data.arrivals || [] },
          { table: 'hpp', localList: data.hpp || [] },
          { table: 'birds', localList: data.birds || [] }
        ];

        for (const item of pruneOrder) {
          try {
            const checkRes = await fetch(`${conf.url}/rest/v1/${item.table}?select=id`, { headers });
            if (checkRes.ok) {
              const remoteRows = await checkRes.json();
              if (Array.isArray(remoteRows) && remoteRows.length > 0) {
                const localIdSet = new Set(item.localList.map((x) => x.id));
                const staleIds = remoteRows.map((r) => r.id).filter((id) => !localIdSet.has(id));
                if (staleIds.length > 0) {
                  await deleteRecords(item.table, staleIds);
                }
              }
            }
          } catch (e) {}
        }
      }

      // 2. Unggah data lokal dengan urutan induk -> anak
      if (Array.isArray(data.birds) && data.birds.length) {
        await fetch(`${conf.url}/rest/v1/birds`, {
          method: 'POST',
          headers: upsertHeaders,
          body: JSON.stringify(data.birds)
        });
      }

      if (Array.isArray(data.arrivals) && data.arrivals.length) {
        const prep = data.arrivals.map((a) => {
          const bird = (data.birds || []).find((b) => b.id === a.birdId) || {};
          return {
            ...a,
            nama: a.nama || bird.nama || 'Burung',
            kategori: a.kategori || bird.kategori || 'Umum'
          };
        });
        await fetch(`${conf.url}/rest/v1/arrivals`, {
          method: 'POST',
          headers: upsertHeaders,
          body: JSON.stringify(prep)
        });
      }

      if (Array.isArray(data.sales) && data.sales.length) {
        const prep = data.sales.map((s) => {
          const bird = (data.birds || []).find((b) => b.id === s.birdId) || {};
          return {
            ...s,
            nama: s.nama || bird.nama || 'Burung',
            kategori: s.kategori || bird.kategori || 'Umum'
          };
        });
        await fetch(`${conf.url}/rest/v1/sales`, {
          method: 'POST',
          headers: upsertHeaders,
          body: JSON.stringify(prep)
        });
      }

      if (Array.isArray(data.hpp) && data.hpp.length) {
        const prep = data.hpp.map((h) => ({
          ...h,
          totalBiaya: (Number(h.biayaPakan) || 0) + (Number(h.biayaMatiLepas) || 0)
        }));
        await fetch(`${conf.url}/rest/v1/hpp`, {
          method: 'POST',
          headers: upsertHeaders,
          body: JSON.stringify(prep)
        });
      }

      return true;
    } catch (err) {
      console.warn('Gagal mengirim data ke Supabase:', err);
      return false;
    }
  }

  /**
   * Menghasilkan skrip SQL migrasi siap pakai untuk Supabase SQL Editor.
   */
  function getSqlScript() {
    return `-- =========================================================
-- Skrip Pembuatan Tabel Toko Burung (Kicau Makmur) di Supabase
-- Jalankan skrip ini di: Supabase Dashboard -> SQL Editor -> New Query
-- =========================================================

-- 1. Tabel Burung (Stok & Data Burung)
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

-- 2. Tabel Burung Datang
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

-- 3. Tabel Burung Terjual (Penjualan)
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

-- 4. Tabel HPP (Pakan & Burung Mati atau Lepas)
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

-- Kebijakan Akses: Mengizinkan baca & tulis untuk anon / aplikasi dashboard
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
END $$;`;
  }

  return {
    init,
    testConnection,
    signInWithSupabase,
    fetchAllFromSupabase,
    pushAllToSupabase,
    deleteRecord,
    deleteRecords,
    clearTable,
    clearAllTables,
    upsertRecord,
    getSqlScript,
    getStatus: () => ({ ...connectionStatus }),
    onChange
  };
})();
