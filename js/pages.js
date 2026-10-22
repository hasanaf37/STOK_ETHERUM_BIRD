/**
 * Halaman-halaman aplikasi (hanya membangun HTML & menghubungkan grafik).
 * Kontrol administratif (tambah/edit/hapus/ekspor/cetak) hanya DIRENDER bila admin login,
 * dan setiap handler tetap memeriksa hak akses lewat TB.auth.requireAdmin().
 */
window.TB = window.TB || {};

TB.pages = (() => {
  const U = TB.utils;
  const UI = TB.ui;
  const C = TB.calc;
  const esc = U.escapeHtml;
  const ic = UI.icon;
  const cfg = TB.config;

  /* Status tampilan yang dipertahankan antar-render */
  const view = {
    dashPeriod: '30d',
    reportRange: '30d',
    custom: { start: U.addDays(U.todayISO(), -6), end: U.todayISO() },
    customError: '',
    report: null // laporan aktif (dipakai tabel & ekspor)
  };

  const isAdmin = () => TB.auth.isAdmin();

  /* ---------- Potongan HTML bersama ---------- */
  const simulationBanner = () =>
    TB.store.isSimulation()
      ? `<div class="banner banner-sim reveal">${ic('flask-conical')}<div><strong>Data simulasi.</strong> Seluruh data di halaman ini adalah contoh untuk demo, bukan transaksi nyata. Admin dapat mengosongkannya di menu Akun Admin.</div></div>`
      : '';

  const pageHeader = (title, subtitle, actions = '') => `
    <div class="page-head reveal">
      <div><h1>${esc(title)}</h1><p class="muted">${esc(subtitle)}</p></div>
      ${actions ? `<div class="page-actions">${actions}</div>` : ''}
    </div>`;

  const statCard = ({ iconName, label, value, money, note, tone = 'brown' }) => `
    <div class="stat-card tone-${tone} reveal">
      <div class="stat-icon">${ic(iconName)}</div>
      <div class="stat-body">
        <span class="stat-label">${esc(label)}</span>
        <strong class="stat-value" data-count="${Math.round(value)}" ${money ? 'data-format="rupiah"' : ''}>${money ? U.formatRupiah(value) : U.formatNumber(value)}</strong>
        ${note ? `<span class="stat-note">${esc(note)}</span>` : ''}
      </div>
    </div>`;

  const statusBadge = (status) => `<span class="badge badge-${status.key}">${esc(status.label)}</span>`;
  const avatar = (name) => `<span class="bird-avatar" aria-hidden="true">${ic('bird')}</span>`;
  const birdPhoto = (b) =>
    b.foto
      ? `<img class="bird-photo" src="${esc(b.foto)}" alt="Foto ${esc(b.nama)}" loading="lazy" data-photo-fallback />`
      : avatar(b.nama);

  const rowActions = (entity, row, label) => `
    <div class="row-actions">
      <button type="button" class="icon-btn" data-action="edit-${entity}" data-id="${esc(row.id)}" title="Edit" aria-label="Edit ${esc(label)}">${ic('pencil')}</button>
      <button type="button" class="icon-btn danger" data-action="delete-${entity}" data-id="${esc(row.id)}" title="Hapus" aria-label="Hapus ${esc(label)}">${ic('trash-2')}</button>
    </div>`;

  const searchBox = (id, placeholder) => `
    <label class="search-box">${ic('search')}<span class="sr-only">Cari</span>
      <input type="search" placeholder="${esc(placeholder)}" data-table-search="${id}" value="${esc(UI.getTableState(id).search)}" autocomplete="off" />
    </label>`;
  const filterSelect = (id, key, label, options) => {
    const current = UI.getTableState(id).filters[key] || '';
    return `<label class="select-box"><span class="sr-only">${esc(label)}</span>
      <select data-table-filter="${id}" data-filter-key="${key}">
        <option value="">${esc(label)}</option>
        ${options.map(([v, l]) => `<option value="${esc(v)}" ${v === current ? 'selected' : ''}>${esc(l)}</option>`).join('')}
      </select></label>`;
  };
  const adminNote = () =>
    isAdmin()
      ? ''
      : `<div class="banner banner-info reveal">${ic('eye')}<div>Anda melihat tampilan umum (hanya baca). <a href="#akun">Login admin</a> untuk menambah, mengubah, atau menghapus data.</div></div>`;

  /* ---------- Definisi daftar Stok Burung (Model Card) & Tabel ---------- */
  const money = (v) => U.formatRupiah(v);

  const renderBirdCard = (r, idx) => {
    const imgSrc = r.foto || TB.seed.defaultBirdPhoto();
    const ket = r.keterangan || `Burung ${r.kategori} asal ${r.asal}, sehat dan terawat.`;
    return `
      <article class="bird-card status-${esc(r.status.key)}">
        <div class="bird-card-media" data-action="view-photo" data-src="${esc(imgSrc)}" data-title="${esc(r.nama)}" title="Klik untuk memperbesar foto">
          <img class="bird-card-img" src="${esc(imgSrc)}" alt="Gambar ${esc(r.nama)}" loading="lazy" data-photo-fallback />
          <div class="bird-card-badges">
            <span class="bird-card-num">#${idx + 1}</span>
            ${statusBadge(r.status)}
          </div>
          <span class="bird-card-cat">${ic('tag')}<span>${esc(r.kategori)}</span></span>
        </div>
        <div class="bird-card-body">
          <div class="bird-card-title-row">
            <h3>${esc(r.nama)}</h3>
            <span class="bird-card-origin">${ic('map-pin')}<span>${esc(r.asal)}</span></span>
          </div>
          <p class="bird-card-desc">${esc(ket)}</p>

          <div class="bird-card-prices">
            <div class="price-box primary">
              <span class="price-label">Harga Jual</span>
              <strong class="price-val">${money(r.hargaJual)}<small>/ekor</small></strong>
            </div>
            <div class="price-box">
              <span class="price-label">Harga Beli</span>
              <strong class="price-val">${money(r.hargaBeli)}<small>/ekor</small></strong>
            </div>
          </div>

          <div class="bird-card-meta">
            <div class="meta-item">
              <span class="meta-label">${ic('boxes')}<span>Stok Tersedia</span></span>
              <strong class="meta-val">${U.formatNumber(r.stok)} ekor</strong>
            </div>
            <div class="meta-item">
              <span class="meta-label">${ic('layers')}<span>Jumlah Burung</span></span>
              <strong class="meta-val">${U.formatNumber(r.jumlahMasuk)} masuk • ${U.formatNumber(r.jumlahTerjual)} terjual</strong>
            </div>
            <div class="meta-item">
              <span class="meta-label">${ic('calendar')}<span>Tanggal Masuk</span></span>
              <strong class="meta-val">${U.formatDate(r.tanggalMasuk)}</strong>
            </div>
            <div class="meta-item">
              <span class="meta-label">${ic('activity')}<span>Status Stok</span></span>
              <span class="meta-val">${statusBadge(r.status)} <small class="muted">(min. ${r.minStok})</small></span>
            </div>
          </div>
        </div>
        ${isAdmin() ? `
          <div class="bird-card-foot">
            <button type="button" class="btn btn-ghost btn-sm" data-action="edit-bird" data-id="${esc(r.id)}" aria-label="Edit ${esc(r.nama)}">${ic('pencil')}<span>Edit</span></button>
            <button type="button" class="btn btn-ghost btn-sm danger-text" data-action="delete-bird" data-id="${esc(r.id)}" aria-label="Hapus ${esc(r.nama)}">${ic('trash-2')}<span>Hapus</span></button>
          </div>` : ''}
      </article>`;
  };

  UI.registerTable('birds', {
    pageSize: 9,
    defaultSort: { key: 'nama', dir: 'asc' },
    getRows: () => C.birdRows(),
    search: (r) => `${r.nama} ${r.kategori} ${r.asal} ${r.keterangan || ''}`,
    filter: (r, f) => (!f.kategori || r.kategori === f.kategori) && (!f.status || r.status.key === f.status),
    empty: { icon: 'bird', title: 'Belum ada stok burung', text: 'Stok burung yang ditambahkan admin akan tampil di sini.' },
    cardRender: renderBirdCard,
    columns: () => [
      { key: 'no', label: 'No', render: (r, i) => i + 1 },
      { key: 'foto', label: 'Foto', render: (r) => birdPhoto(r) },
      { key: 'nama', label: 'Nama burung', sortable: true, className: 'strong', render: (r) => esc(r.nama) },
      { key: 'kategori', label: 'Kategori', sortable: true, render: (r) => `<span class="chip">${esc(r.kategori)}</span>` },
      { key: 'asal', label: 'Asal', sortable: true, render: (r) => esc(r.asal) },
      { key: 'tanggalMasuk', label: 'Tanggal masuk', sortable: true, render: (r) => U.formatDate(r.tanggalMasuk) },
      { key: 'hargaBeli', label: 'Harga beli', sortable: true, align: 'right', render: (r) => money(r.hargaBeli) },
      { key: 'hargaJual', label: 'Harga jual', sortable: true, align: 'right', render: (r) => money(r.hargaJual) },
      { key: 'stok', label: 'Stok', sortable: true, align: 'right', render: (r) => `<strong>${U.formatNumber(r.stok)}</strong> ekor` },
      { key: 'status', label: 'Status', sortable: true, sortValue: (r) => r.stok, render: (r) => statusBadge(r.status) },
      ...(isAdmin() ? [{ key: 'aksi', label: 'Aksi', align: 'center', render: (r) => rowActions('bird', r, r.nama) }] : [])
    ]
  });

  const withBird = (x) => {
    const b = TB.store.getBird(x.birdId);
    return { ...x, nama: b?.nama || '(dihapus)', kategori: b?.kategori || '-' };
  };

  UI.registerTable('arrivals', {
    pageSize: 10,
    selectable: true,
    defaultSort: { key: 'tanggal', dir: 'desc' },
    getRows: () => TB.store.get().arrivals.map((a) => ({ ...withBird(a), total: a.jumlah * a.hargaBeli })),
    search: (r) => `${r.nama} ${r.kategori} ${r.pemasok} ${r.catatan}`,
    filter: (r, f) => !f.kategori || r.kategori === f.kategori,
    empty: { icon: 'package-open', title: 'Belum ada burung datang', text: 'Riwayat kedatangan burung akan tampil di sini.' },
    columns: () => [
      { key: 'tanggal', label: 'Tanggal masuk', sortable: true, render: (r) => U.formatDate(r.tanggal) },
      { key: 'nama', label: 'Nama burung', sortable: true, className: 'strong', render: (r) => esc(r.nama) },
      { key: 'kategori', label: 'Kategori', sortable: true, render: (r) => `<span class="chip">${esc(r.kategori)}</span>` },
      { key: 'jumlah', label: 'Jumlah', sortable: true, align: 'right', render: (r) => `${U.formatNumber(r.jumlah)} ekor` },
      { key: 'hargaBeli', label: 'Harga beli / ekor', sortable: true, align: 'right', render: (r) => money(r.hargaBeli) },
      { key: 'total', label: 'Total biaya', sortable: true, align: 'right', className: 'strong', render: (r) => money(r.total) },
      { key: 'pemasok', label: 'Asal pemasok', sortable: true, render: (r) => esc(r.pemasok) },
      { key: 'catatan', label: 'Catatan', render: (r) => (r.catatan ? esc(r.catatan) : '<span class="muted">-</span>') },
      ...(isAdmin() ? [{ key: 'aksi', label: 'Aksi', align: 'center', render: (r) => rowActions('arrival', r, `${r.nama} (${U.formatDate(r.tanggal)})`) }] : [])
    ]
  });

  UI.registerTable('sales', {
    pageSize: 10,
    selectable: true,
    defaultSort: { key: 'tanggal', dir: 'desc' },
    getRows: () => TB.store.get().sales.map((s) => ({ ...withBird(s), total: s.jumlah * s.hargaJual })),
    search: (r) => `${r.nama} ${r.noTransaksi} ${r.pembeli} ${r.metode}`,
    filter: (r, f) => !f.metode || r.metode === f.metode,
    empty: { icon: 'receipt', title: 'Belum ada penjualan', text: 'Riwayat transaksi penjualan akan tampil di sini.' },
    columns: () => [
      { key: 'tanggal', label: 'Tanggal', sortable: true, render: (r) => U.formatDate(r.tanggal) },
      { key: 'noTransaksi', label: 'No. transaksi', sortable: true, render: (r) => `<code>${esc(r.noTransaksi)}</code>` },
      { key: 'nama', label: 'Nama burung', sortable: true, className: 'strong', render: (r) => esc(r.nama) },
      { key: 'jumlah', label: 'Jumlah', sortable: true, align: 'right', render: (r) => `${U.formatNumber(r.jumlah)} ekor` },
      { key: 'hargaJual', label: 'Harga jual / ekor', sortable: true, align: 'right', render: (r) => money(r.hargaJual) },
      { key: 'total', label: 'Total penjualan', sortable: true, align: 'right', className: 'strong', render: (r) => money(r.total) },
      { key: 'pembeli', label: 'Pembeli', sortable: true, render: (r) => (r.pembeli ? esc(r.pembeli) : '<span class="muted">-</span>') },
      { key: 'metode', label: 'Pembayaran', sortable: true, render: (r) => `<span class="chip chip-soft">${esc(r.metode)}</span>` },
      ...(isAdmin() ? [{ key: 'aksi', label: 'Aksi', align: 'center', render: (r) => rowActions('sale', r, r.noTransaksi) }] : [])
    ]
  });

  UI.registerTable('hpp', {
    pageSize: 10,
    selectable: true,
    defaultSort: { key: 'tanggal', dir: 'desc' },
    getRows: () => (TB.store.get().hpp || []).map((h) => ({
      ...h,
      totalBiaya: (Number(h.biayaPakan) || 0) + (Number(h.biayaMatiLepas) || 0)
    })),
    search: (r) => `${U.formatDate(r.tanggal)} ${r.tanggal} ${r.pakanBurung} ${r.matiAtauLepas} ${r.statusInsiden || ''}`,
    filter: (r, f) => !f.statusInsiden || (r.statusInsiden || 'Tidak ada') === f.statusInsiden,
    empty: { icon: 'calculator', title: 'Belum ada catatan HPP', text: 'Catatan biaya pakan burung serta burung mati atau lepas akan tampil di sini.' },
    columns: () => [
      { key: 'tanggal', label: 'Tanggal', sortable: true, render: (r) => U.formatDate(r.tanggal) },
      {
        key: 'pakanBurung',
        label: 'Pakan burung',
        sortable: true,
        sortValue: (r) => r.biayaPakan,
        render: (r) => `<div class="hpp-cell"><strong>${esc(r.pakanBurung)}</strong><span class="chip">${money(r.biayaPakan)}</span></div>`
      },
      {
        key: 'matiAtauLepas',
        label: 'Mati atau lepas',
        sortable: true,
        sortValue: (r) => r.biayaMatiLepas,
        render: (r) => {
          const st = r.statusInsiden || 'Tidak ada';
          if (st === 'Tidak ada' && !r.biayaMatiLepas) {
            return `<span class="badge badge-ok">Tidak ada</span> <span class="muted">(${money(0)})</span>`;
          }
          const badgeCls = st === 'Mati' ? 'badge-out' : 'badge-low';
          return `<div class="hpp-cell"><span class="badge ${badgeCls}">${esc(r.matiAtauLepas)}</span><span class="chip chip-soft">${money(r.biayaMatiLepas)}</span></div>`;
        }
      },
      {
        key: 'totalBiaya',
        label: 'Total biaya',
        sortable: true,
        align: 'right',
        className: 'strong',
        render: (r) => money(r.totalBiaya)
      },
      ...(isAdmin() ? [{ key: 'aksi', label: 'Aksi', align: 'center', render: (r) => rowActions('hpp', r, `HPP ${U.formatDate(r.tanggal)}`) }] : [])
    ]
  });

  UI.registerTable('report', {
    pageSize: 15,
    defaultSort: { key: 'key', dir: 'asc' },
    getRows: () => (view.report ? view.report.rows : []),
    search: (r) => `${r.fullLabel} ${r.label}`,
    empty: { icon: 'bar-chart-3', title: 'Belum ada data', text: 'Tidak ada data pada periode ini.' },
    columns: () => [
      { key: 'key', label: view.report?.monthly ? 'Bulan' : 'Tanggal', sortable: true, className: 'strong', render: (r) => esc(r.fullLabel) },
      { key: 'terjual', label: 'Jumlah', sortable: true, align: 'right', render: (r) => `${U.formatNumber(r.terjual)} ekor` },
      { key: 'hargaAsli', label: 'Harga asli', sortable: true, align: 'right', render: (r) => money(r.hargaAsli) },
      { key: 'hargaJual', label: 'Harga jual', sortable: true, align: 'right', render: (r) => money(r.hargaJual) },
      { key: 'hpp', label: 'HPP', sortable: true, align: 'right', render: (r) => money(r.hpp) },
      {
        key: 'keuntunganBersih',
        label: 'Keuntungan bersih',
        sortable: true,
        align: 'right',
        className: 'strong',
        render: (r) => `<span class="${r.keuntunganBersih < 0 ? 'danger-text' : ''}">${money(r.keuntunganBersih)}</span>`
      }
    ]
  });

  /* ---------- Dashboard ---------- */
  const DASH_PERIODS = [['7d', '7 hari terakhir'], ['30d', '30 hari terakhir'], ['thisMonth', 'Bulan ini']];

  function dashboardPage() {
    const admin = isAdmin();
    const range = C.resolveRange(view.dashPeriod);
    const report = C.buildReport(range.start, range.end);
    const t = report.totals;
    const rows = C.birdRows();
    const low = C.lowStockBirds();
    const recent = C.recentSales(6).map(withBird);

    const quick = admin
      ? `<button type="button" class="btn btn-primary" data-action="add-sale">${ic('shopping-bag')}<span>Catat penjualan</span></button>
         <button type="button" class="btn btn-ghost" data-action="add-arrival">${ic('package-plus')}<span>Catat burung datang</span></button>`
      : '';

    return `
      ${simulationBanner()}
      ${pageHeader('Dashboard', `Ringkasan toko • ${C.rangeLabel(range)}`, `
        <label class="select-box"><span class="sr-only">Periode ringkasan</span>
          <select data-dash-period>${DASH_PERIODS.map(([v, l]) => `<option value="${v}" ${v === view.dashPeriod ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </label>${quick}`)}
      ${adminNote()}
      <section class="stat-grid" aria-label="Statistik utama">
        ${statCard({ iconName: 'bird', label: 'Total jenis burung', value: rows.length, note: 'Terdaftar di inventaris', tone: 'brown' })}
        ${statCard({ iconName: 'boxes', label: 'Total stok tersedia', value: C.totalStock(), note: 'Ekor burung di toko', tone: 'caramel' })}
        ${statCard({ iconName: 'package-plus', label: 'Burung masuk', value: t.masuk, note: 'Pada periode terpilih', tone: 'olive' })}
        ${statCard({ iconName: 'shopping-bag', label: 'Burung terjual', value: t.terjual, note: `${U.formatNumber(t.trx)} transaksi`, tone: 'gold' })}
        ${statCard({ iconName: 'wallet', label: 'Total omzet', value: t.omzet, money: true, note: 'Pada periode terpilih', tone: 'brown' })}
      </section>
      <section class="grid-2">
        <div class="card reveal">
          <div class="card-head"><h2>Pemasukan & penjualan</h2><span class="muted">${esc(C.rangeLabel(range))}</span></div>
          ${report.hasData ? '<div class="chart-box"><canvas id="chart-overview" aria-label="Grafik pemasukan dan penjualan" role="img"></canvas></div>'
            : UI.emptyState('line-chart', 'Belum ada transaksi', 'Belum ada data penjualan atau burung masuk pada periode ini.')}
        </div>
        <div class="card reveal">
          <div class="card-head"><h2>Stok menipis</h2><span class="badge ${low.length ? 'badge-low' : 'badge-ok'}">${low.length ? low.length + ' burung' : 'Aman'}</span></div>
          ${low.length ? `<ul class="alert-list">${low.slice(0, 6).map((b) => `
            <li><span class="alert-dot ${b.status.key}"></span>
              <div><strong>${esc(b.nama)}</strong><small class="muted">${esc(b.kategori)} • batas ${b.minStok} ekor</small></div>
              <span class="badge badge-${b.status.key}">${b.stok} ekor</span></li>`).join('')}</ul>
            ${low.length > 6 ? `<a class="link-more" href="#stok-burung">Lihat semua (${low.length})</a>` : ''}`
            : UI.emptyState('shield-check', 'Stok aman', 'Tidak ada burung dengan stok menipis atau habis.')}
        </div>
      </section>
      <section class="card reveal">
        <div class="card-head"><h2>Transaksi terbaru</h2><a class="link-more" href="#burung-terjual">Lihat semua</a></div>
        ${recent.length ? `<div class="table-wrap"><table class="data-table"><thead><tr>
            <th>Tanggal</th><th>No. transaksi</th><th>Burung</th><th class="ta-right">Jumlah</th><th class="ta-right">Total</th><th>Pembeli</th></tr></thead><tbody>
            ${recent.map((s) => `<tr><td>${U.formatDate(s.tanggal)}</td><td><code>${esc(s.noTransaksi)}</code></td><td class="strong">${esc(s.nama)}</td>
              <td class="ta-right">${s.jumlah} ekor</td><td class="ta-right strong">${money(s.jumlah * s.hargaJual)}</td><td>${s.pembeli ? esc(s.pembeli) : '<span class="muted">-</span>'}</td></tr>`).join('')}
            </tbody></table></div>`
          : UI.emptyState('receipt', 'Belum ada transaksi', 'Transaksi penjualan terbaru akan tampil di sini.')}
      </section>`;
  }
  function dashboardMount() {
    const range = C.resolveRange(view.dashPeriod);
    const report = C.buildReport(range.start, range.end);
    if (report.hasData) TB.charts.overview('chart-overview', report);
  }

  /* ---------- Stok Burung (Model Card) ---------- */
  function birdsPage() {
    const categories = [...new Set([...cfg.categories, ...TB.store.get().birds.map((b) => b.kategori)])];
    const st = UI.getTableState('birds');
    const curSort = `${st.sortKey}:${st.sortDir}`;
    const sortOptions = [
      ['nama:asc', 'Urutkan: Nama (A–Z)'],
      ['nama:desc', 'Urutkan: Nama (Z–A)'],
      ['hargaJual:desc', 'Urutkan: Harga tertinggi'],
      ['hargaJual:asc', 'Urutkan: Harga terendah'],
      ['stok:desc', 'Urutkan: Stok terbanyak'],
      ['stok:asc', 'Urutkan: Stok paling sedikit'],
      ['tanggalMasuk:desc', 'Urutkan: Tanggal terbaru']
    ];
    return `
      ${simulationBanner()}
      ${pageHeader('Stok Burung', 'Katalog stok burung lengkap dengan gambar, jenis, keterangan, harga, jumlah, tanggal, dan status', isAdmin() ? `<button type="button" class="btn btn-primary" data-action="add-bird">${ic('plus')}<span>Tambah stok burung</span></button>` : '')}
      ${adminNote()}
      <section class="card reveal">
        <div class="toolbar">
          ${searchBox('birds', 'Cari nama, jenis burung, keterangan, atau asal…')}
          ${filterSelect('birds', 'kategori', 'Semua jenis burung', categories.map((c) => [c, c]))}
          ${filterSelect('birds', 'status', 'Semua status stok', [['ok', 'Tersedia'], ['low', 'Menipis'], ['out', 'Habis']])}
          <label class="select-box"><span class="sr-only">Urutkan stok burung</span>
            <select data-table-sort-select="birds">
              ${sortOptions.map(([v, l]) => `<option value="${v}" ${v === curSort ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </label>
        </div>
        ${UI.tableHost('birds')}
      </section>`;
  }

  /* ---------- Burung Datang ---------- */
  function arrivalsPage() {
    const cats = [...new Set(TB.store.get().birds.map((b) => b.kategori))];
    return `
      ${simulationBanner()}
      ${pageHeader('Burung Datang', 'Riwayat kedatangan burung. Stok bertambah otomatis saat transaksi disimpan.', isAdmin() ? `<button type="button" class="btn btn-primary" data-action="add-arrival">${ic('package-plus')}<span>Catat burung datang</span></button>` : '')}
      ${adminNote()}
      <section class="card reveal">
        <div class="toolbar">
          ${searchBox('arrivals', 'Cari burung, pemasok, atau catatan…')}
          ${filterSelect('arrivals', 'kategori', 'Semua kategori', cats.map((c) => [c, c]))}
        </div>
        ${UI.tableHost('arrivals')}
      </section>`;
  }

  /* ---------- Burung Terjual ---------- */
  function salesPage() {
    return `
      ${simulationBanner()}
      ${pageHeader('Burung Terjual', 'Riwayat penjualan. Stok berkurang otomatis dan tidak dapat melebihi stok tersedia.', isAdmin() ? `<button type="button" class="btn btn-primary" data-action="add-sale">${ic('shopping-bag')}<span>Catat penjualan</span></button>` : '')}
      ${adminNote()}
      <section class="card reveal">
        <div class="toolbar">
          ${searchBox('sales', 'Cari burung, no. transaksi, atau pembeli…')}
          ${filterSelect('sales', 'metode', 'Semua pembayaran', cfg.paymentMethods.map((m) => [m, m]))}
        </div>
        ${UI.tableHost('sales')}
      </section>`;
  }

  /* ---------- HPP (Pakan Burung, Mati atau Lepas, Total Biaya) ---------- */
  function hppPage() {
    const list = TB.store.get().hpp || [];
    const totalPakan = list.reduce((s, x) => s + (Number(x.biayaPakan) || 0), 0);
    const totalMatiLepas = list.reduce((s, x) => s + (Number(x.biayaMatiLepas) || 0), 0);
    const totalBiaya = totalPakan + totalMatiLepas;
    const jmlInsiden = list.filter((x) => (x.statusInsiden && x.statusInsiden !== 'Tidak ada') || Number(x.biayaMatiLepas) > 0).length;

    return `
      ${simulationBanner()}
      ${pageHeader('HPP', 'Pencatatan biaya pakan burung, kerugian burung mati atau lepas, serta total biaya dalam Rupiah.', isAdmin() ? `<button type="button" class="btn btn-primary" data-action="add-hpp">${ic('plus')}<span>Catat HPP</span></button>` : '')}
      ${adminNote()}
      <section class="stat-grid" aria-label="Ringkasan HPP">
        ${statCard({ iconName: 'wheat', label: 'Total biaya pakan burung', value: totalPakan, money: true, note: 'Akumulasi pengeluaran pakan', tone: 'olive' })}
        ${statCard({ iconName: 'alert-triangle', label: 'Biaya mati atau lepas', value: totalMatiLepas, money: true, note: `${U.formatNumber(jmlInsiden)} kejadian tercatat`, tone: 'clay' })}
        ${statCard({ iconName: 'calculator', label: 'Total biaya HPP', value: totalBiaya, money: true, note: 'Pakan + mati atau lepas', tone: 'brown' })}
        ${statCard({ iconName: 'clipboard-list', label: 'Jumlah catatan HPP', value: list.length, note: 'entri tercatat', tone: 'caramel' })}
      </section>
      <section class="card reveal">
        <div class="toolbar">
          ${searchBox('hpp', 'Cari tanggal, pakan burung, atau keterangan mati/lepas…')}
          ${filterSelect('hpp', 'statusInsiden', 'Semua status mati/lepas', [
            ['Tidak ada', 'Tidak ada mati / lepas'],
            ['Mati', 'Burung mati'],
            ['Lepas', 'Burung lepas']
          ])}
        </div>
        ${UI.tableHost('hpp')}
      </section>`;
  }

  /* ---------- Laporan ---------- */
  function currentRange() {
    return C.resolveRange(view.reportRange, view.custom);
  }

  function reportPage() {
    const admin = isAdmin();
    let range = currentRange();
    view.customError = '';
    if (range.error) {
      view.customError = range.error;
      range = C.resolveRange('30d'); // tetap tampilkan data terakhir yang valid
    }
    const report = C.buildReport(range.start, range.end);
    view.report = report;
    const t = report.totals;
    const today = U.todayISO();

    const actions = admin
      ? `<button type="button" class="btn btn-ghost" data-action="export-csv">${ic('download')}<span>Ekspor CSV</span></button>
         <button type="button" class="btn btn-primary" data-action="print-report">${ic('printer')}<span>Cetak</span></button>`
      : '';

    return `
      ${simulationBanner()}
      ${pageHeader('Laporan', 'Analitik penjualan, pembelian, dan stok burung', actions)}
      ${adminNote()}
      <div class="print-only print-head">
        <h2>${esc(cfg.store.name)} — Laporan Penjualan</h2>
        <p>Periode: ${esc(C.rangeLabel(range))} • Dicetak: ${U.formatDateTime(Date.now())}</p>
      </div>
      <section class="card report-filter reveal">
        <div class="filter-row">
          <label class="field-inline"><span>Periode</span>
            <span class="select-box"><select data-report-range aria-label="Pilih periode laporan">
              ${C.RANGE_OPTIONS.map((o) => `<option value="${o.key}" ${o.key === view.reportRange ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select></span>
          </label>
          ${view.reportRange === 'custom' ? `
            <label class="field-inline"><span>Dari</span><input type="date" data-report-custom="start" value="${esc(view.custom.start)}" max="${today}" /></label>
            <label class="field-inline"><span>Sampai</span><input type="date" data-report-custom="end" value="${esc(view.custom.end)}" max="${today}" /></label>` : ''}
        </div>
        <p class="report-period">${ic('calendar-days')}<span>Periode laporan: <strong>${esc(C.rangeLabel(range))}</strong> (${report.days} hari)</span></p>
        ${view.customError ? `<p class="form-error" role="alert">${esc(view.customError)} Menampilkan 30 hari terakhir.</p>` : ''}
      </section>
      <section class="stat-grid stat-grid-6" aria-label="Ringkasan laporan">
        ${statCard({ iconName: 'package-plus', label: 'Total burung masuk', value: t.masuk, note: 'ekor', tone: 'olive' })}
        ${statCard({ iconName: 'shopping-bag', label: 'Total burung terjual', value: t.terjual, note: 'ekor', tone: 'gold' })}
        ${statCard({ iconName: 'wallet', label: 'Total harga jual (omzet)', value: t.hargaJual, money: true, tone: 'brown' })}
        ${statCard({ iconName: 'tag', label: 'Total harga asli', value: t.hargaAsli, money: true, note: 'Modal burung terjual', tone: 'clay' })}
        ${statCard({ iconName: 'calculator', label: 'Total HPP', value: t.hpp, money: true, note: 'Pakan + mati atau lepas', tone: 'caramel' })}
        ${statCard({ iconName: 'trending-up', label: 'Keuntungan bersih', value: t.keuntunganBersih, money: true, note: 'Harga jual − harga asli − HPP', tone: 'brown' })}
      </section>
      <p class="footnote reveal">${ic('info')}<span><strong>Keuntungan bersih</strong> dihitung dengan rumus: <code>Harga Jual − Harga Asli − HPP</code> pada periode terpilih.</span></p>
      ${report.hasData ? `
        <section class="grid-2 charts-grid">
          <div class="card reveal"><div class="card-head"><h2>Penjualan per ${report.monthly ? 'bulan' : 'hari'}</h2></div><div class="chart-box"><canvas id="chart-sales" role="img" aria-label="Grafik penjualan"></canvas></div></div>
          <div class="card reveal"><div class="card-head"><h2>Burung datang vs terjual</h2></div><div class="chart-box"><canvas id="chart-inout" role="img" aria-label="Grafik burung datang dan terjual"></canvas></div></div>
          <div class="card reveal"><div class="card-head"><h2>Penjualan per kategori</h2></div>
            ${report.categories.length ? '<div class="chart-box"><canvas id="chart-category" role="img" aria-label="Grafik kategori burung"></canvas></div>' : UI.emptyState('pie-chart', 'Belum ada penjualan', 'Tidak ada penjualan pada periode ini.')}</div>
          <div class="card reveal"><div class="card-head"><h2>Tren omzet</h2></div><div class="chart-box"><canvas id="chart-trend" role="img" aria-label="Grafik tren omzet"></canvas></div></div>
        </section>
        <section class="card reveal">
          <div class="card-head"><h2>Rincian per ${report.monthly ? 'bulan' : 'tanggal'}</h2></div>
          <div class="toolbar">${searchBox('report', report.monthly ? 'Cari bulan…' : 'Cari tanggal…')}</div>
          ${UI.tableHost('report')}
        </section>`
      : `<section class="card reveal">${UI.emptyState('bar-chart-3', 'Belum ada data pada periode ini', `Tidak ada transaksi penjualan maupun burung masuk pada ${C.rangeLabel(range)}. Coba pilih periode lain.`)}</section>`}`;
  }
  function reportMount() {
    const r = view.report;
    if (!r || !r.hasData) return;
    TB.charts.salesDaily('chart-sales', r);
    TB.charts.inVsOut('chart-inout', r);
    if (r.categories.length) TB.charts.categoryDonut('chart-category', r);
    TB.charts.revenueTrend('chart-trend', r);
  }

  /** Ekspor CSV (admin saja) mengikuti pencarian & urutan tabel saat ini. */
  function exportCsv() {
    TB.auth.requireAdmin();
    if (!view.report || !view.report.hasData) throw new Error('Tidak ada data pada periode ini untuk diekspor.');
    const r = view.report;
    const rows = UI.processRows('report');
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      [q(`Laporan ${TB.config.store.name}`)],
      [q('Periode'), q(C.rangeLabel({ start: r.start, end: r.end }))],
      [q('Rumus'), q('Keuntungan Bersih = Harga Jual - Harga Asli - HPP')],
      [],
      [r.monthly ? 'Bulan' : 'Tanggal', 'Jumlah', 'Harga Asli (Rp)', 'Harga Jual (Rp)', 'HPP (Rp)', 'Keuntungan Bersih (Rp)'].map(q),
      ...rows.map((x) => [q(x.fullLabel), x.terjual, x.hargaAsli, x.hargaJual, x.hpp, x.keuntunganBersih]),
      [q('TOTAL'), r.totals.terjual, r.totals.hargaAsli, r.totals.hargaJual, r.totals.hpp, r.totals.keuntunganBersih]
    ].map((l) => l.join(','));
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-${r.start}_sd_${r.end}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function printReport() {
    TB.auth.requireAdmin();
    window.print();
  }

  /* ---------- Akun Admin ---------- */
  function accountPage() {
    const session = TB.auth.getSession();
    const supaCfg = TB.config.supabase || {};
    const supaSt = TB.supabase?.getStatus() || {};

    if (!session) {
      return `
        <div class="login-shell reveal">
          <aside class="login-brand">
            <div class="brand-mark big">${ic('bird')}</div>
            <h2>${esc(cfg.store.name)}</h2>
            <p>${esc(cfg.store.tagline)}</p>
            <ul>
              <li>${ic('check')}<span>Terhubung ke Supabase Cloud</span></li>
              <li>${ic('check')}<span>Kelola data burung & stok</span></li>
              <li>${ic('check')}<span>Catat burung datang & penjualan</span></li>
              <li>${ic('check')}<span>Cetak & ekspor laporan</span></li>
            </ul>
          </aside>
          <section class="login-card">
            <h1>Login Admin</h1>
            <p class="muted">Masuk untuk mengelola data toko.</p>
            <form data-form="login" novalidate autocomplete="on">
              <div class="field">
                <label for="login-username">Username atau Email Admin</label>
                <div class="input-icon">${ic('user')}<input id="login-username" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="hasan" value="hasan" required /></div>
              </div>
              <div class="field">
                <label for="login-password">Password</label>
                <div class="input-icon">${ic('lock')}<input id="login-password" name="password" type="password" autocomplete="current-password" placeholder="HASANH1J1" value="HASANH1J1" required />
                  <button type="button" class="icon-btn pw-toggle" data-action="toggle-password" aria-label="Tampilkan password" aria-pressed="false">${ic('eye')}</button></div>
              </div>
              <div class="form-error" role="alert" hidden></div>
              <button type="submit" class="btn btn-primary btn-block btn-lg"><span class="spinner" hidden></span><span class="btn-label">Masuk</span></button>
            </form>
            <div class="login-note">${ic('database')}<div><strong>Terhubung ke Supabase:</strong> <code>${esc(supaCfg.url || 'supabase.co')}</code></div></div>
          </section>
        </div>`;
    }

    const expires = new Date(session.exp);
    const authSourceLabel = session.source === 'supabase' ? 'Supabase Auth (Cloud)' : 'Admin Lokal (Terhubung ke Supabase)';

    return `
      ${pageHeader('Akun Admin', 'Kelola sesi dan koneksi Supabase Anda')}
      <section class="grid-2">
        <div class="card profile-card reveal">
          <div class="profile-top">
            <div class="avatar-lg">${esc(session.user.charAt(0).toUpperCase())}</div>
            <div><h2>${esc(session.user)}</h2><span class="badge badge-ok">Administrator</span></div>
          </div>
          <dl class="kv">
            <div><dt>Status Autentikasi</dt><dd>Login aktif</dd></div>
            <div><dt>Metode Login</dt><dd>${esc(authSourceLabel)}</dd></div>
            <div><dt>Sesi berakhir</dt><dd>${U.formatDate(U.toISO(expires))}, ${U.pad(expires.getHours())}.${U.pad(expires.getMinutes())}</dd></div>
            <div><dt>Hak akses</dt><dd>Tambah, edit, hapus, ekspor, cetak</dd></div>
          </dl>
          <button type="button" class="btn btn-danger btn-block" data-action="logout">${ic('log-out')}<span>Logout</span></button>
        </div>

        <div class="stack" style="margin:0">
          <div class="card reveal">
            <div class="card-head">
              <h2>${ic('database')} <span>Koneksi Supabase</span></h2>
              <span class="badge badge-ok">Online</span>
            </div>
            <dl class="kv" style="margin-bottom:14px">
              <div><dt>Project URL</dt><dd><code>${esc(supaCfg.url || '-')}</code></dd></div>
              <div><dt>Status API</dt><dd>Terhubung (${supaSt.latencyMs ? supaSt.latencyMs + ' ms' : 'Aktif'})</dd></div>
              <div><dt>Tabel Data Toko</dt><dd>${supaSt.tablesReady ? '<span class="badge badge-ok">Tabel Siap</span>' : '<span class="badge badge-low">Perlu Skrip SQL</span>'}</dd></div>
              <div><dt>Tabel User Admin</dt><dd>${supaSt.adminUsersReady ? '<span class="badge badge-ok">admin_users Siap</span>' : '<span class="badge badge-low">Belum Dibuat</span>'}</dd></div>
            </dl>
            <div class="stack">
              <button type="button" class="btn btn-primary btn-block" data-action="copy-sql">${ic('copy')}<span>Salin Skrip SQL Supabase</span></button>
              <div style="display:flex;gap:8px">
                <button type="button" class="btn btn-ghost" style="flex:1" data-action="test-supabase">${ic('refresh-cw')}<span>Uji Koneksi</span></button>
                <button type="button" class="btn btn-ghost" style="flex:1" data-action="sync-supabase">${ic('cloud-upload')}<span>Sinkron Data</span></button>
              </div>
            </div>
            <p class="footnote">${ic('info')}<span>Jalankan skrip SQL di <strong>Supabase Dashboard &rarr; SQL Editor</strong> untuk membuat tabel di PostgreSQL cloud.</span></p>
          </div>

          <div class="card reveal">
            <div class="card-head"><h2>Penyimpanan Lokal</h2></div>
            <p class="muted">Data tersimpan di browser ini dan disinkronkan otomatis saat Supabase aktif.</p>
            <div style="display:flex;gap:8px;margin-top:12px">
              <button type="button" class="btn btn-ghost" style="flex:1" data-action="reset-sim">${ic('rotate-ccw')}<span>Reset Contoh</span></button>
              <button type="button" class="btn btn-ghost danger-text" style="flex:1" data-action="clear-data">${ic('eraser')}<span>Kosongkan</span></button>
            </div>
          </div>
        </div>
      </section>`;
  }

  /* ---------- Registri halaman ---------- */
  const pages = {
    beranda: { title: 'Dashboard', render: dashboardPage, mount: dashboardMount },
    'stok-burung': { title: 'Stok Burung', render: birdsPage },
    'burung-datang': { title: 'Burung Datang', render: arrivalsPage },
    'burung-terjual': { title: 'Burung Terjual', render: salesPage },
    hpp: { title: 'HPP', render: hppPage },
    laporan: { title: 'Laporan', render: reportPage, mount: reportMount },
    akun: { title: 'Akun Admin', render: accountPage }
  };

  return { pages, view, exportCsv, printReport };
})();
