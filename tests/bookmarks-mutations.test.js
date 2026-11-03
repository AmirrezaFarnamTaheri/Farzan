import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountBookmarksView } from '../src/views/bookmarksRoute.js';

describe('Bookmarks timestamp mutation receipts', () => {
  let Toast;
  let records;

  beforeEach(() => {
    document.body.innerHTML = '<main id="bookmarks-receipt-host"></main>';
    records = [{ id: 'ts-1', topicId: 'topic-1', title: 'Original checkpoint', note: 'Saved text', position: 45 }];
    Toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
    window.OpenCourseDeck = { UI: { confirm: vi.fn(async () => true) } };
    window.DB = {
      getAllPdfBookmarks: vi.fn(async () => []),
      getAllTimestamps: vi.fn(async () => records.map(record => ({ ...record }))),
      getAllNotes: vi.fn(async () => []),
      getAllAnnotations: vi.fn(async () => []),
      saveTimestamp: vi.fn(async record => {
        records = records.map(existing => existing.id === record.id ? record : existing);
        return true;
      }),
      compareAndSwapTimestamp: vi.fn(async (id, expected, next) => {
        const index = records.findIndex(record => record.id === id);
        if (index < 0 || JSON.stringify(records[index]) !== JSON.stringify(expected)) return false;
        if (next === null) records.splice(index, 1);
        else records[index] = structuredClone(next);
        return true;
      }),
      deleteTimestamp: vi.fn(async id => {
        records = records.filter(record => record.id !== id);
        return true;
      }),
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete window.DB;
    delete window.OpenCourseDeck;
    vi.restoreAllMocks();
  });

  function mount() {
    mountBookmarksView({
      setView: html => { document.getElementById('bookmarks-receipt-host').innerHTML = html; },
      createElement: (tag, attrs = {}, ...children) => {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
        children.flat().forEach(child => node.append(child));
        return node;
      },
      Router: { navigate: vi.fn() },
      Toast,
      sanitizeHtml: html => html,
    });
  }

  async function editTimestamp() {
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-edit-timestamp="ts-1"]')).not.toBeNull());
    document.querySelector('[data-edit-timestamp="ts-1"]').click();
    await vi.waitFor(() => expect(document.querySelector('[data-timestamp-edit-form="ts-1"]')).not.toBeNull());
    const form = document.querySelector('[data-timestamp-edit-form="ts-1"]');
    form.elements.namedItem('title').value = 'Updated checkpoint';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  it('never reports a rejected timestamp save as success or dismisses its unsaved edit', async () => {
    window.DB.compareAndSwapTimestamp.mockResolvedValue(false);
    await editTimestamp();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith('Timestamp changed elsewhere; reload bookmarks'));
    expect(Toast.success).not.toHaveBeenCalled();
    expect(document.querySelector('[data-timestamp-edit-form="ts-1"]')).not.toBeNull();
    expect(document.querySelector('[data-timestamp-edit-form="ts-1"]').elements.namedItem('title').value)
      .toBe('Updated checkpoint');
  });

  it('closes the edit only after an affirmative timestamp save receipt', async () => {
    await editTimestamp();
    await vi.waitFor(() => expect(Toast.success).toHaveBeenCalledWith('Timestamp updated'));
    await vi.waitFor(() => expect(document.querySelector('[data-timestamp-edit-form="ts-1"]')).toBeNull());
    expect(Toast.error).not.toHaveBeenCalled();
    expect(records[0].title).toBe('Updated checkpoint');
  });

  it('reports success and removes a timestamp only after acknowledged deletion', async () => {
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-delete-timestamp="ts-1"]')).not.toBeNull());
    document.querySelector('[data-delete-timestamp="ts-1"]').click();
    await vi.waitFor(() => expect(Toast.success).toHaveBeenCalledWith('Timestamp deleted'));
    await vi.waitFor(() => expect(document.querySelector('[data-bookmark-id="ts-1"]')).toBeNull());
    expect(records).toHaveLength(0);
    expect(Toast.error).not.toHaveBeenCalled();
  });

  it('retains a timestamp and reports failure when deletion is unacknowledged', async () => {
    window.DB.compareAndSwapTimestamp.mockResolvedValue(false);
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-delete-timestamp="ts-1"]')).not.toBeNull());
    document.querySelector('[data-delete-timestamp="ts-1"]').click();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith('Timestamp changed elsewhere; reload bookmarks'));
    expect(Toast.success).not.toHaveBeenCalled();
    expect(document.querySelector('[data-bookmark-id="ts-1"]')).not.toBeNull();
    expect(records[0].id).toBe('ts-1');
  });

  it('does not overwrite a timestamp modified in another tab after an edit form opened', async () => {
    window.DB.compareAndSwapTimestamp = vi.fn(async (id, expected, next) => {
      const current = records.find(row => row.id === id);
      if (JSON.stringify(current) !== JSON.stringify(expected)) return false;
      records = records.map(row => row.id === id ? next : row);
      return true;
    });
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-edit-timestamp="ts-1"]')).not.toBeNull());
    document.querySelector('[data-edit-timestamp="ts-1"]').click();
    await vi.waitFor(() => expect(document.querySelector('[data-timestamp-edit-form="ts-1"]')).not.toBeNull());
    const form = document.querySelector('[data-timestamp-edit-form="ts-1"]');
    form.elements.namedItem('title').value = 'Unsaved local revision';
    records[0] = { ...records[0], title: 'Newer cross-tab title', note: 'Preserve remote edit',
      updatedAt: 200 };
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/changed elsewhere|reload/i)));
    expect(records[0].title).toBe('Newer cross-tab title');
    expect(records[0].note).toBe('Preserve remote edit');
    expect(window.DB.saveTimestamp).not.toHaveBeenCalled();
    expect(document.querySelector('[data-timestamp-edit-form="ts-1"]').elements.namedItem('title').value)
      .toBe('Unsaved local revision');
  });

  it('does not delete a newer revision while the confirmation dialog is open', async () => {
    window.DB.compareAndSwapTimestamp = vi.fn(async (id, expected, next) => {
      const current = records.find(row => row.id === id);
      if (JSON.stringify(current) !== JSON.stringify(expected)) return false;
      if (next === null) records = records.filter(row => row.id !== id);
      return true;
    });
    window.OpenCourseDeck.UI.confirm.mockImplementation(async () => {
      records[0] = { ...records[0], title: 'Newer saved bookmark', position: 126,
        updatedAt: 201 };
      return true;
    });
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-delete-timestamp="ts-1"]')).not.toBeNull());
    document.querySelector('[data-delete-timestamp="ts-1"]').click();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/changed elsewhere|reload/i)));
    expect(records).toHaveLength(1);
    expect(records[0].title).toBe('Newer saved bookmark');
    expect(window.DB.deleteTimestamp).not.toHaveBeenCalled();
  });

  it('does not expose timestamp mutation controls when atomic canonical revisions are unavailable', async () => {
    delete window.DB.compareAndSwapTimestamp;
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-bookmark-id="ts-1"]')).not.toBeNull());
    expect(document.querySelector('[data-edit-timestamp]')).toBeNull();
    expect(document.querySelector('[data-delete-timestamp]')).toBeNull();
    expect(records[0].title).toBe('Original checkpoint');
  });

});
