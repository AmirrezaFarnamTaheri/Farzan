import { createRequire } from 'node:module';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);

describe('CSS authoritative selector ownership', () => {
  it('has one enhancement-layer progress card min-width owner, with no duplicate earlier paint', () => {
    const early = fs.readFileSync('src/styles/progress-enhancements.css', 'utf8');
    const owner = fs.readFileSync('src/styles/farzan-redesign.css', 'utf8');
    const index = fs.readFileSync('src/styles/index.css', 'utf8');
    expect(early).not.toMatch(/\.progress-chart-card\s*,\s*\.progress-table-card\s*\{\s*min-width:\s*0\s*;\s*\}/);
    expect(owner).toMatch(/\.progress-chart-card\s*,\s*\.progress-table-card\s*\{\s*min-width:\s*0\s*;\s*\}/);
    expect(index.indexOf("progress-enhancements.css")).toBeLessThan(index.indexOf("farzan-redesign.css"));
  });

  it('has a reproducible stylesheet/at-rule inventory across all 22 imported stylesheets', () => {
    const { inventoryCss } = require('../scripts/css-owner-inventory.cjs');
    const report = inventoryCss();
    expect(report.stylesheets).toHaveLength(22);
    expect(report.stylesheets.map(x => x.file)).toContain('farzan-redesign.css');
    expect(report.stylesheets.every(x => x.bytes > 0 && x.ruleCount > 0)).toBe(true);
    expect(report.rules.length).toBeGreaterThan(1500);
    expect(report.owners.some(x => x.selector === '.progress-chart-card, .progress-table-card'
      && x.file === 'farzan-redesign.css' && x.context === '')).toBe(true);
    expect(report.exactDuplicates.some(x => x.selector === '.progress-chart-card, .progress-table-card'
      && x.body === 'min-width: 0;')).toBe(false);
  });
});
