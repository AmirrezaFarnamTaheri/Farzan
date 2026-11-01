import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const base = readFileSync('src/styles/workspace.css', 'utf8');
const redesign = readFileSync('src/styles/farzan-redesign.css', 'utf8');
const cardOverlayRule = /\.card::before,\s*\.card\.card-glow::before\s*\{\s*content:\s*none;\s*\}/g;

describe('card pseudo-element CSS ownership', () => {
  it('has a single later visual owner rather than repeating identical suppression in an older layer', () => {
    expect([...base.matchAll(cardOverlayRule)]).toHaveLength(0);
    expect([...redesign.matchAll(cardOverlayRule)]).toHaveLength(1);
  });

  it('retains the same card and glow pseudo-element suppression in the final visual layer', () => {
    expect(redesign).toContain('.card::before,');
    expect(redesign).toContain('.card.card-glow::before { content: none; }');
  });
});
