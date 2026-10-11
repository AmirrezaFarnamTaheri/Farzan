import { test, expect } from '@playwright/test';

function parseColor(input) {
  const values = String(input).match(/[0-9.]+/g)?.map(Number) ?? [];
  if (values.length < 3) throw new Error(`Cannot parse computed color: ${input}`);
  return { rgb: values.slice(0, 3), alpha: values[3] ?? 1 };
}

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
