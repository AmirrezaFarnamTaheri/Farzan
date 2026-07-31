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

  it('uses valid relative imports from the font entrypoint', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'vendor/fonts/fonts.css'), 'utf8');
    expect(css).toContain('@import "./inter/index.css";');
    expect(css).toContain('@import "./jetbrains-mono/index.css";');
    expect(css).toContain('@import "./playfair-display/index.css";');
    expect(css).not.toContain('./fonts/');
  });
});
