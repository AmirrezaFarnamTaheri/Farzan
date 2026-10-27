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
    // The catalog may legitimately auto-select a course. Verify real content.
    await expect(page.locator('#courses-search')).toBeVisible();
    await expect(page.locator('#courses-list .course-item').first()).toBeVisible();
    await expect(page.locator('#course-detail h2').first()).toBeVisible();
    await expect(player).toBeHidden();
  });

  test('renders a high-contrast editorial home hero for a new learner', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/home', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-home-title]')).toContainText('What will you learn today');
    const appearance = await page.locator('.home-hero').evaluate(element => ({
      background: getComputedStyle(element).backgroundImage,
      titleInk: getComputedStyle(element.querySelector('.home-title')).color,
    }));
    expect(appearance.background).toContain('linear-gradient');
    expect(appearance.titleInk).toBe('rgb(255, 255, 255)');
  });

  test('reveals and dismisses lesson video only after choosing Play', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/courses', { waitUntil: 'domcontentloaded' });
    const medicine = page.locator('.course-item[data-course-id="comprehensive-internal-medicine-course"]');
    await expect(medicine).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#courses-list .course-item').first()).not.toContainText('Getting Started');
    await medicine.click();
    const play = page.locator('#course-detail button[data-action="play-video"]').first();
    await expect(play).toBeVisible({ timeout: 20000 });
    await play.click();
    const session = page.locator('[data-course-playback]');
    await expect(session).toBeVisible();
    await expect(page.locator('#course-player')).toBeVisible();
    await session.locator('[data-course-close-playback]').click();
    await expect(session).toBeHidden();
  });

  test('shows meaningful first-run progress guidance instead of empty charts', async ({ page }) => {
    await page.goto('/#/progress', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-progress')).toBeVisible();
    await expect(page.locator('[data-progress-loading]')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('[data-progress-empty]').first()).toBeVisible();
    await expect(page.locator('[data-progress-empty]').first()).toContainText('Start a lesson');
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

  test('guides new Studio users without blocking drawing or covering saved content', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/studio', { waitUntil: 'domcontentloaded' });
    const hint = page.locator('[data-studio-empty-hint]');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Choose Pen');
    const styles = await hint.evaluate(node => ({
      events: getComputedStyle(node).pointerEvents,
      width: node.getBoundingClientRect().width,
    }));
    expect(styles.events).toBe('none');
    expect(styles.width).toBeLessThan(390);

    await page.locator('[data-studio-text]').fill('Plan my next study session');
    await page.locator('[data-studio-add-text]').click();
    await expect(page.locator('[data-studio-elements]')).toContainText('Plan my next study session');
    await expect(hint).toBeHidden();
  });

  test('shows the mobile course catalog instead of a grid of zero progress metrics', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/home', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-home')).toHaveAttribute('data-home-has-progress', 'false');
    await expect(page.locator('[data-home-progress-card]')).toBeHidden();
    const catalog = page.locator('.home-grid .home-card').filter({ hasText: 'Catalog' }).first();
    await expect(catalog).toBeVisible();
    expect((await catalog.boundingBox()).y).toBeLessThan(650);
  });

  test('keeps both backup actions inside a narrow Progress toolbar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/progress', { waitUntil: 'domcontentloaded' });
    const exportButton = page.locator('#btn-export-json');
    const importButton = page.locator('#btn-import-json');
    await expect(exportButton).toHaveAccessibleName('Export app-data JSON');
    for (const button of [exportButton, importButton]) {
      await expect(button).toBeVisible();
      const rect = await button.boundingBox();
      expect(rect.x).toBeGreaterThanOrEqual(-1);
      expect(rect.x + rect.width).toBeLessThanOrEqual(391);
    }
  });

  test('keeps destructive Progress reset behind a native disclosure on mobile and desktop', async ({ page }) => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(viewport);
      await page.goto('/#/progress', { waitUntil: 'domcontentloaded' });
      const disclosure = page.locator('details.progress-manage-menu');
      const reset = page.locator('#btn-reset-all');
      await expect(disclosure.locator('summary')).toHaveAccessibleName('Manage saved data');
      await expect(disclosure).not.toHaveAttribute('open');
      await expect(reset).toBeHidden();
      await disclosure.locator('summary').click();
      await expect(disclosure).toHaveAttribute('open');
      await expect(reset).toBeVisible();
      const rect = await reset.boundingBox();
      expect(rect.x).toBeGreaterThanOrEqual(-1);
      expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width + 1);
      await disclosure.locator('summary').click();
      await expect(reset).toBeHidden();
    }
  });

  test('keeps desktop quick search legible without truncating its visible hint', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/#/home', { waitUntil: 'domcontentloaded' });
    const input = page.locator('#sidebar-search');
    await expect(input).toHaveAttribute('placeholder', 'Search…');
    await expect(input).toHaveAttribute('aria-label', 'Quick search courses and lessons');
  });

  test('keeps a newly opened note editor visible without scrolling past an empty library panel', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/notes', { waitUntil: 'domcontentloaded' });
    const editor = page.locator('[data-notes-main-pane]');
    await expect(editor).toBeVisible();
    await expect(page.locator('[data-note-title-input]')).toBeVisible();
    const measure = await page.evaluate(() => ({
      libraryHeight: document.querySelector('.notes-sidebar').getBoundingClientRect().height,
      editorTop: document.querySelector('[data-notes-main-pane]').getBoundingClientRect().top,
      overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
    }));
    expect(measure.libraryHeight).toBeLessThan(400);
    expect(measure.editorTop).toBeLessThan(720);
    expect(measure.overflow).toBeLessThanOrEqual(2);
  });

  test('keeps RTL mobile navigation fully off-canvas until opened', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/home', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
    await expect.poll(async () => page.locator('#sidebar').evaluate(el =>
      el.getBoundingClientRect().left)).toBeGreaterThanOrEqual(390);
    const layout = await page.evaluate(() => ({
      app: document.querySelector('#ocd-app').getBoundingClientRect(),
      topbar: document.querySelector('#topbar').getBoundingClientRect(),
      hero: document.querySelector('.home-hero').getBoundingClientRect(),
    }));
    expect(layout.topbar.right).toBeLessThanOrEqual(391);
    expect(layout.hero.right).toBeLessThanOrEqual(391);
  });

  test('keeps the mobile course picker short enough to reveal the lesson outline', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/courses', { waitUntil: 'domcontentloaded' });
    const list = page.locator('#courses-list');
    await expect(list.locator('.course-item').first()).toBeVisible();
    const height = await list.evaluate(el => el.getBoundingClientRect().height);
    expect(height).toBeLessThanOrEqual(245);
  });

  test('prioritizes course discovery above redundant zero-data panels on a new phone profile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/home', { waitUntil: 'domcontentloaded' });
    const hero = page.locator('.home-hero');
    await expect(hero).toHaveAttribute('data-home-has-progress', 'false');
    // Only the first action should take a full row; secondary actions share a row.
    await expect(page.locator('[data-home-resume]')).toBeVisible();
    await expect(page.locator('[data-home-command-strip]')).toBeHidden();
    await expect(hero.locator('.home-focus-panel')).toBeHidden();
    const metrics = await hero.evaluate(element => ({
      height: element.getBoundingClientRect().height,
      width: element.getBoundingClientRect().width,
      overflow: element.scrollWidth - element.clientWidth,
    }));
    expect(metrics.height).toBeLessThan(630);
    expect(metrics.width).toBeLessThanOrEqual(390);
    expect(metrics.overflow).toBeLessThanOrEqual(2);
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
  test('keeps Studio drawing surface aligned at portrait and short-landscape sizes', async ({ page }) => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await page.goto('/#/studio', { waitUntil: 'domcontentloaded' });
      const canvas = page.locator('#studio-canvas');
      await expect(canvas).toBeVisible();
      const dimensions = await canvas.evaluate(element => {
        const canvasRect = element.getBoundingClientRect();
        const shellRect = element.closest('.studio-shell').getBoundingClientRect();
        return {
          canvasHeight: canvasRect.height,
          shellHeight: shellRect.height,
          canvasWidth: canvasRect.width,
          shellWidth: shellRect.width,
        };
      });
      expect(Math.abs(dimensions.canvasHeight - dimensions.shellHeight),
        'Canvas must not clip strokes below its parent surface').toBeLessThanOrEqual(2);
      expect(Math.abs(dimensions.canvasWidth - dimensions.shellWidth)).toBeLessThanOrEqual(2);
      if (viewport.height < 500) {
        expect(dimensions.shellHeight,
          'Landscape canvas should not exceed most of the short viewport').toBeLessThanOrEqual(310);
        expect(dimensions.shellHeight).toBeGreaterThanOrEqual(225);
      }
    }
  });


});
