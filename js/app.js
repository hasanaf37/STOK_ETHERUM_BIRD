// ==================== CONSTANTS & STORAGE KEYS ====================
const STORAGE_KEYS = {
  USERS: 'eb_users_v1',
  SESSION: 'eb_session_v1',
  BELI: 'eb_data_beli_v2',
  JUAL: 'eb_data_jual_v2',
  STATUS: 'eb_data_status_v2',
  HPP: 'eb_data_hpp_v2',
  SUPABASE_CONFIG: 'eb_supabase_config_v1',
};

const AUTH_WARNING_MSG = 'Silakan login terlebih dahulu untuk menambah, mengubah, atau menghapus data';

const DEFAULT_USERS = [
  { username: 'admin', password: '123' }
];

// Helper for relative dates around today
function getIsoDateOffset(daysOffset) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ==================== STATE ====================
let state = {
  currentMenu: 'dashboard',
  authMode: 'login',
  user: null,
  beli: [],
  jual: [],
  status: [],
  hpp: [],
  selected: {
    beli: new Set(),
    jual: new Set(),
    status: new Set(),
    hpp: new Set(),
  },
  charts: {
    tren: null,
    stok: null,
    lapKeuangan: null,
    lapKomposisi: null,
  }
};

// ==================== FORMATTERS ====================
function formatRupiah(num) {
  const val = Number(num) || 0;
  const prefix = val < 0 ? '-Rp ' : 'Rp ';
  return prefix + Math.abs(val).toLocaleString('id-ID');
}

function formatTanggalIndo(isoDate) {
  if (!isoDate) return '-';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(dateObj.getTime())) return isoDate;

  const hariList = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const bulanList = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  return `${hariList[dateObj.getDay()]}, ${dateObj.getDate()} ${bulanList[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==================== STORAGE HELPERS ====================
function loadFromStorage() {
  // Users
  if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(DEFAULT_USERS));
  }
  // Session
  const savedSession = localStorage.getItem(STORAGE_KEYS.SESSION);
  state.user = savedSession ? JSON.parse(savedSession) : null;

  // Table data (start empty if not in storage)
  const loadTable = (key) => {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify([]));
      return [];
    }
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  };

  state.beli = loadTable(STORAGE_KEYS.BELI);
  state.jual = loadTable(STORAGE_KEYS.JUAL);
  state.status = loadTable(STORAGE_KEYS.STATUS);
  state.hpp = loadTable(STORAGE_KEYS.HPP);
}

function saveTableToStorage(type) {
  const map = {
    beli: STORAGE_KEYS.BELI,
    jual: STORAGE_KEYS.JUAL,
    status: STORAGE_KEYS.STATUS,
    hpp: STORAGE_KEYS.HPP,
  };
  localStorage.setItem(map[type], JSON.stringify(state[type]));
}

function confirmClearAllData() {
  if (!requireAuth()) return;
  showConfirmModal(
    'Kosongkan Semua Data?',
    'Seluruh data di semua tabel akan dihapus permanen. Lanjutkan?',
    () => {
      state.beli = [];
      state.jual = [];
      state.status = [];
      state.hpp = [];
      ['beli', 'jual', 'status', 'hpp'].forEach(t => {
        saveTableToStorage(t);
        state.selected[t].clear();
      });
      sbClearAll();
      refreshAllViews();
      showToast('Semua data tabel berhasil dikosongkan.', 'success');
    }
  );
}

// ==================== TOAST NOTIFICATION ====================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const colors = {
    success: 'bg-emerald-600 text-white border-emerald-700',
    warning: 'bg-amber-500 text-white border-amber-600',
    error: 'bg-rose-600 text-white border-rose-700',
    info: 'bg-slate-800 text-white border-slate-900',
  };
  const icons = {
    success: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>',
    warning: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>',
    error: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>',
    info: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>',
  };

  const toast = document.createElement('div');
  toast.className = `pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium fade-in ${colors[type] || colors.info}`;
  toast.innerHTML = `
    <svg class="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">${icons[type] || icons.info}</svg>
    <span class="flex-1 leading-snug">${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-6px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

// ==================== AUTH & ACCESS CONTROL ====================
function isLoggedIn() {
  return Boolean(state.user && state.user.username);
}

function requireAuth() {
  if (!isLoggedIn()) {
    showToast(AUTH_WARNING_MSG, 'warning');
    return false;
  }
  return true;
}

function renderAuthUI() {
  const container = document.getElementById('sidebar-auth-container');
  const modeBadge = document.getElementById('mode-badge');
  document.body.classList.toggle('is-guest', !isLoggedIn());

  if (isLoggedIn()) {
    const name = state.user.username;
    const initial = name.trim().charAt(0).toUpperCase();
    container.innerHTML = `
      <div class="flex items-center justify-between gap-2 sidebar-auth-row">
        <div class="flex items-center gap-3 min-w-0 mx-auto lg:mx-0" title="${escapeHtml(name)} (Admin Aktif)">
          <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 text-white font-bold text-base flex items-center justify-center shrink-0 shadow-md">
            ${escapeHtml(initial)}
          </div>
          <div class="sidebar-text min-w-0">
            <p class="text-sm font-bold text-white truncate">${escapeHtml(name)}</p>
            <span class="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Admin Aktif
            </span>
          </div>
        </div>
        <button onclick="openSettingsView()" title="Pengaturan Database" class="sidebar-text p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0" aria-label="Pengaturan">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        </button>
      </div>
      <button onclick="logout()" title="Logout (Keluar)" class="mt-3 w-full py-2 rounded-xl text-xs font-semibold text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors flex items-center justify-center gap-1.5">
        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
        <span class="sidebar-text">Logout (Keluar)</span>
      </button>
    `;

    modeBadge.className = 'inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap';
    modeBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500"></span> <span class="hidden sm:inline">Mode Admin</span> (${escapeHtml(name)})`;
  } else {
    container.innerHTML = `
      <button onclick="openAuthModal()" title="Login / Masuk" class="w-full flex items-center justify-center gap-2.5 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-600/25 transition-all">
        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/></svg>
        <span class="sidebar-text">Login / Masuk</span>
      </button>
    `;

    modeBadge.className = 'inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap';
    modeBadge.innerHTML = `<svg class="w-3.5 h-3.5 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg> <span>Mode Tamu</span>`;
  }

  // Apply visual locked state on auth-protected buttons
  document.querySelectorAll('[data-auth-btn]').forEach(btn => {
    if (isLoggedIn()) {
      btn.classList.remove('guest-locked');
    } else {
      btn.classList.add('guest-locked');
    }
  });
}

function openAuthModal() {
  document.getElementById('form-auth').reset();
  openModal('modal-auth');
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!username || !password) return;

  let found = null;

  if (sbClient) {
    try {
      const { data, error } = await sbClient
        .from('admin_users')
        .select('id, username, password')
        .ilike('username', username)
        .eq('password', password)
        .limit(1);
      if (!error && data && data.length > 0) {
        found = { username: data[0].username };
      }
    } catch (err) {
      console.warn('Supabase auth fallback ke lokal:', err);
    }
  }

  if (!found) {
    const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
    const localMatch = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
    if (localMatch) {
      found = { username: localMatch.username };
    }
  }

  if (!found) {
    showToast('Username atau password salah!', 'error');
    return;
  }
  state.user = { username: found.username };
  localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(state.user));
  closeModal('modal-auth');
  refreshAllViews();
  showToast(`Selamat datang kembali, ${found.username}!`, 'success');
}

function logout() {
  state.user = null;
  localStorage.removeItem(STORAGE_KEYS.SESSION);
  ['beli', 'jual', 'status', 'hpp'].forEach(t => state.selected[t].clear());
  refreshAllViews();
  if (state.currentMenu === 'pengaturan') {
    switchMenu('dashboard');
  }
  showToast('Anda telah logout. Mode Tamu aktif.', 'info');
}

// ==================== NAVIGATION & SIDEBAR ====================
function toggleSidebar(open) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (open) {
    sidebar.classList.remove('-translate-x-full');
    backdrop.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  } else {
    sidebar.classList.add('-translate-x-full');
    backdrop.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }
}

function applyDesktopSidebarState() {
  const collapsed = localStorage.getItem('eb_sidebar_collapsed') === '1';
  const sidebar = document.getElementById('sidebar');
  const icon = document.getElementById('icon-collapse-sidebar');
  if (collapsed) {
    sidebar.classList.add('sidebar-collapsed');
    if (icon) icon.style.transform = 'rotate(180deg)';
  } else {
    sidebar.classList.remove('sidebar-collapsed');
    if (icon) icon.style.transform = 'rotate(0deg)';
  }
}

function toggleDesktopSidebar() {
  const isCollapsed = localStorage.getItem('eb_sidebar_collapsed') === '1';
  localStorage.setItem('eb_sidebar_collapsed', isCollapsed ? '0' : '1');
  applyDesktopSidebarState();
}

function switchMenu(menu) {
  if (menu === 'pengaturan' && !requireAuth()) return;
  state.currentMenu = menu;
  const meta = {
    dashboard: { title: 'Dashboard', subtitle: 'Ringkasan stok burung dan performa keuangan Ethereum Bird' },
    stok: { title: 'Stok Burung', subtitle: 'Kelola catatan Harga Beli stok burung masuk' },
    terjual: { title: 'Burung Terjual', subtitle: 'Kelola catatan penjualan burung (Harga Jual)' },
    lain: { title: 'Lain-lain', subtitle: 'Kelola Status Burung (Mati/Lepas/Hilang) dan biaya HPP' },
    laporan: { title: 'Laporan', subtitle: 'Rekapitulasi keuangan lengkap dan cetak PDF A4' },
    pengaturan: { title: 'Pengaturan', subtitle: 'Status & Konfigurasi Database Supabase' },
  };

  document.getElementById('page-title').textContent = meta[menu].title;
  document.getElementById('page-subtitle').textContent = meta[menu].subtitle;

  ['dashboard', 'stok', 'terjual', 'lain', 'laporan', 'pengaturan'].forEach(m => {
    const sec = document.getElementById(`section-${m}`);
    const nav = document.getElementById(`nav-${m}`);
    if (m === menu) {
      if (sec) sec.classList.remove('hidden');
      if (nav) nav.className = 'nav-btn w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white shadow-md shadow-indigo-600/25 transition-all';
    } else {
      if (sec) sec.classList.add('hidden');
      if (nav) nav.className = 'nav-btn w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-all';
    }
  });

  toggleSidebar(false);

  if (menu === 'dashboard') renderDashboard();
  if (menu === 'stok') renderTable('beli');
  if (menu === 'terjual') renderTable('jual');
  if (menu === 'lain') { renderTable('status'); renderTable('hpp'); }
  if (menu === 'laporan') renderLaporan();
  if (menu === 'pengaturan') renderSupabaseSettings();
}

// ==================== MODALS ====================
function openModal(id) {
  const el = document.getElementById(id);
  el.classList.remove('hidden');
  el.classList.add('flex');
}

function closeModal(id) {
  const el = document.getElementById(id);
  el.classList.add('hidden');
  el.classList.remove('flex');
}

function showConfirmModal(title, message, onConfirm) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  const okBtn = document.getElementById('confirm-ok-btn');
  okBtn.onclick = () => {
    closeModal('modal-confirm');
    onConfirm();
  };
  openModal('modal-confirm');
}

// ==================== BIRD SPECIES DROPDOWN SYNC ====================
function populateBirdSelects() {
  const birds = new Set();
  [...state.beli, ...state.jual, ...state.status].forEach(item => {
    if (item.jenisBurung) birds.add(item.jenisBurung.trim());
  });
  const sorted = Array.from(birds).sort((a, b) => a.localeCompare(b));

  ['dash-filter-bird', 'lap-filter-bird'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="all">Semua Jenis Burung</option>' +
      sorted.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
    if (sorted.includes(current)) sel.value = current;
  });
}

// ==================== DASHBOARD & CHARTS ====================
function matchTimeFilter(isoDate, filterType) {
  if (filterType === 'all' || !isoDate) return true;
  const now = new Date();
  const todayStr = getIsoDateOffset(0);
  if (filterType === 'today') return isoDate === todayStr;
  if (filterType === 'month') {
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return isoDate.startsWith(ym);
  }
  if (filterType === 'year') {
    return isoDate.startsWith(String(now.getFullYear()));
  }
  return true;
}

function animateCountUp(el, target, isCurrency = false) {
  const duration = 500;
  const startTime = performance.now();
  const startVal = 0;

  function update(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(startVal + (target - startVal) * eased);
    el.textContent = isCurrency ? formatRupiah(current) : current.toLocaleString('id-ID');
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function getJualTotal(item) {
  return Math.max(0, (Number(item.jumlah || 0) * Number(item.harga || 0)) - Number(item.diskon || 0));
}

function getJualProfit(item) {
  const totalRow = getJualTotal(item);
  const beliMatch = state.beli.find(b => b.jenisBurung.trim().toLowerCase() === item.jenisBurung.trim().toLowerCase());
  const hargaBeli = beliMatch ? Number(beliMatch.harga || 0) : 0;
  return totalRow - (Number(item.jumlah || 0) * hargaBeli);
}

function renderDashboard() {
  populateBirdSelects();
  const timeFilter = document.getElementById('dash-filter-time').value;
  const birdFilter = document.getElementById('dash-filter-bird').value;

  const filterItem = (item, hasBird = true) => {
    const timeOk = matchTimeFilter(item.tanggal, timeFilter);
    const birdOk = !hasBird || birdFilter === 'all' || item.jenisBurung === birdFilter;
    return timeOk && birdOk;
  };

  const beliFiltered = state.beli.filter(i => filterItem(i, true));
  const jualFiltered = state.jual.filter(i => filterItem(i, true));
  const statusFiltered = state.status.filter(i => filterItem(i, true));
  const hppFiltered = state.hpp.filter(i => filterItem(i, false));

  const totalBeliQty = beliFiltered.reduce((s, i) => s + Number(i.jumlah || 0), 0);
  const totalJualQty = jualFiltered.reduce((s, i) => s + Number(i.jumlah || 0), 0);
  const totalStatusQty = statusFiltered.reduce((s, i) => s + Number(i.jumlah || 1), 0);
  const stokHidup = Math.max(0, totalBeliQty - totalJualQty - totalStatusQty);

  const totalModal = beliFiltered.reduce((s, i) => s + (Number(i.jumlah) * Number(i.harga)), 0);
  const totalJual = jualFiltered.reduce((s, i) => s + getJualTotal(i), 0);
  const totalKerugian = statusFiltered.reduce((s, i) => s + Number(i.totalHarga || 0), 0);
  const totalHpp = birdFilter === 'all'
    ? hppFiltered.reduce((s, i) => s + Number(i.nominal || 0), 0)
    : 0; // HPP is store-wide operational cost when specific bird selected

  const labaBersih = jualFiltered.reduce((s, i) => s + getJualProfit(i), 0);

  // Animate KPIs
  animateCountUp(document.getElementById('kpi-stok'), stokHidup, false);
  animateCountUp(document.getElementById('kpi-modal'), totalModal, true);
  animateCountUp(document.getElementById('kpi-jual'), totalJual, true);

  const labaEl = document.getElementById('kpi-laba');
  labaEl.className = `text-2xl sm:text-2xl font-extrabold ${labaBersih >= 0 ? 'text-indigo-600' : 'text-rose-600'}`;
  animateCountUp(labaEl, labaBersih, true);

  renderCharts(beliFiltered, jualFiltered, statusFiltered, hppFiltered, birdFilter);
}

function renderCharts(beliList, jualList, statusList, hppList, birdFilter) {
  // 1. Tren Pemasukan vs Pengeluaran grouped by date
  const dateMap = {};
  const ensureDate = d => {
    if (!dateMap[d]) dateMap[d] = { pemasukan: 0, pengeluaran: 0 };
  };

  jualList.forEach(i => {
    ensureDate(i.tanggal);
    dateMap[i.tanggal].pemasukan += getJualTotal(i);
  });
  beliList.forEach(i => {
    ensureDate(i.tanggal);
    dateMap[i.tanggal].pengeluaran += Number(i.jumlah) * Number(i.harga);
  });
  statusList.forEach(i => {
    ensureDate(i.tanggal);
    dateMap[i.tanggal].pengeluaran += Number(i.totalHarga);
  });
  if (birdFilter === 'all') {
    hppList.forEach(i => {
      ensureDate(i.tanggal);
      dateMap[i.tanggal].pengeluaran += Number(i.nominal);
    });
  }

  const sortedDates = Object.keys(dateMap).sort();
  const labelsTren = sortedDates.map(d => {
    const p = d.split('-');
    return `${p[2]}/${p[1]}`;
  });
  const dataIn = sortedDates.map(d => dateMap[d].pemasukan);
  const dataOut = sortedDates.map(d => dateMap[d].pengeluaran);

  if (state.charts.tren) state.charts.tren.destroy();
  const ctxTren = document.getElementById('chart-tren').getContext('2d');
  state.charts.tren = new Chart(ctxTren, {
    type: 'line',
    data: {
      labels: labelsTren.length ? labelsTren : ['Tidak ada data'],
      datasets: [
        {
          label: 'Pemasukan (Penjualan)',
          data: dataIn.length ? dataIn : [0],
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: 'Pengeluaran (Modal, Rugi, HPP)',
          data: dataOut.length ? dataOut : [0],
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${formatRupiah(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: val => 'Rp ' + Number(val).toLocaleString('id-ID')
          },
          grid: { color: '#f1f5f9' }
        },
        x: { grid: { display: false } }
      }
    }
  });

  // 2. Perbandingan Stok per Jenis Burung
  const stockByBird = {};
  beliList.forEach(i => {
    stockByBird[i.jenisBurung] = (stockByBird[i.jenisBurung] || 0) + Number(i.jumlah);
  });
  jualList.forEach(i => {
    stockByBird[i.jenisBurung] = (stockByBird[i.jenisBurung] || 0) - Number(i.jumlah);
  });
  statusList.forEach(i => {
    stockByBird[i.jenisBurung] = (stockByBird[i.jenisBurung] || 0) - Number(i.jumlah || 1);
  });

  const birdLabels = Object.keys(stockByBird).sort();
  const birdValues = birdLabels.map(b => Math.max(0, stockByBird[b]));

  if (state.charts.stok) state.charts.stok.destroy();
  const ctxStok = document.getElementById('chart-stok').getContext('2d');
  state.charts.stok = new Chart(ctxStok, {
    type: 'bar',
    data: {
      labels: birdLabels.length ? birdLabels : ['Tidak ada data'],
      datasets: [{
        label: 'Stok Hidup (Ekor)',
        data: birdValues.length ? birdValues : [0],
        backgroundColor: [
          'rgba(99, 102, 241, 0.85)',
          'rgba(16, 185, 129, 0.85)',
          'rgba(245, 158, 11, 0.85)',
          'rgba(6, 182, 212, 0.85)',
          'rgba(244, 63, 94, 0.85)',
        ],
        borderRadius: 8,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `Stok Hidup: ${ctx.parsed.y} Ekor`
          }
        }
      },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#f1f5f9' } },
        x: { grid: { display: false } }
      }
    }
  });
}

// ==================== TABLE RENDERING & FILTERING ====================
function getFilteredTableData(type) {
  const search = (document.getElementById(`search-${type}`)?.value || '').trim().toLowerCase();
  const month = document.getElementById(`month-${type}`)?.value || '';

  return state[type].filter(item => {
    if (month && !item.tanggal.startsWith(month)) return false;

    if (type === 'beli' || type === 'jual') {
      if (search && !item.jenisBurung.toLowerCase().includes(search)) return false;
    } else if (type === 'status') {
      const statusFilter = document.getElementById('filter-status-type')?.value || 'all';
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (search && !item.jenisBurung.toLowerCase().includes(search)) return false;
    } else if (type === 'hpp') {
      const catFilter = document.getElementById('filter-hpp-cat')?.value || 'all';
      if (catFilter !== 'all' && item.kategori !== catFilter) return false;
      if (search && !item.kategori.toLowerCase().includes(search)) return false;
    }
    return true;
  });
}

function clearTableFilter(type) {
  const s = document.getElementById(`search-${type}`);
  const m = document.getElementById(`month-${type}`);
  if (s) s.value = '';
  if (m) m.value = '';
  if (type === 'status') document.getElementById('filter-status-type').value = 'all';
  if (type === 'hpp') document.getElementById('filter-hpp-cat').value = 'all';
  renderTable(type);
}

function renderTable(type) {
  const tbody = document.getElementById(`tbody-${type}`);
  if (!tbody) return;
  const rows = getFilteredTableData(type);
  const loggedIn = isLoggedIn();
  const selectedSet = state.selected[type];

  // Update master checkbox
  const selectAllEl = document.getElementById(`select-all-${type}`);
  if (selectAllEl) {
    selectAllEl.checked = loggedIn && rows.length > 0 && rows.every(r => selectedSet.has(r.id));
    if (!loggedIn) selectAllEl.classList.add('guest-locked');
    else selectAllEl.classList.remove('guest-locked');
  }

  // Update bulk delete button
  updateBulkDeleteBtn(type);

  if (rows.length === 0) {
    const baseCols = type === 'beli' ? 10 : (type === 'jual' ? 9 : (type === 'status' ? 8 : 6));
    const colSpan = loggedIn ? baseCols : baseCols - 2;
    tbody.innerHTML = `
      <tr>
        <td colspan="${colSpan}" class="py-10 text-center text-slate-400 text-sm">
          Tidak ada data yang sesuai dengan pencarian atau filter.
        </td>
      </tr>
    `;
    return;
  }

  const lockClass = loggedIn ? '' : 'guest-locked';

  tbody.innerHTML = rows.map((item, idx) => {
    const isChecked = loggedIn && selectedSet.has(item.id) ? 'checked' : '';
    const checkboxHtml = `
      <td class="auth-only py-3.5 px-4">
        <input type="checkbox" ${isChecked} onchange="toggleRowSelect('${type}', '${item.id}', this)" class="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer ${lockClass}" />
      </td>
    `;
    const aksiHtml = `
      <td class="auth-only py-3.5 px-4 text-center">
        <div class="inline-flex items-center gap-1.5">
          <button onclick="openFormModal('${type}', '${item.id}')" title="Edit" class="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors ${lockClass}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>
          <button onclick="confirmDeleteSingle('${type}', '${item.id}')" title="Hapus" class="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors ${lockClass}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </td>
    `;

    if (type === 'beli') {
      const totalBeli = Number(item.jumlah) * Number(item.harga);
      const hargaJualVal = item.hargaJual !== undefined ? Number(item.hargaJual) : Number(item.harga);
      const totalJual = Number(item.jumlah) * hargaJualVal;
      return `
        <tr class="hover:bg-slate-50/80 transition-colors">
          ${checkboxHtml}
          <td class="py-3.5 px-3 font-medium text-slate-500">${idx + 1}</td>
          <td class="py-3.5 px-4 font-semibold text-slate-900">${escapeHtml(item.jenisBurung)}</td>
          <td class="py-3.5 px-4">${item.jumlah} ekor</td>
          <td class="py-3.5 px-4">${formatRupiah(item.harga)}</td>
          <td class="py-3.5 px-4 font-semibold text-emerald-700">${formatRupiah(hargaJualVal)}</td>
          <td class="py-3.5 px-4 font-bold text-slate-900">${formatRupiah(totalBeli)}</td>
          <td class="py-3.5 px-4 font-bold text-emerald-700">${formatRupiah(totalJual)}</td>
          <td class="py-3.5 px-4 text-slate-600 whitespace-nowrap">${formatTanggalIndo(item.tanggal)}</td>
          ${aksiHtml}
        </tr>
      `;
    } else if (type === 'jual') {
      const diskon = Number(item.diskon || 0);
      const total = getJualTotal(item);
      return `
        <tr class="hover:bg-slate-50/80 transition-colors">
          ${checkboxHtml}
          <td class="py-3.5 px-3 font-medium text-slate-500">${idx + 1}</td>
          <td class="py-3.5 px-4 font-semibold text-slate-900">${escapeHtml(item.jenisBurung)}</td>
          <td class="py-3.5 px-4">${item.jumlah} ekor</td>
          <td class="py-3.5 px-4">${formatRupiah(item.harga)}</td>
          <td class="py-3.5 px-4 ${diskon > 0 ? 'text-rose-600 font-semibold' : 'text-slate-400'}">${diskon > 0 ? '-' + formatRupiah(diskon) : 'Rp 0'}</td>
          <td class="py-3.5 px-4 font-bold text-slate-900">${formatRupiah(total)}</td>
          <td class="py-3.5 px-4 text-slate-600 whitespace-nowrap">${formatTanggalIndo(item.tanggal)}</td>
          ${aksiHtml}
        </tr>
      `;
    } else if (type === 'status') {
      const badgeMap = {
        'Mati': 'bg-rose-100 text-rose-700 border-rose-200',
        'Lepas': 'bg-amber-100 text-amber-800 border-amber-200',
        'Hilang': 'bg-slate-100 text-slate-700 border-slate-300',
      };
      const badgeCls = badgeMap[item.status] || badgeMap['Hilang'];
      return `
        <tr class="hover:bg-slate-50/80 transition-colors">
          ${checkboxHtml}
          <td class="py-3.5 px-3 font-medium text-slate-500">${idx + 1}</td>
          <td class="py-3.5 px-4 font-semibold text-slate-900">${escapeHtml(item.jenisBurung)}</td>
          <td class="py-3.5 px-4">${item.jumlah || 1} ekor</td>
          <td class="py-3.5 px-4">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeCls}">
              ${escapeHtml(item.status)}
            </span>
          </td>
          <td class="py-3.5 px-4 font-bold text-rose-600">${formatRupiah(item.totalHarga)}</td>
          <td class="py-3.5 px-4 text-slate-600 whitespace-nowrap">${formatTanggalIndo(item.tanggal)}</td>
          ${aksiHtml}
        </tr>
      `;
    } else {
      // hpp
      const catBadge = item.kategori === 'Makanan & Vitamin'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-cyan-50 text-cyan-700 border-cyan-200';
      return `
        <tr class="hover:bg-slate-50/80 transition-colors">
          ${checkboxHtml}
          <td class="py-3.5 px-3 font-medium text-slate-500">${idx + 1}</td>
          <td class="py-3.5 px-4">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${catBadge}">
              ${escapeHtml(item.kategori)}
            </span>
          </td>
          <td class="py-3.5 px-4 font-bold text-slate-900">${formatRupiah(item.nominal)}</td>
          <td class="py-3.5 px-4 text-slate-600 whitespace-nowrap">${formatTanggalIndo(item.tanggal)}</td>
          ${aksiHtml}
        </tr>
      `;
    }
  }).join('');
}

// ==================== BULK SELECTION & DELETE ====================
function toggleSelectAll(type, checkboxEl) {
  if (!requireAuth()) {
    checkboxEl.checked = false;
    return;
  }
  const rows = getFilteredTableData(type);
  if (checkboxEl.checked) {
    rows.forEach(r => state.selected[type].add(r.id));
  } else {
    rows.forEach(r => state.selected[type].delete(r.id));
  }
  renderTable(type);
}

function toggleRowSelect(type, id, checkboxEl) {
  if (!requireAuth()) {
    checkboxEl.checked = false;
    return;
  }
  if (checkboxEl.checked) {
    state.selected[type].add(id);
  } else {
    state.selected[type].delete(id);
  }
  renderTable(type);
}

function updateBulkDeleteBtn(type) {
  const btn = document.getElementById(`bulk-del-${type}`);
  const countEl = document.getElementById(`count-del-${type}`);
  if (!btn || !countEl) return;
  const count = state.selected[type].size;
  if (isLoggedIn() && count > 0) {
    btn.classList.remove('hidden');
    btn.classList.add('inline-flex');
    countEl.textContent = count;
  } else {
    btn.classList.add('hidden');
    btn.classList.remove('inline-flex');
  }
}

function confirmDeleteSingle(type, id) {
  if (!requireAuth()) return;
  showConfirmModal(
    'Hapus Data?',
    'Data yang dihapus tidak dapat dikembalikan. Yakin ingin menghapus baris ini?',
    () => {
      state[type] = state[type].filter(item => item.id !== id);
      state.selected[type].delete(id);
      saveTableToStorage(type);
      sbDeleteRows(type, [id]);
      refreshAllViews();
      showToast('Data berhasil dihapus.', 'success');
    }
  );
}

function confirmBulkDelete(type) {
  if (!requireAuth()) return;
  const count = state.selected[type].size;
  if (count === 0) return;
  showConfirmModal(
    `Hapus ${count} Data Terpilih?`,
    `Sebanyak ${count} item yang dicentang akan dihapus secara permanen.`,
    () => {
      const idsToDelete = Array.from(state.selected[type]);
      state[type] = state[type].filter(item => !state.selected[type].has(item.id));
      state.selected[type].clear();
      saveTableToStorage(type);
      sbDeleteRows(type, idsToDelete);
      refreshAllViews();
      showToast(`${count} data berhasil dihapus.`, 'success');
    }
  );
}

// ==================== STOK SYNC HELPERS ====================
function getAvailableStockForBird(jenisBurung, excludeJualId = null, excludeStatusId = null) {
  const target = (jenisBurung || '').trim().toLowerCase();
  if (!target) return 0;
  const bought = state.beli
    .filter(i => i.jenisBurung.trim().toLowerCase() === target)
    .reduce((s, i) => s + Number(i.jumlah || 0), 0);
  const sold = state.jual
    .filter(i => i.id !== excludeJualId && i.jenisBurung.trim().toLowerCase() === target)
    .reduce((s, i) => s + Number(i.jumlah || 0), 0);
  const lost = state.status
    .filter(i => i.id !== excludeStatusId && i.jenisBurung.trim().toLowerCase() === target)
    .reduce((s, i) => s + Number(i.jumlah || 1), 0);
  return Math.max(0, bought - sold - lost);
}

function getStokBirdOptions(excludeJualId = null, excludeStatusId = null) {
  const map = new Map();
  // Iterate oldest->newest or newest->oldest; state.beli unshifts newest first,
  // so the first seen entry for a bird species has the latest hargaJual.
  state.beli.forEach(item => {
    const name = (item.jenisBurung || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        jenisBurung: name,
        hargaBeli: Number(item.harga || 0),
        hargaJual: item.hargaJual !== undefined ? Number(item.hargaJual) : Number(item.harga || 0),
        stokTersedia: getAvailableStockForBird(name, excludeJualId, excludeStatusId),
      });
    }
  });
  return Array.from(map.values()).sort((a, b) => a.jenisBurung.localeCompare(b.jenisBurung));
}

let currentJualStokOptions = [];

function buildBeliMultiRowHtml(index) {
  return `
    <div class="beli-multi-row p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2.5">
      <div class="flex items-center justify-between">
        <span class="b-row-label text-xs font-bold text-slate-700 uppercase tracking-wide">Item #${index + 1}</span>
        <button type="button" onclick="removeBeliMultiRow(this)" class="b-remove-btn text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded-lg transition-colors">Hapus</button>
      </div>
      <div>
        <label class="block text-[11px] font-semibold text-slate-600 mb-1">Jenis Burung</label>
        <input type="text" required placeholder="Contoh: Murai Batu" class="b-jenis w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div>
          <label class="block text-[11px] font-semibold text-slate-600 mb-1">Jumlah (Ekor)</label>
          <input type="number" required min="1" value="1" oninput="updateMultiBeliTotals()" class="b-jumlah w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-slate-600 mb-1">Harga Beli / Ekor (Rp)</label>
          <input type="number" required min="0" placeholder="1500000" oninput="updateMultiBeliTotals()" class="b-harga w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-slate-600 mb-1">Harga Jual / Ekor (Rp)</label>
          <input type="number" required min="0" placeholder="2000000" oninput="updateMultiBeliTotals()" class="b-harga-jual w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
        <span class="font-semibold text-slate-600">Modal Beli: <span class="b-sub-beli text-indigo-600 font-bold">Rp 0</span></span>
        <span class="font-semibold text-slate-600">Potensi Jual: <span class="b-sub-jual text-emerald-600 font-bold">Rp 0</span></span>
      </div>
    </div>
  `;
}

function addBeliMultiRow() {
  const container = document.getElementById('beli-multi-rows');
  if (!container) return;
  const idx = container.querySelectorAll('.beli-multi-row').length;
  container.insertAdjacentHTML('beforeend', buildBeliMultiRowHtml(idx));
  refreshBeliMultiRowUI();
  updateMultiBeliTotals();
}

function removeBeliMultiRow(btn) {
  const container = document.getElementById('beli-multi-rows');
  if (!container) return;
  const rows = container.querySelectorAll('.beli-multi-row');
  if (rows.length <= 1) return;
  btn.closest('.beli-multi-row')?.remove();
  refreshBeliMultiRowUI();
  updateMultiBeliTotals();
}

function refreshBeliMultiRowUI() {
  const rows = document.querySelectorAll('#beli-multi-rows .beli-multi-row');
  rows.forEach((row, i) => {
    const label = row.querySelector('.b-row-label');
    if (label) label.textContent = `Item #${i + 1}`;
    const removeBtn = row.querySelector('.b-remove-btn');
    if (removeBtn) removeBtn.classList.toggle('hidden', rows.length <= 1);
  });
  const countEl = document.getElementById('beli-multi-count');
  if (countEl) countEl.textContent = `${rows.length} item`;
}

function updateMultiBeliTotals() {
  const rows = document.querySelectorAll('#beli-multi-rows .beli-multi-row');
  let grandModal = 0;
  rows.forEach(row => {
    const jml = Number(row.querySelector('.b-jumlah')?.value || 0);
    const hrgBeli = Number(row.querySelector('.b-harga')?.value || 0);
    const hrgJual = Number(row.querySelector('.b-harga-jual')?.value || 0);
    const subBeli = jml * hrgBeli;
    const subJual = jml * hrgJual;
    grandModal += subBeli;
    const subBeliEl = row.querySelector('.b-sub-beli');
    const subJualEl = row.querySelector('.b-sub-jual');
    if (subBeliEl) subBeliEl.textContent = formatRupiah(subBeli);
    if (subJualEl) subJualEl.textContent = formatRupiah(subJual);
  });
  const prev = document.getElementById('f-total-preview');
  if (prev) prev.textContent = formatRupiah(grandModal);
}

function buildJualMultiRowHtml(index, options) {
  const defaultOpt = options[index % options.length] || options[0];
  return `
    <div class="jual-multi-row p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2.5">
      <div class="flex items-center justify-between">
        <span class="j-row-label text-xs font-bold text-slate-700 uppercase tracking-wide">Item #${index + 1}</span>
        <button type="button" onclick="removeJualMultiRow(this)" class="j-remove-btn text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded-lg transition-colors">Hapus</button>
      </div>
      <div>
        <label class="block text-[11px] font-semibold text-slate-600 mb-1">Jenis Burung (Sesuai Stok Burung)</label>
        <select onchange="onSelectMultiBirdForJual(this)" class="j-jenis w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
          ${options.map(o => `
            <option value="${escapeHtml(o.jenisBurung)}" ${o.jenisBurung === defaultOpt.jenisBurung ? 'selected' : ''}>
              ${escapeHtml(o.jenisBurung)} (Stok: ${o.stokTersedia} ekor)
            </option>
          `).join('')}
        </select>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div>
          <label class="block text-[11px] font-semibold text-slate-600 mb-1">Jumlah (Ekor)</label>
          <input type="number" required min="1" ${defaultOpt.stokTersedia > 0 ? `max="${defaultOpt.stokTersedia}"` : ''} value="1" oninput="updateMultiJualTotals()" class="j-jumlah w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-slate-600 mb-1">Harga Jual / Ekor</label>
          <input type="number" readonly value="${defaultOpt.hargaJual}" class="j-harga w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-100 text-slate-600 font-semibold cursor-not-allowed focus:outline-none" />
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-slate-600 mb-1">Diskon (Rp)</label>
          <input type="number" min="0" value="0" oninput="updateMultiJualTotals()" class="j-diskon w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
      </div>
      <div class="flex items-center justify-between text-xs pt-1">
        <span class="j-stok-info font-semibold ${defaultOpt.stokTersedia > 0 ? 'text-emerald-600' : 'text-rose-600'}">Stok tersedia: ${defaultOpt.stokTersedia} ekor</span>
        <span class="font-bold text-slate-700">Subtotal: <span class="j-subtotal text-emerald-700">${formatRupiah(defaultOpt.hargaJual)}</span></span>
      </div>
    </div>
  `;
}

function addJualMultiRow() {
  const container = document.getElementById('jual-multi-rows');
  if (!container || currentJualStokOptions.length === 0) return;
  const idx = container.querySelectorAll('.jual-multi-row').length;
  container.insertAdjacentHTML('beforeend', buildJualMultiRowHtml(idx, currentJualStokOptions));
  refreshJualMultiRowUI();
  updateMultiJualTotals();
}

function removeJualMultiRow(btn) {
  const container = document.getElementById('jual-multi-rows');
  if (!container) return;
  const rows = container.querySelectorAll('.jual-multi-row');
  if (rows.length <= 1) return;
  btn.closest('.jual-multi-row')?.remove();
  refreshJualMultiRowUI();
  updateMultiJualTotals();
}

function refreshJualMultiRowUI() {
  const rows = document.querySelectorAll('#jual-multi-rows .jual-multi-row');
  rows.forEach((row, i) => {
    const label = row.querySelector('.j-row-label');
    if (label) label.textContent = `Item #${i + 1}`;
    const removeBtn = row.querySelector('.j-remove-btn');
    if (removeBtn) removeBtn.classList.toggle('hidden', rows.length <= 1);
  });
  const countEl = document.getElementById('jual-multi-count');
  if (countEl) countEl.textContent = `${rows.length} item`;
}

function onSelectMultiBirdForJual(selectEl) {
  const row = selectEl.closest('.jual-multi-row');
  if (!row) return;
  const match = currentJualStokOptions.find(o => o.jenisBurung === selectEl.value);
  if (!match) return;
  const hargaInput = row.querySelector('.j-harga');
  const stokInfo = row.querySelector('.j-stok-info');
  const jumlahInput = row.querySelector('.j-jumlah');

  if (hargaInput) hargaInput.value = match.hargaJual;
  if (stokInfo) {
    stokInfo.textContent = `Stok tersedia: ${match.stokTersedia} ekor`;
    stokInfo.className = `j-stok-info font-semibold ${match.stokTersedia > 0 ? 'text-emerald-600' : 'text-rose-600'}`;
  }
  if (jumlahInput) {
    if (match.stokTersedia > 0) {
      jumlahInput.max = match.stokTersedia;
      if (Number(jumlahInput.value) > match.stokTersedia) jumlahInput.value = match.stokTersedia;
    } else {
      jumlahInput.removeAttribute('max');
    }
  }
  updateMultiJualTotals();
}

function updateMultiJualTotals() {
  const rows = document.querySelectorAll('#jual-multi-rows .jual-multi-row');
  let grandTotal = 0;
  rows.forEach(row => {
    const jml = Number(row.querySelector('.j-jumlah')?.value || 0);
    const hrg = Number(row.querySelector('.j-harga')?.value || 0);
    const dsk = Math.max(0, Number(row.querySelector('.j-diskon')?.value || 0));
    const sub = Math.max(0, (jml * hrg) - dsk);
    grandTotal += sub;
    const subEl = row.querySelector('.j-subtotal');
    if (subEl) subEl.textContent = formatRupiah(sub);
  });
  const prev = document.getElementById('f-total-preview');
  if (prev) prev.textContent = formatRupiah(grandTotal);
}

function onSelectBirdForJual(selectedName) {
  const excludeId = document.getElementById('form-id')?.value || null;
  const options = getStokBirdOptions(excludeId);
  const match = options.find(o => o.jenisBurung === selectedName);
  const hargaInput = document.getElementById('f-harga');
  const stokInfo = document.getElementById('f-stok-info');
  const jumlahInput = document.getElementById('f-jumlah');

  if (match && hargaInput) {
    hargaInput.value = match.hargaJual;
    if (stokInfo) {
      stokInfo.textContent = `Stok tersedia: ${match.stokTersedia} ekor`;
      stokInfo.className = `text-xs mt-1 font-semibold ${match.stokTersedia > 0 ? 'text-emerald-600' : 'text-rose-600'}`;
    }
    if (jumlahInput && match.stokTersedia > 0) {
      jumlahInput.max = match.stokTersedia;
      if (Number(jumlahInput.value) > match.stokTersedia) {
        jumlahInput.value = match.stokTersedia;
      }
    }
    updateLiveTotalPreview();
  }
}

function updateStatusTotalPreview() {
  const jml = Number(document.getElementById('f-jumlah')?.value || 0);
  const satuan = Number(document.getElementById('f-harga-satuan')?.value || 0);
  const totalHargaInput = document.getElementById('f-total-harga');
  if (totalHargaInput) {
    totalHargaInput.value = jml * satuan;
  }
}

function onSelectBirdForStatus(selectedName) {
  const excludeId = document.getElementById('form-id')?.value || null;
  const options = getStokBirdOptions(null, excludeId);
  const match = options.find(o => o.jenisBurung === selectedName);
  const satuanInput = document.getElementById('f-harga-satuan');
  const stokInfo = document.getElementById('f-status-stok-info');
  const jumlahInput = document.getElementById('f-jumlah');

  if (match && satuanInput) {
    satuanInput.value = match.hargaBeli;
    if (stokInfo) {
      stokInfo.textContent = `Stok tersedia: ${match.stokTersedia} ekor`;
      stokInfo.className = `text-xs mt-1 font-semibold ${match.stokTersedia > 0 ? 'text-emerald-600' : 'text-rose-600'}`;
    }
    if (jumlahInput && match.stokTersedia > 0) {
      jumlahInput.max = match.stokTersedia;
      if (Number(jumlahInput.value) > match.stokTersedia) {
        jumlahInput.value = match.stokTersedia;
      }
    }
    updateStatusTotalPreview();
  }
}

// ==================== ADD / EDIT DATA MODAL ====================
function openFormModal(type, id = null) {
  if (!requireAuth()) return;

  const isEdit = Boolean(id);
  const item = isEdit ? state[type].find(x => x.id === id) : null;

  if (type === 'jual' || type === 'status') {
    const stokOptions = getStokBirdOptions(type === 'jual' ? id : null);
    if (stokOptions.length === 0) {
      showToast('Stok burung masih kosong! Silakan tambah data di menu Stok Burung terlebih dahulu.', 'warning');
      return;
    }
  }

  const titles = {
    beli: isEdit ? 'Edit Data Stok Burung (Harga Beli)' : 'Tambah Data Stok Burung (Harga Beli)',
    jual: isEdit ? 'Edit Data Burung Terjual' : 'Tambah Data Burung Terjual',
    status: isEdit ? 'Edit Data Status Burung' : 'Tambah Data Status Burung',
    hpp: isEdit ? 'Edit Data HPP' : 'Tambah Data HPP',
  };

  const modalCard = document.getElementById('modal-form-card');
  if (modalCard) {
    const useWide = (type === 'jual' || type === 'beli') && !isEdit;
    modalCard.classList.toggle('max-w-2xl', useWide);
    modalCard.classList.toggle('max-w-lg', !useWide);
  }

  document.getElementById('form-modal-title').textContent = titles[type];
  document.getElementById('form-type').value = type;
  document.getElementById('form-id').value = id || '';

  const today = getIsoDateOffset(0);
  const fieldsEl = document.getElementById('form-fields');

  if (type === 'beli') {
    const defDate = item ? item.tanggal : today;
    if (!isEdit) {
      fieldsEl.innerHTML = `
        <div class="pb-3 border-b border-slate-100">
          <label class="block text-xs font-semibold text-slate-700 mb-1">Tanggal Stok Masuk (Untuk Semua Item)</label>
          <div class="flex flex-col sm:flex-row sm:items-center gap-3">
            <input type="date" id="f-tanggal" required oninput="updateDatePreview(this.value)" value="${defDate}" class="flex-1 px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <button type="button" onclick="addBeliMultiRow()" class="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shrink-0">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              Tambah List Burung
            </button>
          </div>
          <p class="text-[11px] text-slate-500 mt-1">Format: <span id="f-date-preview" class="font-semibold text-slate-700">${formatTanggalIndo(defDate)}</span></p>
        </div>
        <div id="beli-multi-rows" class="space-y-3">
          ${buildBeliMultiRowHtml(0)}
        </div>
        <div class="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 flex items-center justify-between">
          <div>
            <span class="text-xs font-semibold text-indigo-900 block">Total Modal Beli (<span id="beli-multi-count">1 item</span>)</span>
            <span class="text-[11px] text-indigo-600">Akumulasi modal pembelian seluruh baris</span>
          </div>
          <span id="f-total-preview" class="text-base font-extrabold text-indigo-700">Rp 0</span>
        </div>
      `;
      setTimeout(() => {
        refreshBeliMultiRowUI();
        updateMultiBeliTotals();
      }, 0);
    } else {
      const defHargaJual = item ? (item.hargaJual !== undefined ? item.hargaJual : item.harga) : '';
      fieldsEl.innerHTML = `
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">Jenis Burung</label>
          <input type="text" id="f-jenis" required value="${escapeHtml(item ? item.jenisBurung : '')}" placeholder="Contoh: Murai Batu" class="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Jumlah (Ekor)</label>
            <input type="number" id="f-jumlah" required min="1" oninput="updateLiveTotalPreview()" value="${item ? item.jumlah : 1}" class="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Harga Beli / Ekor (Rp)</label>
            <input type="number" id="f-harga" required min="0" oninput="updateLiveTotalPreview()" value="${item ? item.harga : ''}" placeholder="1500000" class="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Harga Jual / Ekor (Rp)</label>
            <input type="number" id="f-harga-jual" required min="0" value="${defHargaJual}" placeholder="2000000" class="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
        </div>
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-500">Total Modal Beli (Otomatis):</span>
          <span id="f-total-preview" class="text-sm font-bold text-indigo-600">Rp 0</span>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">Tanggal</label>
          <input type="date" id="f-tanggal" required oninput="updateDatePreview(this.value)" value="${defDate}" class="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <p class="text-xs text-slate-500 mt-1">Format: <span id="f-date-preview" class="font-semibold text-slate-700">${formatTanggalIndo(defDate)}</span></p>
        </div>
      `;
      setTimeout(updateLiveTotalPreview, 0);
    }
  } else if (type === 'jual') {
    const defDate = item ? item.tanggal : today;
    const stokOptions = getStokBirdOptions(id);

    if (!isEdit) {
      currentJualStokOptions = stokOptions;
      fieldsEl.innerHTML = `
        <div class="pb-3 border-b border-slate-100">
          <label class="block text-xs font-semibold text-slate-700 mb-1">Tanggal Penjualan (Untuk Semua Item)</label>
          <div class="flex flex-col sm:flex-row sm:items-center gap-3">
            <input type="date" id="f-tanggal" required oninput="updateDatePreview(this.value)" value="${defDate}" class="flex-1 px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <button type="button" onclick="addJualMultiRow()" class="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shrink-0">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              Tambah List Burung
            </button>
          </div>
          <p class="text-[11px] text-slate-500 mt-1">Format: <span id="f-date-preview" class="font-semibold text-slate-700">${formatTanggalIndo(defDate)}</span></p>
        </div>
        <div id="jual-multi-rows" class="space-y-3">
          ${buildJualMultiRowHtml(0, stokOptions)}
        </div>
        <div class="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200 flex items-center justify-between">
          <div>
            <span class="text-xs font-semibold text-emerald-800 block">Total Penjualan (<span id="jual-multi-count">1 item</span>)</span>
            <span class="text-[11px] text-emerald-600">Sudah termasuk potongan diskon masing-masing baris</span>
          </div>
          <span id="f-total-preview" class="text-base font-extrabold text-emerald-700">Rp 0</span>
        </div>
      `;
      setTimeout(() => {
        refreshJualMultiRowUI();
        updateMultiJualTotals();
      }, 0);
    } else {
      const selectedBird = item ? item.jenisBurung : stokOptions[0].jenisBurung;
      const matchedOpt = stokOptions.find(o => o.jenisBurung === selectedBird) || stokOptions[0];
      const autoHargaJual = matchedOpt ? matchedOpt.hargaJual : (item ? item.harga : 0);

      fieldsEl.innerHTML = `
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">Jenis Burung (Sesuai Stok Burung)</label>
          <select id="f-jenis" required onchange="onSelectBirdForJual(this.value)" class="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
            ${stokOptions.map(o => `
              <option value="${escapeHtml(o.jenisBurung)}" ${o.jenisBurung === selectedBird ? 'selected' : ''}>
                ${escapeHtml(o.jenisBurung)} (Stok: ${o.stokTersedia} ekor)
              </option>
            `).join('')}
          </select>
          <p id="f-stok-info" class="text-xs mt-1 font-semibold ${matchedOpt.stokTersedia > 0 ? 'text-emerald-600' : 'text-rose-600'}">
            Stok tersedia: ${matchedOpt.stokTersedia} ekor
          </p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Jumlah Terjual (Ekor)</label>
            <input type="number" id="f-jumlah" required min="1" ${matchedOpt.stokTersedia > 0 ? `max="${matchedOpt.stokTersedia}"` : ''} oninput="updateLiveTotalPreview()" value="${item ? item.jumlah : 1}" class="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Harga Jual / Ekor (Otomatis)</label>
            <input type="number" id="f-harga" readonly value="${autoHargaJual}" class="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-100 text-slate-600 font-semibold cursor-not-allowed focus:outline-none" />
          </div>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">Diskon (Rp)</label>
          <input type="number" id="f-diskon" min="0" oninput="updateLiveTotalPreview()" value="${item ? Number(item.diskon || 0) : 0}" placeholder="0" class="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div class="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between">
          <span class="text-xs font-semibold text-emerald-700">Total Harga Jual Setelah Diskon:</span>
          <span id="f-total-preview" class="text-sm font-bold text-emerald-700">Rp 0</span>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">Tanggal</label>
          <input type="date" id="f-tanggal" required oninput="updateDatePreview(this.value)" value="${defDate}" class="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <p class="text-xs text-slate-500 mt-1">Format: <span id="f-date-preview" class="font-semibold text-slate-700">${formatTanggalIndo(defDate)}</span></p>
        </div>
      `;
      setTimeout(updateLiveTotalPreview, 0);
    }
  } else if (type === 'status') {
    const defDate = item ? item.tanggal : today;
    const st = item ? item.status : 'Mati';
    const defJumlah = item ? (item.jumlah || 1) : 1;
    const stokOptions = getStokBirdOptions(null, id);
    const selectedBird = item ? item.jenisBurung : stokOptions[0].jenisBurung;
    const matchedOpt = stokOptions.find(o => o.jenisBurung === selectedBird) || stokOptions[0];
    const autoHargaBeli = matchedOpt ? matchedOpt.hargaBeli : (item ? Number(item.totalHarga || 0) / defJumlah : 0);
    const autoTotalKerugian = defJumlah * autoHargaBeli;

    fieldsEl.innerHTML = `
      <input type="hidden" id="f-harga-satuan" value="${autoHargaBeli}" />
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">Jenis Burung (Sesuai Stok Burung)</label>
        <select id="f-jenis" required onchange="onSelectBirdForStatus(this.value)" class="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white">
          ${stokOptions.map(o => `
            <option value="${escapeHtml(o.jenisBurung)}" ${o.jenisBurung === selectedBird ? 'selected' : ''}>
              ${escapeHtml(o.jenisBurung)} (Stok: ${o.stokTersedia} ekor)
            </option>
          `).join('')}
        </select>
        <p id="f-status-stok-info" class="text-xs mt-1 font-semibold ${matchedOpt.stokTersedia > 0 ? 'text-emerald-600' : 'text-rose-600'}">
          Stok tersedia: ${matchedOpt.stokTersedia} ekor
        </p>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">Jumlah (Ekor)</label>
          <input type="number" id="f-jumlah" required min="1" ${matchedOpt.stokTersedia > 0 ? `max="${matchedOpt.stokTersedia}"` : ''} oninput="updateStatusTotalPreview()" value="${defJumlah}" class="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">Status Burung</label>
          <select id="f-status" class="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500">
            <option value="Mati" ${st === 'Mati' ? 'selected' : ''}>Mati</option>
            <option value="Lepas" ${st === 'Lepas' ? 'selected' : ''}>Lepas</option>
            <option value="Hilang" ${st === 'Hilang' ? 'selected' : ''}>Hilang</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">Total Kerugian (Otomatis)</label>
          <input type="number" id="f-total-harga" readonly value="${autoTotalKerugian}" class="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-100 text-slate-600 font-semibold cursor-not-allowed focus:outline-none" />
        </div>
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">Tanggal</label>
        <input type="date" id="f-tanggal" required oninput="updateDatePreview(this.value)" value="${defDate}" class="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500" />
        <p class="text-xs text-slate-500 mt-1">Format: <span id="f-date-preview" class="font-semibold text-slate-700">${formatTanggalIndo(defDate)}</span></p>
      </div>
    `;
  } else if (type === 'hpp') {
    const defDate = item ? item.tanggal : today;
    const kat = item ? item.kategori : 'Makanan & Vitamin';
    fieldsEl.innerHTML = `
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">Kategori HPP</label>
        <select id="f-kategori" class="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="Makanan & Vitamin" ${kat === 'Makanan & Vitamin' ? 'selected' : ''}>Makanan & Vitamin</option>
          <option value="Ongkos Kirim" ${kat === 'Ongkos Kirim' ? 'selected' : ''}>Ongkos Kirim</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">Nominal / Biaya (Rp)</label>
        <input type="number" id="f-nominal" required min="0" value="${item ? item.nominal : ''}" placeholder="Contoh: 350000" class="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">Tanggal</label>
        <input type="date" id="f-tanggal" required oninput="updateDatePreview(this.value)" value="${defDate}" class="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <p class="text-xs text-slate-500 mt-1">Format: <span id="f-date-preview" class="font-semibold text-slate-700">${formatTanggalIndo(defDate)}</span></p>
      </div>
    `;
  }

  openModal('modal-form');
}

function updateLiveTotalPreview() {
  const jml = Number(document.getElementById('f-jumlah')?.value || 0);
  const hrg = Number(document.getElementById('f-harga')?.value || 0);
  const dsk = Math.max(0, Number(document.getElementById('f-diskon')?.value || 0));
  const prev = document.getElementById('f-total-preview');
  if (prev) prev.textContent = formatRupiah(Math.max(0, (jml * hrg) - dsk));
}

function updateDatePreview(val) {
  const el = document.getElementById('f-date-preview');
  if (el) el.textContent = formatTanggalIndo(val);
}

function handleDataFormSubmit(e) {
  e.preventDefault();
  if (!requireAuth()) return;

  const type = document.getElementById('form-type').value;
  const id = document.getElementById('form-id').value;
  const tanggal = document.getElementById('f-tanggal').value;

  let newObj;
  if (type === 'beli') {
    if (!id) {
      const rows = Array.from(document.querySelectorAll('#beli-multi-rows .beli-multi-row'));
      if (rows.length === 0) return;

      const baseTs = Date.now();
      const newItems = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const jenisBurung = row.querySelector('.b-jenis').value.trim();
        const jumlah = Number(row.querySelector('.b-jumlah').value);
        const harga = Number(row.querySelector('.b-harga').value);
        const hargaJual = Number(row.querySelector('.b-harga-jual').value);

        if (!jenisBurung || jumlah <= 0 || harga < 0 || hargaJual < 0) {
          showToast(`Periksa kembali isian Item #${i + 1}.`, 'warning');
          return;
        }

        newItems.push({
          id: `b${baseTs}_${i + 1}`,
          jenisBurung,
          jumlah,
          harga,
          hargaJual,
          tanggal,
        });
      }

      for (let i = newItems.length - 1; i >= 0; i--) {
        state.beli.unshift(newItems[i]);
      }
      saveTableToStorage('beli');
      sbUpsertRows('beli', newItems);
      closeModal('modal-form');
      refreshAllViews();
      showToast(`${newItems.length} data stok burung berhasil ditambahkan!`, 'success');
      return;
    }

    newObj = {
      id: id || `b${Date.now()}`,
      jenisBurung: document.getElementById('f-jenis').value.trim(),
      jumlah: Number(document.getElementById('f-jumlah').value),
      harga: Number(document.getElementById('f-harga').value),
      hargaJual: Number(document.getElementById('f-harga-jual').value),
      tanggal,
    };
  } else if (type === 'jual') {
    if (!id) {
      const rows = Array.from(document.querySelectorAll('#jual-multi-rows .jual-multi-row'));
      if (rows.length === 0) return;

      const baseTs = Date.now();
      const newItems = [];
      const qtyPerBird = {};

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const jenisBurung = row.querySelector('.j-jenis').value.trim();
        const jumlah = Number(row.querySelector('.j-jumlah').value);
        const harga = Number(row.querySelector('.j-harga').value);
        const diskon = Math.max(0, Number(row.querySelector('.j-diskon').value || 0));

        if (!jenisBurung || jumlah <= 0) {
          showToast(`Periksa kembali isian Item #${i + 1}.`, 'warning');
          return;
        }

        const key = jenisBurung.toLowerCase();
        qtyPerBird[key] = (qtyPerBird[key] || 0) + jumlah;
        const stokTersedia = getAvailableStockForBird(jenisBurung, null);
        if (qtyPerBird[key] > stokTersedia) {
          showToast(`Total jumlah "${jenisBurung}" (${qtyPerBird[key]} ekor) melebihi stok tersedia (${stokTersedia} ekor)!`, 'warning');
          return;
        }

        newItems.push({
          id: `j${baseTs}_${i + 1}`,
          jenisBurung,
          jumlah,
          harga,
          diskon,
          tanggal,
        });
      }

      for (let i = newItems.length - 1; i >= 0; i--) {
        state.jual.unshift(newItems[i]);
      }
      saveTableToStorage('jual');
      sbUpsertRows('jual', newItems);
      closeModal('modal-form');
      refreshAllViews();
      showToast(`${newItems.length} data burung terjual berhasil ditambahkan!`, 'success');
      return;
    }

    const jenisBurung = document.getElementById('f-jenis').value.trim();
    const jumlah = Number(document.getElementById('f-jumlah').value);
    const stokTersedia = getAvailableStockForBird(jenisBurung, id || null);
    if (jumlah > stokTersedia) {
      showToast(`Jumlah melebihi stok tersedia (${stokTersedia} ekor)!`, 'warning');
      return;
    }
    newObj = {
      id: id || `j${Date.now()}`,
      jenisBurung,
      jumlah,
      harga: Number(document.getElementById('f-harga').value),
      diskon: Math.max(0, Number(document.getElementById('f-diskon')?.value || 0)),
      tanggal,
    };
  } else if (type === 'status') {
    const jenisBurung = document.getElementById('f-jenis').value.trim();
    const jumlah = Number(document.getElementById('f-jumlah').value);
    const stokTersedia = getAvailableStockForBird(jenisBurung, null, id || null);
    if (jumlah > stokTersedia) {
      showToast(`Jumlah melebihi stok tersedia (${stokTersedia} ekor)!`, 'warning');
      return;
    }
    newObj = {
      id: id || `s${Date.now()}`,
      jenisBurung,
      jumlah,
      status: document.getElementById('f-status').value,
      totalHarga: Number(document.getElementById('f-total-harga').value),
      tanggal,
    };
  } else if (type === 'hpp') {
    newObj = {
      id: id || `h${Date.now()}`,
      kategori: document.getElementById('f-kategori').value,
      nominal: Number(document.getElementById('f-nominal').value),
      tanggal,
    };
  }

  if (id) {
    const idx = state[type].findIndex(x => x.id === id);
    if (idx !== -1) state[type][idx] = newObj;
    showToast('Data berhasil diperbarui!', 'success');
  } else {
    state[type].unshift(newObj);
    showToast('Data baru berhasil ditambahkan!', 'success');
  }

  saveTableToStorage(type);
  sbUpsertRow(type, newObj);
  closeModal('modal-form');
  refreshAllViews();
}

// ==================== LAPORAN & PDF EXPORT ====================
function resetLaporanFilter() {
  document.getElementById('lap-date-start').value = '';
  document.getElementById('lap-date-end').value = '';
  document.getElementById('lap-filter-bird').value = 'all';
  document.getElementById('lap-search').value = '';
  renderLaporan();
}

function renderLaporan() {
  populateBirdSelects();
  const rawStart = (document.getElementById('lap-date-start').value || '').trim().slice(0, 10);
  const rawEnd = (document.getElementById('lap-date-end').value || '').trim().slice(0, 10);
  let start = rawStart;
  let end = rawEnd;
  if (start && end && start > end) {
    [start, end] = [end, start];
  }
  const bird = document.getElementById('lap-filter-bird').value;
  const search = document.getElementById('lap-search').value.trim().toLowerCase();

  // Update period header text
  let periodeText = 'Semua Waktu';
  if (start && end) periodeText = `${formatTanggalIndo(start)} s/d ${formatTanggalIndo(end)}`;
  else if (start) periodeText = `Mulai ${formatTanggalIndo(start)}`;
  else if (end) periodeText = `Sampai ${formatTanggalIndo(end)}`;
  if (bird !== 'all') periodeText += ` • Burung: ${bird}`;
  document.getElementById('lap-periode-text').textContent = `Periode: ${periodeText}`;
  document.getElementById('lap-printed-at').textContent = formatTanggalIndo(getIsoDateOffset(0));

  const inRange = (iso) => {
    const d = String(iso || '').trim().slice(0, 10);
    if (!d) return false;
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  };

  const beliF = state.beli.filter(i =>
    inRange(i.tanggal) &&
    (bird === 'all' || i.jenisBurung === bird) &&
    (!search || i.jenisBurung.toLowerCase().includes(search))
  );

  const jualF = state.jual.filter(i =>
    inRange(i.tanggal) &&
    (bird === 'all' || i.jenisBurung === bird) &&
    (!search || i.jenisBurung.toLowerCase().includes(search))
  );

  const statusF = state.status.filter(i =>
    inRange(i.tanggal) &&
    (bird === 'all' || i.jenisBurung === bird) &&
    (!search || i.jenisBurung.toLowerCase().includes(search) || i.status.toLowerCase().includes(search))
  );

  const hppF = bird === 'all'
    ? state.hpp.filter(i =>
        inRange(i.tanggal) &&
        (!search || i.kategori.toLowerCase().includes(search))
      )
    : [];

  const sumBeli = beliF.reduce((s, i) => s + Number(i.jumlah) * Number(i.harga), 0);
  const sumJual = jualF.reduce((s, i) => s + getJualTotal(i), 0);
  const sumStatus = statusF.reduce((s, i) => s + Number(i.totalHarga), 0);
  const sumHpp = hppF.reduce((s, i) => s + Number(i.nominal), 0);
  const sumKeuntunganPenjualan = jualF.reduce((s, i) => s + getJualProfit(i), 0);
  const laba = sumKeuntunganPenjualan;

  document.getElementById('lap-sum-beli').textContent = formatRupiah(sumBeli);
  const jualKotorEl = document.getElementById('lap-sum-jual-kotor');
  if (jualKotorEl) jualKotorEl.textContent = formatRupiah(sumJual);
  document.getElementById('lap-sum-jual').textContent = formatRupiah(sumKeuntunganPenjualan);
  document.getElementById('lap-sum-status').textContent = formatRupiah(sumStatus);
  document.getElementById('lap-sum-hpp').textContent = formatRupiah(sumHpp);
  const labaEl = document.getElementById('lap-sum-laba');
  labaEl.textContent = formatRupiah(laba);
  labaEl.className = `text-base font-extrabold mt-1 ${laba >= 0 ? 'text-indigo-700' : 'text-rose-600'}`;

  // Render report tables
  document.getElementById('lap-tbody-beli').innerHTML = beliF.length
    ? beliF.map((i, idx) => {
        const totalBeli = Number(i.jumlah) * Number(i.harga);
        const hargaJualVal = i.hargaJual !== undefined ? Number(i.hargaJual) : Number(i.harga);
        const totalJual = Number(i.jumlah) * hargaJualVal;
        return `
          <tr class="pdf-avoid-break">
            <td class="py-2 px-3">${idx + 1}</td>
            <td class="py-2 px-3 font-semibold">${escapeHtml(i.jenisBurung)}</td>
            <td class="py-2 px-3">${i.jumlah} ekor</td>
            <td class="py-2 px-3">${formatRupiah(i.harga)}</td>
            <td class="py-2 px-3 text-emerald-700 font-semibold">${formatRupiah(hargaJualVal)}</td>
            <td class="py-2 px-3 font-bold">${formatRupiah(totalBeli)}</td>
            <td class="py-2 px-3 font-bold text-emerald-700">${formatRupiah(totalJual)}</td>
            <td class="py-2 px-3 whitespace-nowrap">${formatTanggalIndo(i.tanggal)}</td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="8" class="py-4 text-center text-slate-400">Tidak ada data stok burung</td></tr>';

  document.getElementById('lap-tbody-jual').innerHTML = jualF.length
    ? jualF.map((i, idx) => {
        const diskon = Number(i.diskon || 0);
        const totalRow = getJualTotal(i);
        const keuntunganBersih = getJualProfit(i);
        return `
        <tr class="pdf-avoid-break">
          <td class="py-2 px-3">${idx + 1}</td>
          <td class="py-2 px-3 font-semibold">${escapeHtml(i.jenisBurung)}</td>
          <td class="py-2 px-3">${i.jumlah} ekor</td>
          <td class="py-2 px-3">${formatRupiah(i.harga)}</td>
          <td class="py-2 px-3 ${diskon > 0 ? 'text-rose-600 font-semibold' : 'text-slate-400'}">${diskon > 0 ? '-' + formatRupiah(diskon) : 'Rp 0'}</td>
          <td class="py-2 px-3 font-bold">${formatRupiah(totalRow)}</td>
          <td class="py-2 px-3 font-bold ${keuntunganBersih >= 0 ? 'text-emerald-700' : 'text-rose-600'}">${formatRupiah(keuntunganBersih)}</td>
          <td class="py-2 px-3">${formatTanggalIndo(i.tanggal)}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="8" class="py-4 text-center text-slate-400">Tidak ada data penjualan</td></tr>';

  document.getElementById('lap-tbody-status').innerHTML = statusF.length
    ? statusF.map((i, idx) => `
        <tr class="pdf-avoid-break">
          <td class="py-2 px-3">${idx + 1}</td>
          <td class="py-2 px-3 font-semibold">${escapeHtml(i.jenisBurung)}</td>
          <td class="py-2 px-3">${i.jumlah || 1} ekor</td>
          <td class="py-2 px-3">${escapeHtml(i.status)}</td>
          <td class="py-2 px-3 font-bold text-rose-600">${formatRupiah(i.totalHarga)}</td>
          <td class="py-2 px-3">${formatTanggalIndo(i.tanggal)}</td>
        </tr>`).join('')
    : '<tr><td colspan="6" class="py-4 text-center text-slate-400">Tidak ada data status burung</td></tr>';

  document.getElementById('lap-tbody-hpp').innerHTML = hppF.length
    ? hppF.map((i, idx) => `
        <tr class="pdf-avoid-break">
          <td class="py-2 px-3">${idx + 1}</td>
          <td class="py-2 px-3 font-semibold">${escapeHtml(i.kategori)}</td>
          <td class="py-2 px-3 font-bold">${formatRupiah(i.nominal)}</td>
          <td class="py-2 px-3">${formatTanggalIndo(i.tanggal)}</td>
        </tr>`).join('')
    : '<tr><td colspan="4" class="py-4 text-center text-slate-400">Tidak ada data HPP</td></tr>';

  renderLaporanCharts(sumBeli, sumJual, sumStatus, sumHpp, laba);
}

function renderLaporanCharts(sumBeli, sumJual, sumStatus, sumHpp, laba) {
  const ctxKeu = document.getElementById('chart-lap-keuangan')?.getContext('2d');
  const ctxKom = document.getElementById('chart-lap-komposisi')?.getContext('2d');
  if (!ctxKeu || !ctxKom) return;

  if (state.charts.lapKeuangan) state.charts.lapKeuangan.destroy();
  state.charts.lapKeuangan = new Chart(ctxKeu, {
    type: 'bar',
    data: {
      labels: ['Pembelian', 'Penjualan', 'Rugi Status', 'Biaya HPP', 'Laba/Keuntungan Bersih'],
      datasets: [{
        label: 'Nominal (Rp)',
        data: [sumBeli, sumJual, sumStatus, sumHpp, laba],
        backgroundColor: [
          'rgba(99, 102, 241, 0.85)',
          'rgba(16, 185, 129, 0.85)',
          'rgba(244, 63, 94, 0.85)',
          'rgba(245, 158, 11, 0.85)',
          laba >= 0 ? 'rgba(6, 182, 212, 0.85)' : 'rgba(225, 29, 72, 0.85)',
        ],
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => formatRupiah(ctx.parsed.y)
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: val => 'Rp ' + Number(val).toLocaleString('id-ID'),
            font: { size: 10 }
          },
          grid: { color: '#e2e8f0' }
        },
        x: {
          ticks: { font: { size: 10 } },
          grid: { display: false }
        }
      }
    }
  });

  const hasData = (sumBeli + sumJual + sumStatus + sumHpp) > 0;
  if (state.charts.lapKomposisi) state.charts.lapKomposisi.destroy();
  state.charts.lapKomposisi = new Chart(ctxKom, {
    type: 'doughnut',
    data: {
      labels: hasData ? ['Penjualan', 'Pembelian', 'Kerugian Status', 'Biaya HPP'] : ['Belum Ada Data'],
      datasets: [{
        data: hasData ? [sumJual, sumBeli, sumStatus, sumHpp] : [1],
        backgroundColor: hasData
          ? ['#10b981', '#6366f1', '#f43f5e', '#f59e0b']
          : ['#e2e8f0'],
        borderWidth: 2,
        borderColor: '#ffffff',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: ctx => hasData ? `${ctx.label}: ${formatRupiah(ctx.parsed)}` : 'Belum ada transaksi'
          }
        }
      }
    }
  });
}

function exportReportPDF() {
  renderLaporan();
  const element = document.getElementById('laporan-print-area');
  const btn = document.getElementById('btn-export-pdf');
  const origText = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = '<span>Memproses PDF...</span>';

  const start = (document.getElementById('lap-date-start')?.value || '').trim().slice(0, 10);
  const end = (document.getElementById('lap-date-end')?.value || '').trim().slice(0, 10);
  const dateTag = (start && end)
    ? `${start}_sd_${end}`
    : (start || end || getIsoDateOffset(0));

  const opt = {
    margin: [10, 10, 10, 10],
    filename: `Laporan-Ethereum-Bird-${dateTag}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
  };

  html2pdf().set(opt).from(element).save()
    .then(() => {
      showToast('PDF Laporan berhasil diunduh!', 'success');
    })
    .catch(() => {
      showToast('Gagal membuat PDF. Silakan coba lagi.', 'error');
    })
    .finally(() => {
      btn.disabled = false;
      btn.innerHTML = origText;
    });
}

// ==================== SUPABASE CONFIG & STATUS ====================
function openSettingsView() {
  if (!requireAuth()) return;
  switchMenu('pengaturan');
}

const DEFAULT_SUPABASE_CONFIG = {
  url: 'https://sxkkcsuwyvqxedjuxxyr.supabase.co',
  key: 'sb_publishable_FPNgcH_nllKMyBAboTZN0w_P1-J62lW',
};

function getSupabaseConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.SUPABASE_CONFIG) || 'null');
    if (saved && saved.url && saved.key) return saved;
  } catch {
    // ignore parse error
  }
  return { ...DEFAULT_SUPABASE_CONFIG };
}

function formatShortDateTime(dateObj) {
  const bulanShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const dd = dateObj.getDate();
  const mmm = bulanShort[dateObj.getMonth()];
  const yyyy = dateObj.getFullYear();
  const hh = String(dateObj.getHours()).padStart(2, '0');
  const min = String(dateObj.getMinutes()).padStart(2, '0');
  return `${dd} ${mmm} ${yyyy}, ${hh}.${min}`;
}

function updateSupabaseStatusUI({ online, latencyMs, lastCheckText, message }) {
  const pill = document.getElementById('sb-status-pill');
  const cardStatus = document.getElementById('sb-card-status');
  const cardStatusSub = document.getElementById('sb-card-status-sub');
  const cardStatusIcon = document.getElementById('sb-card-status-icon');
  const cardLatency = document.getElementById('sb-card-latency');
  const cardLastCheck = document.getElementById('sb-card-lastcheck');
  const cardMode = document.getElementById('sb-card-mode');
  const cardModeSub = document.getElementById('sb-card-mode-sub');

  if (!pill) return;

  if (online) {
    pill.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200';
    pill.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span><span>TERHUBUNG (ONLINE)</span>';

    cardStatus.textContent = 'Terhubung Penuh (Online)';
    cardStatus.className = 'text-base sm:text-lg font-extrabold text-emerald-600 mt-1.5';
    cardStatusSub.textContent = message || 'Auth API Aktif • Tabel Database Siap';
    cardStatusIcon.className = 'w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0';

    cardMode.textContent = 'PostgreSQL Cloud';
    cardModeSub.textContent = 'Dual-Sync + Local Cache';
  } else {
    pill.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200';
    pill.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span><span>BELUM TERHUBUNG</span>';

    cardStatus.textContent = 'Mode Lokal (Offline)';
    cardStatus.className = 'text-base sm:text-lg font-extrabold text-slate-700 mt-1.5';
    cardStatusSub.textContent = message || 'Isi URL & API Key untuk menghubungkan ke Supabase';
    cardStatusIcon.className = 'w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0';

    cardMode.textContent = 'LocalStorage Browser';
    cardModeSub.textContent = 'Penyimpanan Lokal Browser';
  }

  cardLatency.textContent = latencyMs !== null && latencyMs !== undefined ? `${latencyMs} ms` : '- ms';
  cardLastCheck.textContent = lastCheckText || formatShortDateTime(new Date());
}

function renderSupabaseSettings() {
  const cfg = getSupabaseConfig();
  const urlEl = document.getElementById('sb-url');
  const keyEl = document.getElementById('sb-key');
  if (urlEl) urlEl.value = cfg.url || '';
  if (keyEl) keyEl.value = cfg.key || '';

  if (cfg.url && cfg.key) {
    checkSupabaseConnection(false);
  } else {
    updateSupabaseStatusUI({
      online: false,
      latencyMs: null,
      lastCheckText: formatShortDateTime(new Date()),
      message: 'Isi URL & API Key untuk menghubungkan ke Supabase',
    });
  }
}

function toggleSbKeyVisibility() {
  const input = document.getElementById('sb-key');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function checkSupabaseConnection(showFeedback = true) {
  const cfg = getSupabaseConfig();
  const url = (document.getElementById('sb-url')?.value || cfg.url || '').trim().replace(/\/+$/, '');
  const key = (document.getElementById('sb-key')?.value || cfg.key || '').trim();
  const btn = document.getElementById('btn-sb-refresh');

  if (!url || !key) {
    updateSupabaseStatusUI({
      online: false,
      latencyMs: null,
      lastCheckText: formatShortDateTime(new Date()),
      message: 'Isi URL & API Key untuk menghubungkan ke Supabase',
    });
    if (showFeedback) showToast('Masukkan Supabase Project URL dan API Key terlebih dahulu.', 'warning');
    return;
  }

  if (btn) btn.disabled = true;
  const start = performance.now();
  try {
    const headers = { apikey: key };
    if (key.startsWith('eyJ')) {
      headers.Authorization = `Bearer ${key}`;
    }

    const authRes = await fetch(`${url}/auth/v1/settings`, {
      method: 'GET',
      headers,
    });
    const latency = Math.max(1, Math.round(performance.now() - start));
    const nowText = formatShortDateTime(new Date());

    if (authRes.ok) {
      const tableRes = await fetch(`${url}/rest/v1/stok_burung?select=id&limit=1`, {
        method: 'GET',
        headers,
      });
      const tableReady = tableRes.ok;

      updateSupabaseStatusUI({
        online: true,
        latencyMs: latency,
        lastCheckText: nowText,
        message: tableReady
          ? 'Auth API Aktif • Tabel Database Siap'
          : 'Auth API Aktif • Jalankan supabase_schema.sql di SQL Editor',
      });
      if (showFeedback) {
        showToast(
          tableReady
            ? `Terhubung ke Supabase (${latency} ms)`
            : `Terhubung (${latency} ms), namun tabel belum dibuat. Jalankan supabase_schema.sql di SQL Editor Supabase.`,
          tableReady ? 'success' : 'warning'
        );
      }
    } else if (authRes.status === 401 || authRes.status === 403 || authRes.status === 404) {
      updateSupabaseStatusUI({
        online: false,
        latencyMs: latency,
        lastCheckText: nowText,
        message: 'URL terjangkau, periksa kembali API Key Anda',
      });
      if (showFeedback) {
        showToast('API Key tidak valid. Gunakan Publishable / Anon Key.', 'warning');
      }
    } else {
      throw new Error(`HTTP ${authRes.status}`);
    }
  } catch {
    updateSupabaseStatusUI({
      online: false,
      latencyMs: null,
      lastCheckText: formatShortDateTime(new Date()),
      message: 'Gagal terhubung ke server Supabase. Periksa URL/koneksi.',
    });
    if (showFeedback) showToast('Gagal terhubung ke Supabase. Periksa URL atau jaringan.', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function saveSupabaseConfig(e) {
  e.preventDefault();
  if (!requireAuth()) return;
  const url = (document.getElementById('sb-url')?.value || '').trim().replace(/\/+$/, '');
  const key = (document.getElementById('sb-key')?.value || '').trim();

  if (!url || !key) {
    showToast('URL dan API Key Supabase wajib diisi.', 'warning');
    return;
  }

  localStorage.setItem(STORAGE_KEYS.SUPABASE_CONFIG, JSON.stringify({ url, key }));
  showToast('Kredensial Supabase disimpan. Menguji koneksi...', 'info');
  checkSupabaseConnection(true);
  initSupabaseClient();
}

function resetSupabaseConfig() {
  if (!requireAuth()) return;
  localStorage.removeItem(STORAGE_KEYS.SUPABASE_CONFIG);
  const urlEl = document.getElementById('sb-url');
  const keyEl = document.getElementById('sb-key');
  if (urlEl) urlEl.value = DEFAULT_SUPABASE_CONFIG.url;
  if (keyEl) keyEl.value = DEFAULT_SUPABASE_CONFIG.key;
  showToast('Konfigurasi Supabase dikembalikan ke default.', 'info');
  checkSupabaseConnection(false);
  initSupabaseClient();
}

// ==================== SUPABASE SYNC & REALTIME ====================
let sbClient = null;
let sbRealtimeChannel = null;

const SB_TABLE_MAP = {
  beli: 'stok_burung',
  jual: 'burung_terjual',
  status: 'status_burung',
  hpp: 'hpp',
};

const SB_REVERSE_MAP = {
  stok_burung: 'beli',
  burung_terjual: 'jual',
  status_burung: 'status',
  hpp: 'hpp',
};

function toDbRow(type, obj) {
  if (type === 'beli') {
    return {
      id: obj.id,
      jenis_burung: obj.jenisBurung,
      jumlah: Number(obj.jumlah || 0),
      harga_beli: Number(obj.harga || 0),
      harga_jual: Number(obj.hargaJual || 0),
      tanggal: obj.tanggal,
    };
  }
  if (type === 'jual') {
    return {
      id: obj.id,
      jenis_burung: obj.jenisBurung,
      jumlah: Number(obj.jumlah || 0),
      harga_jual: Number(obj.harga || 0),
      diskon: Number(obj.diskon || 0),
      tanggal: obj.tanggal,
    };
  }
  if (type === 'status') {
    return {
      id: obj.id,
      jenis_burung: obj.jenisBurung,
      jumlah: Number(obj.jumlah || 0),
      status: obj.status,
      total_harga: Number(obj.totalHarga || 0),
      tanggal: obj.tanggal,
    };
  }
  return {
    id: obj.id,
    kategori: obj.kategori,
    nominal: Number(obj.nominal || 0),
    tanggal: obj.tanggal,
  };
}

function fromDbRow(type, row) {
  if (type === 'beli') {
    return {
      id: row.id,
      jenisBurung: row.jenis_burung,
      jumlah: Number(row.jumlah || 0),
      harga: Number(row.harga_beli || 0),
      hargaJual: Number(row.harga_jual || 0),
      tanggal: row.tanggal,
    };
  }
  if (type === 'jual') {
    return {
      id: row.id,
      jenisBurung: row.jenis_burung,
      jumlah: Number(row.jumlah || 0),
      harga: Number(row.harga_jual || 0),
      diskon: Number(row.diskon || 0),
      tanggal: row.tanggal,
    };
  }
  if (type === 'status') {
    return {
      id: row.id,
      jenisBurung: row.jenis_burung,
      jumlah: Number(row.jumlah || 0),
      status: row.status,
      totalHarga: Number(row.total_harga || 0),
      tanggal: row.tanggal,
    };
  }
  return {
    id: row.id,
    kategori: row.kategori,
    nominal: Number(row.nominal || 0),
    tanggal: row.tanggal,
  };
}

async function initSupabaseClient() {
  if (sbRealtimeChannel && sbClient) {
    sbClient.removeChannel(sbRealtimeChannel);
    sbRealtimeChannel = null;
  }

  const cfg = getSupabaseConfig();

  if (!cfg || !cfg.url || !cfg.key || !window.supabase?.createClient) {
    sbClient = null;
    return;
  }

  sbClient = window.supabase.createClient(cfg.url, cfg.key);
  await syncAllFromSupabase();
  subscribeSupabaseRealtime();
}

async function syncAllFromSupabase() {
  if (!sbClient) return;
  const types = Object.keys(SB_TABLE_MAP);
  try {
    const results = await Promise.all(
      types.map(type =>
        sbClient
          .from(SB_TABLE_MAP[type])
          .select('*')
          .order('created_at', { ascending: false })
      )
    );

    let updated = false;
    results.forEach((res, idx) => {
      const type = types[idx];
      if (!res.error && Array.isArray(res.data)) {
        state[type] = res.data.map(row => fromDbRow(type, row));
        saveTableToStorage(type);
        updated = true;
      } else if (res.error) {
        console.warn(`Supabase sync error (${SB_TABLE_MAP[type]}):`, res.error.message);
      }
    });

    if (updated) {
      refreshAllViews();
    }
  } catch (err) {
    console.warn('Gagal sinkronisasi awal dari Supabase:', err);
  }
}

function subscribeSupabaseRealtime() {
  if (!sbClient) return;
  if (sbRealtimeChannel) {
    sbClient.removeChannel(sbRealtimeChannel);
    sbRealtimeChannel = null;
  }

  const channel = sbClient.channel('ethereum-bird-realtime');

  Object.keys(SB_REVERSE_MAP).forEach(tableName => {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: tableName },
      payload => {
        const type = SB_REVERSE_MAP[tableName];
        if (!type) return;

        if (payload.eventType === 'INSERT' && payload.new) {
          const item = fromDbRow(type, payload.new);
          const idx = state[type].findIndex(x => x.id === item.id);
          if (idx === -1) {
            state[type].unshift(item);
          } else {
            state[type][idx] = item;
          }
        } else if (payload.eventType === 'UPDATE' && payload.new) {
          const item = fromDbRow(type, payload.new);
          const idx = state[type].findIndex(x => x.id === item.id);
          if (idx !== -1) {
            state[type][idx] = item;
          } else {
            state[type].unshift(item);
          }
        } else if (payload.eventType === 'DELETE' && payload.old) {
          const deletedId = payload.old.id;
          state[type] = state[type].filter(x => x.id !== deletedId);
          state.selected[type].delete(deletedId);
        }

        saveTableToStorage(type);
        refreshAllViews();
      }
    );
  });

  channel.subscribe();
  sbRealtimeChannel = channel;
}

async function sbUpsertRow(type, obj) {
  return sbUpsertRows(type, [obj]);
}

async function sbUpsertRows(type, objs) {
  if (!sbClient || !SB_TABLE_MAP[type] || !objs || objs.length === 0) return;
  try {
    const { error } = await sbClient
      .from(SB_TABLE_MAP[type])
      .upsert(objs.map(obj => toDbRow(type, obj)), { onConflict: 'id' });
    if (error) {
      console.warn(`Supabase upsert error (${SB_TABLE_MAP[type]}):`, error.message);
      showToast('Tersimpan lokal, gagal sinkron ke Supabase.', 'warning');
    }
  } catch (err) {
    console.warn('Supabase upsert exception:', err);
  }
}

async function sbDeleteRows(type, ids) {
  if (!sbClient || !SB_TABLE_MAP[type] || !ids || ids.length === 0) return;
  try {
    const { error } = await sbClient
      .from(SB_TABLE_MAP[type])
      .delete()
      .in('id', ids);
    if (error) {
      console.warn(`Supabase delete error (${SB_TABLE_MAP[type]}):`, error.message);
      showToast('Terhapus lokal, gagal hapus di Supabase.', 'warning');
    }
  } catch (err) {
    console.warn('Supabase delete exception:', err);
  }
}

async function sbClearAll() {
  if (!sbClient) return;
  try {
    await Promise.all(
      Object.values(SB_TABLE_MAP).map(table =>
        sbClient.from(table).delete().neq('id', '')
      )
    );
  } catch (err) {
    console.warn('Supabase clear all exception:', err);
  }
}

// ==================== GLOBAL REFRESH & INIT ====================
function refreshAllViews() {
  renderAuthUI();
  populateBirdSelects();
  renderDashboard();
  renderTable('beli');
  renderTable('jual');
  renderTable('status');
  renderTable('hpp');
  renderLaporan();
}

document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  applyDesktopSidebarState();
  refreshAllViews();
  switchMenu('dashboard');
  initSupabaseClient();
});

