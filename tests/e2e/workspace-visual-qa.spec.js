import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const output = path.resolve('artifacts/farzan-redesign');
const routes = ['home', 'courses', 'my-courses', 'notes', 'progress', 'studio', 'settings'];
const setups = [
  { name: 'desktop-light', width: 1440, height: 900 },
  { name: 'desktop-dark', width: 1440, height: 900, dark: true },
  { name: 'mobile-light', width: 390, height: 844 },
  { name: 'mobile-rtl', width: 390, height: 844, rtl: true },
];
test.use({ channel: 'chrome' });
test.setTimeout(180000);

for (const setup of setups) {
  test(`visual acceptance across key routes: ${setup.name}`, async ({ page }) => {
    await page.setViewportSize({ width: setup.width, height: setup.height });
    if (setup.dark) {
      await page.addInitScript(() => {
        try { localStorage.setItem('ocd_theme', 'dark'); } catch {}
      });
    }
    const folder = path.join(output, setup.name);
    fs.mkdirSync(folder, { recursive: true });
    for (const route of routes) {
      await page.goto('/#/' + route, { waitUntil: 'domcontentloaded' });
      const view = page.locator('#view-container .view-' + route);
      await expect(view).toBeVisible({ timeout: 25000 });
      if (route === 'courses') await expect(page.locator('#courses-list .course-item').first()).toBeVisible();
      if (route === 'progress') await expect(page.locator('[data-progress-loading]')).toHaveAttribute('aria-busy', 'false');
      if (route === 'home') await expect(page.locator('[data-home-widgets]')).toHaveAttribute('aria-busy', 'false');
      if (setup.rtl) await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const dimensions = await page.evaluate(() => ({
        body: document.body.scrollWidth,
        html: document.documentElement.scrollWidth,
        width: window.innerWidth,
        top: document.querySelector('#ocd-app').getBoundingClientRect().top,
      }));
      expect(Math.max(dimensions.body, dimensions.html) - dimensions.width, `${setup.name}/${route} horizontal overflow`).toBeLessThanOrEqual(3);
      expect(dimensions.top, `${setup.name}/${route} shell displaced`).toBeGreaterThanOrEqual(-1);
      const name = path.join(folder, route + '.png');
      const shot = await page.screenshot({ path: name, animations: 'disabled', caret: 'hide' });
      expect(shot.byteLength, `${setup.name}/${route} blank screenshot`).toBeGreaterThan(11000);
    }
  });
}
