/**
 * CanvasAreaChart — filled area under line with multiple series.
 * Grid lines and axis labels, canvas-rendered.
 *
 * Usage:
 *   const ac = new CanvasAreaChart(canvas);
 *   ac.render({
 *     labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
 *     series: [
 *       { label: 'Study Hours', data: [3, 5, 2, 7, 4], color: '#6366f1' },
 *     ]
 *   });
 *   ac.destroy();
 */

export class CanvasAreaChart {
  constructor(canvas, options = {}) {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._fontFamily = options.fontFamily || 'sans-serif';
    this._fontSize = Number(options.fontSize) || 11;
    this._gridColor = options.gridColor || 'rgba(255,255,255,0.08)';
    this._axisColor = options.axisColor || 'rgba(255,255,255,0.3)';
    this._textColor = options.textColor || 'rgba(255,255,255,0.6)';
    this._lineWidth = Number(options.lineWidth) || 2;
    this._fillOpacity = options.fillOpacity != null ? Number(options.fillOpacity) : 0.15;
    this._smooth = options.smooth !== false;
    this._showGrid = options.showGrid !== false;
    this._showDots = options.showDots !== false;
    this._dotRadius = Number(options.dotRadius) || 3;
    this._padding = { top: 20, right: 20, bottom: 40, left: 50, ...(options.padding || {}) };
    this._data = null;
    this._hoverIdx = -1;

    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundMouseLeave = this._onMouseLeave.bind(this);
    this._canvas.addEventListener('mousemove', this._boundMouseMove);
    this._canvas.addEventListener('mouseleave', this._boundMouseLeave);
  }

  render(data) {
    this._data = data;
    this._draw();
  }

  _getDrawArea() {
    const canvas = this._canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.width / dpr;
    const h = canvas.clientHeight || canvas.height / dpr;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    this._width = w;
    this._height = h;
    return {
      x: this._padding.left,
      y: this._padding.top,
      w: w - this._padding.left - this._padding.right,
      h: h - this._padding.top - this._padding.bottom,
    };
  }

  _draw() {
    const ctx = this._ctx;
    const dpr = window.devicePixelRatio || 1;
    const area = this._getDrawArea();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this._width, this._height);

    if (!this._data?.labels?.length || !this._data?.series?.length) return;

    const { labels, series } = this._data;
    const n = labels.length;
    if (n < 2) return;

    // Compute global min/max
    let allMin = Infinity;
    let allMax = -Infinity;
    for (const s of series) {
      for (const v of s.data) {
        const num = Number(v);
        if (Number.isFinite(num)) {
          if (num < allMin) allMin = num;
          if (num > allMax) allMax = num;
        }
      }
    }
    if (!Number.isFinite(allMin)) allMin = 0;
    if (!Number.isFinite(allMax)) allMax = 1;
    if (allMin === allMax) { allMin -= 1; allMax += 1; }
    const range = allMax - allMin;

    // Y-axis ticks
    const tickCount = 5;
    const ticks = [];
    for (let i = 0; i <= tickCount; i++) {
      const val = allMin + (range * i) / tickCount;
      ticks.push(val);
    }

    // X positions
    const xStep = area.w / (n - 1);
    const xPos = (i) => area.x + i * xStep;

    // Y position
    const yPos = (val) => area.y + area.h - ((val - allMin) / range) * area.h;

    // Grid lines
    if (this._showGrid) {
      ctx.strokeStyle = this._gridColor;
      ctx.lineWidth = 1;
      for (const tick of ticks) {
        const y = Math.round(yPos(tick)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(area.x, y);
        ctx.lineTo(area.x + area.w, y);
        ctx.stroke();
      }
    }

    // Y-axis labels
    ctx.font = `${this._fontSize}px ${this._fontFamily}`;
    ctx.fillStyle = this._textColor;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const tick of ticks) {
      const label = Number.isInteger(tick) ? String(tick) : tick.toFixed(1);
      ctx.fillText(label, area.x - 8, yPos(tick));
    }

    // X-axis labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const labelStep = Math.max(1, Math.floor(n / 10));
    for (let i = 0; i < n; i += labelStep) {
      ctx.fillText(String(labels[i]), xPos(i), area.y + area.h + 8);
    }
    if ((n - 1) % labelStep !== 0) {
      ctx.fillText(String(labels[n - 1]), xPos(n - 1), area.y + area.h + 8);
    }

    // Series
    for (const s of series) {
      const color = s.color || '#6366f1';
      const data = s.data;

      // Build points
      const points = [];
      for (let i = 0; i < Math.min(n, data.length); i++) {
        const val = Number(data[i]);
        points.push({ x: xPos(i), y: yPos(Number.isFinite(val) ? val : allMin) });
      }
      if (points.length < 2) continue;

      // Area fill
      ctx.beginPath();
      if (this._smooth && points.length > 2) {
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1];
          const curr = points[i];
          const cpx = (prev.x + curr.x) / 2;
          ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
        }
      } else {
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
      }
      ctx.lineTo(points[points.length - 1].x, area.y + area.h);
      ctx.lineTo(points[0].x, area.y + area.h);
      ctx.closePath();

      ctx.globalAlpha = this._fillOpacity;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Line
      ctx.beginPath();
      if (this._smooth && points.length > 2) {
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1];
          const curr = points[i];
          const cpx = (prev.x + curr.x) / 2;
          ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
        }
      } else {
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = this._lineWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      // Dots
      if (this._showDots) {
        for (const pt of points) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, this._dotRadius, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
      }
    }

    // Hover tooltip
    if (this._hoverIdx >= 0 && this._hoverIdx < n) {
      const hx = xPos(this._hoverIdx);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hx, area.y);
      ctx.lineTo(hx, area.y + area.h);
      ctx.stroke();
      ctx.setLineDash([]);

      // Tooltip
      const lines = [String(labels[this._hoverIdx])];
      for (const s of series) {
        const val = Number(s.data[this._hoverIdx]);
        lines.push(`${s.label || 'Series'}: ${Number.isFinite(val) ? val : '—'}`);
      }
      ctx.font = `${this._fontSize}px ${this._fontFamily}`;
      let maxW = 0;
      for (let i = 0; i < lines.length; i++) {
        const w = ctx.measureText(lines[i]).width;
        if (w > maxW) maxW = w;
      }
      const tipW = maxW + 16;
      const tipH = lines.length * (this._fontSize + 4) + 8;
      let tipX = hx + 8;
      let tipY = area.y + 8;
      if (tipX + tipW > this._width - this._padding.right) tipX = hx - tipW - 8;

      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.beginPath();
      ctx.roundRect(tipX, tipY, tipW, tipH, 4);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (let i = 0; i < lines.length; i++) {
        ctx.fillStyle = i === 0 ? '#fff' : (series[i - 1]?.color || '#fff');
        ctx.fillText(lines[i], tipX + 8, tipY + 4 + i * (this._fontSize + 4));
      }
    }
  }

  _onMouseMove(e) {
    if (!this._data?.labels?.length) return;
    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const area = { x: this._padding.left, w: this._width - this._padding.left - this._padding.right };
    const n = this._data.labels.length;
    const xStep = area.w / (n - 1);
    const idx = Math.round((mx - area.x) / xStep);
    const clamped = Math.max(0, Math.min(n - 1, idx));
    if (clamped !== this._hoverIdx) {
      this._hoverIdx = clamped;
      this._draw();
    }
  }

  _onMouseLeave() {
    if (this._hoverIdx !== -1) {
      this._hoverIdx = -1;
      this._draw();
    }
  }

  destroy() {
    this._canvas.removeEventListener('mousemove', this._boundMouseMove);
    this._canvas.removeEventListener('mouseleave', this._boundMouseLeave);
    this._data = null;
  }
}
