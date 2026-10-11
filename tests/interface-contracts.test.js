import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const routeFiles = [
  'home', 'courses', 'myCourses', 'materials', 'tags', 'playlists',
  'notes', 'pdf', 'bookmarks', 'studio', 'progress', 'achievements',
  'settings', 'help', 'notFound',
].map((name) => `src/views/${name}Route.js`);

function token(block, name) {
  const match = block.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  if (!match) throw new Error(`Missing solid color token --${name}`);
  return match[1];
}

function luminance(color) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16) / 255);
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(a, b) {
  const first = luminance(a), second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe('interface contracts', () => {
  it('maintains readable main text on default dark and light card surfaces', () => {
    const themes = source('src/styles/themes.css');
    for (const theme of ['dark', 'light']) {
      const start = themes.indexOf(`[data-theme="${theme}"] {`);
      expect(start, `Missing ${theme} palette`).toBeGreaterThanOrEqual(0);
      const block = themes.slice(start).split('}')[0];
      expect(contrast(token(block, 'text-primary'), token(block, 'surface-2'))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('loads shared styles without dropping user theme and focus support', () => {
    const entry = source('src/styles/index.css');
    const workspace = source('src/styles/workspace.css');
    expect(entry).toContain("@import './workspace.css' layer(enhancements);");
    expect(workspace).toContain(':focus-visible');
    expect(workspace).toContain('[dir="rtl"]');
    expect(workspace).toContain('prefers-contrast: more');
    expect(entry).toContain('prefers-reduced-motion: reduce');
  });

  it('does not force obsolete glass, background-grid or card-hover overrides', () => {
    const background = source('src/styles/elevation.css');
    expect(background).not.toContain('!important');
    expect(background).not.toContain('linear-gradient');
    expect(background).not.toContain('radial-gradient');
    expect(background).not.toContain('backdrop-filter');
    expect(background).not.toMatch(/translateY\s*\(/);
  });

  it('keeps the startup splash consistent with the Lapis palette', () => {
    const html = source('index.html');
    expect(html).not.toContain('#7c3aed');
    expect(html).toContain('--skeleton-base: #101820');
    expect(html).toContain('prefers-reduced-motion: reduce');
  });

  it('does not restore decorative badges or promotional route slogans', () => {
    for (const file of routeFiles) {
      const content = source(file);
      expect(content, file).not.toMatch(/Feature status: ready/i);
      expect(content, file).not.toMatch(/learning studio|command deck|control center|learning trail|at a glance/i);
    }
  });
});
