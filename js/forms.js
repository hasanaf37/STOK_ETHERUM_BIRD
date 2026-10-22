/**
 * Form administratif (modal) dan aksi hapus. Setiap fungsi memeriksa hak akses admin
 * dan store melakukan pemeriksaan ulang sebelum data diubah.
 */
window.TB = window.TB || {};

TB.forms = (() => {
  const U = TB.utils;
  const UI = TB.ui;
  const esc = U.escapeHtml;
  const cfg = TB.config;

  const field = (label, name, { type = 'text', value = '', required = true, attrs = '', hint = '', full = false } = {}) => `
    <div class="field ${full ? 'full' : ''}">
      <label for="f-${name}">${esc(label)}${required ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>
      <input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''} ${attrs} />
      ${hint ? `<small class="muted">${hint}</small>` : ''}
    </div>`;
  const selectField = (label, name, options, selected, { required = true, full = false } = {}) => `
    <div class="field ${full ? 'full' : ''}">
      <label for="f-${name}">${esc(label)}${required ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>
      <select id="f-${name}" name="${name}" ${required ? 'required' : ''}>
        ${options.map(([v, l, extra = '']) => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''} ${extra}>${esc(l)}</option>`).join('')}
      </select>
    </div>`;
  const formShell = (kind, id, fields, submitLabel) => `
    <form data-form="${kind}" data-id="${esc(id || '')}" novalidate>
      <div class="form-grid">${fields}</div>
      <div class="form-error" role="alert" hidden></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-modal-close>Batal</button>
        <button type="submit" class="btn btn-primary"><span class="spinner" hidden></span><span class="btn-label">${esc(submitLabel)}</span></button>
      </div>
    </form>`;

  /** Membungkus pembukaan form dengan pemeriksaan hak akses. */
  function guarded(fn) {
    return (...args) => {
      try {
        TB.auth.requireAdmin();
        fn(...args);
      } catch (e) {
        UI.toast(e.message, 'error');
      }
    };
  }

  const today = () => U.todayISO();
  const sortedBirds = () => [...TB.store.get().birds].sort((a, b) => a.nama.localeCompare(b.nama, 'id'));

  /* ---------- Stok Burung ---------- */
  const openBirdForm = guarded((id) => {
    const b = id ? TB.store.getBird(id) : null;
    if (id && !b) throw new Error('Data stok burung tidak ditemukan.');
    const cats = [...new Set([...cfg.categories, ...(b ? [b.kategori] : [])])];
    const customFoto = b?.foto && !b.foto.startsWith('data:image/svg+xml') ? b.foto : '';
    const fields = `
      ${field('Nama burung', 'nama', { value: b?.nama, attrs: 'maxlength="80"', full: true })}
      <div class="field">
        <label for="f-kategori">Jenis / kategori burung <span class="req" aria-hidden="true">*</span></label>
        <input id="f-kategori" name="kategori" list="dl-kategori" value="${esc(b?.kategori || '')}" maxlength="40" required />
        <datalist id="dl-kategori">${cats.map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>
      </div>
      ${field('Asal burung', 'asal', { value: b?.asal, attrs: 'maxlength="80"' })}
      <div class="field full">
        <label for="f-keterangan">Keterangan burung</label>
        <textarea id="f-keterangan" name="keterangan" rows="2" maxlength="240" placeholder="Deskripsi ciri fisik, kualitas kicauan, usia/ring, atau kondisi burung…">${esc(b?.keterangan || '')}</textarea>
      </div>
      ${field('Tanggal masuk', 'tanggalMasuk', { type: 'date', value: b?.tanggalMasuk || today(), attrs: `max="${today()}"` })}
      ${field('Batas stok menipis (ekor)', 'minStok', { type: 'number', value: b?.minStok ?? 5, attrs: 'min="0" step="1" inputmode="numeric"' })}
      ${field('Harga beli (Rp)', 'hargaBeli', { type: 'number', value: b?.hargaBeli ?? '', attrs: 'min="1" step="1" inputmode="numeric"' })}
      ${field('Harga jual (Rp)', 'hargaJual', { type: 'number', value: b?.hargaJual ?? '', attrs: 'min="1" step="1" inputmode="numeric"' })}
      ${b ? `<div class="field full"><label>Stok saat ini</label><p class="static-value">${TB.store.stockOf(b.id)} ekor <small class="muted">— diubah lewat menu Burung Datang / Burung Terjual</small></p></div>`
          : field('Jumlah / stok awal (ekor)', 'stokAwal', { type: 'number', value: 1, required: false, attrs: 'min="0" step="1" inputmode="numeric"', hint: 'Stok awal otomatis dicatat sebagai burung datang.', full: true })}
      ${field('URL gambar burung (opsional)', 'foto', { type: 'url', value: customFoto, required: false, attrs: 'maxlength="500" placeholder="Kosongkan untuk memakai ilustrasi bawaan atau isi https://…"', full: true })}`;
    UI.openModal({ title: b ? 'Edit stok burung' : 'Tambah stok burung', body: formShell('bird', id, fields, b ? 'Simpan perubahan' : 'Tambah stok burung') });
  });

  /* ---------- Burung datang ---------- */
  const openArrivalForm = guarded((id) => {
    const a = id ? TB.store.get().arrivals.find((x) => x.id === id) : null;
    if (id && !a) throw new Error('Catatan burung datang tidak ditemukan.');
    const birds = sortedBirds();
    if (!birds.length) throw new Error('Tambahkan data burung terlebih dahulu di menu Data Burung.');
    const first = TB.store.getBird(a?.birdId) || birds[0];
    const fields = `
      ${field('Tanggal masuk', 'tanggal', { type: 'date', value: a?.tanggal || today(), attrs: `max="${today()}"` })}
      ${selectField('Nama burung', 'birdId', birds.map((b) => [b.id, `${b.nama} (${b.kategori})`]), first.id)}
      ${field('Jumlah (ekor)', 'jumlah', { type: 'number', value: a?.jumlah ?? 1, attrs: 'min="1" step="1" inputmode="numeric"' })}
      ${field('Harga beli per ekor (Rp)', 'hargaBeli', { type: 'number', value: a?.hargaBeli ?? first.hargaBeli, attrs: 'min="1" step="1" inputmode="numeric"' })}
      <div class="field full"><label>Total biaya pembelian</label><p class="static-value" data-total>Rp0</p></div>
      ${field('Asal pemasok', 'pemasok', { value: a?.pemasok, attrs: 'maxlength="80"', full: true })}
      <div class="field full"><label for="f-catatan">Catatan tambahan</label><textarea id="f-catatan" name="catatan" rows="2" maxlength="200">${esc(a?.catatan || '')}</textarea></div>`;
    const overlay = UI.openModal({ title: a ? 'Edit burung datang' : 'Catat burung datang', body: formShell('arrival', id, fields, a ? 'Simpan perubahan' : 'Simpan') });
    const form = overlay.querySelector('form');
    const total = () => {
      const q = Number(form.jumlah.value) || 0, p = Number(form.hargaBeli.value) || 0;
      form.querySelector('[data-total]').textContent = U.formatRupiah(q * p);
    };
    form.birdId.addEventListener('change', () => {
      const b = TB.store.getBird(form.birdId.value);
      if (b) form.hargaBeli.value = b.hargaBeli;
      total();
    });
    form.jumlah.addEventListener('input', total);
    form.hargaBeli.addEventListener('input', total);
    total();
  });

  /* ---------- Penjualan ---------- */
  const openSaleForm = guarded((id) => {
    const s = id ? TB.store.get().sales.find((x) => x.id === id) : null;
    if (id && !s) throw new Error('Transaksi penjualan tidak ditemukan.');
    const stocks = TB.store.stockMap();
    // Saat edit, stok transaksi ini dikembalikan dulu ke jumlah yang bisa dipilih.
    const available = (b) => stocks[b.id] + (s && s.birdId === b.id ? s.jumlah : 0);
    const birds = sortedBirds().filter((b) => available(b) > 0);
    if (!birds.length) throw new Error('Tidak ada burung dengan stok tersedia untuk dijual.');
    const first = birds.find((b) => b.id === s?.birdId) || birds[0];
    const fields = `
      ${field('Tanggal transaksi', 'tanggal', { type: 'date', value: s?.tanggal || today(), attrs: `max="${today()}"` })}
      ${field('Nomor transaksi', 'noTransaksi', { value: s?.noTransaksi || 'Dibuat otomatis', required: false, attrs: 'readonly' })}
      ${selectField('Nama burung', 'birdId', birds.map((b) => [b.id, `${b.nama} — stok ${available(b)}`]), first.id, { full: true })}
      ${field('Jumlah terjual (ekor)', 'jumlah', { type: 'number', value: s?.jumlah ?? 1, attrs: `min="1" step="1" inputmode="numeric" max="${available(first)}"`, hint: `Stok tersedia: <strong data-stock>${available(first)}</strong> ekor` })}
      ${field('Harga jual per ekor (Rp)', 'hargaJual', { type: 'number', value: s?.hargaJual ?? first.hargaJual, attrs: 'min="1" step="1" inputmode="numeric"' })}
      <div class="field full"><label>Total penjualan</label><p class="static-value" data-total>Rp0</p></div>
      ${field('Nama pembeli', 'pembeli', { value: s?.pembeli, required: false, attrs: 'maxlength="80"' })}
      ${selectField('Metode pembayaran', 'metode', cfg.paymentMethods.map((m) => [m, m]), s?.metode || cfg.paymentMethods[0])}`;
    const overlay = UI.openModal({ title: s ? 'Edit penjualan' : 'Catat penjualan', body: formShell('sale', id, fields, s ? 'Simpan perubahan' : 'Simpan penjualan') });
    const form = overlay.querySelector('form');
    const refresh = () => {
      const b = TB.store.getBird(form.birdId.value);
      const avail = b ? available(b) : 0;
      form.querySelector('[data-stock]').textContent = avail;
      form.jumlah.max = avail;
      const q = Number(form.jumlah.value) || 0, p = Number(form.hargaJual.value) || 0;
      form.querySelector('[data-total]').textContent = U.formatRupiah(q * p);
    };
    form.birdId.addEventListener('change', () => {
      const b = TB.store.getBird(form.birdId.value);
      if (b) form.hargaJual.value = b.hargaJual;
      refresh();
    });
    form.jumlah.addEventListener('input', refresh);
    form.hargaJual.addEventListener('input', refresh);
    refresh();
  });

  /* ---------- HPP (Pakan Burung, Mati atau Lepas, Total Biaya) ---------- */
  const openHppForm = guarded((id) => {
    const h = id ? (TB.store.get().hpp || []).find((x) => x.id === id) : null;
    if (id && !h) throw new Error('Catatan HPP tidak ditemukan.');
    const curStatus = h?.statusInsiden || 'Tidak ada';
    const cleanKet = (h?.matiAtauLepas && h.matiAtauLepas !== 'Tidak ada')
      ? h.matiAtauLepas.replace(/^(Mati|Lepas)\s*[—:-]\s*/i, '')
      : '';

    const fields = `
      ${field('Tanggal', 'tanggal', { type: 'date', value: h?.tanggal || today(), attrs: `max="${today()}"` })}
      ${field('Biaya pakan burung (Rp)', 'biayaPakan', { type: 'number', value: h?.biayaPakan ?? 50000, attrs: 'min="0" step="1000" inputmode="numeric"' })}
      ${field('Pakan burung (rincian)', 'pakanBurung', { value: h?.pakanBurung || '', attrs: 'maxlength="140" placeholder="Contoh: Voer Halus, Jangkrik & Kroto Segar"', full: true })}
      ${selectField('Status mati atau lepas', 'statusInsiden', [
        ['Tidak ada', 'Tidak ada'],
        ['Mati', 'Mati'],
        ['Lepas', 'Lepas']
      ], curStatus)}
      ${field('Biaya / kerugian mati atau lepas (Rp)', 'biayaMatiLepas', { type: 'number', value: h?.biayaMatiLepas ?? 0, required: false, attrs: 'min="0" step="1000" inputmode="numeric"' })}
      ${field('Keterangan mati atau lepas', 'matiAtauLepas', { value: cleanKet, required: false, attrs: 'maxlength="140" placeholder="Contoh: 1 ekor Parkit Australia (perubahan cuaca)"', full: true })}
      <div class="field full">
        <label>Total biaya (Format Rupiah)</label>
        <p class="static-value" data-total>Rp0</p>
      </div>`;

    const overlay = UI.openModal({
      title: h ? 'Edit catatan HPP' : 'Catat HPP baru',
      body: formShell('hpp', id, fields, h ? 'Simpan perubahan' : 'Simpan HPP')
    });
    const form = overlay.querySelector('form');
    const syncInsiden = () => {
      const noInsiden = form.statusInsiden.value === 'Tidak ada';
      form.biayaMatiLepas.readOnly = noInsiden;
      form.matiAtauLepas.readOnly = noInsiden;
      if (noInsiden) {
        form.biayaMatiLepas.value = 0;
        form.matiAtauLepas.value = '';
      }
      const pakan = Number(form.biayaPakan.value) || 0;
      const insiden = noInsiden ? 0 : (Number(form.biayaMatiLepas.value) || 0);
      form.querySelector('[data-total]').textContent = U.formatRupiah(pakan + insiden);
    };
    form.statusInsiden.addEventListener('change', syncInsiden);
    form.biayaPakan.addEventListener('input', syncInsiden);
    form.biayaMatiLepas.addEventListener('input', syncInsiden);
    syncInsiden();
  });

  /* ---------- Submit form ---------- */
  const entityLabels = {
    bird: 'Data stok burung',
    arrival: 'Catatan burung datang',
    sale: 'Transaksi penjualan',
    hpp: 'Catatan HPP'
  };

  function showFormError(form, message) {
    const box = form.querySelector('.form-error');
    box.textContent = message;
    box.hidden = !message;
  }

  /** Menangani submit form modal. Mengembalikan true bila berhasil. */
  function submitEntityForm(form) {
    const kind = form.dataset.form;
    const id = form.dataset.id || '';
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      TB.auth.requireAdmin();
      const api = {
        bird: [TB.store.addBird, TB.store.updateBird],
        arrival: [TB.store.addArrival, TB.store.updateArrival],
        sale: [TB.store.addSale, TB.store.updateSale],
        hpp: [TB.store.addHpp, TB.store.updateHpp]
      }[kind];
      if (!api) return false;
      if (id) api[1](id, data);
      else api[0](data);
      UI.closeModal();
      UI.toast(`${entityLabels[kind]} berhasil ${id ? 'diperbarui' : 'disimpan'}.`);
      return true;
    } catch (e) {
      showFormError(form, e.message);
      UI.toast(e.message, 'error');
      return false;
    }
  }

  /* ---------- Hapus dengan konfirmasi ---------- */
  async function confirmDelete(kind, id) {
    try {
      TB.auth.requireAdmin();
      const st = TB.store;
      let title, message;
      if (kind === 'bird') {
        const b = st.getBird(id);
        if (!b) throw new Error('Data burung tidak ditemukan.');
        title = 'Hapus data burung?';
        message = `Data <strong>${esc(b.nama)}</strong> beserta riwayat kedatangannya akan dihapus permanen.`;
      } else if (kind === 'arrival') {
        const a = st.get().arrivals.find((x) => x.id === id);
        if (!a) throw new Error('Catatan tidak ditemukan.');
        title = 'Hapus catatan burung datang?';
        message = `Catatan kedatangan <strong>${esc(st.getBird(a.birdId)?.nama)}</strong> (${a.jumlah} ekor, ${U.formatDate(a.tanggal)}) akan dihapus dan stok berkurang ${a.jumlah} ekor.`;
      } else if (kind === 'hpp') {
        const h = (st.get().hpp || []).find((x) => x.id === id);
        if (!h) throw new Error('Catatan HPP tidak ditemukan.');
        const total = (Number(h.biayaPakan) || 0) + (Number(h.biayaMatiLepas) || 0);
        title = 'Hapus catatan HPP?';
        message = `Catatan HPP tanggal <strong>${U.formatDate(h.tanggal)}</strong> (${esc(h.pakanBurung)} • total <strong>${U.formatRupiah(total)}</strong>) akan dihapus permanen.`;
      } else {
        const s = st.get().sales.find((x) => x.id === id);
        if (!s) throw new Error('Transaksi tidak ditemukan.');
        title = 'Hapus transaksi penjualan?';
        message = `Transaksi <strong>${esc(s.noTransaksi)}</strong> (${s.jumlah} ekor ${esc(st.getBird(s.birdId)?.nama)}) akan dihapus dan stok bertambah ${s.jumlah} ekor.`;
      }
      const ok = await UI.confirmDialog({ title, message, confirmText: 'Ya, hapus' });
      if (!ok) return;
      TB.auth.requireAdmin(); // sesi bisa berakhir saat dialog terbuka
      ({ bird: st.deleteBird, arrival: st.deleteArrival, sale: st.deleteSale, hpp: st.deleteHpp })[kind](id);
      UI.toast('Data berhasil dihapus.');
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  }

  return { openBirdForm, openArrivalForm, openSaleForm, openHppForm, submitEntityForm, confirmDelete };
})();
