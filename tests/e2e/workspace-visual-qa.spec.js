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
  { name: 'desktop-rtl', width: 1440, height: 900, rtl: true },
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
      if (route === 'notes') {
        await expect(page.locator('[data-notes-semantic-search]')).toBeDisabled();
        await expect(page.locator('[data-notes-semantic-clear]')).toBeDisabled();
        if (setup.width >= 1200) {
          const toolbarY = await page.locator('.notes-toolbar-scroll').evaluate(el => {
            const r = el.getBoundingClientRect();
            return r.y + r.height / 2;
          });
          const stylesY = await page.locator('.notes-format-more > summary').evaluate(el => {
            const r = el.getBoundingClientRect();
            return r.y + r.height / 2;
          });
          expect(Math.abs(toolbarY - stylesY), 'Text styles should share the desktop toolbar row')
            .toBeLessThan(28);
          await expect(page.locator('.notes-quick-add')).toBeHidden();
        }
      }
      if (route === 'studio' && setup.width >= 1200) {
        const inspector = page.locator('[data-studio-inspector]');
        await expect(inspector).toBeVisible();
        const more = page.locator('[data-studio-more-tools] > summary');
        await more.click();
        const popup = page.locator('.studio-more-tools-content');
        await expect(popup).toBeVisible();
        const a = await popup.boundingBox();
        const b = await inspector.boundingBox();
        expect(a && b, 'Studio tools/inspector should be measurable').toBeTruthy();
        const overlaps = a.x < b.x + b.width && a.x + a.width > b.x
          && a.y < b.y + b.height && a.y + a.height > b.y;
        expect(overlaps, 'Studio More tools should not obscure Layers controls').toBe(false);
        await more.click();
      }
      if (route === 'home') {
        await expect(page.locator('[data-home-widgets]')).toHaveAttribute('aria-busy', 'false');
        await expect(page.locator('[data-focus-widget]')).toHaveAttribute('data-focus-initialized', 'true');
        await expect(page.locator('[data-focus-clock]')).toHaveText(/^\d\d:\d\d$/);
      }
      if (setup.rtl) {
        await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
        if (setup.width <= 1023) {
          await expect.poll(async () => page.locator('#sidebar').evaluate(el =>
            el.getBoundingClientRect().left)).toBeGreaterThanOrEqual(setup.width);
        } else {
          // Desktop navigation must move to the inline-start (right) side.
          await expect.poll(async () => page.locator('#sidebar').evaluate(el =>
            Math.round(el.getBoundingClientRect().right))).toBeGreaterThanOrEqual(setup.width - 2);
        }
        if (route === 'notes' || route === 'courses') {
          // Mobile Notes intentionally shows the editor first. Open the
          // accessible library pane before inspecting its search control.
          if (route === 'notes' && setup.width <= 1023) {
            await page.locator('[data-notes-toggle-library]').click();
            await expect(page.locator('[data-notes-toggle-library]')).toHaveAttribute('aria-expanded', 'true');
          }
          const fieldSelector = route === 'notes' ? '.notes-search-field' : '.courses-search-field';
          const field = page.locator(fieldSelector).first();
          await expect(field).toBeVisible();
          const position = await field.evaluate((el) => {
            const icon = el.querySelector('.icon')?.getBoundingClientRect();
            const input = el.querySelector('input')?.getBoundingClientRect();
            return icon && input ? { iconX: icon.left + icon.width / 2, inputMid: input.left + input.width / 2 } : null;
          });
          expect(position, setup.name + '/' + route + ' search control missing').not.toBeNull();
          expect(position.iconX, setup.name + '/' + route + ' search icon should be at inline-start')
            .toBeGreaterThan(position.inputMid);
          // The input itself has dir="auto": English and Persian values can
          // change its inline-start independently of the surrounding icon.
          // Symmetric clearance prevents collisions in either script.
          const clearance = await field.locator('input').evaluate((input) => {
            const style = getComputedStyle(input);
            return Math.min(parseFloat(style.paddingLeft), parseFloat(style.paddingRight));
          });
          expect(clearance, setup.name + '/' + route + ' mixed-script search clearance')
            .toBeGreaterThanOrEqual(24);
          if (route === 'notes' && setup.width <= 1023) {
            await page.locator('[data-notes-toggle-library]').click();
            await expect(page.locator('[data-notes-toggle-library]')).toHaveAttribute('aria-expanded', 'false');
          }
        }
        if (route === 'home') {
          await expect(page.locator('.home-widget').first()).toHaveCSS('text-align', 'start');
        }
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
      if (route === 'home') {
        // The Focus card sits below the first fold on some screens. Capture
        // the actual hydrated widget instead of declaring a passing top-only
        // screenshot to be evidence of its readability.
        const focusCard = page.locator('[data-focus-widget]');
        await focusCard.scrollIntoViewIfNeeded();
        await expect(page.locator('[data-focus-start]')).toBeEnabled();
        await expect(page.locator('[data-focus-preset]')).toBeEnabled();
        await page.screenshot({
          path: path.join(folder, 'home-focus-widget.png'),
          animations: 'disabled', caret: 'hide',
        });
        await page.locator('[data-focus-start]').click();
        await expect(page.locator('[data-focus-start]')).toHaveText('Pause');
        await page.locator('[data-focus-start]').click();
        await expect(page.locator('[data-focus-start]')).toHaveText('Resume');
        await page.locator('[data-focus-reset]').click();
        await expect(page.locator('[data-focus-clock]')).toHaveText('25:00');
        await page.locator('#view-container').evaluate(el => { el.scrollTop = 0; });
      }

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
