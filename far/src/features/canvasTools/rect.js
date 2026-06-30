import { createToolBase } from './toolBase.js';

export const rect = createToolBase({
  name: 'rect',
  icon: '⬜',
  cursor: 'crosshair',
  onMouseDown(_ctx, point, state) {
    state.isDrawing = true;
    state.currentShape = {
      type: 'rect',
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
      fill: state.fillColor,
      stroke: state.strokeColor,
      strokeWidth: state.strokeWidth,
      _startX: point.x,
      _startY: point.y,
    };
  },
  onMouseMove(_ctx, point, state) {
    if (!state.isDrawing || !state.currentShape) return;
    const s = state.currentShape;
    s.x = Math.min(s._startX, point.x);
    s.y = Math.min(s._startY, point.y);
    s.width = Math.abs(point.x - s._startX);
    s.height = Math.abs(point.y - s._startY);
  },
  onMouseUp(_ctx, _point, state) {
    state.isDrawing = false;
    const shape = state.currentShape;
    state.currentShape = null;
    if (!shape) return null;
    delete shape._startX;
    delete shape._startY;
    return shape.width > 2 && shape.height > 2 ? shape : null;
  },
});
