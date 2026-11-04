import { test, expect } from '@playwright/test';

test.use({ channel: 'chrome' });

test.describe('Farzan first-run legibility and responsive workspaces', () => {
  test('Flashcards first-run help and description have strong normal-text contrast', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/flashcards', { waitUntil: 'domcontentloaded' });
    const paragraph = page.locator('.fc-empty .fc-sub');
    await expect(paragraph).toBeVisible({ timeout: 15000 });
    const ratio = await paragraph.evaluate(node => {
      const channels = getComputedStyle(node).color.match(/[\\d.]+/g).slice(0, 3).map(Number);
      const lightness = rgb => rgb.map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, channel, i) => sum + channel * [0.2126, 0.7152, 0.0722][i], 0);
      const text = lightness(channels);
      return (1.05) / (text + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(6);
  });

  test('first-run Progress uses compact placeholders instead of full-height empty charts', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/progress', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.progress-chart-empty').first()).toBeVisible({ timeout: 15000 });
    const metrics = await page.locator('.view-progress').evaluate(root => ({
      isEmpty: root.dataset.noStudyActivity === 'true',
      heights: [...root.querySelectorAll('.progress-chart-frame')]
        .map(element => element.getBoundingClientRect().height),
    }));
    expect(metrics.isEmpty).toBe(true);
    expect(metrics.heights.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...metrics.heights)).toBeLessThanOrEqual(180);
  });

  test('Materials shows direct Play and PDF controls without duplicate media badges', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/materials', { waitUntil: 'domcontentloaded' });
    const row = page.locator('#materials-list .topic-row[data-media="video-pdf"]').first();
    await expect(row).toBeVisible({ timeout: 20000 });
    await expect(row.locator('.topic-actions button')).toHaveCount(2);
    await expect(row.locator('.topic-actions')).toContainText('Play');
    await expect(row.locator('.topic-actions')).toContainText('PDF');
    await expect(row.locator('.topic-meta .badge')).toHaveCount(0);
  });

  test('Studio inspector stays compact to leave a useful drawing area on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/studio', { waitUntil: 'domcontentloaded' });
    const inspector = page.locator('.view-studio .studio-sidebar-card');
    await expect(inspector).toBeVisible({ timeout: 15000 });
    const size = await inspector.evaluate(node => ({
      width: node.getBoundingClientRect().width,
      overflow: getComputedStyle(node).overflowY,
    }));
    expect(size.width).toBeLessThanOrEqual(265);
    expect(size.width).toBeGreaterThan(190);
    expect(['auto', 'scroll']).toContain(size.overflow);
  });
});
