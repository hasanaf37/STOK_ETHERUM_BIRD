/**
 * Utilitas umum: format Rupiah, tanggal Indonesia, hash SHA-256, helper kecil.
 */
window.TB = window.TB || {};

TB.utils = (() => {
  const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------- Tanggal (semua tanggal disimpan sebagai string ISO YYYY-MM-DD, zona waktu lokal) ---------- */
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => toISO(new Date());
  const parseISO = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const addDays = (iso, n) => {
    const d = parseISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  };
  const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
  const isValidISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && toISO(parseISO(s)) === s;

  /** 2026-10-21 -> "21 Oktober 2026" */
  const formatDate = (iso) => {
    if (!isValidISO(iso)) return '-';
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
  };
  /** 2026-10-21 -> "21 Okt" */
  const formatDateShort = (iso) => {
    const [, m, d] = iso.split('-').map(Number);
    return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
  };
  const formatMonth = (key, short) => {
    const [y, m] = key.split('-').map(Number);
    return short ? `${MONTHS[m - 1].slice(0, 3)} ${y}` : `${MONTHS[m - 1]} ${y}`;
  };
  const formatDateTime = (ts) => {
    const d = new Date(ts);
    return `${formatDate(toISO(d))}, ${pad(d.getHours())}.${pad(d.getMinutes())}`;
  };

  /* ---------- Angka ---------- */
  const formatNumber = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  /** 10000 -> "Rp10.000" */
  const formatRupiah = (n) => {
    const v = Math.round(Number(n) || 0);
    return (v < 0 ? '-' : '') + 'Rp' + formatNumber(Math.abs(v));
  };
  /** Format ringkas untuk sumbu grafik: 1500000 -> "Rp1,5jt" */
  const formatRupiahShort = (n) => {
    const v = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (v >= 1e9) return `${sign}Rp${(v / 1e9).toFixed(1).replace('.', ',')}M`;
    if (v >= 1e6) return `${sign}Rp${(v / 1e6).toFixed(1).replace('.', ',').replace(',0', '')}jt`;
    if (v >= 1e3) return `${sign}Rp${Math.round(v / 1e3)}rb`;
    return `${sign}Rp${v}`;
  };

  /* ---------- Teks & DOM ---------- */
  const escapeHtml = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const debounce = (fn, ms = 200) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };
  const prefersReducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- SHA-256 (sinkron, tanpa bergantung pada crypto.subtle) ---------- */
  const sha256 = (message) => {
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    const primes = [];
    for (let c = 2; primes.length < 64; c++) if (primes.every((p) => c % p)) primes.push(c);
    const frac = (x) => ((x - Math.floor(x)) * 4294967296) | 0;
    let h = primes.slice(0, 8).map((p) => frac(Math.sqrt(p)));
    const K = primes.map((p) => frac(Math.cbrt(p)));

    const bytes = Array.from(new TextEncoder().encode(message));
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 255);

    for (let off = 0; off < bytes.length; off += 64) {
      const w = new Array(64);
      for (let i = 0; i < 16; i++) {
        w[i] = (bytes[off + 4 * i] << 24) | (bytes[off + 4 * i + 1] << 16) | (bytes[off + 4 * i + 2] << 8) | bytes[off + 4 * i + 3];
      }
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h = [h[0] + a, h[1] + b, h[2] + c, h[3] + d, h[4] + e, h[5] + f, h[6] + g, h[7] + hh].map((x) => x | 0);
    }
    return h.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  };

  return {
    MONTHS, pad, toISO, todayISO, parseISO, addDays, diffDays, isValidISO,
    formatDate, formatDateShort, formatMonth, formatDateTime,
    formatNumber, formatRupiah, formatRupiahShort,
    escapeHtml, uid, debounce, prefersReducedMotion, sha256
  };
})();
