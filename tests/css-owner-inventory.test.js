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

  it('rejects empty selector blocks in the imported component stylesheets', () => {
    const { inventoryCss } = require('../scripts/css-owner-inventory.cjs');
    const unused = inventoryCss().rules
      .filter(rule => rule.body.length === 0)
      .map(rule => `${rule.file}:${rule.line}: ${rule.selector}`);
    expect(unused).toEqual([]);
  });

  it('preserves quoted comment markers when collecting CSS declaration provenance', () => {
    const { parseRules, parseDeclarations } = require('../scripts/css-owner-inventory.cjs');
    const source = '.example::before { content: "/* literal ; : */"; color: red;'
      + ' /* actual stylesheet comment */ direction: rtl; }';
    const rules = parseRules(source, 'quoted-fixture.css', 'enhancements');
    expect(rules).toHaveLength(1);
    expect(rules[0].body).toContain('content: "/* literal ; : */"');
    expect(parseDeclarations(rules[0].body)).toContainEqual({
      property: 'content', value: '"/* literal ; : */"',
    });
    expect(parseDeclarations(rules[0].body)).toContainEqual({
      property: 'direction', value: 'rtl',
    });
  });

  it('retains selectors containing quoted literal braces without inventing nested rule owners', () => {
    const { parseRules, parseDeclarations } = require('../scripts/css-owner-inventory.cjs');
    const simple = '.study-tooltip::before { content: "{\\"lesson\\":1}"; color: red; }';
    const parsed = parseRules(simple, 'quoted.css', 'enhancements');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].selector).toBe('.study-tooltip::before');
    expect(parseDeclarations(parsed[0].body)).toContainEqual({
      property: 'content', value: '"{\\"lesson\\":1}"',
    });
    // Actual nested selector blocks are not declarations. The report must
    // avoid inventing an owner by flattening an unsupported CSS nesting.
    expect(parseRules('.parent { &:hover { color: blue; } }',
      'nested.css', 'enhancements')).toHaveLength(0);
  });

  it('has a reproducible stylesheet/at-rule inventory across all 22 imported stylesheets', () => {
    const { inventoryCss, parseRules } = require('../scripts/css-owner-inventory.cjs');
    const conditional = parseRules('@media (max-width: 640px) { .example { width: 100%; } } .example { width: 50%; }', 'fixture.css', 'enhancements');
    expect(conditional).toHaveLength(2);
    expect(conditional[0].context).toBe('@media (max-width: 640px)');
    expect(conditional[1].context).toBe('');
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
