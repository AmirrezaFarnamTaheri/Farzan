/**
 * MediaStorage — throttled per-media state persistence via IndexedDB.
 * Based on Vidstack LocalMediaStorage pattern.
 * Stores: volume, muted, time, rate, quality, lang, captions per mediaId.
 */

import { throttle } from '../lib/dom.js';

const DB_NAME = 'opencoursedeck-media';
const STORE_NAME = 'mediaState';
const THROTTLE_MS = 2000;
const DEFAULT_STATE = Object.freeze({
  volume: 0.8,
  muted: false,
  time: 0,
  rate: 1,
  quality: '',
  lang: '',
  captions: false,
});

let _cachedDB = null;
let _openingDB = null;

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeState(record) {
  if (!record) return { ...DEFAULT_STATE };
  return {
    // `|| 0.8` incorrectly converted a deliberately persisted volume of 0
    // back to 0.8. Preserve zero and bound malformed imported records.
    volume: Math.max(0, Math.min(1, finiteNumber(record.volume, DEFAULT_STATE.volume))),
    muted: Boolean(record.muted),
    time: Math.max(0, finiteNumber(record.time, DEFAULT_STATE.time)),
    rate: Math.max(0.1, finiteNumber(record.rate, DEFAULT_STATE.rate)),
    quality: String(record.quality || ''),
    lang: String(record.lang || ''),
    captions: Boolean(record.captions),
  };
}

function openDB() {
  if (_cachedDB) return Promise.resolve(_cachedDB);
  if (_openingDB) return _openingDB;

  _openingDB = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'mediaId' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      if (settled) {
        // A blocked request can succeed after its promise has already been
        // rejected. Do not leak that late connection and block future upgrades.
        db.close();
        return;
      }
      settled = true;
      db.onversionchange = () => {
        db.close();
        if (_cachedDB === db) _cachedDB = null;
      };
      _cachedDB = db;
      resolve(db);
    };
    req.onerror = () => fail(req.error || new Error('Unable to open media storage'));
    req.onblocked = () => fail(new Error('Media storage upgrade is blocked by another tab; close other OpenCourseDeck tabs and retry'));
  }).finally(() => {
    _openingDB = null;
  });

  return _openingDB;
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
    const req = tx.objectStore(STORE_NAME).put(record);
    let requestError = null;
    req.onerror = () => { requestError = req.error; };
    // Request success only means the write was accepted by the transaction.
    // Resolve after transaction completion so callers never clear dirty state
    // for a transaction that later aborts.
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || requestError || new Error('Media storage transaction failed'));
    tx.onabort = () => reject(tx.error || requestError || new Error('Media storage transaction aborted'));
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
    /** @type {Map<string, Promise<void>>} */
    this._updates = new Map();
    this._destroyed = false;

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
    if (this._destroyed) return this.flush();
    this._destroyed = true;
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
          const state = normalizeState(await dbGet(mediaId));
          if (!this._cache.has(mediaId)) this._cache.set(mediaId, state);
          return { ...this._cache.get(mediaId) };
        } catch {
          const state = { ...DEFAULT_STATE };
          if (!this._cache.has(mediaId)) this._cache.set(mediaId, state);
          return { ...this._cache.get(mediaId) };
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
   * Updates for the same media ID are serialized so back-to-back writes such
   * as volume + muted cannot each clone the same stale state and erase one
   * another when their async get() calls resume.
   * @param {string} mediaId
   * @param {string} key
   * @param {*} value
   */
  set(mediaId, key, value) {
    const previous = this._updates.get(mediaId) || Promise.resolve();
    const update = previous
      .catch(() => {})
      .then(async () => {
        const state = await this.get(mediaId);
        const next = { ...state, [key]: value };
        this._cache.set(mediaId, next);
        this._dirty.set(mediaId, { ...next, mediaId });
        this._flushThrottled();
      });

    this._updates.set(mediaId, update);
    return update.finally(() => {
      if (this._updates.get(mediaId) === update) this._updates.delete(mediaId);
    });
  }

  /**
   * Force immediate write of all dirty records.
   */
  async flush() {
    // A pagehide/destroy flush may race an async get() inside set(). Wait for
    // the currently queued updates before taking the dirty snapshot.
    const pending = [...this._updates.values()];
    if (pending.length) await Promise.allSettled(pending);
    if (this._dirty.size === 0) return;

    const entries = [...this._dirty.entries()];
    this._dirty.clear();
    for (const [mediaId, record] of entries) {
      try {
        await dbPut(record);
      } catch (e) {
        console.warn('[MediaStorage] flush failed for', mediaId, e);
        // Preserve a newer write that arrived while this older record was in
        // flight; only restore the failed record when nothing newer is dirty.
        if (!this._dirty.has(mediaId)) this._dirty.set(mediaId, record);
      }
    }
  }
}

window.OpenCourseDeck.MediaStorage = MediaStorage;
