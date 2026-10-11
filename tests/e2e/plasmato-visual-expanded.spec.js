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
