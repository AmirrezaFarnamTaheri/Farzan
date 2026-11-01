import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const output = path.resolve('artifacts/farzan-redesign');
const routes = [
  'home', 'courses', 'my-courses', 'materials', 'tags', 'playlists',
  'studio', 'notes', 'pdf', 'bookmarks', 'flashcards',
  'progress', 'achievements', 'help', 'settings',
];

// The sidebar defines every product destination. If one is added, visual
// assurance must include it instead of silently rendering only seven routes.
const navigationRoutes = [...new Set(
  [...fs.readFileSync(path.resolve('index.html'), 'utf8').matchAll(/data-route="\/([^"]+)"/g)]
    .map(match => match[1]),
)].sort();
test('visual QA covers all sidebar navigation destinations', () => {
  expect([...routes].sort()).toEqual(navigationRoutes);
});
const setups = [
  { name: 'desktop-light', width: 1440, height: 900 },
  { name: 'desktop-dark', width: 1440, height: 900, dark: true },
  { name: 'mobile-light', width: 390, height: 844 },
  { name: 'mobile-rtl', width: 390, height: 844, rtl: true },
];
test.use({ channel: 'chrome' });
test.setTimeout(240000);

for (const setup of setups) {
  test(`visual acceptance across all navigation routes: ${setup.name}`, async ({ page }) => {
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
      if ((route === 'help' || route === 'settings') && setup.width >= 1024) {
        const systemLink = page.locator('.sidebar-system-nav [data-route="/' + route + '"]');
        await expect(systemLink).toHaveAttribute('aria-current', 'page');
        await expect(systemLink).toBeVisible();
        const bounds = await systemLink.boundingBox();
        expect(bounds, setup.name + ' / ' + route + ' missing visible System link').not.toBeNull();
        expect(bounds.y + bounds.height, setup.name + '/' + route + ' System link clipped')
          .toBeLessThanOrEqual(setup.height - 2);
      }
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

      // Record real opened overlays as separate visual states; close them
      // before subsequent routes to avoid accidentally obscuring screenshots.
      if (route === 'home' && setup.name === 'desktop-light') {
        await page.evaluate(() => {
          window.OpenCourseDeck?.bus?.emit?.('notification:new', {
            title: 'Lesson note saved', message: 'A note is ready to review.',
          });
        });
        await page.locator('[data-notifications-toggle]').click();
        await expect(page.locator('#notifications-panel')).toBeVisible();
        for (const id of ['#notif-mark-read', '#notif-clear-all']) {
          await expect(page.locator(id)).toHaveCSS('white-space', 'nowrap');
        }
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
        await page.keyboard.press('Escape');
        await expect(page.locator('#add-content-menu')).toHaveAttribute('aria-hidden', 'true');
      }

      // The original visual suite captured only an idle Courses page. Study
      // focus is a distinct, interactive layout; capture it in every viewport
      // and theme, not only desktop-dark or mobile.
      if (route === 'courses') {
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

    // The missing-route recovery screen is not in sidebar navigation, but it
    // is user-facing and must be visually checked for each layout direction.
    await page.goto('/#/this-route-does-not-exist', { waitUntil: 'domcontentloaded' });
    const missingView = page.locator('#view-container .view-notfound');
    await expect(missingView).toBeVisible();
    await expect(missingView.locator('h1')).toHaveText('Page not found');
    // The shell must describe this route, not leak the old internal product name.
    await expect(page.locator('#breadcrumb-list')).toContainText('Page not found');
    await expect(page.locator('#breadcrumb-list')).not.toContainText('OpenCourseDeck');
    await expect(page.locator('[data-missing-route]')).toContainText('this-route-does-not-exist');
    await expect(missingView.getByRole('link', { name: /return home/i })).toBeVisible();
    if (setup.rtl) {
      // A full reload resets the temporary direction override used for QA.
      await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
    }
    // Visibility alone does not guarantee a painted frame: this SPA's
    // .view animation starts at opacity 0 and is still 'visible' to Playwright.
    // Wait for an actual on-screen, fully opaque recovery panel.
    await expect(missingView).toBeInViewport({ ratio: 0.1 });
    await expect.poll(() => missingView.evaluate(el =>
      Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.99);
    await page.evaluate(() => new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const invalidWidth = await page.evaluate(() =>
      Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth);
    expect(invalidWidth, `${setup.name}/notfound horizontal overflow`).toBeLessThanOrEqual(3);
    const notfound = await page.screenshot({
      path: path.join(folder, 'notfound.png'), animations: 'disabled', caret: 'hide',
    });
    // Minimal, mostly blank error views compress to well below 9 KB on
    // narrow mobile; DOM assertions above prove the actual content exists.
    expect(notfound.byteLength, `${setup.name} blank notfound screenshot`).toBeGreaterThan(2000);
  });
}
