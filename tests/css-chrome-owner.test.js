import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/styles/workspace.css', 'utf8');
const owner = readFileSync('src/styles/farzan-redesign.css', 'utf8');
const imports = readFileSync('src/styles/index.css', 'utf8');

function rule(css, selector) {
  const key = selector + ' {';
  const start = css.indexOf(key);
  if (start < 0) throw new Error('Missing authoritative chrome selector: ' + selector);
  return css.slice(start + key.length, css.indexOf('}', start));
}

describe('single authoritative shared chrome CSS property ownership', () => {
  it('keeps the late redesign after workspace in the release entry', () => {
    expect(imports.indexOf("./workspace.css")).toBeLessThan(imports.indexOf("./farzan-redesign.css"));
  });

  it('owns navigation baseline border and interaction paint only in final redesign', () => {
    expect(source).not.toContain('.nav-item {');
    expect(source).not.toContain('.nav-item:hover:not(.active) {');
    expect(rule(owner, '.nav-item')).toMatch(/border:\s*1px solid transparent/);
    expect(rule(owner, '.nav-item:hover:not(.active)')).toMatch(/background:/);
  });

  it('owns sidebar-logo geometry, background and shadow in redesign', () => {
    expect(source).not.toContain('.sidebar-logo {');
    const final = rule(owner, '.sidebar-logo');
    expect(final).toMatch(/background:\s*transparent/);
    expect(final).toMatch(/box-shadow:\s*none/);
    expect(final).toMatch(/border-bottom:/);
  });

  it('keeps one winning rule for static topbar context and full-span activity across widths', () => {
    // The final global rules already apply at every breakpoint, so earlier
    // identical media overrides only obscure which declaration owns paint.
    const chromeHides = owner.match(/\.topbar-context\s*\{\s*display:\s*none;\s*\}/g) || [];
    const activityColumns = owner.match(/\.home-grid\s*>\s*\.home-card-activity\s*\{\s*grid-column:\s*1\s*\/\s*-1;\s*\}/g) || [];
    expect(chromeHides).toHaveLength(1);
    expect(activityColumns).toHaveLength(1);
  });

  it('removes the earlier topbar and sidebar paint blocks and retains the winning owners', () => {
    for (const selector of ['.topbar', '.sidebar']) {
      expect(source).not.toContain(selector + ' {');
      expect(rule(owner, selector)).toMatch(/box-shadow:\s*none/);
    }
    expect(rule(owner, '.topbar')).toMatch(/background:\s*var\(--surface\)/);
  });
});
