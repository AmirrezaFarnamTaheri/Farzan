import fs from 'node:fs';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mountBookmarksView } from '../src/views/bookmarksRoute.js';

const styles = fs.readFileSync('src/styles/views.css', 'utf8');
const list = () => document.querySelector('[data-bookmark-list]');
const section = () => document.querySelector('.bookmarks-section-card');
const mount = () => mountBookmarksView({
  setView: html => { document.getElementById('host').innerHTML = html; },
  sanitizeHtml: html => html,
});

describe('Bookmarks does not nest a card inside another card for focused views', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="host"></main>';
    window.DB = {
      getAllNotes: vi.fn(async () => []),
      getAllTimestamps: vi.fn(async () => []),
      getAllAnnotations: vi.fn(async () => []),
    };
  });
  afterEach(() => { delete window.DB; vi.restoreAllMocks(); });

  it('exposes a first-use surface without two stacked card decorations', async () => {
    mount();
    await vi.waitFor(() => expect(list().querySelector('.bookmarks-empty-state')).not.toBeNull());
    expect(section().dataset.bookmarkLayout).toBe('empty');
    expect(styles).toMatch(/\.view-bookmarks \.bookmarks-section-card\[data-bookmark-layout="empty"\]/);
  });

  it('shows one primary saved-note card without a second full-width box', async () => {
    window.DB.getAllNotes.mockResolvedValue([{ id: 'note-1', title: 'Exam prep' }]);
    mount();
    await vi.waitFor(() => expect(list().querySelectorAll('[data-bookmark-type]')).toHaveLength(1));
    expect(section().dataset.bookmarkLayout).toBe('single');
    expect(styles).toMatch(/\.view-bookmarks \.bookmarks-section-card\[data-bookmark-layout="single"\]/);
  });

  it('retains a card and source filters for genuinely mixed saved items', async () => {
    window.DB.getAllNotes.mockResolvedValue([{ id: 'note-1', title: 'Exam prep' }]);
    window.DB.getAllTimestamps.mockResolvedValue([{ id: 'video-1', title: 'Lecture' }]);
    mount();
    await vi.waitFor(() => expect(list().querySelectorAll('[data-bookmark-type]')).toHaveLength(2));
    expect(section().dataset.bookmarkLayout).toBe('collection');
    expect(document.querySelector('[data-bookmark-filters]').hidden).toBe(false);
  });

  it('never styles an unavailable DB read as an empty collection', async () => {
    window.DB.getAllNotes.mockRejectedValue(new Error('Read failed'));
    mount();
    await vi.waitFor(() => expect(list().querySelector('[role="alert"]')).not.toBeNull());
    expect(section().dataset.bookmarkLayout).not.toBe('empty');
  });
});
