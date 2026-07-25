import { createToolBase } from './toolBase.js';

export const circle = createToolBase({
  name: 'circle',
  icon: '⭕',
  cursor: 'crosshair',
  onMouseDown(_ctx, point, state) {
    state.isDrawing = true;
    state.currentShape = {
      type: 'circle',
      x: point.x,
      y: point.y,
      radius: 0,
      fill: state.fillColor,
      stroke: state.strokeColor,
      strokeWidth: state.strokeWidth,
      _startX: point.x,
      _startY: point.y,
    };
  },
  onMouseMove(_ctx, point, state) {
    if (!state.isDrawing || !state.currentShape) return;
    state.currentShape.radius = Math.hypot(point.x - state.currentShape._startX, point.y - state.currentShape._startY);
  },
  onMouseUp(_ctx, _point, state) {
    state.isDrawing = false;
    const shape = state.currentShape;
    state.currentShape = null;
    if (!shape) return null;
    delete shape._startX;
    delete shape._startY;
    return shape.radius > 2 ? shape : null;
  },
});
