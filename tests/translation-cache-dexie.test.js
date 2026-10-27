import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { translationCache, hashParams } from '../src/features/translationCache.js';

const DB = 'opencoursedeck-translations';
const TTL = 30 * 24 * 60 * 60 * 1000;

function oldDatabaseSeed(records) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('translations', { keyPath: 'key' });
      store.createIndex('createdAt', 'createdAt', { unique: false });
      store.createIndex('engine', 'engine', { unique: false });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('translations', 'readwrite');
      const store = tx.objectStore('translations');
      records.forEach(record => store.put(record));
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  });
}

describe('Dexie translation-cache compatibility with raw IndexedDB v1', () => {
  beforeEach(async () => {
    translationCache.close();
    await Dexie.delete(DB);
    vi.restoreAllMocks();
  });
  afterEach(async () => {
    translationCache.close();
    await Dexie.delete(DB);
    vi.restoreAllMocks();
  });

  it('reads an existing raw-IndexedDB entry without upgrading, dropping, or rewriting the schema', async () => {
    const text = 'Study aortic physiology';
    const params = { from: 'en', to: 'fa' };
    await oldDatabaseSeed([{
      key: 'google:' + hashParams(params) + ':' + text,
      engine: 'google',
      paramsHash: hashParams(params),
      sourceText: text,
      translation: 'ترجمه موجود',
      createdAt: Date.now(),
      ttl: TTL,
    }]);
    await translationCache.init();
    expect(await translationCache.get(text, 'google', params)).toBe('ترجمه موجود');
    expect(await translationCache.size()).toBe(1);
    const raw = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB);
      request.onsuccess = () => { const db = request.result; const version = db.version;
        const tx = db.transaction('translations', 'readonly');
        const store = tx.objectStore('translations');
        const indexes = [...store.indexNames];
        db.close();
        resolve({ version, keyPath: store.keyPath, indexes });
      };
      request.onerror = () => reject(request.error);
    });
    expect(raw).toEqual({ version: 1, keyPath: 'key', indexes: ['createdAt', 'engine'] });
  });

  it('keeps cache-key provenance and persists writes through reopen', async () => {
    const params = { from: 'en', to: 'fr', model: 'local' };
    await translationCache.set('hello', 'custom', params, 'bonjour');
    translationCache.close();
    await translationCache.init();
    expect(await translationCache.get('hello', 'custom', params)).toBe('bonjour');
    expect(await translationCache.get('hello', 'google', params)).toBeNull();
    expect(await translationCache.get('hello', 'custom', { ...params, to: 'de' })).toBeNull();
  });

  it('atomically removes only expired entries, honoring per-record TTL', async () => {
    const stamp = Date.now();
    await oldDatabaseSeed([
      { key: 'old', engine: 'google', createdAt: stamp - 8000, ttl: 1000, translation: 'old' },
      { key: 'new', engine: 'google', createdAt: stamp - 1000, ttl: 5000, translation: 'new' },
      { key: 'default', engine: 'custom', createdAt: stamp - TTL - 5000, translation: 'stale' },
    ]);
    expect(await translationCache.prune()).toBe(2);
    expect(await translationCache.size()).toBe(1);
    expect(await translationCache.prune()).toBe(0);
  });

  it('removes one engine without deleting unrelated cached translations', async () => {
    await translationCache.set('one', 'google', { to: 'fa' }, 'یک');
    await translationCache.set('two', 'google', { to: 'fa' }, 'دو');
    await translationCache.set('one', 'custom', { to: 'fa' }, 'یک دیگر');
    expect(await translationCache.clearEngine('google')).toBe(2);
    expect(await translationCache.size()).toBe(1);
    expect(await translationCache.get('one', 'custom', { to: 'fa' })).toBe('یک دیگر');
    await translationCache.clear();
    expect(await translationCache.size()).toBe(0);
  });
});