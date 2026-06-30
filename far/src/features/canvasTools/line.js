import { createToolBase } from './toolBase.js';

export const line = createToolBase({
  name: 'line',
  icon: '📏',
  cursor: 'crosshair',
  onMouseDown(_ctx, point, state) {
    state.isDrawing = true;
    state.currentShape = {
      type: 'line',
      x1: point.x,
      y1: point.y,
      x2: point.x,
      y2: point.y,
      stroke: state.strokeColor,
      strokeWidth: state.strokeWidth,
    };
  },
  onMouseMove(_ctx, point, state) {
    if (!state.isDrawing || !state.currentShape) return;
    state.currentShape.x2 = point.x;
    state.currentShape.y2 = point.y;
  },
  onMouseUp(_ctx, _point, state) {
    state.isDrawing = false;
    const shape = state.currentShape;
    state.currentShape = null;
    if (!shape) return null;
    const dist = Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1);
    return dist > 2 ? shape : null;
  },
});
