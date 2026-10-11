import { test, expect } from '@playwright/test';

function parseColor(input) {
  const css = String(input).trim().toLowerCase();
  const srgb = /^color\(\s*srgb\s+(.+)\)$/.exec(css);
  // Other color spaces must be converted explicitly. Treating Display-P3
  // unit channels as 8-bit sRGB could falsely pass a contrast check.
  if (css.startsWith('color(') && !srgb) throw new Error(`Unsupported computed color space: ${input}`);
  const channelText = srgb ? srgb[1] : css;
  const values = [...channelText.matchAll(/-?(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?%?/g)].map(match => {
    const value = Number(match[0].replace('%', ''));
    return match[0].endsWith('%') ? value / 100 : value;
  });
  if (values.length < 3 || values.some(value => !Number.isFinite(value))) {
    throw new Error(`Cannot parse computed color: ${input}`);
  }
  return {
    rgb: srgb ? values.slice(0, 3).map(value => Math.max(0, Math.min(1, value)) * 255) : values.slice(0, 3),
    alpha: values[3] ?? 1,
  };
}

test('understands normalized sRGB color channels and rejects other color spaces', () => {
  expect(parseColor('color(srgb 1 0 0 / 0.5)')).toEqual({ rgb: [255, 0, 0], alpha: 0.5 });
  expect(contrast(parseColor('color(srgb 0 0 0)').rgb, parseColor('color(srgb 1 1 1)').rgb)).toBeCloseTo(21);
  expect(() => parseColor('color(display-p3 1 1 1)')).toThrow(/Unsupported computed color space/);
});

function over(foreground, background) {
  return foreground.rgb.map((channel, index) =>
    channel * foreground.alpha + background.rgb[index] * (1 - foreground.alpha));
}

function brightness(rgb) {
  const [r, g, b] = rgb.map(value => value / 255).map(value =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground, background) {
  const a = brightness(foreground);
  const b = brightness(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('study status labels remain legible across all shipped themes and accents', async ({ page }) => {
  await page.goto('/#/', { waitUntil: 'networkidle' });
  const status = page.locator('.home-focus-status');
  await expect(status).toBeVisible();

  const results = await page.evaluate(() => {
    const themes = ['dark', 'light', 'midnight', 'forest', 'ocean', 'sunset', 'rose', 'paper'];
    const accents = ['lapis', 'violet', 'cyan', 'amber', 'rose', 'emerald', 'sakura'];
    const label = document.querySelector('.home-focus-status');
    const panel = document.querySelector('.home-focus-panel');
    if (!label || !panel) throw new Error('Home status panel unavailable');

    return themes.flatMap(theme => accents.map(accent => {
      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.accent = accent;
      return {
        theme,
        accent,
        foreground: getComputedStyle(label).color,
        background: getComputedStyle(label).backgroundColor,
        panelBackground: getComputedStyle(panel).backgroundColor,
      };
    }));
  });

  for (const result of results) {
    const base = parseColor(result.panelBackground);
    const background = over(parseColor(result.background), base);
    const foreground = over(parseColor(result.foreground), { rgb: background, alpha: 1 });
    expect(
      contrast(foreground, background),
      `${result.theme}/${result.accent} status color contrast`,
    ).toBeGreaterThanOrEqual(4.5);
  }
});
