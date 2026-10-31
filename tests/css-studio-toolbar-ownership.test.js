import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/styles/farzan-redesign.css', 'utf8');

describe('Studio toolbar single-owner stylesheet contract', () => {
  it('keeps the early Studio layout rule structural instead of overriding final focus-stage paint and spacing', () => {
    const studio = css.slice(css.indexOf('/* Studio: create on the canvas;'));
    const first = studio.match(/\.view-studio \.studio-toolbar-panel\s*\{([^}]*)\}/);
    expect(first).not.toBeNull();
    expect(first[1]).toMatch(/border:\s*1px solid var\(--fz-line\)/);
    for (const obsolete of ['padding', 'border-radius', 'background', 'box-shadow']) {
      expect(first[1]).not.toMatch(new RegExp('(?:^|\\n)\\s*' + obsolete + '\\s*:'));
    }
    const focus = css.slice(css.indexOf('/* Studio focus stage:'));
    const authoritative = focus.match(/\.view-studio \.studio-toolbar-panel\s*\{([^}]*)\}/);
    expect(authoritative).not.toBeNull();
    for (const owned of ['padding', 'border-radius', 'background', 'box-shadow']) {
      expect(authoritative[1]).toMatch(new RegExp('(?:^|\\n)\\s*' + owned + '\\s*:'));
    }
  });

  it('does not duplicate the final toolbar padding in an earlier narrow-landscape media rule', () => {
    const landscape = css.match(/@media \(max-width: 1023px\) and \(max-height: 500px\)\s*\{([\s\S]*?)\n\}/);
    expect(landscape).not.toBeNull();
    expect(landscape[1]).not.toMatch(/\.view-studio \.studio-toolbar-panel\s*\{/);
  });
});
