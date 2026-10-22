/**
 * Konfigurasi lokal aplikasi (MODE DEMO).
 *
 * PENTING: login ini hanyalah SIMULASI FRONTEND. Semua kode di browser dapat dibaca dan diubah
 * pengguna, sehingga TIDAK memberikan keamanan produksi. Jangan dipakai untuk melindungi data sensitif.
 *
 * Mengganti kredensial demo:
 *   1. Ubah `username`.
 *   2. Hitung hash password baru, contoh di terminal:
 *        node -e "console.log(require('crypto').createHash('sha256').update('<salt>:<passwordBaru>').digest('hex'))"
 *      lalu tempel ke `passwordHash`. (Password asli tidak pernah ditulis di sini maupun di localStorage.)
 */
window.TB = window.TB || {};

TB.config = {
  store: {
    name: 'Kicau Makmur',
    tagline: 'Manajemen Toko Burung'
  },
  supabase: {
    url: 'https://edyeugvyfbblkbljyowt.supabase.co',
    anonKey: 'sb_publishable_nqbqm55mIV-lJPq9UIILAQ_qLcbs0ef',
    adminEmailDefault: 'hasan@kicaumakmur.com',
    enabled: true
  },
  admin: {
    username: 'hasan',
    salt: 'kicau-makmur-demo',
    // sha256("<salt>:<password>")
    passwordHash: 'be9254846c704eb9d4ed5193164428b153946fedb9786453558c895ca3376487',
    sessionMinutes: 60, // sesi demo berakhir otomatis
    maxAttempts: 5, // percobaan gagal sebelum dikunci sementara
    lockSeconds: 30
  },
  storage: {
    dataKey: 'kicau_makmur_data_v1', // data demo (burung, burung datang, penjualan) - TIDAK memuat password
    sessionKey: 'kicau_makmur_admin_session', // sessionStorage: status sesi admin
    sidebarKey: 'kicau_makmur_sidebar' // sessionStorage: preferensi sidebar
  },
  limits: {
    maxQty: 100000,
    maxPrice: 1000000000,
    maxRangeDays: 366,
    dailyGranularityMaxDays: 62 // lebih dari ini, laporan dikelompokkan per bulan
  },
  categories: ['Burung Kicau', 'Burung Hias', 'Lovebird', 'Perkutut', 'Merpati'],
  paymentMethods: ['Tunai', 'Transfer Bank', 'QRIS', 'E-Wallet', 'Lainnya']
};
