/**
 * Canvas Zoom — d3-zoom pattern for Canvas2D.
 * Pan via mouse drag, zoom via wheel (zoom-to-cursor), pinch-to-zoom on touch.
 * Uses src/lib/easing.js for smooth transitions.
 *
 * Usage:
 *   const zoom = new CanvasZoom(canvas, { minZoom: 0.1, maxZoom: 10 });
 *   zoom.onTransform((transform) => { /* redraw with transform *\/ });
 *   zoom.zoomTo(2, { x: 400, y: 300 });
 *   zoom.panTo(100, 200);
 *   zoom.resetZoom();
 */

import { easeOutCubic } from '../lib/easing.js';

export class CanvasZoom {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.minZoom = Math.max(0.01, Number(options.minZoom) || 0.1);
    this.maxZoom = Math.min(100, Number(options.maxZoom) || 10);
    this.wheelSpeed = Number(options.wheelSpeed) || 0.002;
    this.enablePan = options.enablePan !== false;
    this.enableZoom = options.enableZoom !== false;
    this.enablePinch = options.enablePinch !== false;

    this._scale = 1;
    this._translateX = 0;
    this._translateY = 0;
    this._listeners = [];
    this._animFrame = null;

    this._dragging = false;
    this._dragStartX = 0;
    this._dragStartY = 0;
    this._dragStartTX = 0;
    this._dragStartTY = 0;

    this._pinching = false;
    this._pinchStartDist = 0;
    this._pinchStartScale = 1;
    this._pinchCenterX = 0;
    this._pinchCenterY = 0;

    this._boundWheel = this._onWheel.bind(this);
    this._boundPointerDown = this._onPointerDown.bind(this);
    this._boundPointerMove = this._onPointerMove.bind(this);
    this._boundPointerUp = this._onPointerUp.bind(this);
    this._boundTouchStart = this._onTouchStart.bind(this);
    this._boundTouchMove = this._onTouchMove.bind(this);
    this._boundTouchEnd = this._onTouchEnd.bind(this);

    canvas.addEventListener('wheel', this._boundWheel, { passive: false });
    canvas.addEventListener('pointerdown', this._boundPointerDown);
    canvas.addEventListener('pointermove', this._boundPointerMove);
    canvas.addEventListener('pointerup', this._boundPointerUp);
    canvas.addEventListener('pointercancel', this._boundPointerUp);
    canvas.addEventListener('touchstart', this._boundTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this._boundTouchMove, { passive: false });
    canvas.addEventListener('touchend', this._boundTouchEnd);
    canvas.addEventListener('touchcancel', this._boundTouchEnd);
  }

  get transform() {
    return { scale: this._scale, translateX: this._translateX, translateY: this._translateY };
  }

  get matrix() {
    return [this._scale, 0, 0, this._scale, this._translateX, this._translateY];
  }

  onTransform(callback) {
    if (typeof callback === 'function') this._listeners.push(callback);
    return () => {
      const idx = this._listeners.indexOf(callback);
      if (idx >= 0) this._listeners.splice(idx, 1);
    };
  }

  _notify() {
    const t = this.transform;
    for (const fn of this._listeners) {
      try { fn(t); } catch (e) { console.error('[CanvasZoom]', e); }
    }
  }

  applyToContext() {
    this.ctx.setTransform(this._scale, 0, 0, this._scale, this._translateX, this._translateY);
  }

  resetContext() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this._translateX) / this._scale,
      y: (sy - this._translateY) / this._scale,
    };
  }

  worldToScreen(wx, wy) {
    return {
      x: wx * this._scale + this._translateX,
      y: wy * this._scale + this._translateY,
    };
  }

  _clampScale(s) {
    return Math.max(this.minZoom, Math.min(this.maxZoom, s));
  }

  _onWheel(e) {
    if (!this.enableZoom) return;
    e.preventDefault();

    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const delta = -e.deltaY * this.wheelSpeed;
    const factor = Math.pow(2, delta);
    const newScale = this._clampScale(this._scale * factor);
    const ratio = newScale / this._scale;

    this._translateX = mx - ratio * (mx - this._translateX);
    this._translateY = my - ratio * (my - this._translateY);
    this._scale = newScale;

    this._notify();
  }

  _onPointerDown(e) {
    if (!this.enablePan) return;
    if (e.pointerType === 'touch' && this.enablePinch) return;

    this._dragging = true;
    this._dragStartX = e.clientX;
    this._dragStartY = e.clientY;
    this._dragStartTX = this._translateX;
    this._dragStartTY = this._translateY;
    try { this.canvas.setPointerCapture(e.pointerId); } catch {}
  }

  _onPointerMove(e) {
    if (!this._dragging) return;
    const dx = e.clientX - this._dragStartX;
    const dy = e.clientY - this._dragStartY;
    this._translateX = this._dragStartTX + dx;
    this._translateY = this._dragStartTY + dy;
    this._notify();
  }

  _onPointerUp(e) {
    if (this._dragging) {
      this._dragging = false;
      try { this.canvas.releasePointerCapture(e.pointerId); } catch {}
    }
  }

  _getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _getTouchCenter(touches, rect) {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
      y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top,
    };
  }

  _onTouchStart(e) {
    if (!this.enablePinch || e.touches.length < 2) return;
    e.preventDefault();
    this._pinching = true;
    this._dragging = false;
    const rect = this.canvas.getBoundingClientRect();
    this._pinchStartDist = this._getTouchDist(e.touches);
    this._pinchStartScale = this._scale;
    const center = this._getTouchCenter(e.touches, rect);
    this._pinchCenterX = center.x;
    this._pinchCenterY = center.y;
  }

  _onTouchMove(e) {
    if (!this._pinching || e.touches.length < 2) return;
    e.preventDefault();

    const rect = this.canvas.getBoundingClientRect();
    const dist = this._getTouchDist(e.touches);
    const center = this._getTouchCenter(e.touches, rect);
    const factor = dist / (this._pinchStartDist || 1);
    const newScale = this._clampScale(this._pinchStartScale * factor);
    const ratio = newScale / this._scale;

    this._translateX = this._pinchCenterX - ratio * (this._pinchCenterX - this._translateX);
    this._translateY = this._pinchCenterY - ratio * (this._pinchCenterY - this._translateY);
    this._scale = newScale;
    this._pinchCenterX = center.x;
    this._pinchCenterY = center.y;

    this._notify();
  }

  _onTouchEnd(e) {
    if (e.touches.length < 2) {
      this._pinching = false;
    }
  }

  zoomTo(scale, center = null, options = {}) {
    const newScale = this._clampScale(Number(scale) || 1);
    const duration = Number(options.duration) || 300;
    const cx = center?.x ?? this.canvas.width / 2;
    const cy = center?.y ?? this.canvas.height / 2;

    if (duration <= 0) {
      const ratio = newScale / this._scale;
      this._translateX = cx - ratio * (cx - this._translateX);
      this._translateY = cy - ratio * (cy - this._translateY);
      this._scale = newScale;
      this._notify();
      return;
    }

    this._animate({
      scale: { from: this._scale, to: newScale },
      tx: { from: this._translateX, to: cx - (newScale / this._scale) * (cx - this._translateX) },
      ty: { from: this._translateY, to: cy - (newScale / this._scale) * (cy - this._translateY) },
      duration,
    });
  }

  panTo(x, y, options = {}) {
    const duration = Number(options.duration) || 300;
    if (duration <= 0) {
      this._translateX = Number(x) || 0;
      this._translateY = Number(y) || 0;
      this._notify();
      return;
    }

    this._animate({
      scale: { from: this._scale, to: this._scale },
      tx: { from: this._translateX, to: Number(x) || 0 },
      ty: { from: this._translateY, to: Number(y) || 0 },
      duration,
    });
  }

  resetZoom(_options = {}) {
    this._scale = 1;
    this._translateX = 0;
    this._translateY = 0;
    this._notify();
  }

  _animate(params) {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    const start = performance.now();
    const { scale, tx, ty, duration } = params;

    const step = (now) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(t);

      this._scale = scale.from + (scale.to - scale.from) * eased;
      this._translateX = tx.from + (tx.to - tx.from) * eased;
      this._translateY = ty.from + (ty.to - ty.from) * eased;

      this._notify();

      if (t < 1) {
        this._animFrame = requestAnimationFrame(step);
      } else {
        this._animFrame = null;
      }
    };

    this._animFrame = requestAnimationFrame(step);
  }

  destroy() {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    this.canvas.removeEventListener('wheel', this._boundWheel);
    this.canvas.removeEventListener('pointerdown', this._boundPointerDown);
    this.canvas.removeEventListener('pointermove', this._boundPointerMove);
    this.canvas.removeEventListener('pointerup', this._boundPointerUp);
    this.canvas.removeEventListener('pointercancel', this._boundPointerUp);
    this.canvas.removeEventListener('touchstart', this._boundTouchStart);
    this.canvas.removeEventListener('touchmove', this._boundTouchMove);
    this.canvas.removeEventListener('touchend', this._boundTouchEnd);
    this.canvas.removeEventListener('touchcancel', this._boundTouchEnd);
    this._listeners.length = 0;
  }
}
