import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mountHelpView } from '../src/views/helpRoute.js';

describe('Help: optional read-only Notes migration audit', () => {
  let oldDB, oldStore;
  const mount = loader => mountHelpView({
    setView: html => { document.querySelector('main').innerHTML = html; },
    loadNotesAudit: loader,
  });
  beforeEach(() => {
    oldDB = window.DB;
    oldStore = window.DataStore;
    document.body.innerHTML = '<main></main>';
    window.DataStore = { init: vi.fn(async () => {}), allTopics: vi.fn(() => []), allCourses: vi.fn(() => []) };
  });
  afterEach(() => {
    window.DB = oldDB;
    window.DataStore = oldStore;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('reads only after explicit opt-in, reports counts without note content and makes no writes', async () => {
    const records = [
      { id: 'patient-1', title: 'Sensitive title', content: '<p>Secret report</p>' },
      { id: 'patient-2', title: 'Table content', content: '<table><tr><td>Unknown</td></tr></table>' },
    ];
    window.DB = {
      getAllNotes: vi.fn(async () => structuredClone(records)),
      saveNote: vi.fn(),
    };
    const loader = vi.fn(async () => ({
      auditSavedNotesForSquire: notes => ({ total: notes.length, compatible: 1, classic: 1 }),
    }));
    mount(loader);
    expect(loader).not.toHaveBeenCalled();
    expect(window.DB.getAllNotes).not.toHaveBeenCalled();
    const details = document.querySelector('[data-help-developer]');
    expect(details.open).toBe(false);
    const button = document.querySelector('[data-help-notes-audit]');
    expect(button).not.toBeNull();
    button.click();
    await vi.waitFor(() => expect(window.DB.getAllNotes).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(document.querySelector('[data-help-notes-audit-status]').textContent)
      .toMatch(/1.*compatible|1.*classic/i));
    const status = document.querySelector('[data-help-notes-audit-status]').textContent;
    expect(status).not.toMatch(/Sensitive title|Secret report|patient-1/);
    expect(window.DB.saveNote).not.toHaveBeenCalled();
    expect(loader).toHaveBeenCalledOnce();
  });

  it('does not treat canonical read failures as zero notes or overwrite any content', async () => {
    window.DB = { getAllNotes: vi.fn(async () => { throw new Error('DB locked'); }), saveNote: vi.fn() };
    const loader = vi.fn(async () => ({ auditSavedNotesForSquire: vi.fn() }));
    mount(loader);
    const button = document.querySelector('[data-help-notes-audit]');
    button.click();
    await vi.waitFor(() => expect(document.querySelector('[data-help-notes-audit-status]').textContent)
      .toMatch(/unavailable|failed|could not/i));
    expect(document.querySelector('[data-help-notes-audit-status]').textContent).not.toMatch(/0.*notes/i);
    expect(loader).not.toHaveBeenCalled();
    expect(window.DB.saveNote).not.toHaveBeenCalled();
  });
});
