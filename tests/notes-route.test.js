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

  it('refuses to leave when the Notes app reports an uncommitted storage write', () => {
    window.PlasmaNotesApp.flushPendingSave.mockReturnValue(false);
    const controller = mountNotesView({
      setView: html => { document.getElementById('main-content').innerHTML = html; },
    });
    expect(controller.beforeLeave()).toBe(false);
    controller.unmount();
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
