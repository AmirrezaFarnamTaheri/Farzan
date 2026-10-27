/**
 * Native Chart.js line-chart configuration for compact sparklines.
 *
 * Chart.js already draws and fills its line datasets, handles animation,
 * DPR, and lifecycle. The old afterDatasetDraw hook reimplemented bezier
 * paths and duplicated drawing. Keep this plugin ID for existing callers.
 */
export const chartSparkline = {
  id: 'sparkline',
  beforeInit(chart) {
    const opts = chart.options || {};
    this.beforeUpdate(chart);

    // Assign shallowly to avoid re-entering Chart.js v4's option Proxy.
    Object.assign(opts, {
      responsive: opts.responsive !== false,
      maintainAspectRatio: opts.maintainAspectRatio !== false,
      animation: opts.animation ?? false,
      scales: { x: { display: false }, y: { display: false } },
      elements: { ...opts.elements, point: { radius: 0, hoverRadius: 0 } },
      layout: { ...opts.layout, padding: 2 },
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
    const config = chart.options?.plugins?.sparkline || {};
    for (const data of chart.data?.datasets || []) {
      data.borderColor ??= config.lineColor || '#6366f1';
      if (config.fillColor) data.backgroundColor ??= config.fillColor;
      data.borderWidth ??= config.lineWidth ?? 2;
      data.pointRadius = 0;
      data.pointHoverRadius = 0;
      data.tension ??= 0.35;
      if (data.fill == null && config.fillColor) data.fill = 'origin';
    }

  },
};