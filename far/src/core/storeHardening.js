import { committedReceipt, failedReceipt } from './mutationReceipt.js';

const ENVELOPE_VERSION = 1;

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function createConflict(expected, actual) {
  const error = new Error(`Store revision conflict: expected ${expected}, found ${actual}`);
  error.code = 'STORE_REVISION_CONFLICT';
  error.expectedRevision = expected;
  error.actualRevision = actual;
  return error;
}

function storageFor(root, persist) {
  if (persist === 'local') return root.localStorage;
  if (persist === 'session') return root.sessionStorage;
  return null;
}

function readEnvelope(storage, key) {
  if (!storage) return { revision: 0, state: null, transactionId: null };
  const raw = storage.getItem(key);
  if (!raw) return { revision: 0, state: null, transactionId: null };
  const parsed = JSON.parse(raw);
  if (parsed?.__pdStore === ENVELOPE_VERSION && isObject(parsed.state)) {
    return {
      revision: Number.isInteger(parsed.revision) && parsed.revision >= 0 ? parsed.revision : 0,
      state: parsed.state,
      transactionId: parsed.transactionId || null,
    };
  }
  return { revision: 0, state: isObject(parsed) ? parsed : null, transactionId: null };
}

function changedKeys(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter(key => !Object.is(before[key], after[key]));
}

export function installStoreHardening(root = window) {
  const data = root.OpenCourseDeck?.Data;
  if (!data || data.__storeHardened) return data;

  class HardenedStore {
    constructor({ state = {}, mutations = {}, actions = {}, persist = null, storageKey = 'pd-store', maxHistory = 50 } = {}) {
      this._mutations = mutations;
      this._actions = actions;
      this._listeners = new Map();
      this._history = [];
      this._journal = [];
      this._maxHistory = Math.max(1, Number(maxHistory) || 50);
      this._storageKey = storageKey;
      this._persist = persist;
      this._storage = storageFor(root, persist);
      this._initialState = clone(state);
      this._lastReceipt = null;

      let restored = { revision: 0, state: null };
      if (this._storage) {
        try {
          restored = readEnvelope(this._storage, storageKey);
        } catch (error) {
          root.OpenCourseDeck?.bus?.emit?.('store:restore-error', { storageKey, error });
        }
      }

      this._revision = restored.revision;
      this._rawState = { ...clone(state), ...(restored.state ? clone(restored.state) : {}) };
      this.state = new Proxy(this._rawState, {
        set: (_target, key, value) => {
          if (Object.is(this._rawState[key], value)) return true;
          const draft = clone(this._rawState);
          draft[key] = value;
          this._commitDraft(`direct:set:${String(key)}`, draft, { payload: value, recordHistory: true });
          return true;
        },
        deleteProperty: (_target, key) => {
          if (!Object.prototype.hasOwnProperty.call(this._rawState, key)) return true;
          const draft = clone(this._rawState);
          delete draft[key];
          this._commitDraft(`direct:delete:${String(key)}`, draft, { recordHistory: true });
          return true;
        },
        ownKeys: () => Reflect.ownKeys(this._rawState),
        getOwnPropertyDescriptor: (_target, key) => Object.getOwnPropertyDescriptor(this._rawState, key)
          || { configurable: true, enumerable: true, writable: true, value: undefined },
        get: (_target, key) => this._rawState[key],
        has: (_target, key) => key in this._rawState,
      });
    }

    get revision() {
      return this._revision;
    }

    get lastReceipt() {
      return this._lastReceipt;
    }

    _persistDraft(draft, expectedRevision, nextRevision, transactionId) {
      if (!this._storage) return 'memory';
      const current = readEnvelope(this._storage, this._storageKey);
      if (current.revision !== expectedRevision) throw createConflict(expectedRevision, current.revision);

      const envelope = {
        __pdStore: ENVELOPE_VERSION,
        revision: nextRevision,
        transactionId,
        committedAt: Date.now(),
        state: draft,
      };
      this._storage.setItem(this._storageKey, JSON.stringify(envelope));
      const verified = readEnvelope(this._storage, this._storageKey);
      if (verified.revision !== nextRevision || verified.transactionId !== transactionId) {
        throw new Error('Store persistence verification failed');
      }
      return this._persist === 'local' ? 'localStorage' : 'sessionStorage';
    }

    _replaceState(next) {
      for (const key of Object.keys(this._rawState)) {
        if (!Object.prototype.hasOwnProperty.call(next, key)) delete this._rawState[key];
      }
      Object.assign(this._rawState, clone(next));
    }

    _notify(before, after, keys, receipt) {
      const listenerErrors = [];
      for (const key of keys) {
        const notify = (listener, args) => {
          try { listener(...args); } catch (error) { listenerErrors.push({ key, error }); }
        };
        for (const listener of this._listeners.get(key) || []) {
          notify(listener, [after[key], before[key], key, receipt]);
        }
        for (const listener of this._listeners.get('*') || []) {
          notify(listener, [{ [key]: after[key] }, { [key]: before[key] }, key, receipt]);
        }
      }
      if (listenerErrors.length) {
        root.OpenCourseDeck?.bus?.emit?.('store:listener-error', {
          storageKey: this._storageKey,
          revision: this._revision,
          errors: listenerErrors,
        });
      }
    }

    _commitDraft(operation, draft, {
      payload = undefined,
      expectedRevision = this._revision,
      recordHistory = true,
    } = {}) {
      const before = clone(this._rawState);
      const next = clone(draft);
      const nextRevision = this._revision + 1;
      const transactionId = `store-${Date.now().toString(36)}-${nextRevision}-${Math.random().toString(36).slice(2, 8)}`;
      const journalEntry = {
        transactionId,
        operation,
        payload: clone(payload),
        beforeRevision: this._revision,
        afterRevision: nextRevision,
        before,
        after: next,
        status: 'prepared',
        preparedAt: Date.now(),
      };
      this._journal.push(journalEntry);
      if (this._journal.length > this._maxHistory * 2) this._journal.shift();

      try {
        if (expectedRevision !== this._revision) throw createConflict(expectedRevision, this._revision);
        const backend = this._persistDraft(next, expectedRevision, nextRevision, transactionId);
        this._replaceState(next);
        this._revision = nextRevision;
        journalEntry.status = 'committed';
        journalEntry.committedAt = Date.now();
        if (recordHistory) {
          this._history.push({ operation, payload: clone(payload), snapshot: before, revision: expectedRevision });
          if (this._history.length > this._maxHistory) this._history.shift();
        }
        const receipt = committedReceipt({ revision: nextRevision, backend, operation });
        this._lastReceipt = receipt;
        this._notify(before, next, changedKeys(before, next), receipt);
        return receipt;
      } catch (error) {
        journalEntry.status = 'rolled-back';
        journalEntry.error = String(error?.message || error);
        journalEntry.rolledBackAt = Date.now();
        const receipt = failedReceipt({ revision: this._revision, backend: this._storage ? this._persist : 'memory', operation, error: journalEntry.error });
        this._lastReceipt = receipt;
        error.receipt = receipt;
        throw error;
      }
    }

    watch(key, fn) {
      if (typeof fn !== 'function') throw new TypeError('Store listener must be a function');
      if (!this._listeners.has(key)) this._listeners.set(key, new Set());
      this._listeners.get(key).add(fn);
      return () => this._listeners.get(key)?.delete(fn);
    }

    commit(mutation, payload, { expectedRevision = this._revision } = {}) {
      const fn = this._mutations[mutation];
      if (!fn) throw new Error(`[Store] Unknown mutation: "${mutation}"`);
      const draft = clone(this._rawState);
      try {
        fn(draft, payload);
      } catch (error) {
        error.receipt = failedReceipt({ revision: this._revision, backend: 'memory', operation: mutation, error: String(error?.message || error) });
        throw error;
      }
      return this._commitDraft(mutation, draft, { payload, expectedRevision, recordHistory: true });
    }

    commitIfRevision(expectedRevision, mutation, payload) {
      return this.commit(mutation, payload, { expectedRevision });
    }

    async dispatch(action, payload) {
      const fn = this._actions[action];
      if (!fn) throw new Error(`[Store] Unknown action: "${action}"`);
      return fn({
        state: this.state,
        revision: this._revision,
        commit: this.commit.bind(this),
        commitIfRevision: this.commitIfRevision.bind(this),
        dispatch: this.dispatch.bind(this),
      }, payload);
    }

    undo() {
      const entry = this._history.at(-1);
      if (!entry) return failedReceipt({ revision: this._revision, backend: this._storage ? this._persist : 'memory', operation: 'undo', error: 'No mutation to undo' });
      const receipt = this._commitDraft(`undo:${entry.operation}`, entry.snapshot, { recordHistory: false });
      this._history.pop();
      return receipt;
    }

    reset(partial = null) {
      const draft = partial === null
        ? clone(this._initialState)
        : { ...clone(this._rawState), ...clone(partial) };
      return this._commitDraft('reset', draft, { payload: partial, recordHistory: true });
    }

    snapshot() {
      return clone(this._rawState);
    }

    journal() {
      return clone(this._journal);
    }
  }

  data.Store = HardenedStore;
  data.createStore = options => new HardenedStore(options);
  Object.defineProperty(data, '__storeHardened', { value: true });
  return data;
}
