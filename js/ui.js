/**
 * Komponen UI bersama: ikon, toast, modal, konfirmasi, animasi angka, reveal, dan tabel data generik.
 */
window.TB = window.TB || {};

TB.ui = (() => {
  const U = TB.utils;
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = U.escapeHtml;

  /* ---------- Ikon (Lucide) ---------- */
  const icon = (name, cls = '') => `<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
  function refreshIcons(root) {
    if (window.lucide) window.lucide.createIcons(root ? { nameAttr: 'data-lucide', root } : undefined);
  }

  /* ---------- Toast ---------- */
  function toast(message, type = 'success') {
    const host = $('#toast-root');
    if (!host) return;
    const icons = { success: 'check-circle-2', error: 'alert-circle', info: 'info' };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `${icon(icons[type] || 'info')}<span>${esc(message)}</span>`;
    host.appendChild(el);
    refreshIcons(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, type === 'error' ? 5000 : 3200);
  }

  /* ---------- Modal ---------- */
  let activeModal = null;
  let lastFocus = null;
  let modalCloseCb = null;

  function openModal({ title, body, size = '', onClose }) {
    closeModal(true);
    lastFocus = document.activeElement;
    modalCloseCb = onClose || null;
    const root = $('#modal-root');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-head">
          <h2 id="modal-title">${esc(title)}</h2>
          <button type="button" class="icon-btn" data-modal-close aria-label="Tutup">${icon('x')}</button>
        </div>
        <div class="modal-body">${body}</div>
      </div>`;
    root.appendChild(overlay);
    activeModal = overlay;
    document.body.classList.add('modal-open');
    refreshIcons(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    const first = overlay.querySelector('input:not([type=hidden]), select, textarea, button.btn');
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 60);
    return overlay;
  }
  function closeModal(immediate = false) {
    if (!activeModal) return;
    const el = activeModal;
    activeModal = null;
    document.body.classList.remove('modal-open');
    el.classList.remove('show');
    setTimeout(() => el.remove(), immediate ? 0 : 220);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    const cb = modalCloseCb;
    modalCloseCb = null;
    if (cb) cb();
  }
  const getModal = () => activeModal;

  /** Dialog konfirmasi berbasis Promise (dipakai sebelum menghapus). */
  function confirmDialog({ title, message, confirmText = 'Ya, lanjutkan', danger = true }) {
    return new Promise((resolve) => {
      let decided = false;
      const done = (v) => { if (!decided) { decided = true; resolve(v); } };
      const overlay = openModal({
        title,
        size: 'modal-sm',
        onClose: () => done(false),
        body: `
          <div class="confirm">
            <div class="confirm-icon ${danger ? 'danger' : ''}">${icon(danger ? 'trash-2' : 'help-circle')}</div>
            <p>${message}</p>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-modal-close>Batal</button>
            <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm-ok>${esc(confirmText)}</button>
          </div>`
      });
      overlay.querySelector('[data-confirm-ok]').addEventListener('click', () => { done(true); closeModal(); });
    });
  }

  /* ---------- Animasi ---------- */
  function animateCounters(root = document) {
    root.querySelectorAll('[data-count]').forEach((el) => {
      const target = Number(el.dataset.count) || 0;
      const money = el.dataset.format === 'rupiah';
      const fmt = (v) => (money ? U.formatRupiah(v) : U.formatNumber(v));
      if (U.prefersReducedMotion() || target === 0) { el.textContent = fmt(target); return; }
      const duration = 800;
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / duration);
        el.textContent = fmt(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = fmt(target);
      };
      requestAnimationFrame(step);
    });
  }

  let revealObserver = null;
  function observeReveals(root = document) {
    const items = root.querySelectorAll('.reveal:not(.in)');
    if (!('IntersectionObserver' in window) || U.prefersReducedMotion()) {
      items.forEach((el) => el.classList.add('in'));
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { e.target.classList.add('in'); revealObserver.unobserve(e.target); }
        });
      }, { threshold: 0.08 });
    }
    items.forEach((el, i) => {
      el.style.setProperty('--reveal-delay', `${Math.min(i, 8) * 45}ms`);
      revealObserver.observe(el);
    });
  }

  /* ---------- Skeleton & empty state ---------- */
  const skeletonPage = () => `
    <div class="skeleton-page" aria-busy="true" aria-label="Memuat data">
      <div class="sk sk-title"></div>
      <div class="stat-grid">${'<div class="sk sk-card"></div>'.repeat(4)}</div>
      <div class="sk sk-block"></div>
    </div>`;
  const emptyState = (iconName, title, text, extra = '') => `
    <div class="empty-state">
      <div class="empty-illus">${icon(iconName)}</div>
      <h3>${esc(title)}</h3>
      <p>${esc(text)}</p>
      ${extra}
    </div>`;

  /* ---------- Tabel data generik (cari, urut, filter, pagination) ---------- */
  const registry = {};
  const tableState = {};

  /**
   * def: { columns: () => [{key,label,sortable,align,className,sortValue(row),render(row,index)}],
   *        getRows: () => [], search: row => string, filter: (row, filters) => bool,
   *        pageSize, defaultSort: {key,dir}, empty: {icon,title,text} }
   */
  function registerTable(id, def) {
    registry[id] = def;
    if (!tableState[id]) {
      tableState[id] = { search: '', page: 1, filters: {}, sortKey: def.defaultSort?.key, sortDir: def.defaultSort?.dir || 'asc', selected: new Set() };
    } else if (!tableState[id].selected) {
      tableState[id].selected = new Set();
    }
  }
  const getTableState = (id) => tableState[id];
  const getTableSelected = (id) => Array.from(tableState[id]?.selected || []);
  const clearTableSelection = (id) => {
    if (tableState[id]?.selected) tableState[id].selected.clear();
    refreshTable(id);
  };

  function processRows(id) {
    const def = registry[id];
    const st = tableState[id];
    let rows = def.getRows();
    if (def.filter) rows = rows.filter((r) => def.filter(r, st.filters));
    const q = st.search.trim().toLowerCase();
    if (q && def.search) rows = rows.filter((r) => def.search(r).toLowerCase().includes(q));
    const col = def.columns().find((c) => c.key === st.sortKey);
    if (col) {
      const val = col.sortValue || ((r) => r[col.key]);
      const dir = st.sortDir === 'desc' ? -1 : 1;
      rows = [...rows].sort((a, b) => {
        const x = val(a), y = val(b);
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
        return String(x ?? '').localeCompare(String(y ?? ''), 'id', { numeric: true }) * dir;
      });
    }
    return rows;
  }

  function tableHTML(id) {
    const def = registry[id];
    const st = tableState[id];
    const rows = processRows(id);
    const pageSize = def.pageSize || 10;
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    st.page = Math.min(Math.max(1, st.page), pages);
    const offset = (st.page - 1) * pageSize;
    const slice = rows.slice(offset, offset + pageSize);
    const cols = def.columns();

    if (!rows.length) {
      const e = def.empty || { icon: 'inbox', title: 'Belum ada data', text: 'Data akan tampil di sini.' };
      const filtered = st.search || Object.values(st.filters).some(Boolean);
      return filtered
        ? emptyState('search-x', 'Data tidak ditemukan', 'Coba ubah kata kunci pencarian atau filter yang digunakan.')
        : emptyState(e.icon, e.title, e.text);
    }

    const from = offset + 1;
    const to = Math.min(offset + pageSize, rows.length);
    const pager = pages > 1 ? `
      <div class="pager" role="navigation" aria-label="Halaman data">
        <button type="button" class="icon-btn" data-table-page="${id}" data-page="${st.page - 1}" ${st.page === 1 ? 'disabled' : ''} aria-label="Halaman sebelumnya">${icon('chevron-left')}</button>
        <span class="pager-info">Hal. ${st.page} / ${pages}</span>
        <button type="button" class="icon-btn" data-table-page="${id}" data-page="${st.page + 1}" ${st.page === pages ? 'disabled' : ''} aria-label="Halaman berikutnya">${icon('chevron-right')}</button>
      </div>` : '';

    if (typeof def.cardRender === 'function') {
      const cards = slice.map((r, i) => def.cardRender(r, offset + i)).join('');
      return `
        <div class="bird-card-grid">${cards}</div>
        <div class="table-foot"><span class="muted">Menampilkan ${from}–${to} dari ${U.formatNumber(rows.length)} stok burung</span>${pager}</div>`;
    }

    const selectable = !!def.selectable && !!TB.auth?.isAdmin?.();
    const selected = st.selected || new Set();
    st.selected = selected;
    const validIds = new Set(rows.map((r) => r.id));
    for (const sid of selected) { if (!validIds.has(sid)) selected.delete(sid); }

    const isAllSelected = slice.length > 0 && slice.every((r) => selected.has(r.id));

    const headCells = cols.map((c) => {
      const active = st.sortKey === c.key;
      const aria = active ? (st.sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
      const inner = c.sortable
        ? `<button type="button" class="th-sort" data-table-sort="${id}" data-key="${c.key}">${esc(c.label)}${icon(active ? (st.sortDir === 'asc' ? 'arrow-up' : 'arrow-down') : 'chevrons-up-down', 'sort-icon')}</button>`
        : esc(c.label);
      return `<th scope="col" class="${c.align ? 'ta-' + c.align : ''}" aria-sort="${aria}">${inner}</th>`;
    });

    const head = selectable
      ? `<th scope="col" class="th-cb"><label class="cb-wrap" title="Pilih semua di halaman ini"><input type="checkbox" data-table-select-all="${id}" ${isAllSelected ? 'checked' : ''} aria-label="Pilih semua baris" /></label></th>` + headCells.join('')
      : headCells.join('');

    const body = slice.map((r, i) => {
      const rowSelected = selectable && selected.has(r.id);
      const cbCell = selectable
        ? `<td class="td-cb"><label class="cb-wrap"><input type="checkbox" data-table-select-row="${id}" data-id="${esc(r.id)}" ${rowSelected ? 'checked' : ''} aria-label="Pilih baris" /></label></td>`
        : '';
      const cells = cols.map((c) => `<td class="${c.align ? 'ta-' + c.align : ''} ${c.className || ''}" data-label="${esc(c.label)}">${c.render(r, offset + i)}</td>`).join('');
      return `<tr class="${rowSelected ? 'row-selected' : ''}">${cbCell}${cells}</tr>`;
    }).join('');

    const bulkBar = (selectable && selected.size > 0) ? `
      <div class="table-bulk-bar reveal in">
        <div class="bulk-info">
          ${icon('check-square')}
          <span><strong>${selected.size}</strong> data dipilih</span>
        </div>
        <div class="bulk-actions">
          <button type="button" class="btn btn-danger btn-sm" data-action="bulk-delete-${id}">
            ${icon('trash-2')}<span>Hapus yang dipilih (${selected.size})</span>
          </button>
          <button type="button" class="btn btn-ghost btn-sm" data-table-clear-select="${id}">Batal</button>
        </div>
      </div>` : '';

    return `
      ${bulkBar}
      <div class="table-wrap"><table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
      <div class="table-foot"><span class="muted">Menampilkan ${from}–${to} dari ${U.formatNumber(rows.length)} data</span>${pager}</div>`;
  }

  function refreshTable(id) {
    const host = document.querySelector(`[data-table-body="${id}"]`);
    if (!host) return;
    host.innerHTML = tableHTML(id);
    refreshIcons(host);
  }
  const tableHost = (id) => `<div class="table-host" data-table-body="${id}">${tableHTML(id)}</div>`;

  /** Mengelola klik urut/halaman, input pencarian, dan filter secara delegasi. */
  function bindTableEvents(root) {
    root.addEventListener('click', (e) => {
      const clearBtn = e.target.closest('[data-table-clear-select]');
      if (clearBtn) {
        const id = clearBtn.dataset.tableClearSelect;
        if (tableState[id]) {
          tableState[id].selected.clear();
          refreshTable(id);
        }
        return;
      }
      const sortBtn = e.target.closest('[data-table-sort]');
      if (sortBtn) {
        const id = sortBtn.dataset.tableSort;
        const st = tableState[id];
        const key = sortBtn.dataset.key;
        if (st.sortKey === key) st.sortDir = st.sortDir === 'asc' ? 'desc' : 'asc';
        else { st.sortKey = key; st.sortDir = 'asc'; }
        st.page = 1;
        refreshTable(id);
        return;
      }
      const pageBtn = e.target.closest('[data-table-page]');
      if (pageBtn && !pageBtn.disabled) {
        const id = pageBtn.dataset.tablePage;
        tableState[id].page = Number(pageBtn.dataset.page);
        refreshTable(id);
      }
    });
    root.addEventListener('input', U.debounce((e) => {
      const input = e.target.closest('[data-table-search]');
      if (!input) return;
      const id = input.dataset.tableSearch;
      tableState[id].search = input.value;
      tableState[id].page = 1;
      refreshTable(id);
    }, 180));
    root.addEventListener('change', (e) => {
      const allCb = e.target.closest('[data-table-select-all]');
      if (allCb) {
        const id = allCb.dataset.tableSelectAll;
        const st = tableState[id];
        const def = registry[id];
        const rows = processRows(id);
        const pageSize = def.pageSize || 10;
        const offset = (st.page - 1) * pageSize;
        const slice = rows.slice(offset, offset + pageSize);
        if (allCb.checked) slice.forEach((r) => st.selected.add(r.id));
        else slice.forEach((r) => st.selected.delete(r.id));
        refreshTable(id);
        return;
      }
      const rowCb = e.target.closest('[data-table-select-row]');
      if (rowCb) {
        const id = rowCb.dataset.tableSelectRow;
        const st = tableState[id];
        const rowId = rowCb.dataset.id;
        if (rowCb.checked) st.selected.add(rowId);
        else st.selected.delete(rowId);
        refreshTable(id);
        return;
      }
      const sel = e.target.closest('[data-table-filter]');
      if (sel) {
        const id = sel.dataset.tableFilter;
        tableState[id].filters[sel.dataset.filterKey] = sel.value;
        tableState[id].page = 1;
        refreshTable(id);
        return;
      }
      const sortSel = e.target.closest('[data-table-sort-select]');
      if (sortSel) {
        const id = sortSel.dataset.tableSortSelect;
        const [key, dir] = sortSel.value.split(':');
        tableState[id].sortKey = key;
        tableState[id].sortDir = dir || 'asc';
        tableState[id].page = 1;
        refreshTable(id);
      }
    });
  }

  return {
    $, icon, refreshIcons, toast, openModal, closeModal, getModal, confirmDialog,
    animateCounters, observeReveals, skeletonPage, emptyState,
    registerTable, getTableState, getTableSelected, clearTableSelection, tableHost, refreshTable, bindTableEvents, processRows
  };
})();
