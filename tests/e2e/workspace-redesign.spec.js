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

  test('keeps primary work surfaces within one readable width on ultrawide desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    // Home has an intentionally narrower editorial layout. Other primary
    // work surfaces share the common readable max-width.
    const expectedWidths = [
      { route: 'home', maxWidth: '1350px' },
      { route: 'materials', maxWidth: '1440px' },
      { route: 'my-courses', maxWidth: '1440px' },
    ];
    for (const { route, maxWidth } of expectedWidths) {
      await page.goto('/#/' + route, { waitUntil: 'domcontentloaded' });
      const view = page.locator('.view-' + route);
      await expect(view).toBeVisible();
      const metrics = await view.evaluate(el => ({
        maxWidth: getComputedStyle(el).maxWidth,
        actualWidth: el.getBoundingClientRect().width,
      }));
      expect(metrics.maxWidth).toBe(maxWidth);
      expect(metrics.actualWidth).toBeLessThanOrEqual(parseInt(maxWidth, 10) + 1);
    }
  });

  test('shows playable Materials results in the first viewport on desktop and mobile', async ({ page }) => {
    for (const viewport of [
      { width: 1440, height: 900, maxRowTop: 500 },
      { width: 390, height: 844, maxRowTop: 540 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/#/materials', { waitUntil: 'domcontentloaded' });
      const first = page.locator('#materials-list [data-topic-id]').first();
      await expect(first).toBeVisible({ timeout: 20000 });
      const box = await first.boundingBox();
      expect(box).not.toBeNull();
      expect(box.y).toBeLessThan(viewport.maxRowTop);
    }
  });

  test('anchors Persian course and Materials rows RTL while isolating English lesson and action text', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/courses', { waitUntil: 'domcontentloaded' });
    const medicine = page.locator('.course-item[data-course-id="comprehensive-internal-medicine-course"]');
    await expect(medicine).toBeVisible({ timeout: 20000 });
    await medicine.click();
    const group = page.locator('#course-detail .source-group[dir="rtl"]').first();
    await expect(group).toBeVisible({ timeout: 20000 });
    const header = await group.evaluate(section => {
      const title = section.querySelector('.source-group-title');
      const count = section.querySelector('.source-group-count');
      return {
        titleLeft: title.getBoundingClientRect().left,
        countRight: count.getBoundingClientRect().right,
        headerDirection: getComputedStyle(section.querySelector('.source-group-header')).direction,
        countDirection: getComputedStyle(count).direction,
      };
    });
    expect(header.headerDirection).toBe('rtl');
    expect(header.countDirection).toBe('ltr');
    expect(header.titleLeft).toBeGreaterThan(header.countRight);

    await page.goto('/#/materials', { waitUntil: 'domcontentloaded' });
    // The course selector is deliberately behind a closed disclosure.
    // Open it through its normal accessible control before selecting.
    await page.locator('details.materials-more-filters > summary').click();
    await page.locator('#materials-course-filter')
      .selectOption('comprehensive-internal-medicine-course');
    const material = page.locator('#materials-list .topic-row[dir="rtl"]').first();
    await expect(material).toBeVisible({ timeout: 12000 });
    const layout = await material.evaluate(row => {
      const title = row.querySelector('.topic-title');
      const actions = row.querySelector('.topic-actions');
      return {
        direction: getComputedStyle(row).direction,
        titleAlign: getComputedStyle(title).textAlign,
        titleLeft: title.getBoundingClientRect().left,
        actionsRight: actions.getBoundingClientRect().right,
        actionsDirection: getComputedStyle(actions).direction,
        titleDir: title.getAttribute('dir'),
      };
    });
    expect(layout.direction).toBe('rtl');
    expect(layout.titleAlign).toBe('right');
    expect(layout.titleDir).toBe('auto');
    expect(layout.actionsDirection).toBe('ltr');
    expect(layout.titleLeft).toBeGreaterThan(layout.actionsRight);
  });

  test('keeps the selected Materials page size when moving to the next page', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/materials', { waitUntil: 'domcontentloaded' });
    const size = page.locator('#materials-pager select[data-per-page]');
    await expect(size).toHaveValue('50', { timeout: 20000 });
    await size.selectOption('25');
    await expect(size).toHaveValue('25');
    await page.locator('#materials-pager button[data-page="2"]').click();
    await expect(page.locator('#materials-pager')).toContainText('Page 2 /');
    await expect(size).toHaveValue('25');
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

  test('actually decodes and plays a local VP8 lesson, not merely a visible player shell', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/courses', { waitUntil: 'domcontentloaded' });
    const course = page.locator('.course-item[data-course-id="comprehensive-internal-medicine-course"]');
    await expect(course).toBeVisible({ timeout: 20000 });
    await course.click();
    await page.locator('#course-detail button[data-action="play-video"]').first().click();
    await page.waitForFunction(() => Boolean(document.querySelector('#course-player')?._pdPlayer));
    const mediaUrl = new URL('/tests/fixtures/tiny-black-vp8.webm', page.url()).href;
    await page.evaluate(source => {
      document.querySelector('#course-player')._pdPlayer.loadPlaylist([{
        id: 'offline-test-video', title: 'Deterministic test video',
        src: source, topicId: 'test-lecture', courseId: 'test-course',
      }], false);
    }, mediaUrl);
    const media = page.locator('#course-player video');
    await expect.poll(() => media.evaluate(el => el.readyState), { timeout: 15000 })
      .toBeGreaterThanOrEqual(2);
    await media.evaluate(el => el.play());
    await expect.poll(() => media.evaluate(el => el.currentTime), { timeout: 10000 })
      .toBeGreaterThan(0.15);
    await expect(page.locator('#course-player .pd-loading-overlay')).toBeHidden();
    await expect(page.locator('#course-player .pd-error-banner')).toBeHidden();
    await page.locator('[data-course-close-playback]').click();
    await expect(page.locator('.courses-sidebar')).toBeVisible();
  });

  test('explains a failed lesson in the real browser instead of leaving a spinner visible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/courses', { waitUntil: 'domcontentloaded' });
    const course = page.locator('.course-item[data-course-id="comprehensive-internal-medicine-course"]');
    await expect(course).toBeVisible({ timeout: 20000 });
    await course.click();
    await page.locator('#course-detail button[data-action="play-video"]').first().click();
    const player = page.locator('#course-player');
    await expect(player).toBeVisible();
    await page.waitForFunction(() => Boolean(document.querySelector('#course-player')?._pdPlayer));
    await page.evaluate(() => {
      const media = document.querySelector('#course-player')._pdPlayer._media;
      Object.defineProperty(media, 'error', { configurable: true, value: { code: 4 } });
      media.dispatchEvent(new Event('error'));
    });
    const alert = player.locator('.pd-error-banner');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('not supported');
    await expect(player.locator('.pd-loading-overlay')).toBeHidden();
    await expect(alert.locator('[data-pd="retry"]')).toBeHidden();
    await page.locator('[data-course-close-playback]').click();
    await expect(page.locator('.courses-sidebar')).toBeVisible();
  });

  test('switches to a reversible study-focus layout when playing a course lesson', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/courses', { waitUntil: 'domcontentloaded' });
    const course = page.locator('.course-item[data-course-id="comprehensive-internal-medicine-course"]');
    await expect(course).toBeVisible({ timeout: 20000 });
    await course.click();
    const shell = page.locator('.courses-shell');
    const catalog = page.locator('.courses-sidebar');
    await expect(catalog).toBeVisible();
    await page.locator('#course-detail button[data-action="play-video"]').first().click();
    await expect(shell).toHaveAttribute('data-playback-active', 'true');
    await expect(catalog).toBeHidden();
    await expect(page.locator('#course-player')).toBeVisible();
    await expect(page.locator('#course-detail .topic-row').first()).toBeVisible();
    const layout = await page.evaluate(() => {
      const session = document.querySelector('.course-session').getBoundingClientRect();
      const outline = document.querySelector('#course-detail').getBoundingClientRect();
      return { session: { top: session.top, right: session.right, width: session.width },
        outline: { top: outline.top, left: outline.left, width: outline.width } };
    });
    expect(layout.session.width).toBeGreaterThan(450);
    expect(layout.outline.width).toBeGreaterThan(250);
    expect(Math.abs(layout.session.top - layout.outline.top)).toBeLessThan(40);
    expect(layout.outline.left).toBeGreaterThanOrEqual(layout.session.right - 2);
    const toggle = page.locator('[data-course-toggle-catalog]');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(catalog).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.click();
    await expect(catalog).toBeHidden();
    await page.locator('[data-course-close-playback]').click();
    await expect(catalog).toBeVisible();
    await expect(shell).not.toHaveAttribute('data-playback-active', 'true');
  });

  test('expands the original playing-video DOM into theater and restores the split lesson workbench', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/courses', { waitUntil: 'domcontentloaded' });
    const course = page.locator('.course-item[data-course-id="comprehensive-internal-medicine-course"]');
    await expect(course).toBeVisible({ timeout: 20000 });
    await course.click();
    await page.locator('#course-detail button[data-action="play-video"]').first().click();
    await expect(page.locator('[data-course-playback]')).toBeVisible();
    await page.waitForFunction(() => Boolean(document.querySelector('#course-player')?._pdPlayer));

    const original = await page.evaluate(() => {
      const player = document.querySelector('#course-player');
      window.__theaterOriginalPlayer = player._pdPlayer;
      const session = document.querySelector('.course-session').getBoundingClientRect();
      const outline = document.querySelector('#course-detail').getBoundingClientRect();
      return { sessionWidth: session.width, sideBySide: outline.left >= session.right - 3 };
    });
    expect(original.sideBySide).toBe(true);
    const theater = page.locator('[data-course-theater]');
    await expect(theater).toHaveAttribute('aria-controls', 'course-player');
    await expect(theater).toHaveAttribute('aria-pressed', 'false');
    await theater.click();
    await expect(theater).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.courses-shell')).toHaveAttribute('data-theater', 'true');

    const expanded = await page.evaluate(() => {
      const session = document.querySelector('.course-session').getBoundingClientRect();
      const outline = document.querySelector('#course-detail').getBoundingClientRect();
      return {
        sessionWidth: session.width, outlineBelow: outline.top >= session.bottom - 4,
        mediaStable: document.querySelector('#course-player')._pdPlayer === window.__theaterOriginalPlayer,
      };
    });
    expect(expanded.sessionWidth).toBeGreaterThan(original.sessionWidth + 100);
    expect(expanded.outlineBelow).toBe(true);
    expect(expanded.mediaStable).toBe(true);
    await theater.click();
    await expect(theater).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.courses-shell')).toHaveAttribute('data-theater', 'false');
    await page.locator('[data-course-close-playback]').click();
    await expect(page.locator('[data-course-playback]')).toBeHidden();
    await expect(page.locator('.courses-shell')).toHaveAttribute('data-theater', 'false');
  });

  test('keeps the theater toggle keyboard-accessible and prevents phone-width horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/courses', { waitUntil: 'domcontentloaded' });
    const course = page.locator('.course-item[data-course-id="comprehensive-internal-medicine-course"]');
    await expect(course).toBeVisible({ timeout: 20000 });
    await course.click();
    await page.locator('#course-detail button[data-action="play-video"]').first().click();
    await expect(page.locator('[data-course-playback]')).toBeVisible();
    const theater = page.locator('[data-course-theater]');
    await theater.focus();
    await theater.press('Enter');
    await expect(theater).toHaveAttribute('aria-pressed', 'true');
    const layout = await page.evaluate(() => {
      const session = document.querySelector('.course-session').getBoundingClientRect();
      const outline = document.querySelector('#course-detail').getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        outlineBelow: outline.top >= session.bottom - 4,
      };
    });
    expect(layout.overflow).toBeLessThanOrEqual(2);
    expect(layout.outlineBelow).toBe(true);
    await theater.press('Enter');
    await expect(theater).toHaveAttribute('aria-pressed', 'false');
    await page.locator('[data-course-close-playback]').click();
    await expect(page.locator('.courses-sidebar')).toBeVisible();
  });

  test('keeps study topics reachable below the player on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/courses', { waitUntil: 'domcontentloaded' });
    const course = page.locator('.course-item[data-course-id="comprehensive-internal-medicine-course"]');
    await expect(course).toBeVisible({ timeout: 20000 });
    await course.click();
    await page.locator('#course-detail button[data-action="play-video"]').first().click();
    await expect(page.locator('.courses-shell')).toHaveAttribute('data-playback-active', 'true');
    await expect(page.locator('.courses-sidebar')).toBeHidden();
    await expect(page.locator('#course-detail .topic-row').first()).toBeVisible();
    const positions = await page.evaluate(() => {
      const session = document.querySelector('.course-session').getBoundingClientRect();
      const detail = document.querySelector('#course-detail').getBoundingClientRect();
      return { sessionBottom: session.bottom, detailTop: detail.top,
        detailWidth: detail.width, viewportWidth: window.innerWidth };
    });
    expect(positions.detailTop).toBeGreaterThan(positions.sessionBottom - 4);
    expect(positions.detailWidth).toBeLessThanOrEqual(positions.viewportWidth);
    // The player is tall on phones and the timestamp form sits above the
    // outline. One explicit action must make the first lesson accessible.
    const jumpToLessons = page.locator('[data-course-jump-topics]');
    await expect(jumpToLessons).toBeVisible();
    await expect(jumpToLessons).toHaveAttribute('aria-controls', 'course-detail');
    await jumpToLessons.click();
    await expect(page.locator('#course-detail .topic-row').first()).toBeInViewport({ ratio: 0.5 });
    await page.locator('[data-course-toggle-catalog]').click();
    await expect(page.locator('.courses-sidebar')).toBeVisible();
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

  test('fits the five Progress summary metrics in one row at desktop width', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/progress', { waitUntil: 'domcontentloaded' });
    const metrics = page.locator('.view-progress .progress-metric');
    await expect(metrics).toHaveCount(5);
    const topPositions = await metrics.evaluateAll(nodes =>
      nodes.map(node => Math.round(node.getBoundingClientRect().top)));
    expect(Math.max(...topPositions) - Math.min(...topPositions)).toBeLessThanOrEqual(2);
  });

  test('keeps both backup actions inside a narrow Progress toolbar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/progress', { waitUntil: 'domcontentloaded' });
    const exportButton = page.locator('#btn-export-json');
    const importButton = page.locator('#btn-import-json');
    const backupMenu = page.locator('details.progress-export-menu');
    await expect(backupMenu.locator('summary')).toHaveAccessibleName('Data and backup options');
    await expect(exportButton).toBeHidden();
    await expect(importButton).toBeHidden();
    await backupMenu.locator('summary').click();
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

  test('shows a five-row Appearance ledger with aligned controls and swatches', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/settings', { waitUntil: 'domcontentloaded' });
    const rows = page.locator('#settings-appearance .settings-control-card');
    await expect(rows).toHaveCount(5);
    const coords = await rows.evaluateAll(elements =>
      elements.map(element => ({
        left: Math.round(element.getBoundingClientRect().left),
        top: Math.round(element.getBoundingClientRect().top),
      })));
    expect(Math.max(...coords.map(row => row.left)) - Math.min(...coords.map(row => row.left)))
      .toBeLessThanOrEqual(2);
    expect(coords.every((row, index) => !index || row.top > coords[index - 1].top)).toBe(true);
    const fontControls = page.locator('#settings-appearance .settings-inline-controls').first();
    const positions = await fontControls.locator('button').evaluateAll(elements =>
      elements.map(element => Math.round(element.getBoundingClientRect().top)));
    expect(positions).toHaveLength(3);
    expect(Math.max(...positions) - Math.min(...positions)).toBeLessThanOrEqual(2);
    const swatches = page.locator('#settings-appearance .settings-accent-row .accent-dot');
    await expect(swatches).toHaveCount(7);
    const swatchPositions = await swatches.evaluateAll(elements =>
      elements.map(element => Math.round(element.getBoundingClientRect().top)));
    expect(Math.max(...swatchPositions) - Math.min(...swatchPositions)).toBeLessThanOrEqual(2);
  });

  test('keeps an expanded Studio canvas with reversible inspector and no inaccessible tools', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/studio', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-studio')).toBeVisible();
    const inspector = page.locator('[data-studio-inspector]');
    const toggle = page.locator('[data-studio-toggle-inspector]');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const bounds = await page.evaluate(() => {
      const rect = selector => {
        const element = document.querySelector(selector);
        const box = element.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, width: box.width };
      };
      return {
        canvas: rect('.studio-canvas-card'),
        toolbar: rect('.studio-toolbar-panel'),
      };
    });
    expect(bounds.canvas.width).toBeGreaterThan(650);
    expect(bounds.toolbar.width).toBeLessThan(bounds.canvas.width * 0.9);
    expect(bounds.canvas.top).toBeLessThan(bounds.toolbar.bottom);
    await expect(inspector).toBeVisible();
    await toggle.click();
    await expect(inspector).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('button[data-studio-tool="pen"]')).toBeVisible();
    await expect(page.locator('[data-studio-save]')).toBeVisible();
    await toggle.click();
    await expect(inspector).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[data-studio-layers]')).toBeVisible();
  });

  test('lets narrow Studio devices reveal the inspector without hiding the canvas', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/studio', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-studio')).toBeVisible();
    const toggle = page.locator('[data-studio-toggle-inspector]');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('[data-studio-inspector]')).toBeHidden();
    await toggle.click();
    await expect(page.locator('[data-studio-inspector]')).toBeVisible();
    await expect(page.locator('#studio-canvas')).toBeVisible();
  });

  test('keeps desktop quick search legible without truncating its visible hint', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/#/home', { waitUntil: 'domcontentloaded' });
    const input = page.locator('#sidebar-search');
    await expect(input).toHaveAttribute('placeholder', 'Search…');
    await expect(input).toHaveAttribute('aria-label', 'Quick search courses and lessons');
  });


  test('opens new and compatible saved Notes in Squire by default, but retains advanced HTML in classic', async ({ page }) => {
    await page.goto('/#/notes', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-notes')).toBeVisible();
    const modern = page.locator('[data-notes-editor] .notes-modern-editor');
    const toggle = page.locator('[data-notes-modern-toggle]');
    await expect(modern).toBeVisible({ timeout: 20000 });
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText('Use classic editor');

    await page.locator('[data-action="new-note"]').first().click();
    await expect(modern).toBeVisible();
    const title = 'Default Squire persisted Persian 你好';
    await page.locator('[data-note-title-input]').fill(title);
    await modern.click();
    await page.keyboard.insertText('پزشکی 你好 World from Squire');
    await expect.poll(async () => page.evaluate(async name => {
      const notes = await window.DB.getAllNotes();
      return notes.find(note => note.title === name)?.content ?? '';
    }, title)).toContain('پزشکی 你好');

    await page.goto('/#/home', { waitUntil: 'domcontentloaded' });
    await page.goto('/#/notes', { waitUntil: 'domcontentloaded' });
    const savedNote = page.locator('[data-notes-list]').getByText(title);
    await expect(savedNote).toBeVisible();
    await savedNote.click();
    await expect(modern).toBeVisible({ timeout: 20000 });
    await expect(modern).toContainText('پزشکی 你好');

    const tableHTML = '<p>Approved diagnosis</p><table><tbody><tr><td>70 mL</td></tr></tbody></table>';
    const savedId = await page.evaluate(html => {
      const note = window.PlasmaNotesStore.createNote({ title: 'Advanced saved table', content: html });
      window.PlasmaNotesApp.openNote(note.id);
      return note.id;
    }, tableHTML);
    await expect(page.locator('[data-notes-editor] table td')).toHaveText('70 mL');
    await expect(modern).toHaveCount(0);
    await expect(toggle).toContainText(/classic editor/i);
    const stored = await page.evaluate(id => window.PlasmaNotesStore.getNote(id)?.content, savedId);
    expect(stored).toContain('<table');
    expect(stored).toContain('70 mL');
  });

  test('round-trips a multilingual note through the opt-in Squire editor in Chromium', async ({ page }) => {
    await page.addInitScript(() => {
      window.OpenCourseDeck = window.OpenCourseDeck || {};
      window.OpenCourseDeck.featureFlags = {
        ...(window.OpenCourseDeck.featureFlags || {}),
        notesTiptapPreview: true,
        notesSquireDefault: false,
      };
    });
    await page.goto('/#/notes', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-notes')).toBeVisible();
    await page.locator('[data-action="new-note"]').first().click();
    const title = 'Squire browser round-trip';
    await page.locator('[data-note-title-input]').fill(title);
    const outer = page.locator('[data-notes-editor]');
    await outer.fill('فیزیولوژی قلب 你好世界');
    const storedContent = () => page.evaluate(async noteTitle => {
      const notes = await window.DB.getAllNotes();
      return notes.find(note => note.title === noteTitle)?.content ?? '';
    }, title);
    await expect.poll(storedContent).toContain('你好世界');
    const toggle = page.locator('[data-notes-modern-toggle]');
    await expect(toggle).toBeVisible();
    await toggle.click();
    const modern = page.locator('[data-notes-editor] .notes-modern-editor');
    await expect(modern).toBeVisible();
    await expect(outer).not.toHaveAttribute('role', 'textbox');
    await expect(modern).toHaveAttribute('role', 'textbox');
    await expect(modern).toContainText('فیزیولوژی قلب');
    await modern.click();
    await modern.press('ControlOrMeta+End');
    await page.keyboard.insertText(' Extra saved edit');
    await expect(modern).toContainText('Extra saved edit');
    await expect.poll(storedContent).toContain('Extra saved edit');
    await toggle.click();
    await expect(modern).toHaveCount(0);
    await expect(outer).toHaveAttribute('role', 'textbox');
    await expect(outer).toContainText('Extra saved edit');
    await page.goto('/#/home', { waitUntil: 'domcontentloaded' });
    await page.goto('/#/notes', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-notes-list]')).toContainText(title);
    await expect.poll(storedContent).toContain('Extra saved edit');
  });

  test('refuses unsupported unsaved table content without replacing the classic Notes DOM', async ({ page }) => {
    await page.addInitScript(() => {
      window.OpenCourseDeck = window.OpenCourseDeck || {};
      window.OpenCourseDeck.featureFlags = {
        ...(window.OpenCourseDeck.featureFlags || {}),
        notesSquireDefault: false,
      };
    });
    await page.goto('/#/notes', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-notes')).toBeVisible();
    await page.locator('[data-action="new-note"]').first().click();
    const result = await page.evaluate(async () => {
      const node = document.querySelector('[data-notes-editor]');
      node.innerHTML = '<p>Important material</p><table><tbody><tr><td>70 mL</td></tr></tbody></table>';
      node.dispatchEvent(new Event('input', { bubbles: true }));
      return window.PlasmaNotesApp.enableModernEditor();
    });
    expect(result).toMatchObject({ ok: false, reason: 'incompatible' });
    await expect(page.locator('[data-notes-editor] table td')).toHaveText('70 mL');
    await expect(page.locator('[data-notes-editor] .notes-modern-editor')).toHaveCount(0);
    await page.evaluate(() => window.PlasmaNotesApp.flushPendingSave());
    await expect.poll(async () => page.evaluate(async () => {
      const notes = await window.DB.getAllNotes();
      return notes.some(note => note.content?.includes('70 mL') && note.content?.includes('<table'));
    })).toBe(true);
  });

  test('preserves an IME Notes draft when route navigation is vetoed', async ({ page }) => {
    await page.addInitScript(() => {
      window.OpenCourseDeck = window.OpenCourseDeck || {};
      window.OpenCourseDeck.featureFlags = {
        ...(window.OpenCourseDeck.featureFlags || {}),
        notesSquireDefault: false,
      };
    });
    await page.goto('/#/notes', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-notes')).toBeVisible();
    await page.locator('[data-action="new-note"]').first().click();
    const editor = page.locator('[data-notes-editor]');
    await editor.fill('Initial note');
    await page.evaluate(() => {
      window.__notesBlockedRoutes = 0;
      window.OpenCourseDeck.bus.on('route:blocked', () => { window.__notesBlockedRoutes += 1; });
      const node = document.querySelector('[data-notes-editor]');
      node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      node.innerHTML = '<p>Draft being composed 你好世界</p>';
      location.hash = '#/home';
    });
    await expect.poll(() => page.evaluate(() => window.__notesBlockedRoutes)).toBe(1);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/notes');
    await expect(editor).toContainText('Draft being composed 你好世界');
    await page.evaluate(() => {
      document.querySelector('[data-notes-editor]')
        .dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      location.hash = '#/home';
    });
    await expect(page.locator('.view-home')).toBeVisible();
    await page.goto('/#/notes', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-notes-editor]')).toContainText('Draft being composed 你好世界');
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


  test('persists canonical FSRS ratings across reload without migration controls', async ({ page }) => {
    await page.goto('/#/flashcards', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-flashcards')).toBeVisible({ timeout: 20000 });
    const saved = await page.evaluate(async () => {
      const api = window.OpenCourseDeck.Flashcards;
      const created = await api.addCard({
        front: 'E2E renal recall question', back: 'Nephron', deck: 'FSRS acceptance',
      });
      if (created.scheduler !== 'fsrs-v5') throw new Error('FSRS was not the default');
      await api.reviewCard(created.id, 4);
      const records = await window.DB.getSetting('ocd_flashcards');
      return records.find(card => card.id === created.id);
    });
    expect(saved.scheduler).toBe('fsrs-v5');
    expect(saved.fsrsState.reviewLog).toHaveLength(1);
    expect(saved.fsrsState.card.due).toMatch(/Z$/);
    expect(saved).not.toHaveProperty('repetitions');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-flashcards')).toBeVisible({ timeout: 20000 });
    const restored = await page.evaluate(async id => {
      window.OpenCourseDeck.Flashcards.invalidateCache();
      const cards = await window.OpenCourseDeck.Flashcards.getCards();
      return cards.find(card => card.id === id);
    }, saved.id);
    expect(restored).toEqual(saved);
    await page.locator('#fc-manage-cards > summary').click();
    await expect(page.locator('[data-fc-edit="' + saved.id + '"]')).toBeVisible();
    await expect(page.locator('[data-fc-migrate], [data-fc-rollback], #fc-new-scheduler')).toHaveCount(0);
  });


  test('runs real Konva draft editing and undo in Chrome without touching the Studio board', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/studio', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-studio')).toBeVisible();
    await page.waitForFunction(() => typeof window.OpenCourseDeck?.Canvas?.loadState === 'function'
      && typeof window.DB?.saveSetting === 'function');
    await page.evaluate(async () => {
      await window.DB.saveSetting('ocd_studio_konva_draft', null);
      window.OpenCourseDeck.Canvas.loadState({
        version: 1, tool: 'select',
        viewport: { offsetX: 0, offsetY: 0, zoom: 1, rotation: 0 },
        grid: { enabled: false, size: 24, snap: false },
        layers: [{
          id: 'layer-1', name: 'Test', visible: true, locked: false, opacity: 1,
          elements: [{
            id: 'shape-1', type: 'rect', x: 20, y: 30,
            width: 120, height: 80, fill: '#e11d48', stroke: '#ffffff', strokeWidth: 2,
          }],
        }],
      });
    });
    await page.locator('[data-studio-more-tools] > summary').click();
    await page.locator('[data-studio-konva-open]').click();
    const dialog = page.locator('[data-studio-konva-dialog]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('not applied to your Studio board');
    await expect(page.locator('[data-studio-konva-stage] .konvajs-content canvas').first()).toBeVisible();

    await page.locator('[data-studio-konva-object]').selectOption('shape-1');
    await page.locator('[data-studio-konva-nudge="right"]').click();
    const draftX = () => page.evaluate(async () =>
      (await window.DB.getSetting('ocd_studio_konva_draft'))?.layers?.[0]?.elements?.[0]?.x);
    await expect.poll(draftX).toBe(30);
    expect(await page.evaluate(() =>
      window.OpenCourseDeck.Canvas.serialize().layers[0].elements[0].x)).toBe(20);

    await page.locator('[data-studio-konva-undo]').click();
    await expect.poll(draftX).toBe(20);
    await page.locator('[data-studio-konva-redo]').click();
    await expect.poll(draftX).toBe(30);

    await page.locator('[data-studio-konva-close]').click();
    await expect(dialog).toBeHidden();
    await page.locator('[data-studio-konva-open]').click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Experimental Konva draft editor');
    await expect.poll(draftX).toBe(30);
    await page.locator('[data-studio-konva-close]').click();
    await expect(dialog).toBeHidden();
  });

  test('keeps the opt-in Konva draft modal operable at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/studio', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-studio')).toBeVisible();
    await page.locator('[data-studio-more-tools] > summary').click();
    await page.locator('[data-studio-konva-open]').click();
    const dialog = page.locator('[data-studio-konva-dialog]');
    await expect(dialog).toBeVisible();
    await expect(page.locator('[data-studio-konva-close]')).toBeVisible();
    await expect(page.locator('[data-studio-konva-stage] .konvajs-content')).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds.width).toBeLessThanOrEqual(390);
    await page.locator('[data-studio-konva-close]').click();
    await expect(dialog).toBeHidden();
  });


  test('reorders and reopens a saved five-topic queue at phone width with keyboard input', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/home', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.DB?.saveSetting === 'function');
    await page.evaluate(async () => {
      await window.DB.saveSetting('ocd_playlists', [{
        id: 'e2e-order', title: 'فارسی Review queue',
        topicIds: ['saved-a', 'saved-b', 'saved-c', 'saved-d', 'saved-e'],
        metadata: { owner: 'local', language: 'fa-IR' },
        createdAt: 1,
      }]);
    });
    await page.goto('/#/playlists', { waitUntil: 'domcontentloaded' });
    const card = page.locator('article.playlist-card[data-playlist-id="e2e-order"]');
    await expect(card).toBeVisible();
    await expect(card.locator('.playlist-preview li')).toHaveCount(4);
    await card.locator('.playlist-reorder > summary').click();
    const fifthUp = card.locator('[data-playlist-move="up"][data-topic-index="4"]');
    await expect(fifthUp).toBeVisible();
    await expect(fifthUp).toHaveAttribute('aria-label', /move.*up/i);
    await fifthUp.focus();
    await fifthUp.press('Enter');
    const savedOrder = () => page.evaluate(async () =>
      (await window.DB.getSetting('ocd_playlists'))?.find(p => p.id === 'e2e-order'));
    await expect.poll(async () => (await savedOrder())?.topicIds)
      .toEqual(['saved-a', 'saved-b', 'saved-c', 'saved-e', 'saved-d']);
    expect((await savedOrder()).metadata).toEqual({ owner: 'local', language: 'fa-IR' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('article.playlist-card[data-playlist-id="e2e-order"]')).toBeVisible();
    await expect.poll(async () => (await savedOrder())?.topicIds)
      .toEqual(['saved-a', 'saved-b', 'saved-c', 'saved-e', 'saved-d']);
  });

  test('draws one canonical pen stroke in the opt-in Konva draft without changing the main board', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/studio', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-studio')).toBeVisible();
    await page.waitForFunction(() => typeof window.OpenCourseDeck?.Canvas?.loadState === 'function'
      && typeof window.DB?.saveSetting === 'function');
    await page.evaluate(async () => {
      await window.DB.saveSetting('ocd_studio_konva_draft', null);
      window.OpenCourseDeck.Canvas.loadState({
        version: 1, tool: 'select',
        viewport: { offsetX: 20, offsetY: 30, zoom: 2, rotation: 0 },
        grid: { enabled: false, size: 24, snap: false },
        style: { strokeColor: '#234abc', strokeWidth: 4, lineCap: 'round', lineJoin: 'round' },
        layers: [{ id: 'draw', name: 'Pen', visible: true, locked: false, opacity: 1, elements: [] }],
      });
    });
    await page.locator('[data-studio-more-tools] > summary').click();
    await page.locator('[data-studio-konva-open]').click();
    const dialog = page.locator('[data-studio-konva-dialog]');
    await expect(dialog).toBeVisible();
    await page.locator('[data-studio-konva-mode="pen"]').click();
    await expect(page.locator('[data-studio-konva-mode="pen"]')).toHaveAttribute('aria-pressed', 'true');
    const stage = page.locator('[data-studio-konva-stage] .konvajs-content');
    await expect(stage).toBeVisible();
    const box = await stage.boundingBox();
    await page.mouse.move(box.x + 72, box.y + 80);
    await page.mouse.down();
    await page.mouse.move(box.x + 94, box.y + 96, { steps: 4 });
    await page.mouse.move(box.x + 116, box.y + 110, { steps: 4 });
    await page.mouse.up();
    const draft = async () => page.evaluate(() => window.DB.getSetting('ocd_studio_konva_draft'));
    await expect.poll(async () => (await draft())?.layers?.[0]?.elements?.length).toBe(1);
    const saved = await draft();
    const line = saved.layers[0].elements[0];
    expect(line.type).toBe('polyline');
    expect(line.stroke).toBe('#234abc');
    expect(line.strokeWidth).toBe(4);
    expect(line.points.length).toBeGreaterThan(2);
    expect(line.points[0][0]).toBeCloseTo(26, 0);
    expect(line.points[0][1]).toBeCloseTo(25, 0);
    expect(await page.evaluate(() =>
      window.OpenCourseDeck.Canvas.serialize().layers[0].elements)).toEqual([]);

    await page.locator('[data-studio-konva-undo]').click();
    await expect.poll(async () => (await draft())?.layers?.[0]?.elements?.length).toBe(0);
    await page.locator('[data-studio-konva-redo]').click();
    await expect.poll(async () => (await draft())?.layers?.[0]?.elements?.length).toBe(1);
    await page.locator('[data-studio-konva-close]').click();
    await expect(dialog).toBeHidden();
    await page.locator('[data-studio-konva-open]').click();
    await expect(dialog).toBeVisible();
    expect((await draft()).layers[0].elements[0].points).toEqual(line.points);
    await page.locator('[data-studio-konva-close]').click();
  });

  test('cancels multi-pointer drawing in the phone-width Konva draft instead of saving a ghost stroke', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/studio', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-studio')).toBeVisible();
    await page.waitForFunction(() => typeof window.OpenCourseDeck?.Canvas?.loadState === 'function'
      && typeof window.DB?.saveSetting === 'function');
    await page.evaluate(async () => {
      await window.DB.saveSetting('ocd_studio_konva_draft', null);
      window.OpenCourseDeck.Canvas.loadState({
        version: 1, tool: 'select',
        viewport: { offsetX: 0, offsetY: 0, zoom: 1, rotation: 0 },
        grid: { enabled: false, size: 24, snap: false },
        layers: [{ id: 'draw', name: 'Pen', visible: true, locked: false, elements: [] }],
      });
    });
    await page.locator('[data-studio-more-tools] > summary').click();
    await page.locator('[data-studio-konva-open]').click();
    await page.locator('[data-studio-konva-mode="pen"]').click();
    await expect(page.locator('[data-studio-konva-stage] .konvajs-content')).toBeVisible();
    await page.evaluate(() => {
      const stage = document.querySelector('[data-studio-konva-stage] .konvajs-content');
      const rect = stage.getBoundingClientRect();
      const send = (type, pointerId, x, y) => stage.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId, pointerType: 'touch',
        isPrimary: pointerId === 10,
        clientX: rect.x + x, clientY: rect.y + y,
      }));
      send('pointerdown', 10, 30, 50);
      send('pointermove', 10, 50, 65);
      send('pointerdown', 11, 90, 90);
      send('pointerup', 11, 92, 92);
      send('pointerup', 10, 110, 100);
    });
    expect(await page.evaluate(() => window.DB.getSetting('ocd_studio_konva_draft'))).toBeNull();
    await page.evaluate(() => {
      const stage = document.querySelector('[data-studio-konva-stage] .konvajs-content');
      const rect = stage.getBoundingClientRect();
      const send = (type, x, y) => stage.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 20, pointerType: 'touch',
        isPrimary: true, clientX: rect.x + x, clientY: rect.y + y,
      }));
      send('pointerdown', 40, 60);
      send('pointermove', 55, 75);
      send('pointerup', 75, 90);
    });
    await expect.poll(() => page.evaluate(async () =>
      (await window.DB.getSetting('ocd_studio_konva_draft'))?.layers?.[0]?.elements?.length)).toBe(1);
    expect(await page.evaluate(() =>
      window.OpenCourseDeck.Canvas.serialize().layers[0].elements.length)).toBe(0);
    await page.locator('[data-studio-konva-close]').click();
    await expect(page.locator('[data-studio-konva-dialog]')).toBeHidden();
  });


  test('keeps topbar and command palette keyboard state accessible in production Chromium', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/home', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(
      window.OpenCourseDeck?.TopbarSearch?.resultsBox
      && typeof window.OpenCourseDeck?.CommandPalette?.open === 'function'));
    await page.evaluate(() => {
      window.__searchKeyboardPick = null;
      window.OpenCourseDeck.TopbarSearch.setData([
        { label: 'Biology', category: 'Course',
          action: () => { window.__searchKeyboardPick = 'biology'; } },
        { label: 'Biology practice', category: 'Topic',
          action: () => { window.__searchKeyboardPick = 'practice'; } },
      ]);
    });
    const topbar = page.locator('#sidebar-search');
    await topbar.fill('biology');
    const topbarRows = page.locator('.search-result-item');
    await expect(topbarRows).toHaveCount(2);
    await expect(topbar).toHaveAttribute('role', 'combobox');
    await expect(topbar).toHaveAttribute('aria-expanded', 'true');
    await expect(topbarRows.first()).toHaveAttribute('aria-selected', 'true');
    expect(await topbar.getAttribute('aria-activedescendant'))
      .toBe(await topbarRows.first().getAttribute('id'));

    await topbar.press('ArrowDown');
    await expect(topbarRows.nth(1)).toHaveAttribute('aria-selected', 'true');
    expect(await topbar.getAttribute('aria-activedescendant'))
      .toBe(await topbarRows.nth(1).getAttribute('id'));
    await topbar.press('Enter');
    await expect.poll(() => page.evaluate(() => window.__searchKeyboardPick)).toBe('practice');
    await expect(topbar).toHaveAttribute('aria-expanded', 'false');
    await expect(topbar).not.toHaveAttribute('aria-activedescendant', /.+/);

    await page.evaluate(() => window.OpenCourseDeck.CommandPalette.open());
    const palette = page.locator('#cp-input');
    const dialog = page.locator('#command-palette-overlay');
    await expect(dialog).toHaveClass(/open/);
    await palette.fill('theme');
    await expect(page.locator('#cp-results .cp-item[data-idx]').first()).toBeVisible();
    const active = page.locator('#cp-results .cp-item[aria-selected="true"]');
    await expect(palette).toHaveAttribute('role', 'combobox');
    await expect(palette).toHaveAttribute('aria-expanded', 'true');
    expect(await palette.getAttribute('aria-activedescendant')).toBe(await active.getAttribute('id'));
    await palette.press('ArrowDown');
    expect(await palette.getAttribute('aria-activedescendant')).toBe(await active.getAttribute('id'));
    await palette.press('Escape');
    await expect(palette).toHaveAttribute('aria-expanded', 'false');
    await expect(palette).not.toHaveAttribute('aria-activedescendant', /.+/);
    await expect(topbar).toBeFocused();
  });


  test('downloads and reimports canonical Konva v1 draft JSON without overwriting classic Studio', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/studio', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-studio')).toBeVisible();
    await page.waitForFunction(() => typeof window.OpenCourseDeck?.Canvas?.loadState === 'function'
      && typeof window.DB?.saveSetting === 'function');
    const board = {
      version: 1, tool: 'select',
      viewport: { offsetX: 11, offsetY: -8, zoom: 1.5, rotation: 0 },
      grid: { enabled: false, size: 24, snap: false },
      layers: [{
        id: 'layer-a', name: 'Layer', visible: true, locked: false, opacity: 1,
        elements: [{
          id: 'signed-rect', type: 'rect', x: 60, y: 70,
          width: -40, height: -25, fill: '#df3870', stroke: '#ffffff', strokeWidth: 2,
        }],
      }],
    };
    await page.evaluate(async source => {
      await window.DB.saveSetting('ocd_studio_konva_draft', null);
      window.OpenCourseDeck.Canvas.loadState(source);
      window.OpenCourseDeck.UI = {
        ...(window.OpenCourseDeck.UI || {}),
        confirm: async () => true,
      };
    }, board);
    await page.locator('[data-studio-more-tools] > summary').click();
    await page.locator('[data-studio-konva-open]').click();
    const dialog = page.locator('[data-studio-konva-dialog]');
    await expect(dialog).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-studio-konva-export]').click(),
    ]);
    expect(download.suggestedFilename()).toBe('farzan-konva-draft-v1.json');
    expect(await page.evaluate(() => window.DB.getSetting('ocd_studio_konva_draft'))).toBeNull();

    const replacement = structuredClone(board);
    replacement.layers[0].elements[0].x = 122;
    await page.locator('[data-studio-konva-import]').setInputFiles({
      name: 'imported-studio-v1.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(replacement)),
    });
    await expect.poll(() => page.evaluate(async () =>
      (await window.DB.getSetting('ocd_studio_konva_draft'))?.layers?.[0]?.elements?.[0]?.x))
      .toBe(122);
    await expect(page.locator('[data-studio-konva-status]')).toContainText('Imported isolated');
    expect(await page.evaluate(() =>
      window.OpenCourseDeck.Canvas.serialize().layers[0].elements[0].x)).toBe(60);
    await page.locator('[data-studio-konva-close]').click();
    await expect(dialog).toBeHidden();
    await page.locator('[data-studio-konva-open]').click();
    await expect(dialog).toBeVisible();
    await expect.poll(() => page.evaluate(async () =>
      (await window.DB.getSetting('ocd_studio_konva_draft'))?.layers?.[0]?.elements?.[0]?.x))
      .toBe(122);
    await page.locator('[data-studio-konva-close]').click();
    await expect(dialog).toBeHidden();
  });

  test('unknown route has a Home recovery breadcrumb on desktop without crowding narrow phones', async ({ page }) => {
    const missing = '/#/this-route-does-not-exist';
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(missing, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-notfound')).toBeVisible();
    await expect(page.locator('#breadcrumb-list a[href="#/home"]')).toBeVisible();
    await expect(page.locator('#breadcrumb-list .breadcrumb-current')).toHaveText('Page not found');
    await expect(page.locator('#breadcrumb-list .breadcrumb-item')).toHaveCount(2);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-notfound')).toBeVisible();
    await expect(page.locator('#breadcrumb-list .breadcrumb-current')).toHaveText('Page not found');
    await expect(page.locator('#breadcrumb-list .breadcrumb-item')).toHaveCount(1);
    await expect(page.locator('#breadcrumb-list a[href="#/home"]')).toHaveCount(0);
  });

  test('lets each notification be dismissed without losing unread-count accuracy or blurring navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/home', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.view-home')).toBeVisible();
    await page.waitForFunction(() => typeof window.OpenCourseDeck?.bus?.emit === 'function');
    await page.evaluate(() => {
      window.OpenCourseDeck.bus.emit('notification:new', { title: 'First lesson note', message: 'Saved to Notes' });
      window.OpenCourseDeck.bus.emit('notification:new', { title: 'Second reminder', message: 'Ready for review' });
    });
    await page.locator('[data-notifications-toggle]').click();
    const drawer = page.locator('#notifications-panel');
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('.notif-item')).toHaveCount(2);
    await expect(page.locator('.drawer-backdrop')).toHaveCSS('backdrop-filter', 'none');
    const first = drawer.locator('.notif-item').first();
    await expect(first.locator('[data-notif-dismiss]')).toHaveAttribute('aria-label', /dismiss/i);
    await first.locator('[data-notif-dismiss]').focus();
    await first.locator('[data-notif-dismiss]').click();
    await expect(drawer.locator('.notif-item')).toHaveCount(1);
    await expect(page.locator('#topbar-notif-dot')).toHaveText('1');
    await expect(drawer.locator('[data-notif-dismiss]').first()).toBeFocused();
    await drawer.locator('[data-notif-dismiss]').click();
    await expect(drawer.locator('.notif-item')).toHaveCount(0);
    await expect(page.locator('#topbar-notif-dot')).toBeHidden();
    await expect(page.locator('[data-notifications-toggle]')).toHaveAttribute('aria-label', 'Notifications');
    await page.locator('#notif-close').click();
    await expect(drawer).toBeHidden();
  });

});
