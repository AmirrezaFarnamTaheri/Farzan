import { createToolBase } from './toolBase.js';

export const pen = createToolBase({
  name: 'pen',
  icon: '✏️',
  cursor: 'crosshair',
  onMouseDown(ctx, point, state) {
    state.isDrawing = true;
    state.currentPath = {
      id: `path-${Date.now().toString(36)}`,
      type: 'polyline',
      points: [[point.x, point.y]],
      stroke: state.strokeColor,
      strokeWidth: Math.max(1, state.strokeWidth),
      fill: null,
      lineCap: state.lineCap,
      lineJoin: state.lineJoin,
    };
  },
  onMouseMove(ctx, point, state) {
    if (!state.isDrawing || !state.currentPath) return;
    const last = state.currentPath.points.at(-1);
    const dist = Math.hypot(point.x - last[0], point.y - last[1]);
    if (dist >= 1.5) {
      state.currentPath.points.push([point.x, point.y]);
    }
  },
  onMouseUp(ctx, point, state) {
    state.isDrawing = false;
    const path = state.currentPath;
    state.currentPath = null;
    return path?.points?.length >= 2 ? path : null;
  },
});
