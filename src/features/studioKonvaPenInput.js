/**
 * Single-pointer pen capture for the isolated Konva Studio draft.
 *
 * This layer never writes storage or Konva JSON. It samples world-space
 * coordinates and sends a completed stroke to the canonical-v1 session.
 * A second touch cancels the gesture; cancellation, taps and rejected
 * partial strokes never become stored elements.
 */
export function installKonvaPenInput({
  target, worldPoint, onPreview, onStroke, onError = () => {},
} = {}) {
  if (!target?.addEventListener || typeof worldPoint !== 'function'
    || typeof onPreview !== 'function' || typeof onStroke !== 'function') {
    throw new TypeError('Konva pen input needs a DOM target, projection and stroke callbacks');
  }

  let destroyed = false;
  let active = null;
  let pending = false;
  const down = new Set();
  const sample = event => {
    let point;
    try { point = worldPoint(event); } catch { return null; }
    if (!Array.isArray(point) || point.length !== 2
      || !point.every(value => typeof value === 'number' && Number.isFinite(value))) return null;
    return [point[0], point[1]];
  };
  const cancel = () => {
    if (!active) return;
    active = null;
    onPreview(null);
  };
  const release = event => {
    try { target.releasePointerCapture?.(event.pointerId); } catch {}
  };
  const addPoint = event => {
    if (!active || event.pointerId !== active.id) return;
    const point = sample(event);
    if (!point) return;
    const last = active.points.at(-1);
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= 1.5) {
      active.points.push(point);
      onPreview(active.points);
    }
  };

  const pointerDown = event => {
    if (destroyed || pending) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.pointerType === 'touch' && event.isPrimary === false && !down.size) return;
    down.add(event.pointerId);
    if (down.size !== 1) {
      cancel(); // Another finger is a gesture, not another pen stroke.
      return;
    }
    const point = sample(event);
    if (!point) {
      down.delete(event.pointerId);
      return;
    }
    active = { id: event.pointerId, points: [point] };
    onPreview(active.points);
    try { target.setPointerCapture?.(event.pointerId); } catch {}
    event.preventDefault?.();
  };
  const pointerMove = event => {
    if (destroyed || !active || down.size !== 1 || event.pointerId !== active.id) return;
    addPoint(event);
    event.preventDefault?.();
  };
  const pointerUp = event => {
    if (destroyed) return;
    if (active && event.pointerId === active.id && down.size === 1) {
      addPoint(event);
      const points = active.points.map(point => [...point]);
      active = null;
      if (points.length >= 2) {
        pending = true;
        Promise.resolve().then(() => onStroke(points)).catch(error => {
          if (!destroyed) onError(error);
        }).finally(() => {
          pending = false;
          if (!destroyed) onPreview(null);
        });
      } else {
        onPreview(null);
      }
      event.preventDefault?.();
    }
    down.delete(event.pointerId);
    release(event);
  };
  const pointerCancel = event => {
    if (destroyed) return;
    down.delete(event.pointerId);
    if (active?.id === event.pointerId) cancel();
    release(event);
  };

  const events = [
    ['pointerdown', pointerDown],
    ['pointermove', pointerMove],
    ['pointerup', pointerUp],
    ['pointercancel', pointerCancel],
    ['lostpointercapture', pointerCancel],
  ];
  for (const [name, listener] of events) target.addEventListener(name, listener);

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancel();
      down.clear();
      for (const [name, listener] of events) target.removeEventListener(name, listener);
    },
  };
}
