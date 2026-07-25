/**
 * CanvasGauge — semi-circular gauge chart rendered on Canvas2D.
 * Color zones (red/yellow/green), center value display, animated fill.
 *
 * Usage:
 *   const g = new CanvasGauge(canvas, { min: 0, max: 100, value: 70 });
 *   g.setValue(85);
 *   g.destroy();
 */

import { easeOutCubic } from '../../lib/easing.js';

const DEG = Math.PI / 180;

export class CanvasGauge {
  constructor(canvas, options = {}) {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._min = Number(options.min) || 0;
    this._max = Number(options.max) || 100;
    this._value = Math.max(this._min, Math.min(this._max, Number(options.value) || 0));
    this._unit = options.unit || '';
    this._lineWidth = Number(options.lineWidth) || 20;
    this._needleColor = options.needleColor || '#fff';
    this._textColor = options.textColor || null;
    this._fontSize = Number(options.fontSize) || 0;
    this._zones = Array.isArray(options.zones) ? options.zones : [
      { from: 0, to: 33, color: '#ef4444' },
      { from: 33, to: 66, color: '#eab308' },
      { from: 66, to: 100, color: '#22c55e' },
    ];
    this._bgColor = options.backgroundColor || 'rgba(255,255,255,0.08)';
    this._fillColor = options.color || '#6366f1';
    this._animateDuration = Number(options.duration) || 800;

    this._animFrame = null;
    this._animStart = null;
    this._animFrom = 0;
    this._animTo = this._value;
    this._currentDisplay = 0;

    this._cachedDpr = 0;
    this._cachedW = 0;
    this._cachedH = 0;

    this._draw = this._draw.bind(this);
    this._syncSize();
    this._draw();
  }

  _syncSize() {
    const canvas = this._canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.width / dpr;
    const h = canvas.clientHeight || canvas.height / dpr;

    if (dpr !== this._cachedDpr || w !== this._cachedW || h !== this._cachedH) {
      this._cachedDpr = dpr;
      this._cachedW = w;
      this._cachedH = h;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
  }

  setValue(v, animate = true) {
    const clamped = Math.max(this._min, Math.min(this._max, Number(v) || 0));
    this._syncSize();
    if (animate) {
      this._animFrom = this._currentDisplay;
      this._animTo = clamped;
      this._animStart = null;
      if (this._animFrame) cancelAnimationFrame(this._animFrame);
      this._animFrame = requestAnimationFrame(this._animate.bind(this));
    } else {
      this._value = clamped;
      this._currentDisplay = clamped;
      this._draw();
    }
    this._value = clamped;
  }

  _animate(now) {
    if (!this._animStart) this._animStart = now;
    const elapsed = now - this._animStart;
    const t = Math.min(1, elapsed / this._animateDuration);
    const eased = easeOutCubic(t);
    this._currentDisplay = this._animFrom + (this._animTo - this._animFrom) * eased;
    this._draw();
    if (t < 1) {
      this._animFrame = requestAnimationFrame(this._animate.bind(this));
    } else {
      this._animFrame = null;
    }
  }

  _draw() {
    const canvas = this._canvas;
    const ctx = this._ctx;
    const dpr = this._cachedDpr || window.devicePixelRatio || 1;
    const w = this._cachedW || canvas.clientWidth || canvas.width / dpr;
    const h = this._cachedH || canvas.clientHeight || canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const lw = this._lineWidth;
    const cx = w / 2;
    const bottom = h * 0.85;
    const radius = Math.min(w / 2 - lw, (h * 0.85) - lw) ;
    const range = this._max - this._min || 1;
    const value = this._currentDisplay;

    ctx.clearRect(0, 0, w, h);
    ctx.save();

    // Draw zone arcs
    if (this._zones.length) {
      for (const zone of this._zones) {
        const zFrom = Math.max(this._min, Number(zone.from ?? this._min));
        const zTo = Math.min(this._max, Number(zone.to ?? this._max));
        const startAngle = (-180 + ((zFrom - this._min) / range) * 180) * DEG;
        const endAngle = (-180 + ((zTo - this._min) / range) * 180) * DEG;
        ctx.beginPath();
        ctx.arc(cx, bottom, radius, startAngle, endAngle);
        ctx.strokeStyle = zone.color || '#666';
        ctx.lineWidth = lw;
        ctx.lineCap = 'butt';
        ctx.stroke();
      }
    } else {
      // Background arc
      ctx.beginPath();
      ctx.arc(cx, bottom, radius, -180 * DEG, 0);
      ctx.strokeStyle = this._bgColor;
      ctx.lineWidth = lw;
      ctx.lineCap = 'butt';
      ctx.stroke();

      // Filled arc
      const fillAngle = (-180 + ((value - this._min) / range) * 180) * DEG;
      ctx.beginPath();
      ctx.arc(cx, bottom, radius, -180 * DEG, fillAngle);
      ctx.strokeStyle = this._fillColor;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Needle
    const needleAngle = (-180 + ((value - this._min) / range) * 180) * DEG;
    const needleLen = radius - lw - 4;
    const nx = cx + Math.cos(needleAngle) * needleLen;
    const ny = bottom + Math.sin(needleAngle) * needleLen;
    ctx.beginPath();
    ctx.moveTo(cx, bottom);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = this._needleColor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Center pivot
    ctx.beginPath();
    ctx.arc(cx, bottom, 4, 0, Math.PI * 2);
    ctx.fillStyle = this._needleColor;
    ctx.fill();

    // Value text
    const computedFontSize = this._fontSize || Math.max(14, radius * 0.28);
    const computedColor = this._textColor || getComputedStyle(canvas).getPropertyValue('color').trim() || '#fff';
    ctx.fillStyle = computedColor;
    ctx.font = `bold ${computedFontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(value)}${this._unit}`, cx, bottom - radius * 0.35);

    // Min/max labels
    const labelFontSize = Math.max(10, computedFontSize * 0.55);
    ctx.font = `${labelFontSize}px sans-serif`;
    ctx.globalAlpha = 0.6;
    ctx.fillText(`${this._min}${this._unit}`, cx - radius + lw, bottom + 6);
    ctx.fillText(`${this._max}${this._unit}`, cx + radius - lw, bottom + 6);
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  destroy() {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    this._animFrame = null;
  }
}
