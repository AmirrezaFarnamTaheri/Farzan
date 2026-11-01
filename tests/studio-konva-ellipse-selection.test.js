import { describe, expect, it } from 'vitest';
import { isKonvaV1TransformableNode } from '../src/features/studioKonvaDraftWorkspace.js';

describe('interactive Konva draft ellipse geometry (#172)', () => {
  it.each(['Rect', 'Circle', 'Ellipse'])('exposes a selection transformer for supported %s geometry', className => {
    expect(isKonvaV1TransformableNode({ getClassName: () => className })).toBe(true);
  });

  it.each(['Text', 'Line', 'Arrow', 'Group', '', null])('never attaches a transformer to unsupported %s geometry', className => {
    expect(isKonvaV1TransformableNode({ getClassName: () => className })).toBe(false);
  });

  it('refuses unknown nodes without dereferencing a missing Konva instance', () => {
    expect(isKonvaV1TransformableNode(null)).toBe(false);
    expect(isKonvaV1TransformableNode({})).toBe(false);
  });
});
