import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = name => fs.readFileSync('src/styles/' + name, 'utf8');

describe('single provable owner for exact overlapping CSS rules', () => {
  it('keeps the final mobile drawer-open transform while removing the identical layout-layer copy', () => {
    const layout = read('layout.css');
    const redesign = read('farzan-redesign.css');
    expect(layout).not.toMatch(/\.sidebar\.sidebar-mobile-open\s*\{\s*transform:\s*translateX\(0\);\s*\}/);
    expect(redesign).toMatch(/\.sidebar\.sidebar-mobile-open\s*\{\s*transform:\s*translateX\(0\);\s*\}/);
    // The earlier RTL mobile *closed* transform still exists, so opening is
    // resolved by the single later explicit owner in both directions.
    expect(layout).toContain('[dir="rtl"] .sidebar {');
  });

  it('keeps the later mobile hero padding rule without duplicate earlier view-layer paint', () => {
    const early = read('views.css');
    const final = read('study-polish.css');
    expect(early).not.toMatch(/\.home-hero\s*\{\s*padding:\s*var\(--space-5\);\s*\}/);
    expect(final).toMatch(/\.home-hero\s*\{\s*padding:\s*var\(--space-5\);\s*\}/);
  });

  it('retains exactly one important hide utility at its higher-priority declared layer', () => {
    const manifest = read('index.css');
    const utility = read('utilities.css');
    const enhancement = read('enhancements.css');
    const hide = /\.hidden\s*\{\s*display:\s*none\s*!important;\s*\}/g;
    expect([...utility.matchAll(hide)]).toHaveLength(1);
    expect([...enhancement.matchAll(hide)]).toHaveLength(0);
    expect(manifest.indexOf("@import './utilities.css' layer(utilities)"))
      .toBeLessThan(manifest.indexOf("@import './enhancements.css' layer(enhancements)"));
  });
});
