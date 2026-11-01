import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync('src/styles/workspace.css', 'utf8');
const final = fs.readFileSync('src/styles/farzan-redesign.css', 'utf8');
const manifest = fs.readFileSync('src/styles/index.css', 'utf8');
const selectorOwners = [
  '.main-content',
  '.sidebar',
  '.sidebar-logo',
  '.nav-group-label',
  '.nav-item',
  '.nav-item:hover:not(.active)',
  '.nav-item.active,\n.nav-item[aria-current="page"]',
  '[dir="rtl"] .nav-item.active,\n[dir="rtl"] .nav-item[aria-current="page"]',
  '.topbar',
];

describe('single final owner of shared navigation/topbar chrome', () => {
  it('ships workspace.css before the authoritative redesign layer', () => {
    const early = manifest.indexOf("@import './workspace.css'");
    const late = manifest.indexOf("@import './farzan-redesign.css'");
    expect(early).toBeGreaterThan(-1);
    expect(late).toBeGreaterThan(early);
  });

  it.each(selectorOwners)('has only the authoritative late owner for %s', selector => {
    expect(source).not.toContain(selector + ' {');
    expect(final).toContain(selector + ' {');
  });

  it('preserves the WebKit sidebar-nav mask fallback and workspace focus contrast tokens', () => {
    expect(source).toContain('-webkit-mask-image: none;');
    expect(source).toContain('--workspace-focus: var(--accent-dark);');
    expect(final).toContain('mask-image: none;');
  });
});
