/**
 * Pointer — unified mouse + touch handling.
 * Based on Phaser Pointer pattern.
 * Tracks: position, velocity, angle, distance, button state.
 * Multi-pointer: up to 5 simultaneous touch points.
 * Pinch-to-zoom gesture detection.
 */

export class Pointer {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.prevX = 0;
    this.prevY = 0;
    this.velocityX = 0;
    this.velocityY = 0;
    this.angle = 0;
    this.distance = 0;
    this.button = -1;
    this.isDown = false;
    this.pointerId = null;
    this.pointerType = 'mouse';

    /** @type {Map<number, {x:number,y:number,prevX:number,prevY:number}>} */
    this._pointers = new Map();
    this._pinchStartDist = 0;
    this._pinchScale = 1;
    this._pinching = false;

    this._onDown = null;
    this._onMove = null;
    this._onUp = null;
    this._onPinch = null;

    this._el = null;
    this._boundHandleDown = null;
    this._boundHandleMove = null;
    this._boundHandleUp = null;
    this._boundHandleTouchStart = null;
    this._boundHandleTouchMove = null;
    this._boundHandleTouchEnd = null;
  }

  /**
   * Bind to an element.
   * @param {HTMLElement} el
   * @param {Object} callbacks
   * @param {function} [callbacks.onDown]
   * @param {function} [callbacks.onMove]
   * @param {function} [callbacks.onUp]
   * @param {function} [callbacks.onPinch] — called with { scale, centerX, centerY }
   */
  bind(el, callbacks = {}) {
    // Re-binding without unbinding used to orphan the previous element's
    // eight listeners: the bound-handler references were overwritten, so
    // destroy() could no longer remove them and they pinned this instance
    // (and the old element) for the page lifetime.
    if (this._el) this.destroy();
    this._el = el;
    this._onDown = callbacks.onDown || null;
    this._onMove = callbacks.onMove || null;
    this._onUp = callbacks.onUp || null;
    this._onPinch = callbacks.onPinch || null;

    const opts = { passive: false };

    this._boundHandleDown = (e) => this._handleDown(e);
    this._boundHandleMove = (e) => this._handleMove(e);
    this._boundHandleUp = (e) => this._handleUp(e);
    this._boundHandleTouchStart = (e) => this._handleTouchStart(e);
    this._boundHandleTouchMove = (e) => this._handleTouchMove(e);
    this._boundHandleTouchEnd = (e) => this._handleTouchEnd(e);

    el.addEventListener('pointerdown', this._boundHandleDown, opts);
    el.addEventListener('pointermove', this._boundHandleMove, opts);
    el.addEventListener('pointerup', this._boundHandleUp, opts);
    el.addEventListener('pointercancel', this._boundHandleUp, opts);

    el.addEventListener('touchstart', this._boundHandleTouchStart, opts);
    el.addEventListener('touchmove', this._boundHandleTouchMove, opts);
    el.addEventListener('touchend', this._boundHandleTouchEnd, opts);
    el.addEventListener('touchcancel', this._boundHandleTouchEnd, opts);
  }

  _handleDown(e) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.x = e.clientX;
    this.y = e.clientY;
    this.button = e.button;
    this.isDown = true;
    this.pointerId = e.pointerId;
    this.pointerType = e.pointerType;
    this.velocityX = 0;
    this.velocityY = 0;

    this._pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      prevX: e.clientX,
      prevY: e.clientY,
    });
    if (this._pointers.size > 5) {
      const oldest = this._pointers.keys().next().value;
      this._pointers.delete(oldest);
    }

    this._onDown?.({
      x: this.x,
      y: this.y,
      button: e.button,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      event: e,
    });
  }

  _handleMove(e) {
    const prev = this._pointers.get(e.pointerId);
    this.prevX = prev?.x ?? this.x;
    this.prevY = prev?.y ?? this.y;
    this.x = e.clientX;
    this.y = e.clientY;
    this.velocityX = this.x - this.prevX;
    this.velocityY = this.y - this.prevY;
    this.deltaX = this.velocityX;
    this.deltaY = this.velocityY;
    this.distance = Math.hypot(this.velocityX, this.velocityY);
    this.angle = Math.atan2(this.velocityY, this.velocityX);

    this._pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      prevX: this.prevX,
      prevY: this.prevY,
    });

    this._onMove?.({
      x: this.x,
      y: this.y,
      velocityX: this.velocityX,
      velocityY: this.velocityY,
      deltaX: this.deltaX,
      deltaY: this.deltaY,
      distance: this.distance,
      angle: this.angle,
      pointerId: e.pointerId,
      event: e,
    });
  }

  _handleUp(e) {
    this.isDown = false;
    this.button = -1;
    this._pointers.delete(e.pointerId);

    this._onUp?.({
      x: this.x,
      y: this.y,
      pointerId: e.pointerId,
      event: e,
    });
  }

  _handleTouchStart(e) {
    if (e.touches.length === 2) {
      this._pinchStartDist = this._touchDist(e.touches);
      this._pinching = true;
    }
  }

  _handleTouchMove(e) {
    if (this._pinching && e.touches.length === 2) {
      const dist = this._touchDist(e.touches);
      if (this._pinchStartDist > 0) {
        this._pinchScale = dist / this._pinchStartDist;
        const center = this._touchCenter(e.touches);
        this._onPinch?.({
          scale: this._pinchScale,
          centerX: center.x,
          centerY: center.y,
          distance: dist,
        });
      }
    }
  }

  _handleTouchEnd(e) {
    if (e.touches.length < 2) {
      this._pinching = false;
      this._pinchStartDist = 0;
      this._pinchScale = 1;
    }
  }

  _touchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  _touchCenter(touches) {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  }

  /**
   * Get active pointer count.
   * @returns {number}
   */
  get pointerCount() {
    return this._pointers.size;
  }

  /**
   * Get all active pointers.
   * @returns {{x:number,y:number,prevX:number,prevY:number}[]}
   */
  getAll() {
    return [...this._pointers.values()];
  }

  destroy() {
    if (this._el) {
      const opts = { passive: false };
      if (this._boundHandleDown) this._el.removeEventListener('pointerdown', this._boundHandleDown, opts);
      if (this._boundHandleMove) this._el.removeEventListener('pointermove', this._boundHandleMove, opts);
      if (this._boundHandleUp) this._el.removeEventListener('pointerup', this._boundHandleUp, opts);
      if (this._boundHandleUp) this._el.removeEventListener('pointercancel', this._boundHandleUp, opts);
      if (this._boundHandleTouchStart) this._el.removeEventListener('touchstart', this._boundHandleTouchStart, opts);
      if (this._boundHandleTouchMove) this._el.removeEventListener('touchmove', this._boundHandleTouchMove, opts);
      if (this._boundHandleTouchEnd) this._el.removeEventListener('touchend', this._boundHandleTouchEnd, opts);
      if (this._boundHandleTouchEnd) this._el.removeEventListener('touchcancel', this._boundHandleTouchEnd, opts);
      this._el = null;
    }
    this._boundHandleDown = null;
    this._boundHandleMove = null;
    this._boundHandleUp = null;
    this._boundHandleTouchStart = null;
    this._boundHandleTouchMove = null;
    this._boundHandleTouchEnd = null;
    this._pointers.clear();
    this._onDown = null;
    this._onMove = null;
    this._onUp = null;
    this._onPinch = null;
  }
}

if (typeof window !== 'undefined') {
  window.OpenCourseDeck = window.OpenCourseDeck ?? {};
  window.OpenCourseDeck.Pointer = Pointer;
}
