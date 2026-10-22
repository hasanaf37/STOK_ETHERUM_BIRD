/**
 * Perhitungan terpusat: stok, status stok, periode laporan, ringkasan, dan data grafik.
 * Semua halaman memakai fungsi di sini agar angka selalu konsisten.
 */
window.TB = window.TB || {};

TB.calc = (() => {
  const U = TB.utils;
  const { dailyGranularityMaxDays, maxRangeDays } = TB.config.limits;

  /* ---------- Stok ---------- */
  function stockStatus(stock, minStok) {
    if (stock <= 0) return { key: 'out', label: 'Habis' };
    if (stock <= minStok) return { key: 'low', label: 'Menipis' };
    return { key: 'ok', label: 'Tersedia' };
  }

  /** Daftar burung lengkap dengan stok, total jumlah masuk/terjual, dan status (dasar halaman Stok Burung & notifikasi). */
  function birdRows() {
    const { birds, arrivals, sales } = TB.store.get();
    const masukMap = {};
    const terjualMap = {};
    birds.forEach((b) => { masukMap[b.id] = 0; terjualMap[b.id] = 0; });
    arrivals.forEach((a) => { if (a.birdId in masukMap) masukMap[a.birdId] += a.jumlah; });
    sales.forEach((s) => { if (s.birdId in terjualMap) terjualMap[s.birdId] += s.jumlah; });
    return birds.map((b) => {
      const jumlahMasuk = masukMap[b.id] || 0;
      const jumlahTerjual = terjualMap[b.id] || 0;
      const stok = jumlahMasuk - jumlahTerjual;
      return {
        ...b,
        jumlahMasuk,
        jumlahTerjual,
        stok,
        status: stockStatus(stok, b.minStok)
      };
    });
  }
  const lowStockBirds = () => birdRows().filter((b) => b.status.key !== 'ok').sort((a, b) => a.stok - b.stok);
  const totalStock = () => birdRows().reduce((sum, b) => sum + Math.max(0, b.stok), 0);

  /* ---------- Periode ---------- */
  const RANGE_OPTIONS = [
    { key: 'today', label: 'Hari ini' },
    { key: 'yesterday', label: 'Kemarin' },
    { key: '7d', label: '7 hari terakhir' },
    { key: '30d', label: '30 hari terakhir' },
    { key: 'thisMonth', label: 'Bulan ini' },
    { key: 'lastMonth', label: 'Bulan sebelumnya' },
    { key: 'custom', label: 'Rentang tanggal khusus' }
  ];

  /** Mengubah kunci periode menjadi {start, end} (ISO). Mengembalikan {error} untuk rentang khusus tidak valid. */
  function resolveRange(key, custom = {}) {
    const today = U.todayISO();
    const first = (iso) => iso.slice(0, 8) + '01';
    switch (key) {
      case 'today': return { start: today, end: today };
      case 'yesterday': { const y = U.addDays(today, -1); return { start: y, end: y }; }
      case '7d': return { start: U.addDays(today, -6), end: today };
      case '30d': return { start: U.addDays(today, -29), end: today };
      case 'thisMonth': return { start: first(today), end: today };
      case 'lastMonth': {
        const end = U.addDays(first(today), -1);
        return { start: first(end), end };
      }
      case 'custom': {
        const { start, end } = custom;
        if (!U.isValidISO(start) || !U.isValidISO(end)) return { error: 'Isi tanggal mulai dan tanggal akhir dengan benar.' };
        if (start > end) return { error: 'Tanggal mulai tidak boleh setelah tanggal akhir.' };
        if (U.diffDays(start, end) + 1 > maxRangeDays) return { error: `Rentang maksimal ${maxRangeDays} hari.` };
        return { start, end };
      }
      default: return { start: U.addDays(today, -29), end: today };
    }
  }
  function rangeLabel(r) {
    return r.start === r.end ? U.formatDate(r.start) : `${U.formatDate(r.start)} – ${U.formatDate(r.end)}`;
  }

  /* ---------- Laporan ---------- */
  /**
   * Membangun laporan untuk periode [start, end].
   * - Harga Jual (Omzet) = Σ(jumlah × harga jual) penjualan pada tanggal/periode.
   * - Harga Asli = Σ(jumlah × harga pokok/beli) dari burung yang terjual pada tanggal/periode.
   * - HPP = Σ(biaya pakan + biaya mati/lepas) dari catatan menu HPP pada tanggal/periode.
   * - Keuntungan Bersih = Harga Jual − Harga Asli − HPP.
   */
  function buildReport(start, end) {
    const state = TB.store.get();
    const days = U.diffDays(start, end) + 1;
    const monthly = days > dailyGranularityMaxDays;
    const keyOf = (iso) => (monthly ? iso.slice(0, 7) : iso);

    const buckets = new Map();
    const ensure = (key) => {
      if (!buckets.has(key)) {
        buckets.set(key, {
          key,
          label: monthly ? U.formatMonth(key, true) : U.formatDateShort(key),
          fullLabel: monthly ? U.formatMonth(key) : U.formatDate(key),
          masuk: 0,
          terjual: 0,
          hargaAsli: 0,
          hargaJual: 0,
          omzet: 0,
          biaya: 0,
          hpp: 0,
          keuntunganBersih: 0,
          laba: 0,
          trx: 0
        });
      }
      return buckets.get(key);
    };
    // Siapkan semua bucket supaya grafik tidak bolong.
    for (let i = 0; i < days; i++) ensure(keyOf(U.addDays(start, i)));

    const category = new Map();
    const inRange = (iso) => iso >= start && iso <= end;
    state.arrivals.forEach((a) => {
      if (!inRange(a.tanggal)) return;
      const b = ensure(keyOf(a.tanggal));
      b.masuk += a.jumlah;
      b.biaya += a.jumlah * a.hargaBeli;
    });
    const sales = state.sales.filter((s) => inRange(s.tanggal));
    sales.forEach((s) => {
      const b = ensure(keyOf(s.tanggal));
      const jmlJual = s.jumlah * s.hargaJual;
      const jmlAsli = s.jumlah * s.hargaPokok;
      b.terjual += s.jumlah;
      b.hargaJual += jmlJual;
      b.omzet += jmlJual;
      b.hargaAsli += jmlAsli;
      b.trx += 1;
      const cat = TB.store.getBird(s.birdId)?.kategori || 'Lainnya';
      const c = category.get(cat) || { kategori: cat, jumlah: 0, omzet: 0 };
      c.jumlah += s.jumlah;
      c.omzet += jmlJual;
      category.set(cat, c);
    });
    (state.hpp || []).forEach((h) => {
      if (!inRange(h.tanggal)) return;
      const b = ensure(keyOf(h.tanggal));
      b.hpp += (Number(h.biayaPakan) || 0) + (Number(h.biayaMatiLepas) || 0);
    });

    const rows = [...buckets.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
    rows.forEach((r) => {
      r.keuntunganBersih = r.hargaJual - r.hargaAsli - r.hpp;
      r.laba = r.keuntunganBersih;
    });
    const sum = (k) => rows.reduce((t, r) => t + r[k], 0);
    const totals = {
      masuk: sum('masuk'),
      terjual: sum('terjual'),
      hargaAsli: sum('hargaAsli'),
      hargaJual: sum('hargaJual'),
      omzet: sum('omzet'),
      biaya: sum('biaya'),
      hpp: sum('hpp'),
      keuntunganBersih: sum('keuntunganBersih'),
      laba: sum('laba'),
      trx: sum('trx')
    };
    return {
      start, end, days, monthly, rows, totals,
      categories: [...category.values()].sort((a, b) => b.jumlah - a.jumlah),
      hasData: totals.masuk > 0 || totals.trx > 0 || totals.hpp > 0
    };
  }

  const recentSales = (n = 6) =>
    [...TB.store.get().sales]
      .sort((a, b) => (a.tanggal === b.tanggal ? (a.noTransaksi < b.noTransaksi ? 1 : -1) : a.tanggal < b.tanggal ? 1 : -1))
      .slice(0, n);

  return { stockStatus, birdRows, lowStockBirds, totalStock, RANGE_OPTIONS, resolveRange, rangeLabel, buildReport, recentSales };
})();
