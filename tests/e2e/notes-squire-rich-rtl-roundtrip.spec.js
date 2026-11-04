import { test, expect } from '@playwright/test';

test.use({ channel: 'chrome' });

test('first real Squire edit keeps rich RTL saved HTML through Chromium reload on mobile', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    // This is a synthetic first-party fixture, not consented user content.
    localStorage.setItem('ocd_dir', 'rtl');
  });
  await page.goto('/#/notes', { waitUntil: 'domcontentloaded' });
  const modern = page.locator('[data-notes-editor] .notes-modern-editor');
  await expect(modern).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));

  const title = 'RTL first-save Chrome qualification';
  const html = '<h2 dir="rtl">فیزیولوژی قلب 你好</h2>'
    + '<p dir="rtl" style="text-align:right">'
    + '<span style="font-size:18px;color:#123456">دریچه Heart</span> review</p>'
    + '<p><a href="https://example.org/study/heart">Source reference</a></p>';
  const noteId = await page.evaluate(({ title: savedTitle, html: sourceHtml }) => {
    const note = window.PlasmaNotesStore.createNote({
      title: savedTitle, content: sourceHtml, folderId: 'default',
    });
    if (!window.PlasmaNotesApp.openNote(note.id)) {
      throw new Error('Saved Squire fixture could not open');
    }
    return note.id;
  }, { title, html });

  await expect(modern).toBeVisible({ timeout: 20_000 });
  await expect(modern).toHaveAttribute('role', 'textbox');
  await expect(modern.locator('h2[dir="rtl"]')).toContainText('فیزیولوژی');
  await expect(modern.locator('p[dir="rtl"] span.size')).toContainText('دریچه Heart');

  // Actual contenteditable keyboard input, not a mocked update callback.
  await modern.locator('p[dir="rtl"]').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' ذخیره 你好');
  const stored = () => page.evaluate(async id =>
    (await window.DB.getAllNotes()).find(note => note.id === id)?.content ?? '', noteId);
  await expect.poll(stored, { timeout: 20_000 }).toContain('ذخیره 你好');

  const assertMeaning = async canonical => {
    const metadata = await page.evaluate(source => {
      const template = document.createElement('template');
      template.innerHTML = source;
      const heading = template.content.querySelector('h2');
      const block = template.content.querySelector('p[dir="rtl"]');
      // Squire can split one styled span into nested size and color marks.
      // Check the *effective inherited* inline styles on the saved text leaf
      // rather than assuming both values remain on one HTML element.
      const matching = [...(block?.querySelectorAll('span') ?? [])]
        .filter(node => node.textContent.includes('دریچه Heart'));
      const leaf = matching.find(node =>
        !matching.some(other => other !== node && node.contains(other)));
      let fontSize = '', color = '';
      for (let node = leaf; node && node !== block; node = node.parentElement) {
        fontSize ||= node.style?.fontSize ?? '';
        color ||= node.style?.color ?? '';
      }
      const link = template.content.querySelector('a[href]');
      return {
        headingDir: heading?.getAttribute('dir'),
        blockDir: block?.getAttribute('dir'),
        fontSize, color,
        href: link?.getAttribute('href'),
        content: template.content.textContent,
      };
    }, canonical);
    expect(metadata.headingDir).toBe('rtl');
    expect(metadata.blockDir).toBe('rtl');
    expect(metadata.fontSize).toBe('18px');
    expect(metadata.color).toMatch(/(?:#123456|rgb\(18,\s*52,\s*86\))/i);
    expect(metadata.href).toBe('https://example.org/study/heart');
    expect(metadata.content).toContain('فیزیولوژی قلب 你好');
    expect(metadata.content).toContain('دریچه Heart');
    expect(metadata.content).toContain('ذخیره 你好');
  };
  await assertMeaning(await stored());

  await page.goto('/#/home', { waitUntil: 'domcontentloaded' });
  await page.goto('/#/notes', { waitUntil: 'domcontentloaded' });
  const library = page.locator('[data-notes-toggle-library]');
  await expect(library).toBeVisible();
  await library.click();
  await page.locator('[data-notes-list]').getByText(title).click();
  await expect(modern).toBeVisible({ timeout: 20_000 });
  await expect(modern).toContainText('ذخیره 你好');
  await assertMeaning(await stored());
  await expect(modern.locator('h2[dir="rtl"]')).toBeVisible();
  await expect(modern.locator('p[dir="rtl"] span.size')).toContainText('دریچه Heart');
});
