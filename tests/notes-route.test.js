import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountNotesView } from '../src/views/notesRoute.js';

describe('notes route workspace', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="main-content"></main>';
    window.PlasmaNotesApp = {
      init: vi.fn(),
      flushPendingSave: vi.fn(),
      destroy: vi.fn(),
    };
  });

  it('vetoes a route leave while Notes IME composition is active', () => {
    const controller = mountNotesView({
      setView: html => { document.getElementById('main-content').innerHTML = html; },
    });
    const editor = document.querySelector('[data-notes-editor]');
    editor.dispatchEvent(new Event('compositionstart', { bubbles: true }));
    expect(controller.beforeLeave()).toBe(false);
    expect(window.PlasmaNotesApp.flushPendingSave).not.toHaveBeenCalled();

    editor.dispatchEvent(new Event('compositionend', { bubbles: true }));
    expect(controller.beforeLeave()).toBe(true);
    expect(window.PlasmaNotesApp.flushPendingSave).toHaveBeenCalledOnce();
    controller.unmount();
  });

  it('marks an unfinished IME composition as unsafe for browser tab close', () => {
    const mark = vi.fn();
    const unmark = vi.fn();
    window.OpenCourseDeck = { beforeUnload: { mark, unmark } };
    const controller = mountNotesView({
      setView: html => { document.getElementById('main-content').innerHTML = html; },
    });
    const editor = document.querySelector('[data-notes-editor]');
    editor.dispatchEvent(new Event('compositionstart', { bubbles: true }));
    expect(mark).toHaveBeenCalledWith('notes-ime');
    expect(unmark).not.toHaveBeenCalledWith('notes-ime');

    editor.dispatchEvent(new Event('compositionend', { bubbles: true }));
    expect(unmark).toHaveBeenCalledWith('notes-ime');
    controller.unmount();
  });

  it('awaits durable note persistence rather than treating an in-memory save as complete', async () => {
    let acceptWrite;
    window.PlasmaNotesApp.flushPendingSaveDurably = vi.fn(
      () => new Promise(resolve => { acceptWrite = resolve; }),
    );
    const controller = mountNotesView({
      setView: html => { document.getElementById('main-content').innerHTML = html; },
    });
    const leaving = controller.beforeLeave();
    expect(window.PlasmaNotesApp.flushPendingSaveDurably).toHaveBeenCalledOnce();
    expect(window.PlasmaNotesApp.flushPendingSave).not.toHaveBeenCalled();
    let finished = false;
    void leaving.then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);
    acceptWrite(false);
    expect(await leaving).toBe(false);
    controller.unmount();
  });

  it('refuses to leave when the Notes app reports an uncommitted storage write', () => {
    window.PlasmaNotesApp.flushPendingSave.mockReturnValue(false);
    const controller = mountNotesView({
      setView: html => { document.getElementById('main-content').innerHTML = html; },
    });
    expect(controller.beforeLeave()).toBe(false);
    controller.unmount();
  });

  it('keeps advanced formatting collapsed while preserving editor commands and Persian font choice', () => {
    const controller = mountNotesView({
      setView: html => { document.getElementById('main-content').innerHTML = html; },
    });
    const advanced = document.querySelector('details.notes-format-more');
    expect(advanced).not.toBeNull();
    expect(advanced.open).toBe(false);
    expect(advanced.querySelector('[data-font-size]')).not.toBeNull();
    expect(advanced.querySelector('[data-font-family] option[value="Vazirmatn"]')).not.toBeNull();
    expect(document.querySelector('[data-notes-toolbar] [data-cmd="bold"]')).not.toBeNull();
    expect(document.querySelector('[data-notes-editor]')).not.toBeNull();
    advanced.querySelector('summary').click();
    expect(advanced.open).toBe(true);
    controller.unmount();
  });

  it('opens mobile notes in the editor and reveals the library only when requested', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn((query) => ({
      matches: query.includes('max-width: 760px'),
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }));
    try {
      const controller = mountNotesView({
        setView: html => { document.getElementById('main-content').innerHTML = html; },
      });
      const shell = document.querySelector('.notes-shell');
      const toggle = document.querySelector('[data-notes-toggle-library]');
      expect(shell.dataset.mobilePane).toBe('editor');
      expect(toggle.getAttribute('aria-expanded')).toBe('false');

      toggle.click();
      expect(shell.dataset.mobilePane).toBe('library');
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(toggle.textContent).toMatch(/editor/i);
      const note = document.createElement('button');
      note.dataset.noteId = 'saved-note';
      document.querySelector('[data-notes-list]').appendChild(note);
      note.click();
      expect(shell.dataset.mobilePane).toBe('editor');
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      controller.unmount();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('preserves editor, formatting, search, folder, import, and export hooks', () => {
    const controller = mountNotesView({
      setView: html => { document.getElementById('main-content').innerHTML = html; },
    });

    const requiredSelectors = [
      '[data-action="new-note"]',
      '[data-action="export-all"]',
      '[data-action="export-md"]',
      '[data-action="import-notes"]',
      '[data-notes-search]',
      '[data-folders-panel]',
      '[data-notes-list]',
      '[data-notes-main-pane]',
      '[data-note-title-input]',
      '[data-save-status]',
      '[data-notes-toolbar]',
      '[data-notes-editor]',
      '[data-note-words]',
      '[data-note-chars]',
      '[data-note-date]',
      '[data-tags-cloud]',
      '[data-font-size]',
      '[data-font-family]',
      '[data-text-color]',
      '[data-highlight-color]',
    ];

    requiredSelectors.forEach(selector => expect(document.querySelector(selector), selector).not.toBeNull());
    expect(document.querySelectorAll('[data-cmd]').length).toBeGreaterThanOrEqual(14);
    expect(document.querySelector('[data-notes-editor]')?.getAttribute('role')).toBe('textbox');
    expect(document.querySelector('[data-note-title-input]')?.getAttribute('dir')).toBe('auto');
    expect(document.querySelector('[data-notes-editor]')?.getAttribute('dir')).toBe('auto');
    expect(document.querySelector('[data-notes-search]')?.getAttribute('dir')).toBe('auto');
    expect(document.querySelector('.notes-page-header .page-subtitle bdi')?.textContent).toMatch(/courses\.$/);
    expect(window.PlasmaNotesApp.init).toHaveBeenCalledOnce();

    controller.beforeLeave();
    controller.unmount();
    expect(window.PlasmaNotesApp.flushPendingSave).toHaveBeenCalledOnce();
    expect(window.PlasmaNotesApp.destroy).toHaveBeenCalledOnce();
  });
});
