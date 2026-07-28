/**
 * MediaStorage — throttled per-media state persistence via IndexedDB.
 * Stores volume, muted, time, rate, quality, language, and captions per media.
 */

import { createOperationContext } from '../core/operationContext.js';
import { committedReceipt, failedReceipt } from '../core/mutationReceipt.js';
import { throttle } from '../lib/dom.js';

const DB_NAME = 'opencoursedeck-media';
const STORE_NAME = 'mediaState';
const THROTTLE_MS = 2000;
const MAX_FLUSH_PASSES = 8;
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
let _nextOwnerId = 0;
let _nextGeneration = 0;
const _activeGeneration = new Map();

function staleMediaError(mediaId) {
  const error = new Error(`Stale media operation rejected for "${mediaId}"`);
  error.code = 'STALE_MEDIA_OPERATION';
  error.mediaId = mediaId;
  return error;
}

function unavailableMediaError(mediaId, cause = null) {
  const error = new Error(`Media state for "${mediaId}" could not be read safely; write was not attempted`);
  error.code = 'MEDIA_STATE_UNAVAILABLE';
  error.mediaId = mediaId;
  if (cause) error.cause = cause;
  return error;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeState(record) {
  if (!record) return { ...DEFAULT_STATE };
  return {
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
    const req = tx.objectStore(STORE_NAME).get(mediaId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error || new Error('Media storage read failed'));
  });
}

async function dbPut(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(record);
    let requestError = null;
    req.onerror = () => { requestError = req.error; };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || requestError || new Error('Media storage transaction failed'));
    tx.onabort = () => reject(tx.error || requestError || new Error('Media storage transaction aborted'));
  });
}

if (typeof window !== 'undefined') window.OpenCourseDeck = window.OpenCourseDeck ?? {};

export class MediaStorage {
  constructor() {
    this._ownerId = `media-owner-${++_nextOwnerId}`;
    this._cache = new Map();
    this._dirty = new Map();
    this._loading = new Map();
    this._updates = new Map();
    this._ownership = new Map();
    this._revisions = new Map();
    this._unverifiedReads = new Map();
    this._flushPromise = null;
    this._destroyPromise = null;
    this._destroyReceipt = null;
    this._destroyed = false;

    this._flushThrottled = throttle(() => this.flush(), THROTTLE_MS);
    this._onPagehide = () => { void this.flush(); };
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this._onPagehide);
  }

  _claim(mediaId) {
    if (this._destroyed) throw staleMediaError(mediaId);
    if (!this._ownership.has(mediaId)) {
      const generation = ++_nextGeneration;
      _activeGeneration.set(mediaId, generation);
      this._ownership.set(mediaId, generation);
    }
    const generation = this._ownership.get(mediaId);
    if (_activeGeneration.get(mediaId) !== generation) throw staleMediaError(mediaId);
    return generation;
  }

  _context(mediaId, revision = this._revisions.get(mediaId) || 0) {
    const generation = this._claim(mediaId);
    const context = createOperationContext({
      resource: mediaId,
      generation,
      revision,
      authority: Object.freeze({ capability: 'media-state-write', ownerId: this._ownerId }),
    });
    const baseIsCurrent = context.isCurrent.bind(context);
    context.isCurrent = () => baseIsCurrent()
      && !this._destroyed
      && this._ownership.get(mediaId) === generation
      && _activeGeneration.get(mediaId) === generation;
    return context;
  }

  _assertOwned(mediaId, generation) {
    if (this._destroyed
      || this._ownership.get(mediaId) !== generation
      || _activeGeneration.get(mediaId) !== generation) {
      throw staleMediaError(mediaId);
    }
  }

  destroy() {
    if (this._destroyPromise) return this._destroyPromise;
    if (this._destroyed) {
      return Promise.resolve(this._destroyReceipt || failedReceipt({
        backend: 'indexedDB',
        operation: 'media-destroy',
        error: 'Media storage was destroyed without a final receipt',
      }));
    }
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this._onPagehide);
    this._destroyPromise = (async () => {
      let receipt;
      try {
        receipt = await this.flush();
        return receipt;
      } finally {
        this._destroyReceipt = receipt || failedReceipt({
          backend: 'indexedDB',
          operation: 'media-destroy',
          error: 'Media storage final flush did not produce a receipt',
        });
        this._destroyed = true;
        for (const [mediaId, generation] of this._ownership) {
          if (_activeGeneration.get(mediaId) === generation) _activeGeneration.delete(mediaId);
        }
        this._ownership.clear();
        this._loading.clear();
        this._updates.clear();
        this._unverifiedReads.clear();
      }
    })();
    return this._destroyPromise;
  }

  async get(mediaId) {
    const context = this._context(mediaId);
    if (this._cache.has(mediaId)) return { ...this._cache.get(mediaId) };

    let loading = this._loading.get(mediaId);
    if (!loading) {
      loading = (async () => {
        try {
          const state = normalizeState(await dbGet(mediaId));
          context.assertCurrent();
          this._unverifiedReads.delete(mediaId);
          if (!this._cache.has(mediaId)) this._cache.set(mediaId, state);
          return { ...this._cache.get(mediaId) };
        } catch (error) {
          if (error?.code === 'STALE_OPERATION' || error?.code === 'STALE_MEDIA_OPERATION') throw staleMediaError(mediaId);
          context.assertCurrent();
          this._unverifiedReads.set(mediaId, error);
          return { ...DEFAULT_STATE };
        } finally {
          if (this._loading.get(mediaId) === loading) this._loading.delete(mediaId);
        }
      })();
      this._loading.set(mediaId, loading);
    }
    const state = await loading;
    context.assertCurrent();
    return { ...state };
  }

  set(mediaId, key, value) {
    let generation;
    try {
      generation = this._claim(mediaId);
    } catch (error) {
      return Promise.reject(error);
    }

    const previous = this._updates.get(mediaId) || Promise.resolve();
    const update = previous
      .catch(() => {})
      .then(async () => {
        this._assertOwned(mediaId, generation);
        const state = await this.get(mediaId);
        this._assertOwned(mediaId, generation);
        if (this._unverifiedReads.has(mediaId)) {
          throw unavailableMediaError(mediaId, this._unverifiedReads.get(mediaId));
        }
        const revision = (this._revisions.get(mediaId) || 0) + 1;
        const next = { ...state, [key]: value };
        this._revisions.set(mediaId, revision);
        this._cache.set(mediaId, next);
        this._dirty.set(mediaId, {
          generation,
          revision,
          record: { ...next, mediaId, _ownerId: this._ownerId, _generation: generation, _revision: revision },
        });
        this._flushThrottled();
        return committedReceipt({ revision, backend: 'memory', operation: `media-set:${key}` });
      });

    this._updates.set(mediaId, update);
    return update.finally(() => {
      if (this._updates.get(mediaId) === update) this._updates.delete(mediaId);
    });
  }

  async _flushPass() {
    const pendingUpdates = [...this._updates.values()];
    if (pendingUpdates.length) await Promise.allSettled(pendingUpdates);
    const entries = [...this._dirty.entries()];
    if (!entries.length) return { attempted: 0, committed: 0, failed: 0, newer: false };

    let committed = 0;
    let failed = 0;
    for (const [mediaId, entry] of entries) {
      try {
        this._assertOwned(mediaId, entry.generation);
        const context = this._context(mediaId, entry.revision);
        await dbPut(entry.record);
        context.assertCurrent();
        const current = this._dirty.get(mediaId);
        if (current?.generation === entry.generation && current?.revision === entry.revision) {
          this._dirty.delete(mediaId);
        }
        committed += 1;
      } catch (error) {
        failed += 1;
        if (error?.code !== 'STALE_MEDIA_OPERATION' && error?.code !== 'STALE_OPERATION') {
          console.warn('[MediaStorage] flush failed for', mediaId, error);
        }
      }
    }

    const newer = [...this._dirty.values()].some(current =>
      !entries.some(([, attempted]) => attempted.generation === current.generation && attempted.revision === current.revision));
    return { attempted: entries.length, committed, failed, newer };
  }

  flush() {
    if (this._flushPromise) return this._flushPromise;
    this._flushPromise = (async () => {
      let totalCommitted = 0;
      let totalFailed = 0;
      let lastRevision = null;
      let passes = 0;
      let newer = false;
      do {
        const pass = await this._flushPass();
        passes += 1;
        totalCommitted += pass.committed;
        totalFailed += pass.failed;
        newer = pass.newer;
        lastRevision = Math.max(lastRevision || 0, ...[...this._revisions.values(), 0]);
        if (!newer) break;
      } while (!this._destroyed && passes < MAX_FLUSH_PASSES);

      if (newer && passes >= MAX_FLUSH_PASSES) totalFailed += this._dirty.size || 1;
      if (totalFailed) {
        return failedReceipt({
          revision: lastRevision,
          backend: 'indexedDB',
          operation: 'media-flush',
          error: `${totalFailed} media write(s) failed, became stale, or exceeded the flush pass limit`,
          details: { passes, pending: this._dirty.size },
        });
      }
      return committedReceipt({ revision: lastRevision, backend: 'indexedDB', operation: 'media-flush', details: { passes } });
    })().finally(() => {
      this._flushPromise = null;
    });
    return this._flushPromise;
  }
}

if (typeof window !== 'undefined') window.OpenCourseDeck.MediaStorage = MediaStorage;
