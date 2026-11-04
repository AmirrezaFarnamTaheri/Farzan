import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { inventoryCss, parseDeclarations } = require('../scripts/css-owner-inventory.cjs');

// Same selector, ordinary property, unconditional context and later imported
// enhancements owner. Do not erase structural, responsive or touch behaviors.
const retired = [
  ['.studio-toolbar-clusters', ['gap']],
  ['.studio-tool-group', ['gap']],
  ['.studio-workspace-grid', ['grid-template-columns', 'gap']],
  ['.studio-canvas-card', ['border-radius', 'border', 'background', 'box-shadow']],
  ['.studio-shell', ['height', 'min-height']],
  ['.studio-sidebar-card', ['max-height', 'padding']],
].flatMap(([selector, properties]) => properties.map(property => [selector, property]));

const report = inventoryCss();
const properties = (file, selector, property) => report.rules
  .filter(rule => rule.file === file && rule.selector === selector && rule.context === '')
  .flatMap(rule => parseDeclarations(rule.body))
  .filter(item => item.property === property);

describe('single final Studio base-property owner (#175)', () => {
  it.each(retired)('retires early views.css %s %s', (selector, property) => {
    expect(properties('views.css', selector, property),
      'shadowed base property ' + selector + ' ' + property).toHaveLength(0);
    expect(properties('farzan-redesign.css', selector, property).length,
      'required final owner ' + selector + ' ' + property).toBeGreaterThan(0);
    expect(report.propertyOwnership.finalDeclarations.find(item =>
      item.selector === selector && item.context === '' && item.property === property
    )?.owner.file).toBe('farzan-redesign.css');
  });

  it('retains Studio interactive and RTL/touch layout rules', () => {
    const source = fs.readFileSync('src/styles/views.css', 'utf8');
    expect(source).toContain('touch-action: none;');
    expect(source).toContain('padding-inline-end: var(--space-3);');
    expect(source).toContain('border-inline-end: 1px solid var(--glass-border);');
    expect(source).toContain('overflow-y: auto;');
    expect(source).toMatch(/@media \(max-width: 1024px\) \{\s*\.studio-workspace-grid \{\s*grid-template-columns: 1fr;/);
  });
});
