/**
 * Chart.js Gauge Plugin — semi-circular gauge with needle.
 * Color zones (red/yellow/green), center value display.
 *
 * Usage:
 *   new Chart(ctx, {
 *     type: 'doughnut',
 *     plugins: [chartGauge],
 *     data: { datasets: [{ data: [70, 30] }] },
 *     options: {
 *       plugins: {
 *         gauge: {
 *           min: 0,
 *           max: 100,
 *           value: 70,
 *           unit: '%',
 *           lineWidth: 20,
 *           zones: [
 *             { from: 0, to: 33, color: '#ef4444' },
 *             { from: 33, to: 66, color: '#eab308' },
 *             { from: 66, to: 100, color: '#22c55e' },
 *           ],
 *         }
 *       }
 *     }
 *   });
 */

const DEG = Math.PI / 180;

export const chartGauge = {
  id: 'gauge',

  beforeInit(chart) {
    const opts = chart.options || {};
    opts.rotation = -90;
    opts.circumference = 180;
    opts.cutout = opts.cutout ?? '72%';
    opts.responsive = opts.responsive !== false;
    opts.maintainAspectRatio = opts.maintainAspectRatio !== false;
    opts.plugins = opts.plugins || {};
    opts.plugins.legend = { display: false };
    opts.plugins.tooltip = { enabled: false };
    opts.animation = opts.animation ?? false;
  },

  afterDraw(chart, args, options) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;

    const min = Number(options.min ?? 0);
    const max = Number(options.max ?? 100);
    const value = Math.max(min, Math.min(max, Number(options.value ?? 0)));
    const unit = options.unit || '';
    const lineWidth = options.lineWidth || 20;
    const zones = Array.isArray(options.zones) ? options.zones : [];
    const needleColor = options.needleColor || '#fff';
    const textColor = options.textColor || null;
    const fontSize = options.fontSize || null;

    const cx = (chartArea.left + chartArea.right) / 2;
    const bottom = chartArea.bottom;
    const radius = Math.min(chartArea.right - chartArea.left, (chartArea.bottom - chartArea.top) * 2) / 2 - lineWidth / 2;
    const range = max - min || 1;

    ctx.save();

    if (zones.length) {
      for (const zone of zones) {
        const zFrom = Math.max(min, Number(zone.from ?? min));
        const zTo = Math.min(max, Number(zone.to ?? max));
        const startAngle = (-180 + ((zFrom - min) / range) * 180) * DEG;
        const endAngle = (-180 + ((zTo - min) / range) * 180) * DEG;
        ctx.beginPath();
        ctx.arc(cx, bottom, radius, startAngle, endAngle);
        ctx.strokeStyle = zone.color || '#666';
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'butt';
        ctx.stroke();
      }
    } else {
      const bgStart = -180 * DEG;
      const bgEnd = 0;
      ctx.beginPath();
      ctx.arc(cx, bottom, radius, bgStart, bgEnd);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'butt';
      ctx.stroke();

      const fillAngle = (-180 + ((value - min) / range) * 180) * DEG;
      ctx.beginPath();
      ctx.arc(cx, bottom, radius, bgStart, fillAngle);
      ctx.strokeStyle = options.color || '#6366f1';
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    const needleAngle = (-180 + ((value - min) / range) * 180) * DEG;
    const needleLen = radius - lineWidth;
    const nx = cx + Math.cos(needleAngle) * needleLen;
    const ny = bottom + Math.sin(needleAngle) * needleLen;

    ctx.beginPath();
    ctx.moveTo(cx, bottom);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = needleColor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, bottom, 4, 0, Math.PI * 2);
    ctx.fillStyle = needleColor;
    ctx.fill();

    const computedFontSize = fontSize || Math.max(14, radius * 0.28);
    const computedColor = textColor || getComputedStyle(ctx.canvas).getPropertyValue('color').trim() || '#fff';
    ctx.fillStyle = computedColor;
    ctx.font = `bold ${computedFontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(value)}${unit}`, cx, bottom - radius * 0.35);

    const labelFontSize = Math.max(10, computedFontSize * 0.55);
    ctx.font = `${labelFontSize}px sans-serif`;
    ctx.globalAlpha = 0.6;
    ctx.fillText(`${min}${unit}`, cx - radius + lineWidth, bottom + 6);
    ctx.fillText(`${max}${unit}`, cx + radius - lineWidth, bottom + 6);
    ctx.globalAlpha = 1;

    ctx.restore();
  },
};
