import { createToolBase } from './toolBase.js';

export const text = createToolBase({
  name: 'text',
  icon: 'T',
  cursor: 'text',
  onMouseDown(_ctx, point, state) {
    state.isDrawing = true;
    state.currentText = {
      type: 'text',
      x: point.x,
      y: point.y,
      text: '',
      fill: state.strokeColor,
      fontSize: state.fontSize,
      fontFamily: state.fontFamily,
    };
  },
  onMouseMove() {},
  onMouseUp(_ctx, _point, state) {
    state.isDrawing = false;
    const shape = state.currentText;
    state.currentText = null;
    return shape;
  },
});
