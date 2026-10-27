import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const DB = 'opencoursedeck-templates';
let templates;

function seedRawV1(records) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('noteTemplates', { keyPath: 'id' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('noteTemplates', 'readwrite');
      for (const record of records) tx.objectStore('noteTemplates').put(record);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}

function inspectRaw(id) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('noteTemplates', 'readonly');
      const store = tx.objectStore('noteTemplates');
      const schema = { version: db.version, keyPath: store.keyPath, indexes: [...store.indexNames] };
      const get = store.get(id);
      get.onerror = () => { db.close(); reject(get.error); };
      get.onsuccess = () => { db.close(); resolve({ schema, record: get.result ?? null }); };
    };
  });
}

describe('Dexie note-template compatibility with native IndexedDB v1', () => {
  beforeEach(async () => {
    vi.resetModules();
    window.OpenCourseDeck = { bus: { emit: vi.fn() } };
    await Dexie.delete(DB);
    templates = await import('../src/features/noteTemplates.js');
  });
  afterEach(async () => {
    templates?.closeTemplateDb?.();
    await Dexie.delete(DB);
    vi.restoreAllMocks();
  });

  it('reads existing user templates while preserving native version, store, and records', async () => {
    const original = {
      id: 'user-legacy', title: 'Saved Cornell', content: '<h2>Old note</h2><p>قلب</p>',
      builtin: false, createdAt: 123456789,
    };
    await seedRawV1([original]);
    expect(await templates.getTemplate('user-legacy')).toEqual(original);
    expect((await templates.getAllTemplates()).some(t => t.id === 'user-legacy')).toBe(true);
    expect((await inspectRaw(original.id)).schema).toEqual({ version: 1, keyPath: 'id', indexes: [] });
    expect((await inspectRaw(original.id)).record).toEqual(original);
  });

  it('saves, updates and deletes without breaking built-in templates or the original schema', async () => {
    const created = await templates.saveAsTemplate('Clinical summary', '<p>Original</p>');
    expect(created.id).toMatch(/^user-/);
    expect((await inspectRaw(created.id)).record.content).toBe('<p>Original</p>');
    expect((await templates.updateTemplate(created.id, { content: '<p>Updated</p>' })).content)
      .toBe('<p>Updated</p>');
    expect((await inspectRaw(created.id)).record.content).toBe('<p>Updated</p>');
    expect(await templates.deleteTemplate('builtin-cornell')).toBe(false);
    expect(await templates.deleteTemplate(created.id)).toBe(true);
    expect((await inspectRaw(created.id)).record).toBeNull();
    expect((await inspectRaw('missing')).schema).toEqual({ version: 1, keyPath: 'id', indexes: [] });
    expect(window.OpenCourseDeck.bus.emit).toHaveBeenCalledWith('templates:changed', expect.any(Array));
  });
});
