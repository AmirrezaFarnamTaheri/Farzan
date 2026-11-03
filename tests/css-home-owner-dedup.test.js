import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { inventoryCss, parseDeclarations } = require('../scripts/css-owner-inventory.cjs');

function values(report, file, selector, property) {
  return report.rules
    .filter(rule => rule.file === file && rule.selector === selector && rule.context === '')
    .flatMap(rule => parseDeclarations(rule.body))
    .filter(item => item.property === property)
    .map(item => item.value);
}

describe('Home workspace and final redesign cascade ownership (#175)', () => {
  it('keeps single authoritative later owners for superseded Home presentation', () => {
    const report = inventoryCss();
    const manifest = report.stylesheets.map(sheet => sheet.file);
    expect(manifest.indexOf('study-polish.css')).toBeLessThan(manifest.indexOf('workspace.css'));
    expect(manifest.indexOf('workspace.css')).toBeLessThan(manifest.indexOf('farzan-redesign.css'));
    const final = [
      ['.home-subtitle', 'color', '#d5e8f6'],
      ['.home-actions', 'gap', '9px'],
      ['.home-command-strip', 'padding-top', '15px'],
      ['.home-focus-status', 'background', '#eaf3fb'],
      ['.home-focus-meta', 'color', '#617387'],
      ['.home-focus-action:hover', 'background', '#e5f1fc'],
      ['.home-title', 'letter-spacing', '-.05em'],
    ];
    for (const [selector, property, value] of final) {
      expect(values(report, 'workspace.css', selector, property),
        `retired old workspace owner: ${selector} ${property}`).toHaveLength(0);
      expect(values(report, 'farzan-redesign.css', selector, property),
        `final Home owner: ${selector} ${property}`).toContain(value);
      const owner = report.propertyOwnership.finalDeclarations.find(item =>
        item.selector === selector && item.context === '' && item.property === property);
      expect(owner?.owner.file).toBe('farzan-redesign.css');
    }
  });

  it('retains truly independent workspace border, text wrap and focus styles', () => {
    const report = inventoryCss();
    const unique = [
      ['.home-hero', 'border', '1px solid var(--workspace-rule)'],
      ['.home-title', 'text-wrap', 'balance'],
      ['.home-focus-action:hover', 'border-color', 'var(--workspace-rule-strong)'],
      ['.home-pulse-item:hover', 'border-color', 'var(--workspace-rule)'],
    ];
    for (const [selector, property, value] of unique) {
      expect(values(report, 'workspace.css', selector, property),
        `preserved workspace behavior: ${selector} ${property}`).toContain(value);
    }
  });
});
