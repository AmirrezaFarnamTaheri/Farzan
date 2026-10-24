import { describe, expect, it, vi } from 'vitest';
import { mountMyCoursesView } from '../src/views/myCoursesRoute.js';

describe('missing-file recovery UI', () => {
  it('relinks an imported PDF without replacing its saved source reference', async () => {
    document.body.innerHTML = '<div id="view-container"></div>';
    const missing = [{
      ref: 'library-file:original-id',
      courseId: 'course-one',
      courseTitle: 'Anatomy',
      topicTitle: 'Week 1',
      kind: 'pdf',
      label: 'notes.pdf',
    }];
    const relink = vi.fn(async () => ({ ref: missing[0].ref }));
    const listMissing = vi.fn(async () => missing);
    const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    window.DB = { getSetting: vi.fn(async () => []), saveSetting: vi.fn(async () => []) };
    window.OpenCourseDeck = {
      Toast: toast, UserLibrary: { listMissingFiles: listMissing, relinkFile: relink },
    };
    mountMyCoursesView({
      setView: html => { document.getElementById('view-container').innerHTML = html; },
      Toast: toast,
    });
    const locate = await vi.waitFor(() => {
      const button = document.querySelector('[data-relink-file]');
      expect(button).not.toBeNull();
      return button;
    });
    const fileInput = locate.parentElement.querySelector('input[type="file"]');
    expect(fileInput?.accept).toContain('.pdf');
    const file = new File(['%PDF-1.4'], 'restored.pdf', { type: 'application/pdf' });
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
    fileInput.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(relink).toHaveBeenCalledWith('library-file:original-id', file));
  });
});
