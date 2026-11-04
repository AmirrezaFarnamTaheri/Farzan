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

test('Squire keyboard undo/redo persists the correct RTL revision and reopens without style loss', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('ocd_dir', 'rtl'));
  await page.goto('/#/notes', { waitUntil: 'domcontentloaded' });

  const modern = page.locator('[data-notes-editor] .notes-modern-editor');
  await expect(modern).toBeVisible({ timeout: 20_000 });
  const title = 'Squire native undo redo RTL';
  const initial = '<h2 dir="rtl">آزمایش Heart 你好</h2>'
    + '<p dir="rtl" style="text-align:right"><span style="font-size:18px;color:#123456">'
    + 'متن مهم</span> پایان</p><p><a href="https://example.org/heart">Reference</a></p>';
  const noteId = await page.evaluate(({ title: savedTitle, initial: html }) => {
    const note = window.PlasmaNotesStore.createNote({
      title: savedTitle, folderId: 'default', content: html,
    });
    if (!window.PlasmaNotesApp.openNote(note.id)) throw new Error('Note was not opened');
    return note.id;
  }, { title, initial });

  const stored = () => page.evaluate(async id =>
    (await window.DB.getAllNotes()).find(note => note.id === id)?.content ?? '', noteId);
  await expect.poll(stored, { timeout: 20_000 }).toContain('متن مهم');
  await expect(modern.locator('p[dir="rtl"]')).toContainText('متن مهم');
  await modern.locator('p[dir="rtl"]').click();
  await page.keyboard.press('End');
  const edit = ' CHECK_UNDO_你好';
  // A real browser keyboard edit must be undoable, not just an injected DOM mutation.
  await page.keyboard.insertText(edit);
  await expect(modern).toContainText(edit);
  await expect.poll(stored, { timeout: 20_000 }).toContain(edit);

  await page.keyboard.press('ControlOrMeta+z');
  await expect(modern).not.toContainText(edit);
  await expect.poll(stored, { timeout: 20_000 }).not.toContain(edit);

  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(modern).toContainText(edit);
  await expect.poll(stored, { timeout: 20_000 }).toContain(edit);

  // The stored revision, not the in-memory Squire DOM, owns reopen.
  await page.goto('/#/home', { waitUntil: 'domcontentloaded' });
  await page.goto('/#/notes', { waitUntil: 'domcontentloaded' });
  const library = page.locator('[data-notes-toggle-library]');
  await expect(library).toBeVisible();
  await library.click();
  await page.locator('[data-notes-list]').getByText(title).click();
  await expect(modern).toBeVisible({ timeout: 20_000 });
  await expect(modern).toContainText(edit);

  const metadata = await page.evaluate(source => {
    const template = document.createElement('template');
    template.innerHTML = source;
    const block = template.content.querySelector('p[dir="rtl"]');
    const leaf = [...(block?.querySelectorAll('span') ?? [])].reverse()
      .find(node => node.textContent.includes('متن مهم'));
    let size = '', color = '';
    for (let node = leaf; node && node !== block; node = node.parentElement) {
      size ||= node.style?.fontSize ?? '';
      color ||= node.style?.color ?? '';
    }
    return {
      headingDir: template.content.querySelector('h2')?.getAttribute('dir'),
      blockDir: block?.getAttribute('dir'),
      alignment: block?.style?.textAlign,
      size, color,
      link: template.content.querySelector('a[href]')?.getAttribute('href'),
      text: template.content.textContent,
    };
  }, await stored());
  expect(metadata).toMatchObject({
    headingDir: 'rtl', blockDir: 'rtl', alignment: 'right',
    size: '18px', link: 'https://example.org/heart',
  });
  expect(metadata.color).toMatch(/(?:#123456|rgb\(18,\s*52,\s*86\))/i);
  expect(metadata.text).toContain('آزمایش Heart 你好');
  expect(metadata.text).toContain(edit);
});

test('unsupported rich HTML stays byte-identical through classic title-only save and note switch', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/notes', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-notes-editor] .notes-modern-editor')).toBeVisible({ timeout: 20_000 });

  // Synthetic first-party saved note with structures Squire intentionally cannot
  // round-trip. Its remote image URL is already privacy-gated as canonical data.
  const title = 'Classic complex HTML preservation';
  const html = '<h2 dir="rtl">گزارش Heart 你好</h2>\n'
    + '<table class="note-table"><tr><th>Study</th></tr><tr><td>72 bpm</td></tr></table>'
    + '<p data-ai-summary-block="true">Original AI metadata</p>'
    + '<p><img data-remote-src="https://example.org/private-scan.png" alt="Scan"> End</p>';
  const ids = await page.evaluate(({ source, savedTitle }) => {
    const old = window.PlasmaNotesStore.createNote({
      title: savedTitle, content: source, folderId: 'default',
    });
    const next = window.PlasmaNotesStore.createNote({
      title: 'Other unrelated note', content: '<p>Other note</p>', folderId: 'default',
    });
    if (!window.PlasmaNotesApp.openNote(old.id)) throw new Error('Failed to open complex note');
    return { old: old.id, next: next.id };
  }, { source: html, savedTitle: title });
  const toggle = page.locator('[data-notes-modern-toggle]');
  await expect(toggle).toHaveText('Classic editor (advanced formatting)', { timeout: 20_000 });
  await expect(page.locator('[data-notes-editor] .notes-modern-editor')).toHaveCount(0);

  // A normal title input followed immediately by switching notes triggers the
  // classic editor's synchronous save. The untouched raw body must not be
  // replaced by sanitized DOM serialization, including implicit <tbody>.
  const renamed = title + ' renamed';
  await page.locator('[data-note-title-input]').fill(renamed);
  await page.evaluate(nextId => {
    if (!window.PlasmaNotesApp.openNote(nextId)) throw new Error('Note switch was refused');
  }, ids.next);

  const saved = () => page.evaluate(async id => {
    const record = (await window.DB.getAllNotes()).find(note => note.id === id);
    return { title: record?.title, content: record?.content };
  }, ids.old);
  await expect.poll(saved, { timeout: 20_000 }).toEqual({ title: renamed, content: html });

  await page.evaluate(oldId => {
    if (!window.PlasmaNotesApp.openNote(oldId)) throw new Error('Could not reopen original note');
  }, ids.old);
  await expect(toggle).toHaveText('Classic editor (advanced formatting)', { timeout: 20_000 });
  await expect(page.locator('[data-notes-editor] .notes-modern-editor')).toHaveCount(0);
  expect((await saved()).content).toBe(html);
});


test('classic fallback redo persists real RTL keyboard revisions without another edit', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('ocd_dir', 'rtl'));
  await page.goto('/#/notes', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-notes-editor] .notes-modern-editor'))
    .toBeVisible({ timeout: 20_000 });

  const title = 'RTL classic history persistence';
  const html = '<p dir="rtl">شروع Heart 你好</p>'
    + '<table><tbody><tr><td>70 mL</td></tr></tbody></table>';
  const noteId = await page.evaluate(({ title: name, html: content }) => {
    const note = window.PlasmaNotesStore.createNote({
      title: name, content, folderId: 'default',
    });
    if (!window.PlasmaNotesApp.openNote(note.id)) throw new Error('Could not open fallback note');
    return note.id;
  }, { title, html });

  const editor = page.locator('[data-notes-editor]');
  const modern = editor.locator('.notes-modern-editor');
  await expect(page.locator('[data-notes-modern-toggle]'))
    .toHaveText('Classic editor (advanced formatting)', { timeout: 20_000 });
  await expect(modern).toHaveCount(0);
  await editor.locator('p').click();
  await page.keyboard.press('End');
  const edit = ' redo فارسی 你好';
  await page.keyboard.insertText(edit);
  const saved = () => page.evaluate(async id =>
    (await window.DB.getAllNotes()).find(note => note.id === id)?.content ?? '', noteId);
  await expect(editor).toContainText(edit);
  await expect.poll(saved, { timeout: 20_000 }).toContain(edit);

  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor).not.toContainText(edit);
  await expect.poll(saved, { timeout: 20_000 }).not.toContain(edit);

  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(editor).toContainText(edit);
  await expect.poll(saved, { timeout: 20_000 }).toContain(edit);
  expect(await saved()).toContain('70 mL');

  await page.goto('/#/home', { waitUntil: 'domcontentloaded' });
  await page.goto('/#/notes', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-notes-toggle-library]').click();
  await page.locator('[data-notes-list]').getByText(title).click();
  await expect(editor).toContainText(edit);
  await expect(editor.locator('table td')).toHaveText('70 mL');
  await expect(modern).toHaveCount(0);
});


test('classic fallback synthetic IME keeps provisional RTL content through history shortcuts and saves only the committed text', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('ocd_dir', 'rtl'));
  await page.goto('/#/notes', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-notes-editor] .notes-modern-editor'))
    .toBeVisible({ timeout: 20_000 });

  const title = 'Classic IME history safety';
  const noteId = await page.evaluate(name => {
    const note = window.PlasmaNotesStore.createNote({
      title: name, folderId: 'default',
      content: '<p dir="rtl">شروع</p><table><tbody><tr><td>70 mL</td></tr></tbody></table>',
    });
    if (!window.PlasmaNotesApp.openNote(note.id)) throw new Error('Could not open complex note');
    return note.id;
  }, title);
  const editor = page.locator('[data-notes-editor]');
  await expect(page.locator('[data-notes-modern-toggle]'))
    .toHaveText('Classic editor (advanced formatting)', { timeout: 20_000 });
  await expect(editor.locator('.notes-modern-editor')).toHaveCount(0);
  const stored = () => page.evaluate(async id =>
    (await window.DB.getAllNotes()).find(note => note.id === id)?.content ?? '', noteId);

  await page.evaluate(() => {
    const root = document.querySelector('[data-notes-editor]');
    root.querySelector('p').textContent = 'ویرایش شده Heart 你好';
    root.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(stored, { timeout: 20_000 }).toContain('ویرایش شده');

  // Synthetic composition events prove our listener routing, not a physical
  // Windows Persian/Chinese keyboard's behavior or screen-reader acceptance.
  const provisional = await page.evaluate(() => {
    const root = document.querySelector('[data-notes-editor]');
    root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    root.querySelector('p').textContent = 'متن ناتمام 你好中间';
    const undo = new KeyboardEvent('keydown', {
      key: 'z', ctrlKey: true, isComposing: true, bubbles: true, cancelable: true,
    });
    root.dispatchEvent(undo);
    return { prevented: undo.defaultPrevented, text: root.querySelector('p').textContent };
  });
  expect(provisional).toEqual({ prevented: false, text: 'متن ناتمام 你好中间' });
  expect(await stored()).not.toContain('متن ناتمام');

  await page.evaluate(() => {
    const root = document.querySelector('[data-notes-editor]');
    root.querySelector('p').textContent = 'متن کامل 你好完成';
    root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  });
  await expect.poll(stored, { timeout: 20_000 }).toContain('متن کامل 你好完成');
  expect(await stored()).toContain('70 mL');
  await page.goto('/#/home', { waitUntil: 'domcontentloaded' });
  await page.goto('/#/notes', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-notes-toggle-library]').click();
  await page.locator('[data-notes-list]').getByText(title).click();
  await expect(editor.locator('p')).toContainText('متن کامل 你好完成');
  await expect(editor.locator('table td')).toHaveText('70 mL');
});


test('incompatible note explains its classic fallback accessibly and clears it on switching notes', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('ocd_dir', 'rtl'));
  await page.goto('/#/notes', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-notes-editor] .notes-modern-editor'))
    .toBeVisible({ timeout: 20_000 });
  const oldTitle = 'RTL advanced formatting original';
  const simpleTitle = 'Squire compatible regular note';
  const ids = await page.evaluate(({ oldTitle: advancedTitle, simpleTitle: regularTitle }) => {
    const advanced = window.PlasmaNotesStore.createNote({
      title: advancedTitle,
      folderId: 'default',
      content: '<h2 dir="rtl">فارسی Heart 你好</h2><table><tbody><tr><td>70 mL</td></tr></tbody></table>',
    });
    const simple = window.PlasmaNotesStore.createNote({
      title: regularTitle, folderId: 'default', content: '<p dir="rtl">سلام 你好</p>',
    });
    if (!window.PlasmaNotesApp.openNote(advanced.id)) throw new Error('Could not open advanced note');
    return { advanced: advanced.id, simple: simple.id };
  }, { oldTitle, simpleTitle });

  const toggle = page.locator('[data-notes-modern-toggle]');
  const hint = page.locator('[data-notes-mode-explanation]');
  const modern = page.locator('[data-notes-editor] .notes-modern-editor');
  await expect(toggle).toHaveText('Classic editor (advanced formatting)', { timeout: 20_000 });
  await expect(toggle).toBeDisabled();
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('classic editor');
  await expect(hint).toContainText('formatting');
  const hintId = await hint.getAttribute('id');
  expect(hintId).toBeTruthy();
  await expect(toggle).toHaveAttribute('aria-describedby', hintId);
  await expect(hint).toHaveAttribute('role', 'status');
  await expect(modern).toHaveCount(0);
  const before = await page.evaluate(id => window.PlasmaNotesStore.getNote(id).content, ids.advanced);

  await page.evaluate(id => {
    if (!window.PlasmaNotesApp.openNote(id)) throw new Error('Could not open compatible note');
  }, ids.simple);
  await expect(hint).toBeHidden();
  await expect(toggle).not.toHaveAttribute('aria-describedby', hintId);
  await expect(modern).toBeVisible({ timeout: 20_000 });
  await expect(toggle).toHaveText('Use classic editor');
  expect(await page.evaluate(id => window.PlasmaNotesStore.getNote(id).content, ids.advanced))
    .toBe(before);

  await page.evaluate(id => {
    if (!window.PlasmaNotesApp.openNote(id)) throw new Error('Could not reopen advanced note');
  }, ids.advanced);
  await expect(toggle).toHaveText('Classic editor (advanced formatting)', { timeout: 20_000 });
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('formatting');
  await expect(modern).toHaveCount(0);
  expect(await page.evaluate(id => window.PlasmaNotesStore.getNote(id).content, ids.advanced))
    .toBe(before);
});
