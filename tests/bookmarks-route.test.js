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