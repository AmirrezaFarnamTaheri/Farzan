import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('pre-release virtualized list footprint', () => {
  it('does not load an unused VirtualList engine without a real route consumer', () => {
    expect(fs.existsSync('src/lib/virtualScroll.js')).toBe(false);
    const entry = fs.readFileSync('src/index.js', 'utf8');
    expect(entry).not.toMatch(/VirtualList|virtualScroll/);
    const app = fs.readFileSync('app.js', 'utf8');
    expect(app).not.toMatch(/VirtualList|virtualScroll/);
    // The actual materials routes retain their own pagination and item caps.
    expect(app).toContain('data-per-page');
  });
});
