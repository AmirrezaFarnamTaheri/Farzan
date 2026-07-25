/**
 * Chart.js Arc Plugin — circular progress rings.
 * Arc from 0% to 100% with center percentage text.
 *
 * Usage:
 *   new Chart(ctx, {
 *     type: 'doughnut',
 *     plugins: [chartArc],
 *     data: { datasets: [{ data: [75, 25] }] },
 *     options: {
 *       plugins: {
 *         arc: {
 *           lineWidth: 12,
 *           color: '#6366f1',
 *           backgroundColor: '#2a2a2e',
 *           animate: true,
 *         }
 *       }
 *     }
 *   });
 */

import { easeOutCubic } from '../../lib/easing.js';

export const chartArc = {
  id: 'arc',

  beforeInit(chart) {
    const opts = chart.options || {};
    opts.cutout = opts.cutout ?? '78%';
    opts.responsive = opts.responsive !== false;
    opts.maintainAspectRatio = opts.maintainAspectRatio !== false;
    opts.plugins = opts.plugins || {};
    opts.plugins.legend = { display: false };
    opts.plugins.tooltip = { enabled: false };
    opts.animation = opts.animation ?? false;
  },

  afterInit(chart) {
    const opts = chart.options?.plugins?.arc || {};
    if (opts.animate) {
      chart._arcProgress = 0;
      chart._arcStartTime = null;
      chart._arcDuration = opts.duration || 800;
      chart._arcTargetPercent = chart.data?.datasets?.[0]?.data?.[0] || 0;
    }
  },

  beforeDraw(chart, _args, _options) {
    if (chart._arcProgress !== undefined && chart._arcProgress < 1) {
      if (chart._arcDrawing) return;
      chart._arcDrawing = true;
      if (!chart._arcStartTime) chart._arcStartTime = performance.now();
      const elapsed = performance.now() - chart._arcStartTime;
      const t = Math.min(1, elapsed / (chart._arcDuration || 800));
      chart._arcProgress = easeOutCubic(t);
      if (t < 1) {
        requestAnimationFrame(() => {
          chart.draw();
          chart._arcDrawing = false;
        });
      } else {
        chart._arcDrawing = false;
      }
    }
  },

  afterDatasetDraw(chart, args, options) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;

    const lineWidth = options.lineWidth || 12;
    const color = options.color || '#6366f1';
    const bgColor = options.backgroundColor || 'rgba(255,255,255,0.08)';
    const textColor = options.textColor || null;
    const fontSize = options.fontSize || null;
    const showText = options.showText !== false;

    const data = chart.data?.datasets?.[0]?.data || [];
    const total = data.reduce((s, v) => s + Math.max(0, Number(v) || 0), 0) || 100;
    const targetPercent = Math.min(100, Math.max(0, (Number(data[0]) || 0) / total * 100));
    const progress = chart._arcProgress !== undefined ? chart._arcProgress : 1;
    const currentPercent = targetPercent * progress;

    const cx = (chartArea.left + chartArea.right) / 2;
    const cy = (chartArea.top + chartArea.bottom) / 2;
    const radius = Math.min(chartArea.right - chartArea.left, chartArea.bottom - chartArea.top) / 2 - lineWidth / 2;

    ctx.save();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = bgColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();

    if (currentPercent > 0) {
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + (currentPercent / 100) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    if (showText) {
      const computedFontSize = fontSize || Math.max(12, radius * 0.4);
      const computedColor = textColor || getComputedStyle(ctx.canvas).getPropertyValue('color').trim() || '#fff';
      ctx.fillStyle = computedColor;
      ctx.font = `bold ${computedFontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(currentPercent)}%`, cx, cy);
    }

    ctx.restore();
  },
};
