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
  it('keeps the late redesign after workspace so deleting older duplicate values is visually inert', () => {
    expect(imports.indexOf("./workspace.css")).toBeLessThan(imports.indexOf("./farzan-redesign.css"));
  });

  it('owns the navigation transparent baseline border only in the final redesign rule', () => {
    expect(rule(source, '.nav-item')).not.toMatch(/(?:^|;)\s*border\s*:/);
    expect(rule(owner, '.nav-item')).toMatch(/border:\s*1px solid transparent/);
  });

  it('leaves the legacy sidebar-logo geometry but delegates identical background/shadow to redesign', () => {
    const original = rule(source, '.sidebar-logo');
    expect(original).toMatch(/border-color:\s*transparent/);
    expect(original).not.toMatch(/(?:^|;)\s*(?:background|box-shadow)\s*:/);
    const final = rule(owner, '.sidebar-logo');
    expect(final).toMatch(/background:\s*transparent/);
    expect(final).toMatch(/box-shadow:\s*none/);
  });

  it('keeps only one winning shadow reset for the topbar and sidebar', () => {
    for (const selector of ['.topbar', '.sidebar']) {
      expect(rule(source, selector)).not.toMatch(/(?:^|;)\s*box-shadow\s*:/);
      expect(rule(owner, selector)).toMatch(/box-shadow:\s*none/);
    }
  });
});
