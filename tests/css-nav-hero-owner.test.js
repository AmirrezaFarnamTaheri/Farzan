import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workspace = readFileSync('src/styles/workspace.css', 'utf8');
const redesign = readFileSync('src/styles/farzan-redesign.css', 'utf8');

function rule(css, selector) {
  const key = selector + ' {';
  const start = css.indexOf(key);
  if (start < 0) throw new Error('Missing owner selector: ' + selector);
  return css.slice(start + key.length, css.indexOf('}', start));
}

describe('shared navigation and home hero CSS property ownership', () => {
  it('keeps the vendor mask fallback but delegates standard navigation mask paint to the final theme layer', () => {
    const legacy = rule(workspace, '.sidebar-nav');
    expect(legacy).toMatch(/-webkit-mask-image:\s*none/);
    expect(legacy).not.toMatch(/(?:^|;)\s*mask-image\s*:/);
    expect(rule(redesign, '.sidebar-nav')).toMatch(/(?:^|;)\s*mask-image:\s*none/);
  });

  it('keeps Home hero structure but assigns centered layout to one final rule', () => {
    const original = rule(workspace, '.home-hero-copy');
    expect(original).toMatch(/display:\s*flex/);
    expect(original).toMatch(/flex-direction:\s*column/);
    expect(original).not.toMatch(/justify-content\s*:/);
    expect(rule(redesign, '.home-hero-copy')).toMatch(/justify-content:\s*center/);
  });
});
