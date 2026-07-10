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
    expect(window.PlasmaNotesApp.init).toHaveBeenCalledOnce();

    controller.beforeLeave();
    controller.unmount();
    expect(window.PlasmaNotesApp.flushPendingSave).toHaveBeenCalledOnce();
    expect(window.PlasmaNotesApp.destroy).toHaveBeenCalledOnce();
  });
});
