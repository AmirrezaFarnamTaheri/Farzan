import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test.use({ channel: 'chrome' });

test('reopens and exports acknowledged Konva board-v1 edits without changing live Studio', async ({ page }) => {
  test.setTimeout(150_000);
  // CI checkpoints identify the first unfinished browser acceptance stage.
  await page.setViewportSize({ width: 1100, height: 800 });
  console.info('[konva-roundtrip] load and seed');
  await page.goto('/#/home', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForFunction(() => typeof window.DB?.saveSetting === 'function');

  const saved = {
    version: 1,
    activeLayerIdx: 0,
    tool: 'select',
    grid: { enabled: false, size: 24 },
    viewport: { offsetX: 20, offsetY: -10, zoom: 1.25, rotation: 0 },
    style: { strokeColor: '#365678', strokeWidth: 2, fillColor: '#b8d4ea' },
    layers: [
      {
        id: 'first', name: 'Draw', visible: true, locked: false, opacity: 1,
        elements: [{ id: 'seed', type: 'rect', x: -30, y: 40,
          width: 130, height: 80, stroke: '#123456', strokeWidth: 2, fill: '#e1eefc' }],
      },
      { id: 'locked', name: 'Protected', visible: true, locked: true, opacity: 1, elements: [] },
    ],
  };
  await page.evaluate(async board => {
    const ok = await window.DB.saveSetting('ocd_studio_konva_draft', board);
    if (!ok) throw new Error('Cannot seed canonical draft');
  }, saved);
  console.info('[konva-roundtrip] seeded; navigate Studio');
  await page.goto('/#/studio', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await expect(page.locator('.view-studio')).toBeVisible();
  const live = await page.evaluate(async () => window.DB.getSetting('ocd_studio_board'));
  const draft = page.locator('[data-studio-konva-dialog]');
  await page.locator('[data-studio-konva-open]').click({ timeout: 12000 });
  await expect(draft).toBeVisible({ timeout: 20000 });
  await expect(draft.locator('[data-studio-konva-stage] canvas').first()).toBeVisible({ timeout: 20000 });
  await expect(draft.locator('[data-studio-konva-layer]')).toHaveValue('0');
  await expect(draft.locator('[data-studio-konva-object] option[value="seed"]')).toHaveCount(1);

  const persisted = () => page.evaluate(async () => window.DB.getSetting('ocd_studio_konva_draft'));
  console.info('[konva-roundtrip] interactive draft ready; create rectangle');
  await draft.locator('[data-studio-konva-add="rect"]').click({ timeout: 12000 });
  await expect.poll(async () => (await persisted()).layers[0].elements.length, { timeout: 18000 }).toBe(2);
  const created = await persisted();
  const shape = created.layers[0].elements[1];
  expect(shape.id).toMatch(/^shape-/);
  expect(shape.type).toBe('rect');
  expect(shape.width).toBe(120);
  expect(shape.height).toBe(80);
  expect(created.layers[1]).toEqual(saved.layers[1]);
  await expect(draft.locator('[data-studio-konva-undo]')).toBeEnabled();

  console.info('[konva-roundtrip] rectangle saved; undo');
  await draft.locator('[data-studio-konva-undo]').click({ timeout: 12000 });
  await expect.poll(async () => (await persisted()).layers[0].elements.length).toBe(1);
  console.info('[konva-roundtrip] undone; redo');
  await draft.locator('[data-studio-konva-redo]').click({ timeout: 12000 });
  await expect.poll(async () => (await persisted()).layers[0].elements.length).toBe(2);

  console.info('[konva-roundtrip] redone; keyboard move');
  await draft.locator('[data-studio-konva-object]').selectOption('seed', { timeout: 12000 });
  await draft.locator('[data-studio-konva-stage]').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await persisted()).layers[0].elements[0].x).toBe(-29);

  console.info('[konva-roundtrip] key move saved; export JSON');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    draft.locator('[data-studio-konva-export]').click(),
  ]);
  expect(download.suggestedFilename()).toBe('farzan-konva-draft-v1.json');
  const json = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
  expect(json.version).toBe(1);
  expect(json.layers[0].elements[0].x).toBe(-29);
  expect(json.layers[0].elements.at(-1).id).toBe(shape.id);
  expect(json.layers[1]).toEqual(saved.layers[1]);

  console.info('[konva-roundtrip] export verified; close and reload');
  await draft.locator('[data-studio-konva-close]').click({ timeout: 12000 });
  await expect(draft).not.toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await expect(page.locator('.view-studio')).toBeVisible();
  console.info('[konva-roundtrip] reloaded; reopen draft');
  await page.locator('[data-studio-konva-open]').click({ timeout: 12000 });
  await expect(draft).toBeVisible({ timeout: 20000 });
  await expect(draft.locator('[data-studio-konva-object] option[value="' + shape.id + '"]')).toHaveCount(1);
  expect((await persisted()).layers[0].elements[0].x).toBe(-29);
  expect(await page.evaluate(async () => window.DB.getSetting('ocd_studio_board'))).toEqual(live);
});
