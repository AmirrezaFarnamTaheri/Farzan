import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
describe('pre-release animation and zoom entry footprint', () => {
  it('does not ship unused custom Timeline and CanvasZoom constructors', () => {
    expect(fs.existsSync('src/lib/timeline.js')).toBe(false);
    expect(fs.existsSync('src/features/canvasZoom.js')).toBe(false);
    const entry = fs.readFileSync('src/index.js', 'utf8');
    const shell = fs.readFileSync('app.js', 'utf8');
    const route = fs.readFileSync('canvas.js', 'utf8');
    expect(entry).not.toMatch(/Timeline|lib\/timeline/);
    expect(shell).not.toMatch(/CanvasZoom|features\/canvasZoom/);
    expect(route).toContain('screenToWorld');
  });
});
