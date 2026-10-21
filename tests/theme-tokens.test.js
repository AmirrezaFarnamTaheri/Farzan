import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// Same theme/accent roster the shipped e2e contrast spec walks
// (tests/e2e/theme-contrast.spec.js), so this unit contract cannot drift
// away from what the browser actually renders.
const THEMES = ['dark', 'light', 'midnight', 'forest', 'ocean', 'sunset', 'rose', 'paper'];
const ACCENTS = ['lapis', 'violet', 'cyan', 'amber', 'rose', 'emerald', 'sakura'];
const LIGHT_THEMES = ['light', 'paper'];

function blockOf(css, marker) {
  const start = css.indexOf(marker);
  expect(start, `Missing ${marker}`).toBeGreaterThanOrEqual(0);
  return css.slice(start).split('}')[0];
}

function token(block, name) {
  const match = block.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  if (!match) throw new Error(`Missing solid color token --${name}`);
  return match[1];
}

function alphaToken(block, name) {
  const match = block.match(new RegExp(`--${name}:\\s*rgba\\(\\s*([0-9.]+)\\s*,\\s*([0-9.]+)\\s*,\\s*([0-9.]+)\\s*,\\s*([0-9.]+)\\s*\\)`, 'i'));
  if (!match) throw new Error(`Missing translucent color token --${name}`);
  return { rgb: [Number(match[1]), Number(match[2]), Number(match[3])], alpha: Number(match[4]) };
}

function luminance(rgb) {
  const linear = rgb.map((value) => value / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(a, b) {
  const first = luminance(a), second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function hexToRgb(color) {
  return [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
}

function over(foreground, backgroundRgb) {
  return foreground.rgb.map((channel, index) =>
    channel * foreground.alpha + backgroundRgb[index] * (1 - foreground.alpha));
}

const themeBlock = (theme) => blockOf(source('src/styles/themes.css'), `[data-theme="${theme}"] {`);
const accentBlock = (accent) => blockOf(source('src/styles/accents.css'), `[data-accent="${accent}"]`);

describe('theme surface tokens', () => {
  it('defines --surface-4 in every theme instead of inheriting the dark default', () => {
    const rootDefault = token(blockOf(source('src/styles/tokens.css'), ':root'), 'surface-4');
    for (const theme of THEMES) {
      const surface4 = token(themeBlock(theme), 'surface-4');
      expect(surface4, `${theme} --surface-4`).toMatch(/^#[0-9a-f]{6}$/i);
      if (LIGHT_THEMES.includes(theme)) {
        expect(surface4, `${theme} --surface-4 must not be the dark default`).not.toBe(rootDefault);
      }
    }
  });

  it('keeps body text readable on every theme --surface-4', () => {
    for (const theme of THEMES) {
      const block = themeBlock(theme);
      const surface4 = token(block, 'surface-4');
      const surface4Rgb = hexToRgb(surface4);
      expect(contrast(hexToRgb(token(block, 'text-primary')), surface4Rgb),
        `${theme} --text-primary on --surface-4`).toBeGreaterThanOrEqual(4.5);
      const secondary = over(alphaToken(block, 'text-secondary'), surface4Rgb);
      expect(contrast(secondary, surface4Rgb), `${theme} --text-secondary on --surface-4`)
        .toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('accent foreground tokens', () => {
  it('keeps text on an accent fill readable for every shipped accent', () => {
    for (const accent of ACCENTS) {
      const block = accentBlock(accent);
      expect(contrast(hexToRgb(token(block, 'accent-contrast')), hexToRgb(token(block, 'accent'))),
        `${accent} --accent-contrast on --accent`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the accent foreground readable on the dark step used by primary buttons', () => {
    for (const accent of ACCENTS) {
      const block = accentBlock(accent);
      // .btn-primary paints --accent and its :hover state paints --accent-dark,
      // both with the label in --accent-contrast, so both ends must hold.
      expect(contrast(hexToRgb(token(block, 'accent-contrast')), hexToRgb(token(block, 'accent-dark'))),
        `${accent} --accent-contrast on --accent-dark`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the accent foreground readable on the light step used by icon buttons', () => {
    for (const accent of ACCENTS) {
      const block = accentBlock(accent);
      // .pd-btn-play:hover paints the play glyph on --accent-light. That is a
      // graphical object, so WCAG 1.4.11 asks for 3:1, not the 4.5:1 of text.
      expect(contrast(hexToRgb(token(block, 'accent-contrast')), hexToRgb(token(block, 'accent-light'))),
        `${accent} --accent-contrast on --accent-light`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('focus indicator tokens', () => {
  it('declares a single --workspace-focus token and routes the focus outlines through it', () => {
    const tokens = source('src/styles/tokens.css');
    expect(tokens).toContain('--workspace-focus: var(--accent-light);');
    for (const file of ['src/styles/reset.css', 'src/styles/utilities.css', 'src/styles/player.css',
      'src/styles/study-polish.css', 'src/styles/workspace.css']) {
      const css = source(file);
      expect(css, `${file} must not hardcode the focus ring colour`).not.toMatch(/outline[^:]*:[^;]*var\(--accent-light\)/);
    }
  });

  it('keeps the focus indicator at 3:1 or better on every theme surface', () => {
    for (const theme of THEMES) {
      const block = themeBlock(theme);
      const bg = hexToRgb(token(block, 'bg'));
      const surface = hexToRgb(token(block, 'surface'));
      // The light and paper themes paint a near-white canvas, where the pale
      // accent tint falls to 1.54:1. They use the dark accent step instead.
      const step = LIGHT_THEMES.includes(theme) ? 'accent-dark' : 'accent-light';
      for (const accent of ACCENTS) {
        const ring = hexToRgb(token(accentBlock(accent), step));
        const worst = Math.min(contrast(ring, bg), contrast(ring, surface));
        expect(worst, `${theme}/${accent} focus ring on ${step}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('overrides --workspace-focus to the dark accent step in the light themes', () => {
    const workspace = source('src/styles/workspace.css');
    expect(workspace).toMatch(/\[data-theme="light"\],\s*\n\s*\[data-theme="paper"\]\s*\{\s*\n\s*--workspace-focus: var\(--accent-dark\);/);
  });
});
