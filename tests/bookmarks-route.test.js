import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountBookmarksView } from '../src/views/bookmarksRoute.js';

describe('Bookmarks canonical read failure states', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="test-bookmarks"></main>';
    window.DB = {
      getAllTimestamps: vi.fn(async () => [{ id: 'ts-1', title: 'Previously saved' }]),
      getAllNotes: vi.fn(async () => []),
      getAllAnnotations: vi.fn(async () => []),
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete window.DB;
    vi.restoreAllMocks();
  });

  const mount = () => mountBookmarksView({
    setView: html => { document.getElementById('test-bookmarks').innerHTML = html; },
    sanitizeHtml: html => html,
  });

  it('does not mistake a missing canonical PDF-bookmarks reader for an empty saved library', async () => {
    // All other categories have a valid reader, and the user has a saved
    // timestamp. An absent reader must not authorize incomplete counts.
    const stamp = { id: 'ts-1', title: 'Previously saved' };
    const getAllTimestamps = window.DB.getAllTimestamps;
    const getAllPdfBookmarks = vi.fn(async () => []);
    mount();
    await vi.waitFor(() => {
      expect(document.querySelector('[role="alert"].bookmarks-load-error')).not.toBeNull();
      expect(document.querySelector('[data-bookmark-retry]')).not.toBeNull();
    });
    expect(document.querySelector('[data-bookmark-metrics]').children).toHaveLength(0);
    expect(document.querySelectorAll('[data-bookmark-type]')).toHaveLength(0);
    expect(getAllTimestamps).toHaveBeenCalled();
    // Restoring the real first-use canonical empty PDF collection can recover.
    window.DB.getAllPdfBookmarks = getAllPdfBookmarks;
    document.querySelector('[data-bookmark-retry]').click();
    await vi.waitFor(() => expect(document.querySelector('[data-bookmark-id="ts-1"]')).not.toBeNull());
    expect(getAllPdfBookmarks).toHaveBeenCalledOnce();
    expect(stamp.title).toBe('Previously saved');
  });

  it.each(['missing', 'invalid', 'rejected'])('shows unavailable state without partial totals for %s canonical notes', async mode => {
    if (mode === 'missing') delete window.DB.getAllNotes;
    if (mode === 'invalid') window.DB.getAllNotes.mockResolvedValue('not a collection');
    if (mode === 'rejected') window.DB.getAllNotes.mockRejectedValue(new Error('disk unavailable'));

    mount();
    await vi.waitFor(() => {
      expect(document.querySelector('[role="alert"].bookmarks-load-error')).not.toBeNull();
    });
    expect(document.querySelector('[data-bookmark-metrics]').children).toHaveLength(0);
    expect(document.querySelectorAll('[data-bookmark-type]')).toHaveLength(0);
    expect(document.querySelector('[data-bookmark-list]').textContent).toContain('Your stored data was not changed');
  });
});