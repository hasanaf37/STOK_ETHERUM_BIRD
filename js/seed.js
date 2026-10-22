/**
 * Data simulasi (SEED). Dibuat otomatis relatif terhadap tanggal hari ini agar laporan terisi.
 * Seluruh data ini adalah data CONTOH, bukan transaksi nyata.
 */
window.TB = window.TB || {};

TB.seed = (() => {
  const { addDays, todayISO, pad } = TB.utils;

  // Generator acak deterministik agar hasil seed konsisten antar-pemuatan pertama.
  const makeRng = (seed) => {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  };
  const round5k = (n) => Math.round(n / 5000) * 5000;

  /**
   * Membuat ilustrasi SVG burung berwarna khas sesuai spesies (data URI),
   * sehingga setiap card stok burung langsung memiliki gambar burung yang menarik tanpa bergantung internet.
   */
  function makeBirdSvg({ bg1, bg2, body, wing, breast, beak, eye = '#1c130e', crest = '' }) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260" width="400" height="260">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${bg1}"/>
          <stop offset="100%" stop-color="${bg2}"/>
        </linearGradient>
      </defs>
      <rect width="400" height="260" fill="url(#bg)"/>
      <circle cx="330" cy="52" r="68" fill="rgba(255,255,255,0.14)"/>
      <circle cx="65" cy="220" r="85" fill="rgba(255,255,255,0.1)"/>
      <!-- Ranting pohon -->
      <path d="M40 206 Q190 192 360 212" stroke="#5b3a29" stroke-width="10" stroke-linecap="round" fill="none"/>
      <path d="M115 201 Q95 182 78 185" stroke="#6e4732" stroke-width="5" stroke-linecap="round" fill="none"/>
      <ellipse cx="75" cy="183" rx="14" ry="7" transform="rotate(-20 75 183)" fill="#6c8c45"/>
      <ellipse cx="315" cy="202" rx="16" ry="8" transform="rotate(15 315 202)" fill="#6c8c45"/>
      <!-- Ekor -->
      <path d="M148 162 L78 214 L98 222 L162 174 Z" fill="${body}"/>
      <path d="M144 166 L64 202 L76 214 L154 174 Z" fill="${wing}" opacity="0.88"/>
      <!-- Kaki -->
      <path d="M196 182 L190 202 M218 182 L214 202" stroke="#4a2e1b" stroke-width="4.5" stroke-linecap="round"/>
      <!-- Badan & Dada -->
      <ellipse cx="205" cy="144" rx="58" ry="44" transform="rotate(-14 205 144)" fill="${body}"/>
      <path d="M210 108 C248 112 266 144 248 174 C228 188 188 186 174 168 C178 136 192 114 210 108 Z" fill="${breast}"/>
      <!-- Sayap -->
      <path d="M162 126 C198 114 234 132 232 162 C206 172 172 166 156 148 Z" fill="${wing}"/>
      <!-- Kepala -->
      ${crest ? `<path d="M232 68 Q242 46 258 56 Q248 68 246 76 Z" fill="${crest}"/>` : ''}
      <circle cx="246" cy="96" r="28" fill="${body}"/>
      <!-- Paruh -->
      <polygon points="271,90 298,98 271,106" fill="${beak}"/>
      <!-- Mata -->
      <circle cx="254" cy="91" r="5.5" fill="#fff"/>
      <circle cx="255.5" cy="91" r="3.2" fill="${eye}"/>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  const BIRD_DEFS = [
    {
      nama: 'Murai Batu Medan',
      kategori: 'Burung Kicau',
      asal: 'Medan, Sumatera Utara',
      beli: 1200000,
      jual: 1650000,
      min: 3,
      qty: 8,
      restock: 4,
      keterangan: 'Ekor panjang melengkung, volume suara kristal lantang, sehat aktif dan sudah makan voer total.',
      palette: { bg1: '#f4e3c9', bg2: '#e2c499', body: '#1f242d', wing: '#2f3644', breast: '#d46a28', beak: '#3a2e28' }
    },
    {
      nama: 'Kacer Poci',
      kategori: 'Burung Kicau',
      asal: 'Wonogiri, Jawa Tengah',
      beli: 450000,
      jual: 650000,
      min: 4,
      qty: 10,
      restock: 6,
      keterangan: 'Dada putih bersih kontras hitam legam, mental tarung kuat, rajin bunyi pagi dan sore.',
      palette: { bg1: '#efe5d4', bg2: '#d8c5a8', body: '#1c1f24', wing: '#343a44', breast: '#f7f5f0', beak: '#2c2c2c' }
    },
    {
      nama: 'Cucak Hijau',
      kategori: 'Burung Kicau',
      asal: 'Lampung',
      beli: 900000,
      jual: 1300000,
      min: 3,
      qty: 5,
      restock: 0,
      keterangan: 'Bulu hijau daun mengkilap, topeng hitam pekat (jantan), pintar menirukan suara burung lain.',
      palette: { bg1: '#e4f0d5', bg2: '#c5dca9', body: '#3c8d2f', wing: '#296b20', breast: '#52ad3e', beak: '#302b27' }
    },
    {
      nama: 'Jalak Suren',
      kategori: 'Burung Kicau',
      asal: 'Boyolali, Jawa Tengah',
      beli: 350000,
      jual: 520000,
      min: 4,
      qty: 8,
      restock: 6,
      keterangan: 'Jinak dan responsif, kicauan bervariasi cocok untuk penjaga rumah maupun masteran.',
      palette: { bg1: '#f5ead6', bg2: '#dfcba8', body: '#2a2623', wing: '#4a423b', breast: '#ffffff', beak: '#e69b28', crest: '#2a2623' }
    },
    {
      nama: 'Kenari Yorkshire',
      kategori: 'Burung Hias',
      asal: 'Bandung, Jawa Barat',
      beli: 380000,
      jual: 550000,
      min: 4,
      qty: 9,
      restock: 6,
      keterangan: 'Postur tegak proporsional, bulu kuning cerah bersih, cengkok kicauan panjang dan merdu.',
      palette: { bg1: '#fdf3c7', bg2: '#f3dc86', body: '#f0b418', wing: '#d99810', breast: '#ffd23f', beak: '#e08b3c' }
    },
    {
      nama: 'Parkit Australia',
      kategori: 'Burung Hias',
      asal: 'Malang, Jawa Timur',
      beli: 60000,
      jual: 110000,
      min: 8,
      qty: 20,
      restock: 12,
      keterangan: 'Burung hias jambul jinak dan lincah, warna bulu kontras menawan, mudah dirawat pemula.',
      palette: { bg1: '#f6ebd8', bg2: '#e5d1b0', body: '#7c8288', wing: '#585e64', breast: '#f5d24b', beak: '#d97a2b', crest: '#f5b82e' }
    },
    {
      nama: 'Lovebird Biola',
      kategori: 'Lovebird',
      asal: 'Blitar, Jawa Timur',
      beli: 250000,
      jual: 400000,
      min: 5,
      qty: 10,
      restock: 6,
      keterangan: 'Warna kepala merah-oranye cerah dengan gradasi bulu hijau opal lembut, ngekek aktif.',
      palette: { bg1: '#fce8d5', bg2: '#ebd0b3', body: '#5da64b', wing: '#3f8030', breast: '#e86838', beak: '#e85234' }
    },
    {
      nama: 'Lovebird Pastel',
      kategori: 'Lovebird',
      asal: 'Blitar, Jawa Timur',
      beli: 200000,
      jual: 320000,
      min: 5,
      qty: 8,
      restock: 0,
      keterangan: 'Warna pastel kuning-hijau lembut, sehat dan lincah, cocok untuk ternak maupun peliharaan.',
      palette: { bg1: '#eff6d8', bg2: '#d5e4ad', body: '#8ccf58', wing: '#6bb03b', breast: '#f5e06b', beak: '#e26a48' }
    },
    {
      nama: 'Perkutut Bangkok',
      kategori: 'Perkutut',
      asal: 'Kediri, Jawa Timur',
      beli: 300000,
      jual: 480000,
      min: 4,
      qty: 8,
      restock: 5,
      keterangan: 'Suara anggungan empuk berirama khas Bangkok, lurik bulu rapi, tenang di gantangan.',
      palette: { bg1: '#f0e4d2', bg2: '#d6c1a3', body: '#7d6352', wing: '#594437', breast: '#b59985', beak: '#4a3a30' }
    },
    {
      nama: 'Merpati Kolong',
      kategori: 'Merpati',
      asal: 'Garut, Jawa Barat',
      beli: 150000,
      jual: 250000,
      min: 5,
      qty: 10,
      restock: 6,
      keterangan: 'Otot sayap tebal dan kuat, terbang tinggi menukik tepat sasaran, fisik prima terlatih.',
      palette: { bg1: '#e8eef5', bg2: '#cad6e5', body: '#5b6c7d', wing: '#3f4e5e', breast: '#8a9bad', beak: '#d48c46' }
    }
  ];

  const BUYERS = ['Budi Santoso', 'Rina Marlina', 'Agus Pratama', 'Dewi Lestari', 'Hendra Wijaya', 'Siti Aminah', 'Yoga Permana', '', 'Komunitas Kicau Jaya', '', 'Eko Prasetyo'];
  const SUPPLIERS = ['Peternak Pak Wahyu', 'CV Sangkar Mas', 'Pengepul Mas Dani', 'Penangkaran Bu Retno'];
  const PAYMENTS = ['Tunai', 'Tunai', 'Transfer Bank', 'QRIS', 'E-Wallet'];
  const DAYS_BACK = 75;

  function generate() {
    const rng = makeRng(20261021);
    const today = todayISO();
    const birds = [];
    const arrivals = [];
    const sales = [];
    const stock = {};
    const costSum = {}; // untuk rata-rata tertimbang harga pokok
    const costQty = {};
    let arrCounter = 0;
    let saleCounter = 0;
    const perDaySeq = {};

    BIRD_DEFS.forEach((def, i) => {
      const id = `b${pad(i + 1)}`;
      birds.push({
        id,
        nama: def.nama,
        kategori: def.kategori,
        asal: def.asal,
        keterangan: def.keterangan,
        tanggalMasuk: addDays(today, -DAYS_BACK + i * 2),
        hargaBeli: def.beli,
        hargaJual: def.jual,
        minStok: def.min,
        foto: makeBirdSvg(def.palette)
      });
      stock[id] = 0; costSum[id] = 0; costQty[id] = 0;
    });

    const addArrival = (bird, def, date, qty, idx) => {
      const price = round5k(def.beli * (1 + (rng() - 0.5) * 0.08)) || def.beli;
      arrivals.push({
        id: `a${pad(++arrCounter)}`, tanggal: date, birdId: bird.id, jumlah: qty, hargaBeli: price,
        pemasok: SUPPLIERS[(idx + arrCounter) % SUPPLIERS.length],
        catatan: arrCounter <= BIRD_DEFS.length ? 'Stok awal' : ''
      });
      stock[bird.id] += qty; costSum[bird.id] += qty * price; costQty[bird.id] += qty;
      bird.hargaBeli = price;
    };

    for (let offset = -DAYS_BACK; offset <= 0; offset++) {
      const date = addDays(today, offset);
      BIRD_DEFS.forEach((def, i) => {
        const bird = birds[i];
        if (offset === -DAYS_BACK + i * 2) addArrival(bird, def, date, def.qty, i);
        else if (def.restock && offset > -DAYS_BACK + 20 && (offset + DAYS_BACK + i * 3) % 24 === 0) {
          addArrival(bird, def, date, def.restock, i);
        }
      });
      if (offset > -DAYS_BACK + 4) {
        const txCount = Math.floor(rng() * 4); // 0..3 transaksi per hari
        for (let t = 0; t < txCount; t++) {
          const i = Math.floor(rng() * BIRD_DEFS.length);
          const bird = birds[i];
          const def = BIRD_DEFS[i];
          const qty = 1 + Math.floor(rng() * (def.jual < 150000 ? 3 : 2));
          if (stock[bird.id] < qty) continue;
          const key = date.replace(/-/g, '');
          perDaySeq[key] = (perDaySeq[key] || 0) + 1;
          saleCounter++;
          sales.push({
            id: `s${pad(saleCounter)}`,
            noTransaksi: `TRX-${key}-${String(perDaySeq[key]).padStart(3, '0')}`,
            tanggal: date, birdId: bird.id, jumlah: qty,
            hargaJual: round5k(def.jual * (1 - rng() * 0.06)) || def.jual,
            hargaPokok: Math.round(costSum[bird.id] / costQty[bird.id]),
            pembeli: BUYERS[Math.floor(rng() * BUYERS.length)],
            metode: PAYMENTS[Math.floor(rng() * PAYMENTS.length)]
          });
          stock[bird.id] -= qty;
        }
      }
    }

    const FEED_ITEMS = [
      { pakan: 'Voer Halus, Jangkrik Alam & Kroto Segar', biaya: 95000 },
      { pakan: 'Milet Putih, Canary Seed & Ebod Vit', biaya: 75000 },
      { pakan: 'Ulat Hongkong, Pisang Kepok & Voer Super', biaya: 110000 },
      { pakan: 'Jagung Muda, Kacang Hijau & Grit Cangkang', biaya: 65000 },
      { pakan: 'Jangkrik, Ulat Kandang & Multivitamin Harian', biaya: 85000 },
      { pakan: 'Pakan Campuran Harian Seluruh Kandang', biaya: 125000 }
    ];
    const hpp = [
      {
        id: 'h01',
        tanggal: addDays(today, -14),
        pakanBurung: FEED_ITEMS[0].pakan,
        biayaPakan: FEED_ITEMS[0].biaya,
        statusInsiden: 'Tidak ada',
        matiAtauLepas: 'Tidak ada',
        biayaMatiLepas: 0
      },
      {
        id: 'h02',
        tanggal: addDays(today, -11),
        pakanBurung: FEED_ITEMS[1].pakan,
        biayaPakan: FEED_ITEMS[1].biaya,
        statusInsiden: 'Mati',
        matiAtauLepas: 'Mati — 1 ekor Parkit Australia (perubahan cuaca)',
        biayaMatiLepas: 60000
      },
      {
        id: 'h03',
        tanggal: addDays(today, -8),
        pakanBurung: FEED_ITEMS[2].pakan,
        biayaPakan: FEED_ITEMS[2].biaya,
        statusInsiden: 'Tidak ada',
        matiAtauLepas: 'Tidak ada',
        biayaMatiLepas: 0
      },
      {
        id: 'h04',
        tanggal: addDays(today, -5),
        pakanBurung: FEED_ITEMS[3].pakan,
        biayaPakan: FEED_ITEMS[3].biaya,
        statusInsiden: 'Lepas',
        matiAtauLepas: 'Lepas — 1 ekor Merpati Kolong (pintu sangkar terbuka)',
        biayaMatiLepas: 150000
      },
      {
        id: 'h05',
        tanggal: addDays(today, -2),
        pakanBurung: FEED_ITEMS[4].pakan,
        biayaPakan: FEED_ITEMS[4].biaya,
        statusInsiden: 'Tidak ada',
        matiAtauLepas: 'Tidak ada',
        biayaMatiLepas: 0
      },
      {
        id: 'h06',
        tanggal: today,
        pakanBurung: FEED_ITEMS[5].pakan,
        biayaPakan: FEED_ITEMS[5].biaya,
        statusInsiden: 'Tidak ada',
        matiAtauLepas: 'Tidak ada',
        biayaMatiLepas: 0
      }
    ];

    return { meta: { simulation: true, version: 3 }, birds, arrivals, sales, hpp };
  }

  const defaultBirdPhoto = () => makeBirdSvg({ bg1: '#f3e5d0', bg2: '#dfc7a4', body: '#5b3a29', wing: '#8a5a3c', breast: '#c68642', beak: '#d4a537' });

  return { generate, defaultBirdPhoto };
})();
