import { createToolBase } from './toolBase.js';

export const fill = createToolBase({
  name: 'fill',
  icon: '🪣',
  cursor: 'cell',
  onMouseDown(_ctx, point, state) {
    const hit = state._hitTest?.(point.x, point.y);
    if (hit) {
      return { action: 'fill', elementId: hit.element.id, color: state.fillColor };
    }
    return null;
  },
  onMouseMove() {},
  onMouseUp() {},
});
