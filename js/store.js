/**
 * Sumber data tunggal (single source of truth) + seluruh operasi perubahan data.
 * - Stok TIDAK disimpan terpisah: dihitung dari (total burung datang - total terjual).
 *   Dengan begitu dashboard, tabel, dan grafik selalu konsisten.
 * - Setiap fungsi perubahan data memanggil TB.auth.requireAdmin() lebih dulu.
 * - Data tersimpan di localStorage browser ini saja (bukan database terpusat).
 */
window.TB = window.TB || {};

TB.store = (() => {
  const { uid, isValidISO, todayISO } = TB.utils;
  const { maxQty, maxPrice } = TB.config.limits;
  const storageKey = TB.config.storage.dataKey;
  const listeners = new Set();
  let state = load();

  /* ---------- Persistensi ---------- */
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (raw && Array.isArray(raw.birds) && Array.isArray(raw.arrivals) && Array.isArray(raw.sales)) {
        // Migrasi otomatis data lama (v1/v2) agar memiliki gambar ilustrasi, keterangan burung, & data HPP
        if (!raw.meta || (raw.meta.version || 1) < 3 || !Array.isArray(raw.hpp)) {
          const seeded = TB.seed.generate();
          const byId = Object.fromEntries(seeded.birds.map((b) => [b.id, b]));
          raw.birds.forEach((b) => {
            const ref = byId[b.id];
            if (!b.foto) b.foto = ref ? ref.foto : TB.seed.defaultBirdPhoto();
            if (!b.keterangan) b.keterangan = ref ? ref.keterangan : `Burung ${b.kategori} asal ${b.asal}, sehat dan terawat.`;
          });
          if (!Array.isArray(raw.hpp)) raw.hpp = seeded.hpp;
          raw.meta = { ...(raw.meta || {}), version: 3 };
          save(raw);
        }
        return raw;
      }
    } catch (e) { /* data rusak -> buat ulang */ }
    const fresh = TB.seed.generate();
    save(fresh);
    return fresh;
  }
  function save(s = state) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(s));
      return true;
    } catch (e) {
      return false;
    }
  }
  const emit = () => listeners.forEach((fn) => fn());
  const subscribe = (fn) => listeners.add(fn);
  const commit = () => {
    const ok = save();
    emit();
    // Sinkronisasi otomatis ke Supabase di latar belakang jika tabel tersedia
    if (TB.supabase && typeof TB.supabase.pushAllToSupabase === 'function') {
      try { TB.supabase.pushAllToSupabase(state); } catch (e) {}
    }
    return ok;
  };

  /** Memuat data dari database Supabase jika tabel sudah dibuat */
  async function syncFromSupabase() {
    if (!TB.supabase || typeof TB.supabase.fetchAllFromSupabase !== 'function') return false;
    const remote = await TB.supabase.fetchAllFromSupabase();
    if (!remote || !Array.isArray(remote.birds)) return false;

    // Jika di Supabase ada data burung, atau sesi ini sudah pernah bersumber dari Supabase
    if (remote.birds.length > 0 || state.meta?.source === 'supabase') {
      state = {
        birds: remote.birds,
        arrivals: remote.arrivals || [],
        sales: remote.sales || [],
        hpp: remote.hpp || [],
        meta: { ...(state.meta || {}), source: 'supabase', lastSync: new Date().toISOString() }
      };
      save();
      emit();
      return true;
    } else if (state.meta?.simulation) {
      // Jika remote masih kosong tapi lokal punya data simulasi awal, unggah ke Supabase
      if (typeof TB.supabase.pushAllToSupabase === 'function') {
        TB.supabase.pushAllToSupabase(state);
      }
    }
    return false;
  }

  /* ---------- Pembacaan ---------- */
  const get = () => state;
  const getBird = (id) => state.birds.find((b) => b.id === id);

  /** Stok burung = datang - terjual. `skip` dipakai saat mengedit/menghapus sebuah transaksi. */
  function stockOf(birdId, skip = {}) {
    let total = 0;
    for (const a of state.arrivals) if (a.birdId === birdId && a.id !== skip.arrivalId) total += a.jumlah;
    for (const s of state.sales) if (s.birdId === birdId && s.id !== skip.saleId) total -= s.jumlah;
    return total;
  }
  function stockMap() {
    const map = {};
    state.birds.forEach((b) => (map[b.id] = 0));
    state.arrivals.forEach((a) => { if (a.birdId in map) map[a.birdId] += a.jumlah; });
    state.sales.forEach((s) => { if (s.birdId in map) map[s.birdId] -= s.jumlah; });
    return map;
  }
  /** Harga pokok per ekor: rata-rata tertimbang seluruh pembelian burung tersebut. */
  function avgCost(birdId) {
    let sum = 0, qty = 0;
    state.arrivals.forEach((a) => { if (a.birdId === birdId) { sum += a.jumlah * a.hargaBeli; qty += a.jumlah; } });
    return qty ? Math.round(sum / qty) : (getBird(birdId)?.hargaBeli || 0);
  }

  /* ---------- Validasi ---------- */
  const fail = (msg) => { throw new Error(msg); };
  function vDate(value, label) {
    if (!isValidISO(value)) fail(`${label} tidak valid.`);
    if (value > todayISO()) fail(`${label} tidak boleh melewati hari ini.`);
    return value;
  }
  function vInt(value, label, { min = 1, max = maxQty } = {}) {
    const n = Number(value);
    if (value === '' || value === null || !Number.isInteger(n)) fail(`${label} harus berupa bilangan bulat.`);
    if (n < min) fail(`${label} minimal ${min}.`);
    if (n > max) fail(`${label} terlalu besar (maksimal ${max.toLocaleString('id-ID')}).`);
    return n;
  }
  function vText(value, label, { required = false, max = 100 } = {}) {
    const t = String(value ?? '').trim();
    if (required && !t) fail(`${label} wajib diisi.`);
    if (t.length > max) fail(`${label} maksimal ${max} karakter.`);
    return t;
  }
  function vPhoto(value) {
    const t = String(value ?? '').trim();
    if (!t) return '';
    if (!/^(https?:\/\/|data:image\/)/i.test(t)) fail('URL foto harus diawali http://, https://, atau data:image/.');
    if (t.length > 4000) fail('URL foto terlalu panjang.');
    return t;
  }
  function vBirdRef(birdId) {
    const bird = getBird(birdId);
    if (!bird) fail('Burung yang dipilih tidak ditemukan.');
    return bird;
  }
  const price = (v, label) => vInt(v, label, { min: 1, max: maxPrice });

  /* ---------- Data Stok Burung ---------- */
  function parseBird(d, ignoreId) {
    const nama = vText(d.nama, 'Nama burung', { required: true, max: 80 });
    if (state.birds.some((b) => b.id !== ignoreId && b.nama.toLowerCase() === nama.toLowerCase())) {
      fail(`Burung dengan nama "${nama}" sudah ada.`);
    }
    const kategori = vText(d.kategori, 'Jenis / kategori burung', { required: true, max: 40 });
    const asal = vText(d.asal, 'Asal burung', { required: true, max: 80 });
    const keterangan = vText(d.keterangan, 'Keterangan burung', { required: false, max: 240 }) || `Burung ${kategori} asal ${asal}, kondisi sehat dan aktif.`;
    return {
      nama,
      kategori,
      asal,
      keterangan,
      tanggalMasuk: vDate(d.tanggalMasuk, 'Tanggal masuk'),
      hargaBeli: price(d.hargaBeli, 'Harga beli'),
      hargaJual: price(d.hargaJual, 'Harga jual'),
      minStok: vInt(d.minStok ?? 5, 'Batas stok menipis', { min: 0, max: 1000 }),
      foto: vPhoto(d.foto) || TB.seed.defaultBirdPhoto()
    };
  }

  function addBird(d) {
    TB.auth.requireAdmin();
    const bird = { id: uid('b'), ...parseBird(d) };
    const stokAwal = vInt(d.stokAwal ?? 0, 'Stok awal', { min: 0 });
    state.birds.push(bird);
    let initialArrival = null;
    if (stokAwal > 0) {
      initialArrival = {
        id: uid('a'), tanggal: bird.tanggalMasuk, birdId: bird.id, jumlah: stokAwal,
        hargaBeli: bird.hargaBeli, pemasok: 'Stok awal', catatan: 'Dibuat saat menambah data burung'
      };
      state.arrivals.push(initialArrival);
    }
    commit();
    if (TB.supabase && typeof TB.supabase.upsertRecord === 'function') {
      TB.supabase.upsertRecord('birds', bird);
      if (initialArrival) {
        TB.supabase.upsertRecord('arrivals', {
          ...initialArrival,
          nama: bird.nama,
          kategori: bird.kategori
        });
      }
    }
    return bird;
  }
  function updateBird(id, d) {
    TB.auth.requireAdmin();
    const bird = vBirdRef(id);
    const parsed = parseBird(d, id);
    if (!String(d.foto ?? '').trim() && bird.foto) parsed.foto = bird.foto;
    Object.assign(bird, parsed);
    commit();
    if (TB.supabase && typeof TB.supabase.upsertRecord === 'function') {
      TB.supabase.upsertRecord('birds', bird);
    }
    return bird;
  }
  function deleteBird(id) {
    TB.auth.requireAdmin();
    const bird = vBirdRef(id);
    if (state.sales.some((s) => s.birdId === id)) {
      fail(`"${bird.nama}" memiliki riwayat penjualan sehingga tidak dapat dihapus. Hapus transaksi penjualannya terlebih dahulu.`);
    }
    const relatedArrivalIds = state.arrivals.filter((a) => a.birdId === id).map((a) => a.id);
    state.arrivals = state.arrivals.filter((a) => a.birdId !== id); // riwayat datang ikut dihapus
    state.birds = state.birds.filter((b) => b.id !== id);
    commit();
    if (TB.supabase) {
      if (relatedArrivalIds.length && typeof TB.supabase.deleteRecords === 'function') {
        TB.supabase.deleteRecords('arrivals', relatedArrivalIds);
      }
      if (typeof TB.supabase.deleteRecord === 'function') {
        TB.supabase.deleteRecord('birds', id);
      }
    }
  }

  /* ---------- Burung Datang ---------- */
  function parseArrival(d) {
    const bird = vBirdRef(d.birdId);
    return {
      bird,
      data: {
        tanggal: vDate(d.tanggal, 'Tanggal masuk'),
        birdId: bird.id,
        jumlah: vInt(d.jumlah, 'Jumlah burung'),
        hargaBeli: price(d.hargaBeli, 'Harga beli per ekor'),
        pemasok: vText(d.pemasok, 'Asal pemasok', { required: true, max: 80 }),
        catatan: vText(d.catatan, 'Catatan', { max: 200 })
      }
    };
  }
  function addArrival(d) {
    TB.auth.requireAdmin();
    const { bird, data } = parseArrival(d);
    const rec = { id: uid('a'), ...data };
    state.arrivals.push(rec);
    bird.hargaBeli = data.hargaBeli; // harga beli terkini
    commit();
    if (TB.supabase && typeof TB.supabase.upsertRecord === 'function') {
      TB.supabase.upsertRecord('arrivals', { ...rec, nama: bird.nama, kategori: bird.kategori });
      TB.supabase.upsertRecord('birds', bird);
    }
    return rec;
  }
  function updateArrival(id, d) {
    TB.auth.requireAdmin();
    const rec = state.arrivals.find((a) => a.id === id);
    if (!rec) fail('Catatan burung datang tidak ditemukan.');
    const { bird, data } = parseArrival(d);
    // Stok burung lama tanpa catatan ini tidak boleh negatif (karena sebagian sudah terjual).
    const without = stockOf(rec.birdId, { arrivalId: id });
    const resulting = rec.birdId === data.birdId ? without + data.jumlah : without;
    if (resulting < 0) {
      fail(`Perubahan ditolak: stok "${getBird(rec.birdId).nama}" akan menjadi negatif (sebagian burung sudah terjual).`);
    }
    Object.assign(rec, data);
    bird.hargaBeli = data.hargaBeli;
    commit();
    if (TB.supabase && typeof TB.supabase.upsertRecord === 'function') {
      TB.supabase.upsertRecord('arrivals', { ...rec, nama: bird.nama, kategori: bird.kategori });
      TB.supabase.upsertRecord('birds', bird);
    }
    return rec;
  }
  function deleteArrival(id) {
    TB.auth.requireAdmin();
    const rec = state.arrivals.find((a) => a.id === id);
    if (!rec) fail('Catatan burung datang tidak ditemukan.');
    if (stockOf(rec.birdId, { arrivalId: id }) < 0) {
      fail('Catatan tidak dapat dihapus karena sebagian burung dari kedatangan ini sudah terjual (stok akan menjadi negatif).');
    }
    state.arrivals = state.arrivals.filter((a) => a.id !== id);
    commit();
    if (TB.supabase && typeof TB.supabase.deleteRecord === 'function') {
      TB.supabase.deleteRecord('arrivals', id);
    }
  }
  function deleteArrivals(ids) {
    TB.auth.requireAdmin();
    if (!Array.isArray(ids) || !ids.length) return;
    const setIds = new Set(ids);
    const subByBird = {};
    state.arrivals.forEach((a) => {
      if (setIds.has(a.id)) subByBird[a.birdId] = (subByBird[a.birdId] || 0) + a.jumlah;
    });
    for (const [birdId, subQty] of Object.entries(subByBird)) {
      const cur = stockOf(birdId);
      if (cur - subQty < 0) {
        const b = getBird(birdId);
        fail(`Penghapusan ditolak: stok "${b?.nama || 'burung'}" akan menjadi negatif (${cur - subQty}). Sebagian burung dari kedatangan ini sudah terjual.`);
      }
    }
    state.arrivals = state.arrivals.filter((a) => !setIds.has(a.id));
    commit();
    if (TB.supabase && typeof TB.supabase.deleteRecords === 'function') {
      TB.supabase.deleteRecords('arrivals', ids);
    }
  }

  /* ---------- Burung Terjual ---------- */
  function nextTransactionNumber(date) {
    const key = date.replace(/-/g, '');
    const prefix = `TRX-${key}-`;
    let max = 0;
    state.sales.forEach((s) => {
      if (s.noTransaksi.startsWith(prefix)) max = Math.max(max, parseInt(s.noTransaksi.slice(prefix.length), 10) || 0);
    });
    return `${prefix}${String(max + 1).padStart(3, '0')}`;
  }
  function parseSale(d, skip) {
    const bird = vBirdRef(d.birdId);
    const jumlah = vInt(d.jumlah, 'Jumlah terjual');
    const available = stockOf(bird.id, skip);
    if (jumlah > available) {
      fail(available <= 0 ? `Stok "${bird.nama}" habis.` : `Stok tidak cukup. Stok "${bird.nama}" tersedia ${available} ekor.`);
    }
    const metode = vText(d.metode, 'Metode pembayaran', { required: true, max: 30 });
    return {
      bird,
      data: {
        tanggal: vDate(d.tanggal, 'Tanggal transaksi'),
        birdId: bird.id, jumlah,
        hargaJual: price(d.hargaJual, 'Harga jual per ekor'),
        pembeli: vText(d.pembeli, 'Nama pembeli', { max: 80 }),
        metode
      }
    };
  }
  function addSale(d) {
    TB.auth.requireAdmin();
    const { bird, data } = parseSale(d, {});
    const rec = { id: uid('s'), noTransaksi: nextTransactionNumber(data.tanggal), ...data, hargaPokok: avgCost(bird.id) };
    state.sales.push(rec);
    commit();
    if (TB.supabase && typeof TB.supabase.upsertRecord === 'function') {
      TB.supabase.upsertRecord('sales', { ...rec, nama: bird.nama, kategori: bird.kategori });
    }
    return rec;
  }
  function updateSale(id, d) {
    TB.auth.requireAdmin();
    const rec = state.sales.find((s) => s.id === id);
    if (!rec) fail('Transaksi penjualan tidak ditemukan.');
    const { bird, data } = parseSale(d, { saleId: id }); // stok dihitung tanpa transaksi ini
    if (data.tanggal !== rec.tanggal) rec.noTransaksi = nextTransactionNumber(data.tanggal);
    if (rec.birdId !== bird.id) rec.hargaPokok = avgCost(bird.id);
    Object.assign(rec, data);
    commit();
    if (TB.supabase && typeof TB.supabase.upsertRecord === 'function') {
      TB.supabase.upsertRecord('sales', { ...rec, nama: bird.nama, kategori: bird.kategori });
    }
    return rec;
  }
  function deleteSale(id) {
    TB.auth.requireAdmin();
    if (!state.sales.some((s) => s.id === id)) fail('Transaksi penjualan tidak ditemukan.');
    state.sales = state.sales.filter((s) => s.id !== id); // stok otomatis kembali (dihitung dari transaksi)
    commit();
    if (TB.supabase && typeof TB.supabase.deleteRecord === 'function') {
      TB.supabase.deleteRecord('sales', id);
    }
  }
  function deleteSales(ids) {
    TB.auth.requireAdmin();
    if (!Array.isArray(ids) || !ids.length) return;
    const setIds = new Set(ids);
    state.sales = state.sales.filter((s) => !setIds.has(s.id));
    commit();
    if (TB.supabase && typeof TB.supabase.deleteRecords === 'function') {
      TB.supabase.deleteRecords('sales', ids);
    }
  }

  /* ---------- HPP (Pakan Burung, Mati atau Lepas, Total Biaya) ---------- */
  function parseHpp(d) {
    const tanggal = vDate(d.tanggal, 'Tanggal HPP');
    const pakanBurung = vText(d.pakanBurung, 'Pakan burung', { required: true, max: 140 });
    const biayaPakan = vInt(d.biayaPakan ?? 0, 'Biaya pakan burung', { min: 0, max: maxPrice });
    const statusInsiden = ['Tidak ada', 'Mati', 'Lepas'].includes(d.statusInsiden) ? d.statusInsiden : 'Tidak ada';
    const ketInsiden = vText(d.matiAtauLepas, 'Keterangan mati atau lepas', { required: false, max: 140 });
    const biayaMatiLepas = statusInsiden === 'Tidak ada'
      ? 0
      : vInt(d.biayaMatiLepas ?? 0, 'Biaya / kerugian mati atau lepas', { min: 0, max: maxPrice });
    if (biayaPakan === 0 && biayaMatiLepas === 0) {
      fail('Total biaya HPP harus lebih dari Rp0 (isi biaya pakan atau biaya mati/lepas).');
    }
    const matiAtauLepas = statusInsiden === 'Tidak ada'
      ? 'Tidak ada'
      : (ketInsiden ? `${statusInsiden} — ${ketInsiden.replace(/^(Mati|Lepas)\s*[—:-]\s*/i, '')}` : statusInsiden);
    return { tanggal, pakanBurung, biayaPakan, statusInsiden, matiAtauLepas, biayaMatiLepas };
  }
  function addHpp(d) {
    TB.auth.requireAdmin();
    if (!Array.isArray(state.hpp)) state.hpp = [];
    const rec = { id: uid('h'), ...parseHpp(d) };
    state.hpp.push(rec);
    commit();
    if (TB.supabase && typeof TB.supabase.upsertRecord === 'function') {
      TB.supabase.upsertRecord('hpp', {
        ...rec,
        totalBiaya: (Number(rec.biayaPakan) || 0) + (Number(rec.biayaMatiLepas) || 0)
      });
    }
    return rec;
  }
  function updateHpp(id, d) {
    TB.auth.requireAdmin();
    if (!Array.isArray(state.hpp)) state.hpp = [];
    const rec = state.hpp.find((h) => h.id === id);
    if (!rec) fail('Catatan HPP tidak ditemukan.');
    Object.assign(rec, parseHpp(d));
    commit();
    if (TB.supabase && typeof TB.supabase.upsertRecord === 'function') {
      TB.supabase.upsertRecord('hpp', {
        ...rec,
        totalBiaya: (Number(rec.biayaPakan) || 0) + (Number(rec.biayaMatiLepas) || 0)
      });
    }
    return rec;
  }
  function deleteHpp(id) {
    TB.auth.requireAdmin();
    if (!Array.isArray(state.hpp) || !state.hpp.some((h) => h.id === id)) fail('Catatan HPP tidak ditemukan.');
    state.hpp = state.hpp.filter((h) => h.id !== id);
    commit();
    if (TB.supabase && typeof TB.supabase.deleteRecord === 'function') {
      TB.supabase.deleteRecord('hpp', id);
    }
  }
  function deleteHpps(ids) {
    TB.auth.requireAdmin();
    if (!Array.isArray(ids) || !ids.length) return;
    const setIds = new Set(ids);
    if (!Array.isArray(state.hpp)) state.hpp = [];
    state.hpp = state.hpp.filter((h) => !setIds.has(h.id));
    commit();
    if (TB.supabase && typeof TB.supabase.deleteRecords === 'function') {
      TB.supabase.deleteRecords('hpp', ids);
    }
  }

  /* ---------- Data demo ---------- */
  function resetSimulation() {
    TB.auth.requireAdmin();
    state = TB.seed.generate();
    commit();
    if (TB.supabase && typeof TB.supabase.pushAllToSupabase === 'function') {
      TB.supabase.pushAllToSupabase(state, { prune: true });
    }
  }
  function clearAll() {
    TB.auth.requireAdmin();
    state = { meta: { simulation: false, version: 3 }, birds: [], arrivals: [], sales: [], hpp: [] };
    commit();
    if (TB.supabase && typeof TB.supabase.clearAllTables === 'function') {
      TB.supabase.clearAllTables();
    }
  }
  /** True selama data masih berupa data contoh (simulasi); false setelah admin mengosongkan data. */
  const isSimulation = () => !!state.meta?.simulation;

  return {
    get, getBird, subscribe, stockOf, stockMap, avgCost, nextTransactionNumber, isSimulation, syncFromSupabase,
    addBird, updateBird, deleteBird, addArrival, updateArrival, deleteArrival, deleteArrivals,
    addSale, updateSale, deleteSale, deleteSales, addHpp, updateHpp, deleteHpp, deleteHpps, resetSimulation, clearAll
  };
})();
