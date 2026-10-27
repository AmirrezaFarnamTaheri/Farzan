/**
 * CanvasHeatmap — grid of colored cells with intensity by value.
 * Month/weekday labels, tooltip on hover.
 *
 * Usage:
 *   const hm = new CanvasHeatmap(canvas);
 *   hm.render({ data: [{ date: '2025-01-01', value: 3 }, ...] });
 *   hm.destroy();
 */

import { buildCalendarGrid, DAY_LABELS } from '../chartPlugins/calendarGrid.js';

export class CanvasHeatmap {
  constructor(canvas, options = {}) {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._colorScale = options.colorScale || ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];
    this._cellSize = Number(options.cellSize) || 12;
    this._cellGap = Number(options.cellGap) || 2;
    this._fontFamily = options.fontFamily || 'sans-serif';
    this._showMonths = options.showMonths !== false;
    this._showWeekdays = options.showWeekdays !== false;
    this._data = null;
    this._grid = null;
    this._hoverCell = null;

    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundMouseLeave = this._onMouseLeave.bind(this);
    this._canvas.addEventListener('mousemove', this._boundMouseMove);
    this._canvas.addEventListener('mouseleave', this._boundMouseLeave);
  }

  render(data) {
    const items = Array.isArray(data) ? data : (data?.data || []);
    this._data = items;
    this._grid = buildCalendarGrid(items);
    this._draw();
  }

  _getDrawArea() {
    const canvas = this._canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.width / dpr;
    const h = canvas.clientHeight || canvas.height / dpr;
    // Only reallocate the backing store when the size actually changed.
    // _draw() runs on every hover-cell change, so an unconditional
    // reassignment here reallocated (and fully cleared) the canvas on
    // every pointer move across the grid.
    const nextWidth = Math.round(w * dpr);
    const nextHeight = Math.round(h * dpr);
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
    this._width = w;
    this._height = h;
    return { w, h };
  }

  _draw() {
    const ctx = this._ctx;
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = this._getDrawArea();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const grid = this._grid;
    if (!grid || !grid.cells.length) return;

    const weekdayWidth = this._showWeekdays ? 30 : 0;
    const monthHeight = this._showMonths ? 16 : 0;
    const cs = this._cellSize;
    const cg = this._cellGap;
    const totalW = grid.weeks * (cs + cg);
    const totalH = 7 * (cs + cg);

    const scaleX = (w - weekdayWidth - 8) / totalW;
    const scaleY = (h - monthHeight - 8) / totalH;
    const scale = Math.min(scaleX, scaleY, 1);
    const sc = cs * scale;
    const sg = cg * scale;

    const offsetX = weekdayWidth + 4;
    const offsetY = monthHeight + 4;

    ctx.save();

    // Cells
    for (const cell of grid.cells) {
      const x = offsetX + cell.week * (sc + sg);
      const y = offsetY + cell.day * (sc + sg);
      const ratio = grid.maxVal > 0 ? cell.value / grid.maxVal : 0;
      const colorIdx = cell.value === 0 ? 0 : Math.max(1, Math.min(this._colorScale.length - 1, Math.ceil(ratio * (this._colorScale.length - 1))));
      ctx.fillStyle = this._colorScale[colorIdx];
      ctx.beginPath();
      ctx.roundRect(x, y, sc, sc, 2 * scale);
      ctx.fill();
    }

    // Month labels
    if (this._showMonths) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = `${Math.round(10 * scale)}px ${this._fontFamily}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      for (const m of grid.months) {
        const x = offsetX + m.week * (sc + sg);
        ctx.fillText(m.label, x, monthHeight);
      }
    }

    // Weekday labels
    if (this._showWeekdays) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = `${Math.round(9 * scale)}px ${this._fontFamily}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let d = 0; d < 7; d++) {
        const y = offsetY + d * (sc + sg) + sc / 2;
        ctx.fillText(DAY_LABELS[d], offsetX - 4, y);
      }
    }

    // Hover tooltip
    if (this._hoverCell) {
      const tip = this._hoverCell;
      const text = `${tip.date}: ${tip.value}`;
      ctx.font = '11px sans-serif';
      const m = ctx.measureText(text);
      const pad = 6;
      const tw = m.width + pad * 2;
      const th = 20;
      const tx = tip.x + sc / 2 - tw / 2;
      const ty = tip.y - th - 4;
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.beginPath();
      ctx.roundRect(Math.max(0, tx), Math.max(0, ty), tw, th, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, tip.x + sc / 2, ty + th / 2);
    }

    ctx.restore();

    this._offsetX = offsetX;
    this._offsetY = offsetY;
    this._sc = sc;
    this._sg = sg;
  }

  _onMouseMove(e) {
    if (!this._grid) return;
    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const prev = this._hoverCell;

    this._hoverCell = null;
    for (const cell of this._grid.cells) {
      const x = this._offsetX + cell.week * (this._sc + this._sg);
      const y = this._offsetY + cell.day * (this._sc + this._sg);
      if (mx >= x && mx <= x + this._sc && my >= y && my <= y + this._sc) {
        this._hoverCell = { ...cell, x, y };
        break;
      }
    }

    this._canvas.style.cursor = this._hoverCell ? 'pointer' : 'default';
    // Compare by cell identity (date), not object identity: a fresh
    // object is spread every move even within the same cell, so `!==`
    // triggered a full redraw on every mousemove.
    if (this._hoverCell?.date !== prev?.date) this._draw();
  }

  _onMouseLeave() {
    if (this._hoverCell) {
      this._hoverCell = null;
      this._draw();
    }
  }

  destroy() {
    this._canvas.removeEventListener('mousemove', this._boundMouseMove);
    this._canvas.removeEventListener('mouseleave', this._boundMouseLeave);
    this._data = null;
    this._grid = null;
  }
}
