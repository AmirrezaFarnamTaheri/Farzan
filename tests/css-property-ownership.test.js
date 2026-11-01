import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { parseRules, propertyOwnership, inventoryCss } = require('../scripts/css-owner-inventory.cjs');

describe('authoritative property-level CSS provenance (#175)', () => {
  it('records source order and the final declaration, with conflicts separately from identical duplicates', () => {
    const early = parseRules('.example { min-width: 0; color: red; }', 'early.css', 'base');
    const late = parseRules('.example { color: blue; min-width: 0; }', 'late.css', 'refinements');
    const report = propertyOwnership([...early, ...late]);
    expect(report.finalDeclarations).toEqual(expect.arrayContaining([
      expect.objectContaining({ selector: '.example', property: 'color',
        owner: expect.objectContaining({ file: 'late.css', value: 'blue' }) }),
      expect.objectContaining({ selector: '.example', property: 'min-width',
        owner: expect.objectContaining({ file: 'late.css', value: '0' }) }),
    ]));
    expect(report.overlaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ selector: '.example', property: 'color', sameValue: false,
        declarations: expect.arrayContaining([expect.objectContaining({ file: 'early.css', value: 'red' })]) }),
      expect.objectContaining({ selector: '.example', property: 'min-width', sameValue: true }),
    ]));
  });

  it('does not coalesce different media or supports conditions', () => {
    const source = [
      '@media (max-width: 600px) { .example { color: red; } }',
      '@supports (display: grid) { .example { color: blue; } }',
      '.example { color: black; }',
    ].join(' ');
    const rules = parseRules(source, 'one.css', 'enhancements');
    const report = propertyOwnership(rules);
    expect(report.finalDeclarations).toHaveLength(3);
    expect(report.overlaps).toHaveLength(0);
  });

  it('keeps quoted/functional semicolons inside one declaration', () => {
    const rules = parseRules('.example { content: "a;b"; background: url("data:image/svg+xml;a=b"); }', 'quoted.css', 'base');
    const report = propertyOwnership(rules);
    expect(report.finalDeclarations.map(x => [x.property, x.owner.value])).toEqual([
      ['content', '"a;b"'], ['background', 'url("data:image/svg+xml;a=b")'],
    ]);
  });

  it('includes property ownership, duplicate and conflict counts for all imported stylesheets', () => {
    const report = inventoryCss();
    expect(report.stylesheets).toHaveLength(22);
    expect(report.propertyOwnership.finalDeclarations.length).toBeGreaterThan(1000);
    expect(report.propertyOwnership.overlaps.every(x => x.declarations.length >= 2)).toBe(true);
    expect(report.propertyOwnership.overlaps.every(x => x.files.length >= 2)).toBe(true);
    expect(report.propertyOwnership.finalDeclarations.some(x => x.owner.file === 'farzan-redesign.css')).toBe(true);
  });
});
