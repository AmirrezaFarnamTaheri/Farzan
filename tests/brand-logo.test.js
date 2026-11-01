import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const favicon = fs.readFileSync('assets/favicon.svg', 'utf8');
const icon = fs.readFileSync('assets/icon-192.svg', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('src/styles/farzan-redesign.css', 'utf8');
const nativeIcons = fs.readFileSync('scripts/prepare-native-assets.cjs', 'utf8');
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));

const fold = (source) => source.match(/<path data-brand-mark="farzan-fold" d="([^"]+)"/)?.[1];

describe('Farzan visual identity', () => {
  it('uses one recognizable vector F/fold symbol at favicon and PWA sizes', () => {
    expect(fold(favicon)).toBeTruthy();
    expect(fold(icon)).toBe(fold(favicon));
    for (const source of [favicon, icon]) {
      expect(source).toContain('viewBox="0 0 96 96"');
      expect(source).not.toMatch(/<filter\b|feDropShadow|<text\b|icon-glow|<polygon\b/);
    }
  });

  it('shows the same local brand image in the loading state and navigation rail', () => {
    const splash = html.match(/<div class="splash-logo"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '';
    const rail = html.match(/<div class="sidebar-logo-icon"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '';
    for (const content of [splash, rail]) {
      expect(content).toMatch(/<img\b[^>]*src="\.\/assets\/favicon\.svg"[^>]*alt=""/);
      expect(content).not.toContain('#i-bolt');
    }
    expect(html).toContain('aria-label="Farzan home"');
    expect(html).toContain('aria-label="Loading Farzan Plasmato"');
  });

  it('leaves brand surfaces unshadowed and relies on the existing native icon source', () => {
    expect(css).toMatch(/\.sidebar-logo-icon\s*\{[^}]*background:\s*transparent;/s);
    expect(css).toMatch(/\.sidebar-logo-icon\s*\{[^}]*box-shadow:\s*none;/s);
    expect(nativeIcons).toContain("'assets', 'icon-192.svg'");
    expect(manifest.icons.some(({ src }) => src === './assets/icon-192.svg')).toBe(true);
  });
});
