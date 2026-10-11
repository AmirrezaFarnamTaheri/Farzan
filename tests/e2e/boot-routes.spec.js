import { test, expect } from '@playwright/test';

test('boots the app shell and exposes the primary route surface', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('frame-ancestors') && !text.includes('Content Security Policy directive')) {
      consoleErrors.push(text);
    }
  });
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('#view-container')).toBeVisible();
  await expect(page.locator('.view-error')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Initializing…');

  await expect.poll(() => page.evaluate(() => Boolean(window.OpenCourseDeck?.Router))).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
