/**
 * Chart.js Sparkline Plugin — tiny inline mini-charts.
 * No axes, no labels, no grid. Just line + optional fill.
 *
 * Usage:
 *   new Chart(ctx, {
 *     type: 'line',
 *     plugins: [chartSparkline],
 *     data: { datasets: [{ data: [1,4,2,6,3,8,5] }] },
 *     options: {
 *       plugins: {
 *         sparkline: {
 *           lineColor: '#6366f1',
 *           fillColor: 'rgba(99,102,241,0.15)',
 *           lineWidth: 2,
 *         }
 *       }
 *     }
 *   });
 */

export const chartSparkline = {
  id: 'sparkline',

  beforeInit(chart) {
    const opts = chart.options || {};
    opts.responsive = opts.responsive !== false;
    opts.maintainAspectRatio = opts.maintainAspectRatio !== false;
    opts.animation = opts.animation ?? { duration: 0 };
    opts.scales = {};
    opts.plugins = opts.plugins || {};
    opts.plugins.legend = { display: false };
    opts.plugins.tooltip = { enabled: false };
    opts.elements = opts.elements || {};
    opts.elements.point = { radius: 0, hoverRadius: 0 };
    opts.layout = opts.layout || {};
    opts.layout.padding = { top: 2, right: 2, bottom: 2, left: 2 };
  },

  afterDatasetDraw(chart, args, options) {
    const { ctx, chartArea, data } = chart;
    if (!chartArea || !data?.datasets?.length) return;

    const dataset = data.datasets[args.index] || data.datasets[0];
    const meta = chart.getDatasetMeta(args.index);
    if (!meta?.data?.length) return;

    const lineColor = options.lineColor || dataset.borderColor || '#6366f1';
    const fillColor = options.fillColor || dataset.backgroundColor || null;
    const lineWidth = options.lineWidth ?? dataset.borderWidth ?? 2;

    const points = meta.data;
    const { bottom } = chartArea;

    ctx.save();

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
    }

    if (fillColor) {
      ctx.lineTo(points[points.length - 1].x, bottom);
      ctx.lineTo(points[0].x, bottom);
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
      }
    }

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.restore();
  },
};
