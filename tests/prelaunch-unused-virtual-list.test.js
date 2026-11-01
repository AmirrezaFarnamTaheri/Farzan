import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('pre-release virtualized list footprint', () => {
  it('does not load an unused VirtualList engine without a real route consumer', () => {
    for (const dead of [
      'src/lib/virtualScroll.js',
      'src/lib/rafLoop.js',
      'src/lib/requestQueue.js',
      'src/lib/hElement.js',
      'src/lib/stagger.js',
    ]) expect(fs.existsSync(dead), dead).toBe(false);
    const entry = fs.readFileSync('src/index.js', 'utf8');
    expect(entry).not.toMatch(/VirtualList|virtualScroll|RAFLoop|RequestQueue|HElement|\bstagger\b/);
    const app = fs.readFileSync('app.js', 'utf8');
    expect(app).not.toMatch(/VirtualList|virtualScroll|RAFLoop|RequestQueue|HElement/);
    // The actual materials routes retain their own pagination and item caps.
    expect(app).toContain('data-per-page');
  });
});
