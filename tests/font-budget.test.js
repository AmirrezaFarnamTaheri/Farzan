import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_FONT_BYTES, MAX_FONT_FILES, checkFontBudget } from '../scripts/check-font-budget.cjs';

describe('vendored font budget', () => {
  it('keeps only selected WOFF2 assets within the release budget', () => {
    const result = checkFontBudget();
    expect(result.count).toBeLessThanOrEqual(MAX_FONT_FILES);
    expect(result.bytes).toBeLessThanOrEqual(MAX_FONT_BYTES);
  });

  it('self-hosts Persian letterforms with an Arabic-only Vazirmatn font and Latin Inter fallback', () => {
    const root = process.cwd();
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const manifest = fs.readFileSync(path.join(root, 'vendor/fonts/fonts.css'), 'utf8');
    const fontCSS = fs.readFileSync(path.join(root, 'vendor/fonts/vazirmatn/index.css'), 'utf8');
    const tokens = fs.readFileSync(path.join(root, 'src/styles/tokens.css'), 'utf8');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    expect(pkg.dependencies['@fontsource/vazirmatn']).toBe('5.3.0');
    expect(manifest).toContain('@import "./vazirmatn/index.css";');
    expect(fontCSS).toContain("font-family: 'Vazirmatn'");
    expect(fontCSS).toContain('unicode-range:');
    expect(fontCSS).toContain('vazirmatn-arabic-400-normal.woff2');
    expect(fontCSS).not.toContain('vazirmatn-latin-');
    expect(tokens).toMatch(/--font-sans:\s*'Vazirmatn',\s*'Inter'/);
    expect(html).toContain('./vendor/fonts/vazirmatn/index.css');
  });

  it('uses valid relative imports from the font entrypoint', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'vendor/fonts/fonts.css'), 'utf8');
    expect(css).toContain('@import "./inter/index.css";');
    expect(css).toContain('@import "./jetbrains-mono/index.css";');
    expect(css).toContain('@import "./playfair-display/index.css";');
    expect(css).not.toContain('./fonts/');
  });
});
