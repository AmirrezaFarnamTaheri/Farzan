import { createToolBase } from './toolBase.js';

export const select = createToolBase({
  name: 'select',
  icon: '🔲',
  cursor: 'default',
  onMouseDown(_ctx, point, state) {
    const hit = state._hitTest?.(point.x, point.y);
    if (hit) {
      state.selectedIds = new Set([hit.element.id]);
      state.isDragging = !hit.layer.locked;
    } else {
      state.selectedIds = new Set();
      state.isDragging = false;
    }
  },
  onMouseMove(_ctx, point, state) {
    if (!state.isDragging || !state.selectedIds.size) return;
    const dx = point.x - state.dragLastX;
    const dy = point.y - state.dragLastY;
    if (dx || dy) {
      state.dragLastX = point.x;
      state.dragLastY = point.y;
    }
  },
  onMouseUp(_ctx, _point, state) {
    state.isDragging = false;
  },
});
