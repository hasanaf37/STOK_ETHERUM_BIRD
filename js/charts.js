/**
 * Grafik (Chart.js saja). Setiap grafik dibuat ulang dengan aman (instance lama dihancurkan)
 * sehingga animasi berjalan ketika halaman dibuka dan ketika filter periode berubah.
 */
window.TB = window.TB || {};

TB.charts = (() => {
  const U = TB.utils;
  const COLORS = {
    brown: '#5b3a29', caramel: '#c68642', gold: '#d4a537', sand: '#e6d3b3', mocha: '#8a5a3c',
    olive: '#7a8b5a', clay: '#b5654a', grid: 'rgba(91,58,41,0.10)', text: '#6f5848'
  };
  const PALETTE = [COLORS.brown, COLORS.caramel, COLORS.gold, COLORS.olive, COLORS.clay, COLORS.mocha, '#a89078'];
  const instances = {};

  function destroyAll() {
    Object.keys(instances).forEach((k) => { instances[k].destroy(); delete instances[k]; });
  }

  function baseOptions(extra = {}) {
    const reduce = U.prefersReducedMotion();
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: reduce ? false : { duration: 700, easing: 'easeOutCubic' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: COLORS.text, usePointStyle: true, boxWidth: 8, font: { family: 'inherit' } } },
        tooltip: {
          backgroundColor: '#2b1b12', titleColor: '#fff', bodyColor: '#f5ecdc', padding: 10, cornerRadius: 8,
          titleFont: { family: 'inherit', weight: '600' }, bodyFont: { family: 'inherit' }
        }
      },
      ...extra
    };
  }
  const scales = (yFormat) => ({
    x: { grid: { display: false }, ticks: { color: COLORS.text, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
    y: { beginAtZero: true, grid: { color: COLORS.grid }, ticks: { color: COLORS.text, callback: yFormat, precision: 0 } }
  });

  function mount(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    if (!window.Chart) {
      canvas.parentElement.innerHTML = '<p class="muted chart-fallback">Grafik tidak dapat dimuat (pustaka Chart.js belum termuat. Periksa koneksi internet).</p>';
      return;
    }
    if (instances[id]) instances[id].destroy();
    instances[id] = new window.Chart(canvas, config);
  }

  const labels = (report) => report.rows.map((r) => r.label);
  const fullLabel = (report, items) => report.rows[items[0].dataIndex].fullLabel;
  const unit = (report) => (report.monthly ? 'bulan' : 'hari');

  /** 1. Penjualan per hari: jumlah burung terjual (tooltip menampilkan omzet & transaksi). */
  function salesDaily(id, report) {
    mount(id, {
      type: 'bar',
      data: {
        labels: labels(report),
        datasets: [{ label: `Burung terjual per ${unit(report)}`, data: report.rows.map((r) => r.terjual), backgroundColor: COLORS.caramel, hoverBackgroundColor: COLORS.brown, borderRadius: 6, maxBarThickness: 36 }]
      },
      options: baseOptions({
        scales: scales((v) => v),
        plugins: {
          ...baseOptions().plugins,
          legend: { display: false },
          tooltip: {
            ...baseOptions().plugins.tooltip,
            callbacks: {
              title: (items) => fullLabel(report, items),
              label: (c) => ` ${c.parsed.y} ekor terjual`,
              afterLabel: (c) => {
                const r = report.rows[c.dataIndex];
                return [` Omzet: ${U.formatRupiah(r.omzet)}`, ` Transaksi: ${r.trx}`];
              }
            }
          }
        }
      })
    });
  }

  /** 2. Burung datang vs terjual (batang berkelompok). */
  function inVsOut(id, report) {
    mount(id, {
      type: 'bar',
      data: {
        labels: labels(report),
        datasets: [
          { label: 'Burung datang', data: report.rows.map((r) => r.masuk), backgroundColor: COLORS.brown, borderRadius: 5, maxBarThickness: 22 },
          { label: 'Burung terjual', data: report.rows.map((r) => r.terjual), backgroundColor: COLORS.gold, borderRadius: 5, maxBarThickness: 22 }
        ]
      },
      options: baseOptions({
        scales: scales((v) => v),
        plugins: {
          ...baseOptions().plugins,
          tooltip: { ...baseOptions().plugins.tooltip, callbacks: { title: (items) => fullLabel(report, items), label: (c) => ` ${c.dataset.label}: ${c.parsed.y} ekor` } }
        }
      })
    });
  }

  /** 3. Distribusi penjualan per kategori (donat). */
  function categoryDonut(id, report) {
    mount(id, {
      type: 'doughnut',
      data: {
        labels: report.categories.map((c) => c.kategori),
        datasets: [{ data: report.categories.map((c) => c.jumlah), backgroundColor: PALETTE, borderColor: '#fffaf1', borderWidth: 3, hoverOffset: 8 }]
      },
      options: baseOptions({
        interaction: { mode: 'nearest', intersect: true },
        cutout: '62%',
        plugins: {
          ...baseOptions().plugins,
          legend: { position: 'bottom', labels: { color: COLORS.text, usePointStyle: true, boxWidth: 8, font: { family: 'inherit' } } },
          tooltip: {
            ...baseOptions().plugins.tooltip,
            callbacks: {
              label: (c) => ` ${c.label}: ${c.parsed} ekor`,
              afterLabel: (c) => ` Omzet: ${U.formatRupiah(report.categories[c.dataIndex].omzet)}`
            }
          }
        }
      })
    });
  }

  /** 4. Tren omzet (garis). */
  function revenueTrend(id, report) {
    mount(id, {
      type: 'line',
      data: {
        labels: labels(report),
        datasets: [{
          label: 'Omzet', data: report.rows.map((r) => r.omzet), borderColor: COLORS.brown, backgroundColor: 'rgba(198,134,66,0.18)',
          fill: true, tension: 0.35, pointRadius: report.rows.length > 31 ? 0 : 3, pointHoverRadius: 6, pointBackgroundColor: COLORS.gold, borderWidth: 2.5
        }]
      },
      options: baseOptions({
        scales: scales((v) => U.formatRupiahShort(v)),
        plugins: {
          ...baseOptions().plugins,
          legend: { display: false },
          tooltip: { ...baseOptions().plugins.tooltip, callbacks: { title: (items) => fullLabel(report, items), label: (c) => ` Omzet: ${U.formatRupiah(c.parsed.y)}` } }
        }
      })
    });
  }

  /** Grafik ringkas dashboard: jumlah terjual (batang, sumbu kiri) + omzet (garis, sumbu kanan). */
  function overview(id, report) {
    mount(id, {
      data: {
        labels: labels(report),
        datasets: [
          { type: 'bar', label: 'Burung terjual', data: report.rows.map((r) => r.terjual), backgroundColor: 'rgba(198,134,66,0.75)', borderRadius: 5, maxBarThickness: 28, yAxisID: 'y' },
          { type: 'line', label: 'Omzet', data: report.rows.map((r) => r.omzet), borderColor: COLORS.brown, backgroundColor: COLORS.brown, tension: 0.35, pointRadius: 0, pointHoverRadius: 5, borderWidth: 2.5, yAxisID: 'y1' }
        ]
      },
      options: baseOptions({
        scales: {
          x: scales().x,
          y: { beginAtZero: true, grid: { color: COLORS.grid }, ticks: { color: COLORS.text, precision: 0 } },
          y1: { beginAtZero: true, position: 'right', grid: { display: false }, ticks: { color: COLORS.text, callback: (v) => U.formatRupiahShort(v) } }
        },
        plugins: {
          ...baseOptions().plugins,
          tooltip: {
            ...baseOptions().plugins.tooltip,
            callbacks: {
              title: (items) => fullLabel(report, items),
              label: (c) => (c.dataset.yAxisID === 'y1' ? ` Omzet: ${U.formatRupiah(c.parsed.y)}` : ` Terjual: ${c.parsed.y} ekor`)
            }
          }
        }
      })
    });
  }

  return { destroyAll, salesDaily, inVsOut, categoryDonut, revenueTrend, overview };
})();
