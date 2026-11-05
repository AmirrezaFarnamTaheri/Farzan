import { test, expect } from '@playwright/test';

test.use({ channel: 'chrome' });

test.describe('CSS ownership computed-style parity at narrow and zoom-equivalent viewports (#175)', () => {
  for (const scheme of ['dark', 'light']) {
    test('contains English/Persian mixed-script workspaces in ' + scheme + ' RTL without an outer scroll leak', async ({ page }) => {
      test.setTimeout(200_000);
      await page.addInitScript(theme => {
        localStorage.setItem('ocd_dir', 'rtl');
        localStorage.setItem('ocd_theme', theme);
      }, scheme);
      const viewports = [
        { width: 1440, height: 900, label: 'desktop' },
        { width: 1280, height: 800, label: 'laptop' },
        { width: 1024, height: 768, label: 'small-desktop' },
        { width: 768, height: 800, label: 'tablet' },
        // Equivalent CSS layout widths at 200% and 400% desktop zoom;
        // these prove reflow only, not physical Windows display scaling.
        { width: 720, height: 450, label: 'zoom-200-layout-proxy' },
        { width: 320, height: 256, label: 'zoom-400-layout-proxy' },
        { width: 390, height: 844, label: 'phone' },
      ];
      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        for (const route of ['home', 'my-courses', 'notes', 'settings']) {
          await page.goto('/#/' + route, { waitUntil: 'domcontentloaded' });
          const view = page.locator('.view-' + route);
          await expect(view).toBeVisible({ timeout: 20000 });
          const metric = await view.evaluate(el => {
            const rect = el.getBoundingClientRect();
            const outer = document.documentElement;
            const shell = document.querySelector('#ocd-app');
            const computed = getComputedStyle(el);
            return {
              route: window.location.hash,
              viewport: innerWidth,
              direction: getComputedStyle(outer).direction,
              maxWidth: computed.maxWidth,
              left: rect.left, right: rect.right,
              outerOverflow: outer.scrollWidth - innerWidth,
              appHeight: shell?.getBoundingClientRect().height || 0,
            };
          });
          console.log('[css-rtl-200pct] ' + scheme + ' ' + viewport.label + ' ' + JSON.stringify(metric));
          expect(metric.direction).toBe('rtl');
          expect(metric.left).toBeGreaterThanOrEqual(-2);
          expect(metric.right).toBeLessThanOrEqual(viewport.width + 2);
          expect(metric.outerOverflow).toBeLessThanOrEqual(2);
          expect(metric.appHeight).toBeLessThanOrEqual(viewport.height + 2);
        }
      }
    });
  }
});

for (const direction of ['ltr', 'rtl']) {
  test('keeps keyboard navigation, content menus and notification drawers operable in ' + direction, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(value => localStorage.setItem('ocd_dir', value), direction);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#/home', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-home')).toBeVisible();

    const add = page.getByRole('button', { name: 'Add content' });
    await add.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#add-content-menu')).toHaveAttribute('aria-hidden', 'false');
    await page.keyboard.press('Escape');
    await expect(page.locator('#add-content-menu')).toHaveAttribute('aria-hidden', 'true');
    await expect(add).toBeFocused();

    const notifications = page.locator('#topbar-notifications-btn');
    await notifications.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#notifications-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#notifications-panel')).toBeHidden();
    await expect(notifications).toBeFocused();

    const deep = page.locator('.sidebar-nav a[href="#/achievements"]');
    await deep.focus();
    await expect(deep).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.view-achievements')).toBeVisible();
    await expect(deep).toHaveAttribute('aria-current', 'page');
  });
}

test('preserves RTL card layout while isolating English numeric playlist metadata', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ocd_dir', 'rtl'));
  await page.goto('/#/playlists', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.view-playlists')).toBeVisible();
  const catalogCard = page.locator('[data-playlist-catalog] .playlist-card').first();
  await expect(catalogCard).toBeAttached({ timeout: 20000 });
  await expect(catalogCard).toHaveCSS('direction', 'rtl');
  await expect(catalogCard.locator('.playlist-card-detail > bdi[dir="auto"]'))
    .toHaveCSS('direction', 'ltr');
  await expect(catalogCard.locator('.playlist-card-title')).toHaveAttribute('dir', 'auto');
  await expect(page.locator('.playlists-discover-summary > bdi[dir="auto"]'))
    .toHaveCSS('direction', 'ltr');
  // The disclosure stays RTL: only its English/count copy changes direction.
  await expect(page.locator('.playlists-discover-summary')).toHaveCSS('direction', 'rtl');
});
