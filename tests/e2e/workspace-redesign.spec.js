import { test, expect } from '@playwright/test';

test.use({ channel: 'chrome' });

test.describe('Farzan desktop workspace redesign', () => {
  test('keeps the app anchored to one viewport without exposing internal file pickers', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/home', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-home')).toBeVisible();
    const shell = await page.evaluate(() => {
      const app = document.getElementById('ocd-app').getBoundingClientRect();
      const sidebar = document.querySelector('#sidebar').getBoundingClientRect();
      const topbar = document.querySelector('#topbar').getBoundingClientRect();
      return {
        bodyOverflow: getComputedStyle(document.body).overflowY,
        appTop: app.top, appHeight: app.height, sidebarTop: sidebar.top, headerTop: topbar.top,
        logo: document.querySelector('.sidebar-logo-text')?.textContent,
      };
    });
    expect(shell.bodyOverflow).toBe('hidden');
    expect(shell.appTop).toBeGreaterThanOrEqual(-1);
    expect(shell.appHeight).toBeLessThanOrEqual(901);
    expect(shell.sidebarTop).toBeGreaterThanOrEqual(-1);
    expect(shell.headerTop).toBeGreaterThanOrEqual(-1);
    expect(shell.logo).toContain('Farzan');
    for (const picker of await page.locator('input[type="file"]').all()) {
      expect(await picker.getAttribute('hidden')).not.toBeNull();
      await expect(picker).toBeHidden();
    }
  });

  test('presents a useful catalog before playback without a blank media theater', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/courses', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-courses')).toBeVisible();
    await expect(page.locator('[data-courses-add]')).toBeVisible();
    const player = page.locator('[data-course-playback]');
    await expect(player).toBeHidden();
    await expect(page.locator('[data-course-empty-guidance]')).toBeVisible();
    await expect(page.locator('#courses-search')).toBeVisible();
  });

  test('shows meaningful first-run progress guidance instead of empty charts', async ({ page }) => {
    await page.goto('/#/progress', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-progress')).toBeVisible();
    await expect(page.locator('[data-progress-loading]')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('[data-progress-empty]')).toBeVisible();
    await expect(page.locator('[data-progress-empty]')).toContainText('Start a lesson');
    await expect(page.locator('#chart-overall')).toBeHidden();
  });

  test('puts advanced Studio commands behind a discoverable disclosure', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/studio', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-studio')).toBeVisible();
    const advanced = page.locator('[data-studio-more-tools]');
    await expect(advanced.locator('summary')).toBeVisible();
    await expect(advanced.locator('[data-studio-export-json]')).toBeHidden();
    await expect(page.locator('button[data-studio-tool="pen"]')).toBeVisible();
    await expect(page.locator('[data-studio-save]')).toBeVisible();
    await advanced.locator('summary').click();
    await expect(advanced.locator('[data-studio-export-json]')).toBeVisible();
  });

  test('keeps a usable mobile shell with no body-level double scrollbars', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/home', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-home')).toBeVisible();
    const metrics = await page.evaluate(() => ({
      bodyOverflow: getComputedStyle(document.body).overflowY,
      rootOverflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
      header: document.querySelector('#topbar').getBoundingClientRect(),
    }));
    expect(metrics.bodyOverflow).toBe('hidden');
    expect(metrics.rootOverflow).toBeLessThanOrEqual(2);
    expect(metrics.header.top).toBeGreaterThanOrEqual(-1);
  });
});
