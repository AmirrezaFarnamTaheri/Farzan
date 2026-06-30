import { createToolBase } from './toolBase.js';

export const eraser = createToolBase({
  name: 'eraser',
  icon: '🧹',
  cursor: 'cell',
  onMouseDown(_ctx, _point, state) {
    state.isDrawing = true;
    state._eraseIds = [];
  },
  onMouseMove(ctx, point, state) {
    if (!state.isDrawing) return;
    const hit = state._hitTest?.(point.x, point.y);
    if (hit && !state._eraseIds.includes(hit.element.id)) {
      state._eraseIds.push(hit.element.id);
    }
  },
  onMouseUp(_ctx, _point, state) {
    state.isDrawing = false;
    const ids = state._eraseIds || [];
    state._eraseIds = [];
    return ids;
  },
});
