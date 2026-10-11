import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// These are actual browser screenshots, never synthesized mockups. This
// supplementary matrix intentionally does not duplicate the 107 base captures.
const root = path.resolve('artifacts/visual-audit');
const routes = [
  'home', 'courses', 'my-courses', 'materials', 'notes',
  'pdf', 'progress', 'playlists', 'bookmarks', 'tags',
  'flashcards', 'studio', 'achievements', 'settings', 'help',
];
const configurations = [
  { group: 'small-mobile', width: 320, height: 740 },
  { group: 'wide-desktop', width: 1920, height: 1080 },
  { group: 'light-tablet', width: 900, height: 1080, light: true },
  { group: 'rtl-desktop', width: 1440, height: 900, rtl: true },
  { group: 'rtl-mobile', width: 390, height: 844, rtl: true },
  { group: 'large-type', width: 1440, height: 900, enlarged: true },
  { group: 'compact-density', width: 1280, height: 800, compact: true },
  { group: 'reduced-motion', width: 1280, height: 800, reducedMotion: true },
  { group: 'keyboard-focus', width: 1280, height: 800, focus: true },
  { group: 'full-page', width: 1440, height: 900, fullPage: true },
];
test.use({ channel: 'chrome' });
test.setTimeout(270000);

function record(data) {
  fs.mkdirSync(root, { recursive: true });
  fs.appendFileSync(path.join(root, 'observations.jsonl'), JSON.stringify({
    suite: 'expanded', ...data, at: new Date().toISOString(),
  }) + '\n');
}

async function capture(page, group, name, fullPage = false) {
  const dir = path.join(root, 'screenshots', group);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name + '.png');
  await page.screenshot({
    path: file, fullPage, animations: 'disabled',
    caret: 'hide', timeout: 25000,
  });
  const metadata = await sharp(file).metadata();
  const stats = await sharp(file).stats();
  const brightness = stats.channels.slice(0, 3)
    .reduce((sum, channel) => sum + channel.mean, 0) / 3;
  const spread = stats.channels.slice(0, 3)
    .reduce((sum, channel) => sum + channel.stdev, 0) / 3;
  expect(metadata.width).toBe(page.viewportSize().width);
  expect(metadata.height).toBeGreaterThanOrEqual(page.viewportSize().height);
  expect(brightness, group + '/' + name + ' is a blank dark frame').toBeGreaterThan(8);
  expect(spread, group + '/' + name + ' is an almost uniform frame').toBeGreaterThan(7);
  const bytes = fs.statSync(file).size;
  expect(bytes, group + '/' + name + ' is unusually small').toBeGreaterThan(12000);
  record({
    group, name, file: path.relative(root, file).replaceAll(path.sep, '/'),
    viewport: page.viewportSize(), pixels: { width: metadata.width, height: metadata.height },
    fullPage, bytes, brightness, spread,
  });
}

async function routeState(page, route) {
  await page.evaluate(name => { window.location.hash = '#/' + name; }, route);
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/' + route);
  await expect(page.locator('#view-container')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const main = document.querySelector('#view-container');
    return main && main.innerText && main.innerText.trim().length >= 10;
  }), { timeout: 15000 }).toBeTruthy();
  await page.waitForTimeout(220);
}

async function stateHealth(page) {
  return page.evaluate(() => {
    const main = document.querySelector('#view-container');
    const bounds = main?.getBoundingClientRect();
    const scrollWidth = Math.max(
      document.body.scrollWidth, document.documentElement.scrollWidth,
    );
    const broken = [...document.images].filter(img =>
      img.complete && img.naturalWidth === 0 && img.getAttribute('src'),
    );
    return {
      route: location.hash, title: main?.querySelector('h1')?.innerText ?? '',
      textLength: main?.innerText?.trim().length || 0,
      visible: Boolean(bounds && bounds.width > 0 && bounds.height > 0),
      overflow: scrollWidth - innerWidth, brokenImages: broken.map(img => img.src).slice(0, 5),
      errors: main?.querySelectorAll('.route-error,.view-error,[data-route-error]').length ?? 0,
      dir: document.documentElement.dir, theme: document.documentElement.dataset.theme,
      focused: document.activeElement?.outerHTML?.slice(0, 160) ?? '',
    };
  });
}

for (const config of configurations) {
  test('capture 15 real routes in ' + config.group + ' layout', async ({ page }) => {
    await page.setViewportSize({ width: config.width, height: config.height });
    if (config.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto('/#/settings', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#view-container')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.OpenCourseDeck?.Router &&
      window.DataStore?.getState), null, { timeout: 20000 });
    if (config.light) {
      await page.locator('#btn-theme-toggle').click();
      await expect.poll(() => page.locator('html').getAttribute('data-theme')).not.toBe('dark');
    }
    if (config.enlarged) {
      const before = await page.locator('#font-scale-label').textContent();
      await page.locator('#btn-font-inc').click();
      await page.locator('#btn-font-inc').click();
      await expect(page.locator('#font-scale-label')).not.toHaveText(before);
    }
    if (config.compact) {
      await page.locator('#select-density').selectOption('compact');
      await expect(page.locator('#select-density')).toHaveValue('compact');
    }

    const problems = [];
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      const name = String(i + 1).padStart(2, '0') + '-' + route;
      try {
        await routeState(page, route);
        if (config.rtl) {
          // The Persian locale option is correctly disabled until translated.
          // This is a directional layout stress test, NOT a translation claim.
          await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
        }
        if (config.focus) {
          const target = await page.evaluate(() => {
            const controls = [...document.querySelectorAll(
              '#view-container button,#view-container a[href],' +
              '#view-container input,#view-container select,#view-container textarea',
            )].filter(node => node.getClientRects().length && !node.disabled);
            const targetControl = controls[0] ||
              document.querySelector('a[href="#/courses"]');
            targetControl?.focus({ preventScroll: true });
            return targetControl ? document.activeElement === targetControl : false;
          });
          expect(target, 'Visible focus target absent from ' + route).toBe(true);
        }
        const state = await stateHealth(page);
        if (!state.visible || state.textLength < 10 || state.errors ||
            state.overflow > 28 || state.brokenImages.length) {
          problems.push({ route, state });
        }
        await capture(page, config.group, name, config.fullPage);
        record({ group: config.group, route, health: state });
      } catch (error) {
        problems.push({ route, error: error.message });
        record({ group: config.group, route, error: error.message });
      }
    }
    expect(problems, 'Visual/functional layout regressions in ' + config.group).toEqual([]);
    expect(pageErrors, 'Runtime errors in ' + config.group).toEqual([]);
    if (config.reducedMotion) {
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    }
  });
}


async function ready(page, route = 'home') {
  await page.goto('/#/' + route, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(
    window.OpenCourseDeck?.Router && window.DataStore?.getState,
  ), null, { timeout: 20000 });
  await routeState(page, route);
}

async function stateShot(page, group, name) {
  await expect(page.locator('#view-container')).toBeVisible();
  await page.waitForTimeout(180);
  await capture(page, group, name);
}

// Distinct, interaction-proven states supplement empty/new-route captures.
// Tests do not falsely claim an external Plasmato video host was contacted.
test('course search, no results, media facets and source scopes change the real view', async ({ page }) => {
  await ready(page, 'courses');
  await expect(page.locator('.course-item[data-course-id]')).not.toHaveCount(0);
  await stateShot(page, 'course-states', '01-catalog-loaded');
  await page.locator('#courses-search').fill('not-an-existing-course-visual-suite');
  await expect(page.locator('#courses-list')).toContainText('No courses match');
  await stateShot(page, 'course-states', '02-search-empty-result');
  await page.locator('#courses-search').fill('');
  await page.locator('.course-item[data-course-id="comprehensive-internal-medicine-course"]').click();
  await expect(page.locator('#course-detail')).toContainText('385 topics');
  await stateShot(page, 'course-states', '03-real-plasmato-detail');
  for (const [index, media] of ['video', 'pdf', 'mixed', 'none'].entries()) {
    const chip = page.locator('[data-course-filter="' + media + '"]');
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await stateShot(page, 'course-states', String(index + 4).padStart(2, '0') + '-' + media + '-facet');
  }
  await page.locator('[data-course-filter="all"]').click();
  await page.locator('#courses-source-scope').selectOption('multi');
  await expect(page.locator('#courses-source-scope')).toHaveValue('multi');
  await stateShot(page, 'course-states', '08-multiple-source-courses');
});

test('Materials changes filters, source, course and empty-result presentation', async ({ page }) => {
  await ready(page, 'materials');
  await expect(page.locator('#materials-course-filter option[value="comprehensive-internal-medicine-course"]')).toHaveCount(1);
  await stateShot(page, 'materials-states', '01-all-materials');
  for (const [index, media] of ['video', 'pdf', 'none'].entries()) {
    const chip = page.locator('[data-material-filter="' + media + '"]');
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await stateShot(page, 'materials-states', String(index + 2).padStart(2, '0') + '-' + media + '-filtered');
  }
  await page.locator('[data-material-filter="all"]').click();
  await page.locator('#materials-course-filter').selectOption('comprehensive-internal-medicine-course');
  await expect(page.locator('#materials-course-filter')).toHaveValue('comprehensive-internal-medicine-course');
  await stateShot(page, 'materials-states', '05-real-course-materials');
  const firstSource = await page.locator('#materials-source-filter option').evaluateAll(
    options => options.find(option => option.value !== 'all')?.value ?? '',
  );
  expect(firstSource).not.toBe('');
  await page.locator('#materials-source-filter').selectOption(firstSource);
  await stateShot(page, 'materials-states', '06-source-filter-selected');
  await page.locator('#materials-search').fill('visual-no-material-match-73917');
  await expect(page.locator('#materials-search')).toHaveValue('visual-no-material-match-73917');
  await stateShot(page, 'materials-states', '07-no-material-results');
  await page.locator('#materials-search').fill('');
  await page.locator('#materials-source-filter').selectOption('all');
  await stateShot(page, 'materials-states', '08-course-materials-restored');
});

test('real notes retain long titles, autosave, search and expose export UI', async ({ page }) => {
  await ready(page, 'notes');
  await stateShot(page, 'notes-states', '01-notes-initial');
  await page.locator('[data-action="new-note"]').first().click();
  const title = 'Extensive Visual QA: Pharmacology and Clinical Study Notes with a Long but Valid Document Name';
  await page.locator('[data-note-title-input]').fill(title);
  await page.locator('[data-notes-editor]').fill(
    'First point: assess the patient.\nSecond point: document findings.\nThird point: verify source credibility.',
  );
  await expect.poll(() => page.evaluate(async name =>
    (await window.DB.getAllNotes()).some(note => note.title === name &&
      String(note.content).includes('assess the patient')), title,
  ), { timeout: 15000 }).toBe(true);
  await stateShot(page, 'notes-states', '02-real-note-autosaved');
  await page.locator('.notes-export-menu summary').click();
  await expect(page.locator('.notes-export-menu')).toHaveAttribute('open', '');
  await stateShot(page, 'notes-states', '03-export-options-expanded');
  await page.locator('.notes-export-menu summary').click();
  await page.locator('[data-notes-search]').fill('Pharmacology');
  await expect(page.locator('[data-notes-list]')).toContainText('Pharmacology');
  await stateShot(page, 'notes-states', '04-notes-search-found');
  await page.locator('[data-notes-search]').fill('visual-nonexistent-title-9913');
  await stateShot(page, 'notes-states', '05-notes-search-empty');
  await routeState(page, 'home');
  await routeState(page, 'notes');
  await expect(page.locator('[data-notes-list]')).toContainText(title);
  await stateShot(page, 'notes-states', '06-note-reopens-after-navigation');
});

test('settings density, font, theme and AI permission states are visible', async ({ page }) => {
  await ready(page, 'settings');
  await stateShot(page, 'settings-states', '01-appearance-default');
  for (const [index, density] of ['compact', 'spacious'].entries()) {
    await page.locator('#select-density').selectOption(density);
    await expect(page.locator('#select-density')).toHaveValue(density);
    await stateShot(page, 'settings-states', String(index + 2).padStart(2, '0') + '-' + density + '-density');
  }
  await page.locator('#btn-font-inc').click();
  await page.locator('#btn-font-inc').click();
  await expect(page.locator('#font-scale-label')).not.toHaveText('100%');
  await stateShot(page, 'settings-states', '04-enlarged-font');
  await page.locator('#btn-theme-toggle').click();
  await stateShot(page, 'settings-states', '05-toggled-theme');
  await page.locator('[data-ai-mode]').selectOption('custom-api');
  await expect(page.locator('[data-ai-custom-fields]')).toBeVisible();
  await stateShot(page, 'settings-states', '06-custom-api-permission');
  await page.locator('[data-ai-endpoint]').fill('http://not-local.example/v1/chat');
  await expect(page.locator('[data-ai-endpoint-warning]')).toContainText('HTTPS');
  await stateShot(page, 'settings-states', '07-unsafe-endpoint-rejected');
  await page.locator('[data-ai-mode]').selectOption('local-gemma');
  await expect(page.locator('[data-ai-local-fields]')).toBeVisible();
  await stateShot(page, 'settings-states', '08-on-device-model-panel');
  await page.locator('#select-clear-scope').selectOption('notes');
  await expect(page.locator('#select-clear-scope')).toHaveValue('notes');
  await page.locator('#select-clear-scope').scrollIntoViewIfNeeded();
  await stateShot(page, 'settings-states', '09-scope-specific-clear-review');
  // Never click the destructive data-clear action.
});

test('Studio shape, note, layer and template actions update its real canvas', async ({ page }) => {
  await ready(page, 'studio');
  await stateShot(page, 'studio-states', '01-blank-board');
  await page.locator('[data-studio-text]').fill('Visual acceptance lesson map');
  await page.locator('[data-studio-add-text]').click();
  await expect(page.locator('[data-studio-status]')).toContainText('Note added');
  await stateShot(page, 'studio-states', '02-real-board-note');
  await page.locator('[data-studio-add-rect]').click();
  await expect(page.locator('[data-studio-status]')).toContainText('Rectangle added');
  await stateShot(page, 'studio-states', '03-board-rectangle');
  await page.locator('[data-studio-add-circle]').click();
  await expect(page.locator('[data-studio-status]')).toContainText('Circle added');
  await stateShot(page, 'studio-states', '04-board-circle');
  await page.locator('[data-studio-add-arrow]').click();
  await stateShot(page, 'studio-states', '05-board-arrow');
  await page.locator('[data-studio-layer-name]').fill('Reviewed subjects');
  await page.locator('[data-studio-add-layer]').click();
  await expect(page.locator('[data-studio-layers]')).toContainText('Reviewed subjects');
  await stateShot(page, 'studio-states', '06-real-layer-created');
  await page.locator('[data-studio-save]').click();
  await stateShot(page, 'studio-states', '07-persisted-studio-board');
});

test('study activity unlocks visible achievements and populates Progress', async ({ page }) => {
  await ready(page, 'achievements');
  await stateShot(page, 'study-states', '01-achievements-before-activity');
  const saved = await page.evaluate(async () => {
    await window.DataStore.init();
    const topics = window.DataStore.allTopics().filter(item => item.courseId !== 'getting-started');
    for (const item of topics.slice(0, 3)) {
      await window.DB.saveProgress(item.topicId, item.courseId, {
        status: 'done', percent: 100, position: 120,
      });
    }
    return topics.slice(0, 3).map(item => item.topicId);
  });
  expect(saved).toHaveLength(3);
  // An unchanged hash does not emit hashchange, so force an actual remount.
  await routeState(page, 'home');
  await routeState(page, 'achievements');
  await expect(page.locator('[data-achievement-state="unlocked"]').first()).toBeVisible();
  await stateShot(page, 'study-states', '02-actual-unlocked-achievements');
  await routeState(page, 'progress');
  await expect.poll(() => page.locator('#stat-done-topics').textContent()).toContain('3');
  await stateShot(page, 'study-states', '03-populated-progress-metrics');
  await page.locator('summary').first().click();
  await stateShot(page, 'study-states', '04-expanded-progress-options');
});

for (const [label, width, height] of [
  ['narrow', 320, 740], ['landscape', 844, 390], ['wide', 1920, 1080],
]) {
  test('standalone player controls remain usable at ' + label + ' width', async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/editions/plasmato-emergency/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#statCourses')).toHaveText('31', { timeout: 15000 });
    await capture(page, 'standalone-responsive', label + '-01-31-courses');
    await page.locator('#searchInput').fill('anemia');
    await expect(page.locator('#resourceList button').first()).toBeVisible({ timeout: 15000 });
    await capture(page, 'standalone-responsive', label + '-02-real-search-results');
    await page.locator('#focusToggle').click();
    await expect(page.locator('#focusToggle')).toHaveAttribute('aria-pressed', 'true');
    await capture(page, 'standalone-responsive', label + '-03-focus-mode');
    const overflow = await page.evaluate(() =>
      Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth);
    expect(overflow, 'Standalone responsive clipping at ' + label).toBeLessThanOrEqual(28);
  });
}
