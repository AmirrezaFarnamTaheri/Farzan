/**
 * Chart.js completion-ring adapter.
 *
 * Chart.js doughnut datasets own the arc geometry, animation and teardown;
 * Farzan's plugin keeps the existing option names and center percentage label.
 * No secondary RAF loop or duplicate Canvas2D arc stroke is needed.
 */
function ringOptions(chart) {
  return chart.options?.plugins?.arc || {};
}

function applyRingDatasetDefaults(chart) {
  const options = ringOptions(chart);
  for (const dataset of chart.data?.datasets || []) {
    dataset.backgroundColor ??= [
      options.color || '#6366f1',
      options.backgroundColor || 'rgba(255,255,255,0.08)',
    ];
    dataset.borderWidth ??= 0;
    dataset.hoverOffset ??= 0;
  }
}

function currentPercent(chart) {
  const data = chart.data?.datasets?.[0]?.data || [];
  const total = data.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0) || 100;
  const ratio = Math.max(0, Math.min(1, (Number(data[0]) || 0) / total));
  // Chart.js exposes the animated circumference of its real first ArcElement.
  // Prefer that when present, falling back to the stored data in test doubles.
  const arc = chart.getDatasetMeta?.(0)?.data?.[0];
  // Chart.js stores ArcElement angles in radians, while the chart sweep is in degrees.
  // A 75% half-circle therefore occupies 0.75*pi radians, not 0.75*2*pi.
  const sweepDegrees = Number(chart.data?.datasets?.[0]?.circumference
    ?? chart.options?.circumference ?? 360);
  const sweepRadians = Math.abs(sweepDegrees) * Math.PI / 180;
  return Number.isFinite(arc?.circumference) && sweepRadians > 0
    ? Math.max(0, Math.min(100, Math.abs(arc.circumference) / sweepRadians * 100))
    : ratio * 100;
}

export const chartArc = {
  id: 'arc',

  beforeInit(chart) {
    const opts = chart.options || {};
    const options = ringOptions(chart);
    applyRingDatasetDefaults(chart);
    // Shallow assignments avoid re-entering Chart.js proxy option setters.
    Object.assign(opts, {
      // Legacy lineWidth is an actual pixel thickness. Scriptable cutout is
      // a native Chart.js option and follows responsive chart size changes.
      cutout: opts.cutout ?? (options.lineWidth != null
        && Number.isFinite(Number(options.lineWidth)) && Number(options.lineWidth) >= 0
        ? (context) => {
          const active = context?.chart || chart;
          const width = active.width || (active.chartArea?.right - active.chartArea?.left) || 0;
          const height = active.height || (active.chartArea?.bottom - active.chartArea?.top) || 0;
          const radius = Math.min(width, height) / 2;
          return radius > 0 ? Math.max(0, radius - Number(options.lineWidth)) : '78%';
        } : '78%'),
      rotation: opts.rotation ?? -90,
      responsive: opts.responsive !== false,
      maintainAspectRatio: opts.maintainAspectRatio !== false,
      animation: opts.animation ?? (options.animate
        ? { duration: options.duration || 800 }
        : false),
    });
    Object.assign(opts, {
      plugins: {
        ...opts.plugins,
        legend: { display: false },
        tooltip: { enabled: false },
      },
    });
  },

  beforeUpdate(chart) {
    applyRingDatasetDefaults(chart);
  },

  afterDatasetDraw(chart, args, options = {}) {
    if (args?.index !== 0 || options.showText === false) return;
    const { ctx, chartArea } = chart;
    if (!ctx || !chartArea) return;
    const cx = (chartArea.left + chartArea.right) / 2;
    const cy = (chartArea.top + chartArea.bottom) / 2;
    const radius = Math.max(0, Math.min(
      chartArea.right - chartArea.left,
      chartArea.bottom - chartArea.top,
    ) / 2);
    ctx.save();
    ctx.fillStyle = options.textColor
      || getComputedStyle(ctx.canvas).getPropertyValue('color').trim() || '#fff';
    ctx.font = 'bold ' + (options.fontSize || Math.max(12, radius * 0.4)) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(currentPercent(chart))) + '%', cx, cy);
    ctx.restore();
  },
};
