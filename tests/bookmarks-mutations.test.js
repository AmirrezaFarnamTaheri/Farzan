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
      getAllTimestamps: vi.fn(async () => records.map(record => ({ ...record }))),
      getAllNotes: vi.fn(async () => []),
      getAllAnnotations: vi.fn(async () => []),
      saveTimestamp: vi.fn(async record => {
        records = records.map(existing => existing.id === record.id ? record : existing);
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
    window.DB.saveTimestamp.mockResolvedValue(false);
    await editTimestamp();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith('Timestamp update failed'));
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
    window.DB.deleteTimestamp.mockResolvedValue(false);
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-delete-timestamp="ts-1"]')).not.toBeNull());
    document.querySelector('[data-delete-timestamp="ts-1"]').click();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith('Timestamp delete failed'));
    expect(Toast.success).not.toHaveBeenCalled();
    expect(document.querySelector('[data-bookmark-id="ts-1"]')).not.toBeNull();
    expect(records[0].id).toBe('ts-1');
  });
});
