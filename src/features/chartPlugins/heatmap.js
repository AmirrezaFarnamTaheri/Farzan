/**
 * Chart.js Heatmap Plugin — GitHub-style activity grid.
 * 52 columns x 7 rows, color intensity by value, month labels.
 *
 * Usage:
 *   new Chart(ctx, {
 *     type: 'scatter',
 *     plugins: [chartHeatmap],
 *     options: {
 *       plugins: {
 *         heatmap: {
 *           data: [{ date: '2025-01-01', value: 3 }, ...],
 *           colorScale: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
 *           cellSize: 12,
 *           labels: { months: true, weekdays: true },
 *         }
 *       }
 *     }
 *   });
 */

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

function parseDate(str) {
  const parts = String(str).split('-');
  if (parts.length < 3) return null;
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function buildGrid(data) {
  const grid = new Map();
  let minDate = null;
  let maxDate = null;
  let maxVal = 0;

  for (const item of data) {
    const date = parseDate(item.date);
    if (!date) continue;
    const val = Math.max(0, Number(item.value) || 0);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    grid.set(key, val);
    if (!minDate || date < minDate) minDate = date;
    if (!maxDate || date > maxDate) maxDate = date;
    if (val > maxVal) maxVal = val;
  }

  if (!minDate || !maxDate) return { cells: [], months: [], maxVal: 0, weeks: 0 };

  const cells = [];
  const months = [];
  const startOfWeek = new Date(minDate);
  startOfWeek.setDate(startOfWeek.getDate() - (startOfWeek.getDay() === 0 ? 6 : startOfWeek.getDay() - 1));

  let current = new Date(startOfWeek);
  let weekIdx = 0;
  let lastMonth = -1;

  while (current <= maxDate || current.getDay() !== 1) {
    const dayOfWeek = current.getDay() === 0 ? 6 : current.getDay() - 1;
    const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
    const val = grid.get(key) || 0;

    if (current >= minDate && current <= maxDate) {
      cells.push({
        week: weekIdx,
        day: dayOfWeek,
        value: val,
        date: key,
      });
    }

    if (current.getMonth() !== lastMonth) {
      months.push({ week: weekIdx, label: MONTH_NAMES[current.getMonth()] });
      lastMonth = current.getMonth();
    }

    current.setDate(current.getDate() + 1);
    if (current.getDay() === 1 && current > maxDate) break;
    if (current.getDay() === 1) weekIdx++;
  }

  return { cells, months, maxVal, weeks: weekIdx + 1 };
}

export const chartHeatmap = {
  id: 'heatmap',

  afterDraw(chart, args, options) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;

    const data = options.data || [];
    const colorScale = options.colorScale || ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
    const cellSize = options.cellSize || 12;
    const cellGap = options.cellGap || 2;
    const showMonths = options.labels?.months !== false;
    const showWeekdays = options.labels?.weekdays !== false;
    const weekdayWidth = showWeekdays ? 30 : 0;
    const monthHeight = showMonths ? 16 : 0;

    const grid = buildGrid(data);
    if (!grid.cells.length) return;

    const offsetX = chartArea.left + weekdayWidth;
    const offsetY = chartArea.top + monthHeight;
    const totalWidth = grid.weeks * (cellSize + cellGap);
    const totalHeight = 7 * (cellSize + cellGap);

    const scaleX = (chartArea.right - chartArea.left - weekdayWidth) / totalWidth;
    const scaleY = (chartArea.bottom - chartArea.top - monthHeight) / totalHeight;
    const scale = Math.min(scaleX, scaleY, 1);

    const scaledCell = cellSize * scale;
    const scaledGap = cellGap * scale;

    ctx.save();

    for (const cell of grid.cells) {
      const x = offsetX + cell.week * (scaledCell + scaledGap);
      const y = offsetY + cell.day * (scaledCell + scaledGap);
      const ratio = grid.maxVal > 0 ? cell.value / grid.maxVal : 0;
      const colorIdx = cell.value === 0 ? 0 : Math.max(1, Math.min(colorScale.length - 1, Math.ceil(ratio * (colorScale.length - 1))));

      ctx.fillStyle = colorScale[colorIdx];
      ctx.beginPath();
      ctx.roundRect(x, y, scaledCell, scaledCell, 2 * scale);
      ctx.fill();
    }

    if (showMonths) {
      ctx.fillStyle = getComputedStyle(ctx.canvas).getPropertyValue('color').trim() || '#666';
      ctx.font = `${Math.round(10 * scale)}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      for (const m of grid.months) {
        const x = offsetX + m.week * (scaledCell + scaledGap);
        ctx.fillText(m.label, x, chartArea.top + monthHeight - 2);
      }
    }

    if (showWeekdays) {
      ctx.fillStyle = getComputedStyle(ctx.canvas).getPropertyValue('color').trim() || '#666';
      ctx.font = `${Math.round(9 * scale)}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let d = 0; d < 7; d++) {
        const y = offsetY + d * (scaledCell + scaledGap) + scaledCell / 2;
        ctx.fillText(DAY_LABELS[d], offsetX - 4, y);
      }
    }

    ctx.restore();

    chart._heatmapGrid = grid;
    chart._heatmapConfig = { offsetX, offsetY, scaledCell, scaledGap };

    const tip = chart._heatmapTooltip;
    if (tip) {
      const text = `${tip.date}: ${tip.value}`;
      ctx.save();
      ctx.font = '11px sans-serif';
      const m = ctx.measureText(text);
      const pad = 6;
      const w = m.width + pad * 2;
      const h = 20;
      const tx2 = tip.x - w / 2;
      const ty2 = tip.y - h - 4;

      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.beginPath();
      ctx.roundRect(tx2, ty2, w, h, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, tip.x, ty2 + h / 2);
      ctx.restore();
    }
  },

  afterEvent(chart, args) {
    const event = args.event;
    if (event.type !== 'mousemove' && event.type !== 'mouseout') return;

    if (event.type === 'mouseout') {
      chart._heatmapTooltip = null;
      return;
    }

    const grid = chart._heatmapGrid;
    const cfg = chart._heatmapConfig;
    if (!grid || !cfg) return;

    const mx = event.x;
    const my = event.y;

    for (const cell of grid.cells) {
      const x = cfg.offsetX + cell.week * (cfg.scaledCell + cfg.scaledGap);
      const y = cfg.offsetY + cell.day * (cfg.scaledCell + cfg.scaledGap);
      if (mx >= x && mx <= x + cfg.scaledCell && my >= y && my <= y + cfg.scaledCell) {
        chart._heatmapTooltip = { x: x + cfg.scaledCell / 2, y, date: cell.date, value: cell.value };
        chart.draw();
        return;
      }
    }

    chart._heatmapTooltip = null;
  },
};
