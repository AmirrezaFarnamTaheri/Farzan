import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { inventoryCss, parseDeclarations } = require('../scripts/css-owner-inventory.cjs');

// All entries are unconditional, unimportant, exact-selector declarations.
// The later redesign declaration wins at the same selector specificity.
// Retire only these earlier owners; leave responsive rules and interaction
// semantics in the original component stylesheet untouched.
const retired = [
  ['.courses-sidebar', ['position', 'top', 'display', 'gap']],
  ['.courses-list', ['gap', 'max-height', 'padding-inline-end']],
  ['.course-item', ['border', 'background', 'border-radius', 'padding', 'box-shadow']],
  ['.course-item::after', ['content']],
  ['.course-item:hover', ['transform', 'border-color', 'box-shadow']],
  ['.course-item.active', ['border-color', 'box-shadow']],
  ['.course-item-meta', ['font-size']],
  ['.topics-list', ['gap']],
  ['.topic-row', ['grid-template-columns', 'gap', 'border', 'background', 'border-radius', 'padding']],
  ['.topic-title', ['font-weight', 'line-height']],
  ['.topic-meta .badge', ['background', 'font-size']],
].flatMap(([selector, properties]) => properties.map(property => [selector, property]));

const report = inventoryCss();
const sourceDeclarations = (file, selector, property) => report.rules
  .filter(rule => rule.file === file && rule.selector === selector && rule.context === '')
  .flatMap(rule => parseDeclarations(rule.body))
  .filter(item => item.property === property);

describe('Courses uses a single authoritative base property owner (#175)', () => {
  it.each(retired)('retires shadowed views.css %s / %s', (selector, property) => {
    expect(sourceDeclarations('views.css', selector, property),
      'obsolete Courses property: ' + selector + ' ' + property).toHaveLength(0);
    const final = sourceDeclarations('farzan-redesign.css', selector, property);
    expect(final.length, 'required redesign property: ' + selector + ' ' + property)
      .toBeGreaterThan(0);
    const owner = report.propertyOwnership.finalDeclarations.find(item =>
      item.selector === selector && item.context === '' && item.property === property);
    expect(owner?.owner.file, 'final CSS source: ' + selector + ' ' + property)
      .toBe('farzan-redesign.css');
  });

  it('preserves source-level keyboard, interaction, scrolling and responsive affordances', () => {
    const source = fs.readFileSync('src/styles/views.css', 'utf8');
    expect(source).toContain('.course-item:focus-visible {');
    expect(source).toContain('.course-item:active {');
    expect(source).toContain('cursor: pointer;');
    expect(source).toContain('overflow: auto;');
    expect(source).toContain('.course-item--mixed::after {');
    expect(source).toContain('@media (max-width: 1024px) {');
  });
});
