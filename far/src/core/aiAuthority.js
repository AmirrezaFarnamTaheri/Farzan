import { committedReceipt, failedReceipt } from './mutationReceipt.js';

export const AI_SETTINGS_KEY = 'plasma-ai-settings';
export const AI_SESSION_KEY = 'plasma-ai-api-key-session';
const CREDENTIAL_VERSION = 1;

function isLoopback(hostname) {
  const value = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  return value === 'localhost' || value === '::1' || value === '127.0.0.1' || value.startsWith('127.');
}

function validateEndpoint(value) {
  const source = String(value || '').trim();
  if (!/^https?:\/\//i.test(source)) throw new TypeError('AI endpoint must be an absolute HTTP or HTTPS URL');
  const parsed = new URL(source);
  if (parsed.username || parsed.password) throw new TypeError('AI endpoint must not contain embedded credentials');
  if (parsed.protocol === 'http:' && !isLoopback(parsed.hostname)) {
    throw new TypeError('Remote AI endpoints must use HTTPS');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new TypeError('AI endpoint must use HTTP or HTTPS');
  return { href: parsed.href, origin: parsed.origin };
}

function readEnvelope(storage) {
  const raw = String(storage?.getItem?.(AI_SESSION_KEY) || '').trim();
  if (!raw) return { raw: '', envelope: null, key: '' };
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.version === CREDENTIAL_VERSION && typeof parsed.key === 'string') {
      return { raw, envelope: parsed, key: parsed.key.trim() };
    }
  } catch {
    // A legacy raw key is accepted only as transaction input. Consumers never
    // receive it until it has been wrapped and bound to persisted authority.
  }
  return { raw, envelope: null, key: raw };
}

export function getBoundAICredential(root, settings = {}) {
  const { envelope } = readEnvelope(root?.sessionStorage);
  if (!envelope?.key) return '';
  if (settings.mode !== 'custom-api') return '';
  let endpoint;
  try { endpoint = validateEndpoint(settings.endpoint); } catch { return ''; }
  const revision = Number(settings.authorityRevision) || 0;
  return envelope.origin === endpoint.origin
    && envelope.endpoint === endpoint.href
    && envelope.model === String(settings.model || '')
    && envelope.authorityRevision === revision
    && envelope.transactionId === settings.authorityTransactionId
    ? envelope.key
    : '';
}

function normalizeCandidate(value = {}) {
  const next = { ...value };
  delete next.apiKey;
  next.keyStorage = 'session';
  next.hasKey = false;
  return next;
}

export function stripPortableAIAuthority(value = {}) {
  const next = normalizeCandidate(value);
  next.approvedEndpointOrigin = '';
  next.authorityRevision = 0;
  next.authorityTransactionId = '';
  next.hasKey = false;
  return next;
}

export function installAIAuthority(root = window) {
  const db = root.DB;
  if (!db || db.__aiAuthorityInstalled) return db;
  const originalSave = db.saveSetting?.bind(db);
  const originalGet = db.getSetting?.bind(db);
  if (typeof originalSave !== 'function' || typeof originalGet !== 'function') {
    throw new Error('AI authority requires DB.getSetting() and DB.saveSetting()');
  }

  db.saveSetting = async (key, value) => {
    if (key !== AI_SETTINGS_KEY) return originalSave(key, value);

    const previousSettings = await originalGet(AI_SETTINGS_KEY).catch(() => null);
    const previousCredential = root.sessionStorage?.getItem?.(AI_SESSION_KEY) ?? null;
    const candidate = normalizeCandidate(value);
    const credential = readEnvelope(root.sessionStorage);
    let endpoint = null;
    let keyValue = '';

    if (candidate.mode === 'custom-api') {
      endpoint = validateEndpoint(candidate.endpoint);
      if (candidate.approvedEndpointOrigin !== endpoint.origin) {
        throw new Error(`Explicit approval for ${endpoint.origin} is required`);
      }
      candidate.endpoint = endpoint.href;
      candidate.approvedEndpointOrigin = endpoint.origin;
      keyValue = credential.key;
    } else {
      candidate.approvedEndpointOrigin = '';
    }

    const previousRevision = Number(previousSettings?.authorityRevision) || 0;
    const authorityRevision = previousRevision + 1;
    const transactionId = `ai-auth-${Date.now().toString(36)}-${authorityRevision}-${Math.random().toString(36).slice(2, 8)}`;
    const persisted = {
      ...candidate,
      authorityRevision,
      authorityTransactionId: transactionId,
      hasKey: Boolean(keyValue && endpoint),
    };

    try {
      await originalSave(AI_SETTINGS_KEY, persisted);
      if (keyValue && endpoint) {
        const envelope = {
          version: CREDENTIAL_VERSION,
          key: keyValue,
          origin: endpoint.origin,
          endpoint: endpoint.href,
          model: String(persisted.model || ''),
          authorityRevision,
          transactionId,
          committedAt: Date.now(),
        };
        root.sessionStorage.setItem(AI_SESSION_KEY, JSON.stringify(envelope));
        if (!getBoundAICredential(root, persisted)) throw new Error('Credential authority verification failed');
      } else {
        root.sessionStorage?.removeItem?.(AI_SESSION_KEY);
      }

      const receipt = committedReceipt({
        revision: authorityRevision,
        backend: 'indexedDB+sessionStorage',
        operation: 'ai-authority-commit',
      });
      root.OpenCourseDeck?.bus?.emit?.('ai:authority-committed', {
        transactionId,
        authorityRevision,
        endpointOrigin: endpoint?.origin || null,
        hasKey: persisted.hasKey,
        receipt,
      });
      return { ...persisted, receipt };
    } catch (error) {
      const rollbackErrors = [];
      try { await originalSave(AI_SETTINGS_KEY, previousSettings || stripPortableAIAuthority()); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
      try {
        if (previousCredential === null) root.sessionStorage?.removeItem?.(AI_SESSION_KEY);
        else root.sessionStorage?.setItem?.(AI_SESSION_KEY, previousCredential);
      } catch (rollbackError) { rollbackErrors.push(rollbackError); }

      const receipt = failedReceipt({
        revision: previousRevision,
        backend: 'indexedDB+sessionStorage',
        operation: 'ai-authority-commit',
        error: String(error?.message || error),
      });
      error.receipt = receipt;
      error.rollbackErrors = rollbackErrors;
      throw error;
    }
  };

  Object.defineProperty(db, '__aiAuthorityInstalled', { value: true });
  root.OpenCourseDeck = root.OpenCourseDeck || {};
  root.OpenCourseDeck.AIAuthority = Object.freeze({
    settingsKey: AI_SETTINGS_KEY,
    sessionKey: AI_SESSION_KEY,
    getCredential: settings => getBoundAICredential(root, settings),
    stripPortableAuthority: stripPortableAIAuthority,
  });
  return db;
}
