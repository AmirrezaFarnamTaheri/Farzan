import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { inventoryCss, parseDeclarations } = require('../scripts/css-owner-inventory.cjs');
const declarations = (report, file, selector, property) => report.rules
  .filter(rule => rule.file === file && rule.selector === selector && rule.context === '')
  .flatMap(rule => parseDeclarations(rule.body))
  .filter(decl => decl.property === property).map(decl => decl.value);

describe('single final owner for shared Home presentation (#175)', () => {
  it('loads final redesign paint after the earlier polish and workspace layers', () => {
    const report = inventoryCss();
    const files = report.stylesheets.map(x => x.file);
    expect(files.indexOf('study-polish.css')).toBeLessThan(files.indexOf('workspace.css'));
    expect(files.indexOf('workspace.css')).toBeLessThan(files.indexOf('farzan-redesign.css'));
    for (const [property, expected] of [
      ['background', '#fff'],
      ['box-shadow', '0 10px 30px rgba(0,0,0,.09)'],
    ]) {
      expect(declarations(report, 'study-polish.css', '.home-focus-panel', property)).toHaveLength(0);
      expect(declarations(report, 'workspace.css', '.home-focus-panel', property)).toHaveLength(0);
      expect(declarations(report, 'farzan-redesign.css', '.home-focus-panel', property))
        .toContain(expected);
    }
  });

  it('keeps correct Home action touch height and paint only in the final owner', () => {
    const report = inventoryCss();
    for (const [property, expected] of [
      ['min-height', '46px'],
      ['background', '#f2f7fc'],
    ]) {
      expect(declarations(report, 'study-polish.css', '.home-focus-action', property)).toHaveLength(0);
      expect(declarations(report, 'workspace.css', '.home-focus-action', property)).toHaveLength(0);
      expect(declarations(report, 'farzan-redesign.css', '.home-focus-action', property))
        .toContain(expected);
    }
  });

  it('retains final Home grid spacing without an abandoned workspace rule', () => {
    const report = inventoryCss();
    for (const [property, expected] of [
      ['gap', '18px'],
      ['margin-top', '20px'],
    ]) {
      expect(declarations(report, 'workspace.css', '.home-grid', property)).toHaveLength(0);
      expect(declarations(report, 'farzan-redesign.css', '.home-grid', property))
        .toContain(expected);
    }
  });
});
