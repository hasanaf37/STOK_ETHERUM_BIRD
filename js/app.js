/**
 * Aplikasi utama: routing berbasis hash, sidebar responsif, delegasi event, dan sinkronisasi UI
 * dengan status login admin & perubahan data. Tidak ada inline event handler.
 */
(() => {
  const U = TB.utils;
  const UI = TB.ui;
  const { pages, view } = TB.pages;
  const body = document.body;
  const $ = (s) => document.querySelector(s);
  const routes = Object.keys(pages);
  const cfg = TB.config;

  const mqMobile = window.matchMedia('(max-width: 767px)');
  const mqTablet = window.matchMedia('(min-width: 768px) and (max-width: 1023px)');
  const sidebar = $('#sidebar');
  const main = $('#page');
  let renderToken = 0;

  const routeFromHash = () => {
    const h = location.hash.replace('#', '');
    if (h === 'data-burung') return 'stok-burung';
    return routes.includes(h) ? h : 'beranda';
  };

  /* =========================================================
   * SIDEBAR: diperluas / diperkecil (ikon) / disembunyikan, drawer di HP
   * ========================================================= */
  let sbPref = '';
  let lastVisible = 'expanded';
  try { sbPref = sessionStorage.getItem(cfg.storage.sidebarKey) || ''; } catch (e) { /* abaikan */ }

  const effectivePref = () => sbPref || (mqTablet.matches ? 'collapsed' : 'expanded');
  const drawerOpen = () => body.classList.contains('drawer-open');

  function applySidebar() {
    const mobile = mqMobile.matches;
    const pref = effectivePref();
    body.classList.toggle('sb-collapsed', !mobile && pref === 'collapsed');
    body.classList.toggle('sb-hidden', !mobile && pref === 'hidden');
    if (!mobile) body.classList.remove('drawer-open');
    sidebar.inert = mobile ? !drawerOpen() : pref === 'hidden';
    const collapsed = !mobile && pref === 'collapsed';
    const btn = $('[data-sidebar="collapse"]');
    btn.setAttribute('aria-label', collapsed ? 'Perluas sidebar' : 'Perkecil sidebar');
    btn.setAttribute('title', collapsed ? 'Perluas sidebar' : 'Perkecil sidebar');
    btn.setAttribute('aria-pressed', String(collapsed));
    $('[data-sidebar="show"]').setAttribute('aria-expanded', String(mobile ? drawerOpen() : pref !== 'hidden'));
  }
  function setPref(p) {
    sbPref = p;
    try { sessionStorage.setItem(cfg.storage.sidebarKey, p); } catch (e) { /* abaikan */ }
    applySidebar();
  }
  const openDrawer = () => { body.classList.add('drawer-open'); applySidebar(); const a = sidebar.querySelector('.nav-link.active') || sidebar.querySelector('.nav-link'); a && a.focus({ preventScroll: true }); };
  const closeDrawer = () => { body.classList.remove('drawer-open'); applySidebar(); };

  function sidebarAction(name) {
    if (name === 'collapse') setPref(effectivePref() === 'collapsed' ? 'expanded' : 'collapsed');
    else if (name === 'hide') {
      if (mqMobile.matches) closeDrawer();
      else { if (effectivePref() !== 'hidden') lastVisible = effectivePref(); setPref('hidden'); }
    } else if (name === 'show') {
      if (mqMobile.matches) (drawerOpen() ? closeDrawer() : openDrawer());
      else setPref(effectivePref() === 'hidden' ? lastVisible : 'hidden');
    } else if (name === 'close') closeDrawer();
  }
  [mqMobile, mqTablet].forEach((mq) => mq.addEventListener('change', applySidebar));

  /* =========================================================
   * Routing & render halaman
   * ========================================================= */
  function updateChrome(route) {
    const admin = TB.auth.isAdmin();
    const session = TB.auth.getSession();
    document.querySelectorAll('.nav-link').forEach((a) => {
      const active = a.dataset.route === route;
      a.classList.toggle('active', active);
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const title = pages[route].title;
    $('#breadcrumb').innerHTML = route === 'beranda'
      ? `<li aria-current="page">Beranda</li>`
      : `<li><a href="#beranda">Beranda</a></li><li aria-current="page">${U.escapeHtml(title)}</li>`;
    document.title = `${title} — ${cfg.store.name}`;
    $('#admin-pill').className = `pill ${admin ? 'pill-admin' : ''}`;
    $('#admin-pill-text').textContent = admin ? `Admin: ${session.user}` : 'Mode pengunjung';
    $('#account-label').textContent = admin ? session.user : 'Akun Admin';
    $('#account-sub').textContent = admin ? 'Login aktif' : 'Belum login';
    body.classList.toggle('is-admin', admin);
  }

  /**
   * mode: 'nav' (skeleton + animasi penuh), 'data' (tanpa animasi ulang), 'filter' (angka & grafik beranimasi).
   */
  function renderRoute(mode = 'nav') {
    const route = routeFromHash();
    const page = pages[route];
    const token = ++renderToken;
    TB.charts.destroyAll();
    updateChrome(route);

    const draw = () => {
      if (token !== renderToken) return;
      try {
        main.classList.toggle('no-reveal', mode !== 'nav');
        main.innerHTML = page.render();
        UI.refreshIcons(main);
        UI.observeReveals(main);
        if (mode !== 'data') UI.animateCounters(main);
        if (page.mount) page.mount();
      } catch (err) {
        console.error(err);
        main.innerHTML = UI.emptyState('alert-triangle', 'Terjadi kesalahan', 'Halaman tidak dapat ditampilkan. Muat ulang halaman dan coba lagi.');
        UI.refreshIcons(main);
      }
      main.classList.remove('is-loading');
      if (mode === 'nav') {
        main.classList.remove('page-enter');
        void main.offsetWidth; // memulai ulang animasi transisi halaman
        main.classList.add('page-enter');
      }
    };

    if (mode === 'nav') {
      main.classList.add('is-loading');
      main.innerHTML = UI.skeletonPage();
      window.scrollTo({ top: 0 });
      setTimeout(draw, U.prefersReducedMotion() ? 0 : 280);
    } else draw();
  }

  window.addEventListener('hashchange', () => {
    if (mqMobile.matches) closeDrawer(); // drawer tertutup otomatis setelah memilih menu
    renderRoute('nav');
  });

  /* =========================================================
   * Aksi (delegasi klik)
   * ========================================================= */
  const actions = {
    'add-bird': () => TB.forms.openBirdForm(),
    'edit-bird': (id) => TB.forms.openBirdForm(id),
    'delete-bird': (id) => TB.forms.confirmDelete('bird', id),
    'add-arrival': () => TB.forms.openArrivalForm(),
    'edit-arrival': (id) => TB.forms.openArrivalForm(id),
    'delete-arrival': (id) => TB.forms.confirmDelete('arrival', id),
    'add-sale': () => TB.forms.openSaleForm(),
    'edit-sale': (id) => TB.forms.openSaleForm(id),
    'delete-sale': (id) => TB.forms.confirmDelete('sale', id),
    'add-hpp': () => TB.forms.openHppForm(),
    'edit-hpp': (id) => TB.forms.openHppForm(id),
    'delete-hpp': (id) => TB.forms.confirmDelete('hpp', id),
    'bulk-delete-arrivals': async () => {
      TB.auth.requireAdmin();
      const ids = UI.getTableSelected('arrivals');
      if (!ids.length) return;
      const ok = await UI.confirmDialog({
        title: 'Hapus data burung datang terpilih?',
        message: `Yakin ingin menghapus ${ids.length} catatan burung datang yang dipilih? Stok burung terkait akan otomatis berkurang sesuai jumlah kedatangan yang dihapus.`,
        confirmText: `Ya, hapus ${ids.length} data`,
        danger: true
      });
      if (ok) {
        try {
          TB.store.deleteArrivals(ids);
          UI.clearTableSelection('arrivals');
          UI.toast(`${ids.length} catatan burung datang berhasil dihapus.`);
        } catch (err) {
          UI.toast(err.message || 'Gagal menghapus data.', 'error');
        }
      }
    },
    'bulk-delete-sales': async () => {
      TB.auth.requireAdmin();
      const ids = UI.getTableSelected('sales');
      if (!ids.length) return;
      const ok = await UI.confirmDialog({
        title: 'Hapus transaksi penjualan terpilih?',
        message: `Yakin ingin menghapus ${ids.length} transaksi penjualan yang dipilih? Stok burung akan otomatis dikembalikan sesuai jumlah yang terjual.`,
        confirmText: `Ya, hapus ${ids.length} transaksi`,
        danger: true
      });
      if (ok) {
        try {
          TB.store.deleteSales(ids);
          UI.clearTableSelection('sales');
          UI.toast(`${ids.length} transaksi penjualan berhasil dihapus.`);
        } catch (err) {
          UI.toast(err.message || 'Gagal menghapus transaksi.', 'error');
        }
      }
    },
    'bulk-delete-hpp': async () => {
      TB.auth.requireAdmin();
      const ids = UI.getTableSelected('hpp');
      if (!ids.length) return;
      const ok = await UI.confirmDialog({
        title: 'Hapus catatan HPP terpilih?',
        message: `Yakin ingin menghapus ${ids.length} catatan HPP (pakan / mati atau lepas) yang dipilih?`,
        confirmText: `Ya, hapus ${ids.length} catatan`,
        danger: true
      });
      if (ok) {
        try {
          TB.store.deleteHpps(ids);
          UI.clearTableSelection('hpp');
          UI.toast(`${ids.length} catatan HPP berhasil dihapus.`);
        } catch (err) {
          UI.toast(err.message || 'Gagal menghapus catatan HPP.', 'error');
        }
      }
    },
    'export-csv': () => { TB.pages.exportCsv(); UI.toast('Laporan CSV berhasil diunduh.'); },
    'print-report': () => TB.pages.printReport(),
    'view-photo': (id, el) => {
      const src = el?.dataset?.src;
      const title = el?.dataset?.title || 'Foto Burung';
      if (!src) return;
      UI.openModal({
        title,
        size: 'modal-lg',
        body: `
          <div style="text-align:center;padding:10px 0">
            <img src="${U.escapeHtml(src)}" alt="${U.escapeHtml(title)}" style="max-width:100%;max-height:72vh;object-fit:contain;margin:0 auto;border-radius:14px;box-shadow:var(--shadow-lg)" />
          </div>`
      });
    },
    logout: () => { TB.auth.logout(); },
    'toggle-password': (id, el) => {
      const input = el.closest('.input-icon').querySelector('input');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      el.setAttribute('aria-pressed', String(show));
      el.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
      el.innerHTML = UI.icon(show ? 'eye-off' : 'eye');
      UI.refreshIcons(el);
    },
    'reset-sim': async () => {
      TB.auth.requireAdmin();
      if (await UI.confirmDialog({ title: 'Muat ulang data simulasi?', message: 'Semua data saat ini akan diganti dengan data contoh baru.', confirmText: 'Ya, muat ulang' })) {
        TB.store.resetSimulation();
        UI.toast('Data simulasi dimuat ulang.');
      }
    },
    'clear-data': async () => {
      TB.auth.requireAdmin();
      if (await UI.confirmDialog({ title: 'Kosongkan semua data?', message: 'Seluruh data burung, burung datang, dan penjualan akan dihapus permanen dari browser ini.', confirmText: 'Ya, kosongkan' })) {
        TB.store.clearAll();
        UI.toast('Seluruh data dikosongkan.');
      }
    },
    'copy-sql': async () => {
      const sql = TB.supabase?.getSqlScript() || '';
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(sql);
        } else {
          const ta = document.createElement('textarea');
          ta.value = sql;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        UI.toast('Skrip SQL Supabase berhasil disalin ke clipboard!');
      } catch (e) {
        UI.openModal({
          title: 'Skrip SQL Supabase',
          size: 'modal-lg',
          body: `<p>Salin skrip SQL berikut dan jalankan di <strong>Supabase Dashboard &rarr; SQL Editor</strong>:</p>
                 <textarea readonly style="width:100%;height:280px;font-family:monospace;font-size:0.82rem;margin-top:10px">${U.escapeHtml(sql)}</textarea>`
        });
      }
    },
    'test-supabase': async () => {
      UI.toast('Menguji koneksi ke Supabase…', 'info');
      if (TB.supabase) {
        const res = await TB.supabase.testConnection();
        if (res.connected) {
          UI.toast(`Koneksi Supabase aktif (${res.latencyMs || 0} ms). ${res.tablesReady ? 'Tabel siap.' : 'Tabel belum dibuat di database.'}`);
        } else {
          UI.toast(`Koneksi Supabase gagal: ${res.error || 'Periksa jaringan'}`, 'error');
        }
        if (routeFromHash() === 'akun') renderRoute('data');
      }
    },
    'sync-supabase': async () => {
      TB.auth.requireAdmin();
      UI.toast('Menyinkronkan data dengan Supabase…', 'info');
      if (TB.supabase) {
        const res = await TB.supabase.testConnection();
        if (!res.connected) {
          UI.toast(`Koneksi Supabase gagal: ${res.error}`, 'error');
          return;
        }
        if (!res.tablesReady) {
          UI.toast('Tabel di Supabase belum dibuat. Klik "Salin Skrip SQL" lalu jalankan di Supabase SQL Editor.', 'error');
          return;
        }
        const okPush = await TB.supabase.pushAllToSupabase(TB.store.get(), { prune: true });
        if (okPush) {
          UI.toast('Data berhasil disinkronkan ke Supabase (tambah & hapus diselaraskan)!');
        } else {
          UI.toast('Gagal menyinkronkan data ke Supabase.', 'error');
        }
        if (routeFromHash() === 'akun') renderRoute('data');
      }
    }
  };

  document.addEventListener('click', async (e) => {
    const sb = e.target.closest('[data-sidebar]');
    if (sb) { sidebarAction(sb.dataset.sidebar); return; }
    if (e.target.closest('[data-modal-close]')) { UI.closeModal(); return; }
    if (e.target.classList.contains('modal-overlay')) { UI.closeModal(); return; }

    const el = e.target.closest('[data-action]');
    if (!el || !actions[el.dataset.action]) return;
    try {
      await actions[el.dataset.action](el.dataset.id, el);
    } catch (err) {
      UI.toast(err.message || 'Terjadi kesalahan.', 'error');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (UI.getModal()) UI.closeModal();
    else if (drawerOpen()) { closeDrawer(); $('[data-sidebar="show"]').focus(); }
  });

  // Foto burung yang gagal dimuat diganti ilustrasi/avatar bawaan (event 'error' tidak bubbling -> capture).
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img && img.tagName === 'IMG' && img.hasAttribute('data-photo-fallback')) {
      img.removeAttribute('data-photo-fallback');
      if (img.classList.contains('bird-card-img') && TB.seed?.defaultBirdPhoto) {
        img.src = TB.seed.defaultBirdPhoto();
      } else {
        const span = document.createElement('span');
        span.className = 'bird-avatar';
        span.innerHTML = UI.icon('bird');
        img.replaceWith(span);
        UI.refreshIcons(span);
      }
    }
  }, true);

  /* =========================================================
   * Form (delegasi submit) & filter
   * ========================================================= */
  function setBusy(form, busy, label) {
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = busy;
    btn.querySelector('.spinner').hidden = !busy;
    if (label) btn.querySelector('.btn-label').textContent = label;
  }

  async function handleLogin(form) {
    const err = form.querySelector('.form-error');
    err.hidden = true;
    const username = form.username.value;
    const password = form.password.value;
    const original = form.querySelector('.btn-label').textContent;
    setBusy(form, true, 'Memproses…');
    try {
      await TB.auth.login(username, password);
      UI.toast('Login berhasil. Selamat datang, admin!');
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      form.classList.remove('shake');
      void form.offsetWidth;
      form.classList.add('shake');
      form.password.value = '';
      form.password.focus();
    } finally {
      if (document.body.contains(form)) setBusy(form, false, original);
    }
  }

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    if (form.dataset.form === 'login') handleLogin(form);
    else TB.forms.submitEntityForm(form);
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-dash-period]')) { view.dashPeriod = t.value; renderRoute('filter'); }
    else if (t.matches('[data-report-range]')) { view.reportRange = t.value; renderRoute('filter'); }
    else if (t.matches('[data-report-custom]')) { view.custom[t.dataset.reportCustom] = t.value; renderRoute('filter'); }
  });
  UI.bindTableEvents(document);

  /* =========================================================
   * Sinkronisasi dengan perubahan login & data
   * ========================================================= */
  TB.auth.onChange((reason) => {
    if (reason !== 'login') UI.closeModal(true); // tutup form admin yang masih terbuka
    if (reason === 'expired') UI.toast('Sesi admin berakhir. Silakan login kembali.', 'info');
    if (reason === 'logout') UI.toast('Anda telah logout. Kontrol admin dinonaktifkan.', 'info');
    if (reason === 'login') {
      if (location.hash !== '#beranda') location.hash = '#beranda'; // memicu transisi ke dashboard
      else renderRoute('nav');
    } else renderRoute('data');
  });
  TB.store.subscribe(() => renderRoute('data'));

  /* =========================================================
   * Inisialisasi
   * ========================================================= */
  $('#brand-name').textContent = cfg.store.name;
  $('#brand-tag').textContent = cfg.store.tagline;
  applySidebar();
  UI.refreshIcons();
  renderRoute('nav');

  if (TB.supabase) {
    TB.supabase.init();
    TB.supabase.testConnection().then((st) => {
      if (st.connected && st.tablesReady) {
        TB.store.syncFromSupabase();
      }
    }).catch(() => {});
  }
})();
