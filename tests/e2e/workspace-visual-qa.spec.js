import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const output = path.resolve('artifacts/farzan-redesign');
const coreRoutes = ['home', 'courses', 'my-courses', 'notes', 'progress', 'studio', 'settings'];
// Keep all desktop destinations visible in the artifact. Historical screenshots
// are no longer sufficient evidence for the uncaptured feature routes.
const supplementaryRoutes = [
  'materials', 'pdf', 'playlists', 'bookmarks', 'tags',
  'flashcards', 'achievements', 'help', 'notfound',
];
const setups = [
  { name: 'desktop-light', width: 1440, height: 900 },
  { name: 'desktop-dark', width: 1440, height: 900, dark: true },
  { name: 'mobile-light', width: 390, height: 844 },
  { name: 'mobile-rtl', width: 390, height: 844, rtl: true },
];
test.use({ channel: 'chrome' });
test.setTimeout(240000);

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
    const routes = setup.name.startsWith('desktop-')
      ? [...coreRoutes, ...supplementaryRoutes] : coreRoutes;
    for (const route of routes) {
      const routeHash = route === 'notfound' ? 'unknown-farzan-route' : route;
      await page.goto('/#/' + routeHash, { waitUntil: 'domcontentloaded' });
      const view = page.locator('#view-container .view-' + route);
      await expect(view).toBeVisible({ timeout: 25000 });
      if (route === 'courses') await expect(page.locator('#courses-list .course-item').first()).toBeVisible();
      if (route === 'progress') await expect(page.locator('[data-progress-loading]')).toHaveAttribute('aria-busy', 'false');
      if (route === 'home') await expect(page.locator('[data-home-widgets]')).toHaveAttribute('aria-busy', 'false');
      if (setup.rtl) {
        await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
        await expect.poll(async () => page.locator('#sidebar').evaluate(el =>
          el.getBoundingClientRect().left)).toBeGreaterThanOrEqual(setup.width);
      }
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

      // Capture important shared overlays as actual interactive states, not
      // untested markup, while leaving their data and focus behavior intact.
      if (route === 'home' && setup.name === 'desktop-light') {
        await page.evaluate(() => {
          window.OpenCourseDeck?.bus?.emit?.('notification:new', {
            title: 'Lesson note saved', message: 'A note is ready to review.',
          });
        });
        await page.locator('[data-notifications-toggle]').click();
        await expect(page.locator('#notifications-panel')).toBeVisible();
        await page.screenshot({
          path: path.join(folder, 'notifications-open.png'),
          animations: 'disabled', caret: 'hide',
        });
        await page.locator('#notif-close').click();
        await expect(page.locator('#notifications-panel')).toBeHidden();

        await page.locator('#topbar-add-btn').click();
        await expect(page.locator('#add-content-menu')).toBeVisible();
        await page.screenshot({
          path: path.join(folder, 'add-content-menu.png'),
          animations: 'disabled', caret: 'hide',
        });
        // Leave subsequent route screenshots unobscured. A separately tested
        // navigation regression covers the menu's automatic dismissal.
        await page.keyboard.press('Escape');
        await expect(page.locator('#add-content-menu')).toHaveAttribute('aria-hidden', 'true');
      }


      // The original visual suite captured only an idle Courses page. Study
      // focus is a distinct, interactive layout; save its real state for
      // desktop/dark and both mobile writing directions.
      if (route === 'courses' && ['desktop-dark', 'mobile-light', 'mobile-rtl'].includes(setup.name)) {
        const course = page.locator('.course-item[data-course-id="comprehensive-internal-medicine-course"]');
        await expect(course).toBeVisible({ timeout: 20000 });
        await course.click();
        const play = page.locator('#course-detail button[data-action="play-video"]').first();
        await expect(play).toBeVisible();
        await play.click();
        await expect(page.locator('.courses-shell')).toHaveAttribute('data-playback-active', 'true');
        await expect(page.locator('#course-player')).toBeVisible();
        await expect(page.locator('#course-detail .topic-row').first()).toBeVisible();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const overflow = await page.evaluate(() => Math.max(
          document.body.scrollWidth, document.documentElement.scrollWidth,
        ) - window.innerWidth);
        expect(overflow, `${setup.name} focus-mode horizontal overflow`).toBeLessThanOrEqual(3);
        const focusShot = await page.screenshot({
          path: path.join(folder, 'courses-study-focus.png'),
          animations: 'disabled',
          caret: 'hide',
        });
        expect(focusShot.byteLength, `${setup.name} empty study-focus screenshot`).toBeGreaterThan(11000);
      }
    }
  });
}
