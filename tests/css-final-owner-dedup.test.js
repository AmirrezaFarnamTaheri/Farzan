import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { inventoryCss, parseDeclarations } = require('../scripts/css-owner-inventory.cjs');

describe('final-layer shared workspace style ownership (#175)', () => {
  it('retains seven proven final enhancement declarations without earlier duplicate values', () => {
    const report = inventoryCss();
    const rules = report.rules;
    // All of these are the same selector, property, value and empty at-rule
    // context in the SAME enhancement layer. The later farzan-redesign.css
    // declaration is authoritative; removing its earlier exact duplicate
    // cannot change same-layer cascade order or the computed value.
    const duplicates = [
      ['workspace.css', '.view-courses .filter-chip', 'background', 'var(--surface)'],
      ['workspace.css', '.home-title', 'font-family', 'var(--font-serif)'],
      ['study-polish.css', '.home-focus-panel', 'justify-content', 'center'],
      ['study-polish.css', '.home-focus-panel', 'min-height', '0'],
      ['study-polish.css', '.home-focus-progress', 'box-shadow', 'none'],
      ['workspace.css', '.home-pulse-item', 'background', 'var(--surface)'],
      ['workspace.css', '.card:hover, .card.card-interactive:hover', 'transform', 'none'],
    ];
    for (const [earlier, selector, property, value] of duplicates) {
      const declarations = file => rules
        .filter(rule => rule.file === file && rule.selector === selector && rule.context === '')
        .flatMap(rule => parseDeclarations(rule.body))
        .filter(item => item.property === property).map(item => item.value);
      expect(declarations(earlier), `${selector} ${property}: earlier ${earlier}`).not.toContain(value);
      expect(declarations('farzan-redesign.css'), `${selector} ${property}: final owner`).toContain(value);
      const final = report.propertyOwnership.finalDeclarations.find(item =>
        item.selector === selector && item.context === '' && item.property === property);
      expect(final?.owner.file).toBe('farzan-redesign.css');
    }
  });
});
