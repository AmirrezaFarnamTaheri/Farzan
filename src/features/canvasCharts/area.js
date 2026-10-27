/**
 * Chart.js adapter for the historical CanvasAreaChart public contract.
 *
 * The previous implementation owned axes, points, lines, fill geometry,
 * tooltip hit-testing and pointer listeners. Chart.js already ships with
 * Farzan; delegate these concerns to it instead of maintaining two engines.
 *
 * Keep the public constructor/render/destroy interface used by plugins and
 * user scripts. Chart.js is loaded by Farzan's existing vendored loader.
 */
function alphaColor(color, opacity) {
  const amount = Math.min(1, Math.max(0, Number(opacity) || 0));
  const hex = /^#([0-9a-f]{6})$/i.exec(String(color));
  if (hex) {
    const value = hex[1];
    return `rgba(${parseInt(value.slice(0, 2), 16)}, ${parseInt(value.slice(2, 4), 16)}, ${parseInt(value.slice(4, 6), 16)}, ${amount})`;
  }
  // Chart.js also accepts standard CSS colors. For arbitrary expressions,
  // prefer its native color parser and avoid replacing a legitimate color.
  return color;
}

function numericOrGap(value) {
  if (value == null || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export class CanvasAreaChart {
  constructor(canvas, options = {}) {
    if (!canvas) throw new TypeError('CanvasAreaChart requires a canvas');
    this._canvas = canvas;
    this._options = { ...options };
    this._chart = null;
    this._data = null;
    this._destroyed = false;
  }

  render(data) {
    if (this._destroyed) throw new Error('CanvasAreaChart has been destroyed');
    const Chart = globalThis.Chart;
    if (typeof Chart !== 'function') {
      throw new Error('CanvasAreaChart: Chart.js is unavailable; load the vendored Chart.js library first');
    }
    const labels = Array.isArray(data?.labels) ? data.labels.map(String) : [];
    const series = Array.isArray(data?.series) ? data.series : [];
    const opts = this._options;
    const datasets = series.map((row, index) => {
      const color = row.color || '#6366f1';
      return {
        label: String(row.label || `Series ${index + 1}`),
        data: labels.map((_, idx) => numericOrGap(row.data?.[idx])),
        borderColor: color,
        backgroundColor: alphaColor(color, opts.fillOpacity ?? 0.15),
        fill: 'origin',
        spanGaps: false,
        tension: opts.smooth === false ? 0 : 0.35,
        borderWidth: opts.lineWidth ?? 2,
        pointRadius: opts.showDots === false ? 0 : (opts.dotRadius ?? 3),
        pointHoverRadius: Math.max(4, opts.dotRadius ?? 3),
      };
    });
    this._data = { labels, series };
    const nextData = { labels, datasets };
    if (this._chart) {
      this._chart.data = nextData;
      this._chart.update('none');
      return;
    }
    this._chart = new Chart(this._canvas, {
      type: 'line',
      data: nextData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        elements: { point: { radius: opts.showDots === false ? 0 : (opts.dotRadius ?? 3) } },
        plugins: {
          legend: { display: series.length > 1 },
          tooltip: { enabled: true, mode: 'index', intersect: false },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: opts.textColor, maxTicksLimit: 10 },
          },
          y: {
            grid: { display: opts.showGrid !== false, color: opts.gridColor || 'rgba(128,128,128,0.12)' },
            ticks: { color: opts.textColor },
          },
        },
      },
    });
  }

  destroy() {
    if (this._destroyed) return;
    this._chart?.destroy();
    this._chart = null;
    this._data = null;
    this._destroyed = true;
  }
}
