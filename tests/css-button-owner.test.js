import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workspace = readFileSync('src/styles/workspace.css', 'utf8');
const redesign = readFileSync('src/styles/farzan-redesign.css', 'utf8');

function rule(css, selector) {
  const token = selector + ' {';
  const start = css.indexOf(token);
  if (start < 0) throw new Error('Required selector missing: ' + selector);
  return css.slice(start + token.length, css.indexOf('}', start));
}

describe('primary button CSS owner contracts', () => {
  it('keeps legacy workspace button structural borders but delegates identical colors to final theme paint', () => {
    const original = rule(workspace, '.btn.btn-primary');
    expect(original).toMatch(/border-color:\s*var\(--accent\)/);
    expect(original).not.toMatch(/(?:^|;)\s*(?:color|background)\s*:/);
    const finalRule = rule(redesign, '.btn.btn-primary');
    expect(finalRule).toMatch(/color:\s*var\(--accent-contrast\)/);
    expect(finalRule).toMatch(/background:\s*var\(--accent\)/);
  });

  it('keeps hover borders/transform but has one owner of the matching background', () => {
    const original = rule(workspace, '.btn.btn-primary:hover');
    expect(original).toMatch(/border-color:\s*var\(--accent-dark\)/);
    expect(original).toMatch(/box-shadow:\s*none/);
    expect(original).not.toMatch(/background\s*:/);
    expect(rule(redesign, '.btn.btn-primary:hover'))
      .toMatch(/background:\s*var\(--accent-dark\)/);
  });
});
