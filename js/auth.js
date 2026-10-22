/**
 * Autentikasi admin (SIMULASI FRONTEND).
 * - Password dibandingkan sebagai hash SHA-256; password asli tidak pernah disimpan.
 * - Status sesi hanya di sessionStorage (hilang saat tab ditutup) dan berakhir otomatis.
 * - Semua operasi administratif WAJIB memanggil TB.auth.requireAdmin().
 * Ini bukan keamanan produksi: siapa pun dapat memodifikasi kode di browser mereka.
 */
window.TB = window.TB || {};

TB.auth = (() => {
  const cfg = TB.config.admin;
  const key = TB.config.storage.sessionKey;
  const listeners = new Set();
  let session = null; // { user, exp }
  let failedAttempts = 0;
  let lockedUntil = 0;

  const sign = (user, exp) => TB.utils.sha256(`${user}|${exp}|${cfg.salt}|session`);
  const emit = (reason) => listeners.forEach((fn) => fn(reason));
  const onChange = (fn) => listeners.add(fn);

  function persist() {
    try {
      if (session) sessionStorage.setItem(key, JSON.stringify({ ...session, sig: sign(session.user, session.exp) }));
      else sessionStorage.removeItem(key);
    } catch (e) { /* penyimpanan tidak tersedia: sesi hanya hidup di memori */ }
  }

  function restore() {
    try {
      const raw = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (raw && raw.user === cfg.username && raw.exp > Date.now() && raw.sig === sign(raw.user, raw.exp)) {
        session = { user: raw.user, exp: raw.exp };
      } else if (raw) sessionStorage.removeItem(key);
    } catch (e) { session = null; }
  }

  /** Memeriksa masa berlaku sesi; mengakhiri sesi bila kedaluwarsa. */
  function validate() {
    if (session && session.exp <= Date.now()) {
      session = null;
      persist();
      emit('expired');
    }
    return !!session;
  }

  const isAdmin = () => validate();
  const getSession = () => (validate() ? { ...session } : null);

  /** Penjaga untuk setiap fungsi administratif. */
  function requireAdmin() {
    if (!validate()) throw new Error('Akses ditolak: fitur ini hanya untuk admin. Silakan login terlebih dahulu.');
  }

  /** Login admin: Memeriksa ke Supabase Auth terlebih dahulu, lalu fallback ke lokal. */
  async function login(username, password) {
    const u = (username || '').trim();
    if (!u) throw new Error('Username wajib diisi.');
    if (!password) throw new Error('Password wajib diisi.');
    if (Date.now() < lockedUntil) {
      throw new Error(`Terlalu banyak percobaan gagal. Coba lagi dalam ${Math.ceil((lockedUntil - Date.now()) / 1000)} detik.`);
    }

    let authMethod = 'local';

    // 1. Coba autentikasi via Supabase Auth jika tersedia
    if (TB.supabase && typeof TB.supabase.signInWithSupabase === 'function') {
      try {
        const supaRes = await TB.supabase.signInWithSupabase(u, password);
        if (supaRes && supaRes.success) {
          authMethod = 'supabase';
        }
      } catch (err) {
        console.warn('Supabase Auth error, mencoba autentikasi lokal:', err);
      }
    }

    // 2. Jika bukan dari Supabase, periksa kredensial demo lokal
    if (authMethod !== 'supabase') {
      const hash = TB.utils.sha256(`${cfg.salt}:${password}`);
      if (u.toLowerCase() !== cfg.username.toLowerCase() || hash !== cfg.passwordHash) {
        failedAttempts++;
        if (failedAttempts >= cfg.maxAttempts) {
          failedAttempts = 0;
          lockedUntil = Date.now() + cfg.lockSeconds * 1000;
          throw new Error(`Terlalu banyak percobaan gagal. Login dikunci selama ${cfg.lockSeconds} detik.`);
        }
        throw new Error('Username atau password salah.');
      }
    }

    failedAttempts = 0;
    session = {
      user: cfg.username,
      source: authMethod,
      exp: Date.now() + cfg.sessionMinutes * 60000
    };
    persist();
    emit('login');
    return getSession();
  }

  function logout() {
    session = null;
    persist();
    emit('logout');
  }

  restore();
  const timer = setInterval(validate, 15000); // cek masa berlaku sesi berkala
  if (timer && typeof timer.unref === 'function') timer.unref();

  return { isAdmin, getSession, requireAdmin, login, logout, onChange };
})();
