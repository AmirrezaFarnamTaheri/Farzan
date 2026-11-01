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

  it('delegates medium-width main-content paint to the late redesign owner only', () => {
    const earlyLayout = fs.readFileSync('src/styles/layout.css', 'utf8');
    const redundant = /\.main-content\s*\{\s*width:\s*100%;\s*\}/g;
    // Both declarations are inside the same max-width:1023px condition.
    // An earlier identical declaration adds selector-ownership debt without
    // changing computed style; retain only the final themed owner.
    expect(earlyLayout.match(redundant)).toBeNull();
    expect(final.match(redundant)).toHaveLength(1);
    expect(earlyLayout).toContain('@media (max-width: 1023px)');
    expect(final).toContain('@media (max-width: 1023px)');
  });

  it('preserves the WebKit sidebar-nav mask fallback and workspace focus contrast tokens', () => {
    expect(source).toContain('-webkit-mask-image: none;');
    expect(source).toContain('--workspace-focus: var(--accent-dark);');
    expect(final).toContain('mask-image: none;');
  });
});


describe('superseded chrome declarations removed from earlier layers', () => {
  const study = fs.readFileSync('src/styles/study-polish.css', 'utf8');
  const enhancements = fs.readFileSync('src/styles/enhancements.css', 'utf8');
  const late = fs.readFileSync('src/styles/farzan-redesign.css', 'utf8');
  const getBlock = (css, selector) => {
    const start = css.indexOf(selector + ' {');
    expect(start).toBeGreaterThan(-1);
    const open = css.indexOf('{', start);
    return css.slice(open + 1, css.indexOf('}', open));
  };

  it('keeps sidebar and topbar blur/shadow reset only in the final redesign', () => {
    for (const selector of ['.sidebar', '.topbar']) {
      const early = getBlock(study, selector);
      const owner = getBlock(late, selector);
      expect(early).not.toMatch(/(?:^|;)\\s*(?:backdrop-filter|-webkit-backdrop-filter|box-shadow)\\s*:/);
      expect(owner).toMatch(/backdrop-filter:\\s*none/);
      expect(owner).toMatch(/box-shadow:\\s*none/);
    }
    expect(getBlock(study, '.sidebar')).toMatch(/border-inline-end:/);
    expect(getBlock(study, '.topbar')).toMatch(/border-bottom:/);
  });

  it('leaves navigation scroll-mask behavior but retires duplicate sizing', () => {
    const early = getBlock(enhancements, '.sidebar-nav');
    const owner = getBlock(late, '.sidebar-nav');
    expect(early).not.toMatch(/(?:^|;)\\s*(?:min-height|flex)\\s*:/);
    expect(early).toMatch(/-webkit-mask-image:/);
    expect(early).toMatch(/overscroll-behavior:\\s*contain/);
    expect(owner).toMatch(/min-height:\\s*0/);
    expect(owner).toMatch(/flex:\\s*1 1 auto/);
  });

  it('has one later owner of the desktop Courses row columns', () => {
    const early = getBlock(enhancements, '.view-courses .topic-row');
    const owner = getBlock(late, '.view-courses .topic-row');
    expect(early).not.toMatch(/grid-template-columns:/);
    expect(owner).toMatch(/grid-template-columns:\\s*minmax\\(0, 1fr\\) auto auto/);
    expect(early).toMatch(/min-height:\\s*72px/);
  });
});
