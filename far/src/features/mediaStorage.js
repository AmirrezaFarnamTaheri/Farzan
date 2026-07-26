/**
 * MediaStorage — throttled per-media state persistence via IndexedDB.
 * Based on Vidstack LocalMediaStorage pattern.
 * Stores: volume, muted, time, rate, quality, lang, captions per mediaId.
 */

import { throttle } from '../lib/dom.js';

const DB_NAME = 'opencoursedeck-media';
const STORE_NAME = 'mediaState';
const THROTTLE_MS = 2000;

let _cachedDB = null;

function openDB() {
  if (_cachedDB) return Promise.resolve(_cachedDB);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'mediaId' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); _cachedDB = null; };
      _cachedDB = db;
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(mediaId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(mediaId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

window.OpenCourseDeck = window.OpenCourseDeck ?? {};

export class MediaStorage {
  constructor() {
    /** @type {Map<string, Object>} */
    this._cache = new Map();
    /** @type {Map<string, Object>} */
    this._dirty = new Map();
    /** @type {Map<string, Promise<Object>>} */
    this._loading = new Map();

    this._flushThrottled = throttle(() => this.flush(), THROTTLE_MS);

    // Best-effort final flush when the tab goes away, so the last position
    // write survives a close without player teardown. Named handler so
    // destroy() can unregister it — players create per-instance storages,
    // and an anonymous listener would pin every destroyed instance.
    this._onPagehide = () => { this.flush(); };
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this._onPagehide);
    }
  }

  /**
   * Flush pending writes and release the pagehide listener. Call when the
   * owning player is destroyed.
   */
  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this._onPagehide);
    }
    return this.flush();
  }

  /**
   * Get full state for a media ID.
   * @param {string} mediaId
   * @returns {Promise<Object>}
   */
  async get(mediaId) {
    if (this._cache.has(mediaId)) return { ...this._cache.get(mediaId) };
    // Share one in-flight read per mediaId: at player init volume/rate/time
    // restore concurrently, and without this the later resolver would
    // overwrite state (including pending set() writes) with stale DB data.
    let loading = this._loading.get(mediaId);
    if (!loading) {
      loading = (async () => {
        try {
          const record = await dbGet(mediaId);
          const state = record
            ? {
                volume: Number(record.volume) || 0.8,
                muted: Boolean(record.muted),
                time: Number(record.time) || 0,
                rate: Number(record.rate) || 1,
                quality: String(record.quality || ''),
                lang: String(record.lang || ''),
                captions: Boolean(record.captions),
              }
            : { volume: 0.8, muted: false, time: 0, rate: 1, quality: '', lang: '', captions: false };
          if (!this._cache.has(mediaId)) this._cache.set(mediaId, state);
          return { ...this._cache.get(mediaId) };
        } catch {
          return { volume: 0.8, muted: false, time: 0, rate: 1, quality: '', lang: '', captions: false };
        } finally {
          this._loading.delete(mediaId);
        }
      })();
      this._loading.set(mediaId, loading);
    }
    const state = await loading;
    return { ...state };
  }

  /**
   * Set a single key for a media ID (throttled write).
   * @param {string} mediaId
   * @param {string} key
   * @param {*} value
   */
  async set(mediaId, key, value) {
    const state = await this.get(mediaId);
    state[key] = value;
    this._cache.set(mediaId, state);
    this._dirty.set(mediaId, { ...state, mediaId });
    this._flushThrottled();
  }

  /**
   * Force immediate write of all dirty records.
   */
  async flush() {
    if (this._dirty.size === 0) return;
    const entries = [...this._dirty.entries()];
    this._dirty.clear();
    for (const [mediaId, record] of entries) {
      try {
        await dbPut(record);
      } catch (e) {
        console.warn('[MediaStorage] flush failed for', mediaId, e);
        this._dirty.set(mediaId, record);
      }
    }
  }
}

window.OpenCourseDeck.MediaStorage = MediaStorage;
