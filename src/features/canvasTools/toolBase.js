/**
 * Canvas Tool Base — composable tool interface.
 * Each tool: { name, icon, cursor, onActivate, onDeactivate, onMouseDown, onMouseMove, onMouseUp }
 */

export function createToolBase(overrides = {}) {
  return {
    name: 'base',
    icon: '',
    cursor: 'default',
    onActivate() {},
    onDeactivate() {},
    onMouseDown(_ctx, _point, _state) {},
    onMouseMove(_ctx, _point, _state) {},
    onMouseUp(_ctx, _point, _state) {},
    ...overrides,
  };
}
