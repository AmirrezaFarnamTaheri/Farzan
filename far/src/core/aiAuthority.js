import { committedReceipt, failedReceipt } from './mutationReceipt.js';

export const AI_SETTINGS_KEY = 'plasma-ai-settings';
export const AI_SESSION_KEY = 'plasma-ai-api-key-session';
export const AI_BINDING_KEY = 'plasma-ai-authority-session';
const BINDING_VERSION = 1;

function isLoopback(hostname) {
  const value = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  return value === 'localhost' || value === '::1' || value === '127.0.0.1' || value.startsWith('127.');
}

function validateEndpoint(value) {
  const source = String(value || '').trim();
  if (!/^https?:\/\//i.test(source)) throw new TypeError('AI endpoint must be an absolute HTTP or HTTPS URL');
  const parsed = new URL(source);
  if (parsed.username || parsed.password) throw new TypeError('AI endpoint must not contain embedded credentials');
  if (parsed.protocol === 'http:' && !isLoopback(parsed.hostname)) throw new TypeError('Remote AI endpoints must use HTTPS');
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new TypeError('AI endpoint must use HTTP or HTTPS');
  return { href: parsed.href, origin: parsed.origin };
}

function keyFingerprint(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return `${text.length}:${(hash >>> 0).toString(36)}`;
}

function readBinding(storage) {
  const raw = String(storage?.getItem?.(AI_BINDING_KEY) || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.version === BINDING_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeCandidate(value = {}) {
  const next = { ...value };
  delete next.apiKey;
  delete next.receipt;
  next.keyStorage = 'session';
  next.hasKey = false;
  return next;
}

export function stripPortableAIAuthority(value = {}) {
  return {
    ...normalizeCandidate(value),
    approvedEndpointOrigin: '',
    authorityRevision: 0,
    authorityTransactionId: '',
    hasKey: false,
  };
}

export function getBoundAICredential(root, settings = {}) {
  if (settings.mode !== 'custom-api') return '';
  const key = String(root?.sessionStorage?.getItem?.(AI_SESSION_KEY) || '').trim();
  const binding = readBinding(root?.sessionStorage);
  if (!key || !binding) return '';
  let endpoint;
  try { endpoint = validateEndpoint(settings.endpoint); } catch { return ''; }
  const revision = Number(settings.authorityRevision) || 0;
  return binding.origin === endpoint.origin
    && binding.endpoint === endpoint.href
    && binding.model === String(settings.model || '')
    && binding.authorityRevision === revision
    && binding.transactionId === settings.authorityTransactionId
    && binding.keyFingerprint === keyFingerprint(key)
    ? key
    : '';
}

function sanitiseRead(root, settings) {
  if (!settings || typeof settings !== 'object') return settings;
  const next = normalizeCandidate(settings);
  if (next.mode !== 'custom-api') return next;
  const key = getBoundAICredential(root, next);
  if (key) return { ...next, hasKey: true };
  return {
    ...next,
    approvedEndpointOrigin: '',
    hasKey: false,
  };
}

export function installAIAuthority(root = window) {
  const db = root.DB;
  if (!db || db.__aiAuthorityInstalled) return db;
  const originalSave = db.saveSetting?.bind(db);
  const originalGet = db.getSetting?.bind(db);
  if (typeof originalSave !== 'function' || typeof originalGet !== 'function') {
    throw new Error('AI authority requires DB.getSetting() and DB.saveSetting()');
  }

  db.getSetting = async (key) => {
    const value = await originalGet(key);
    return key === AI_SETTINGS_KEY ? sanitiseRead(root, value) : value;
  };

  db.saveSetting = async (key, value) => {
    if (key !== AI_SETTINGS_KEY) return originalSave(key, value);

    const previousSettings = await originalGet(AI_SETTINGS_KEY).catch(() => null);
    const previousBinding = root.sessionStorage?.getItem?.(AI_BINDING_KEY) ?? null;
    const candidate = normalizeCandidate(value);
    let endpoint = null;
    let sessionKey = '';

    if (candidate.mode === 'custom-api') {
      endpoint = validateEndpoint(candidate.endpoint);
      if (candidate.approvedEndpointOrigin !== endpoint.origin) {
        throw new Error(`Explicit approval for ${endpoint.origin} is required`);
      }
      candidate.endpoint = endpoint.href;
      candidate.approvedEndpointOrigin = endpoint.origin;
      sessionKey = String(root.sessionStorage?.getItem?.(AI_SESSION_KEY) || '').trim();
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
      hasKey: Boolean(sessionKey && endpoint),
    };

    try {
      await originalSave(AI_SETTINGS_KEY, persisted);
      if (sessionKey && endpoint) {
        root.sessionStorage.setItem(AI_BINDING_KEY, JSON.stringify({
          version: BINDING_VERSION,
          origin: endpoint.origin,
          endpoint: endpoint.href,
          model: String(persisted.model || ''),
          authorityRevision,
          transactionId,
          keyFingerprint: keyFingerprint(sessionKey),
          committedAt: Date.now(),
        }));
        if (!getBoundAICredential(root, persisted)) throw new Error('Credential authority verification failed');
      } else {
        root.sessionStorage?.removeItem?.(AI_SESSION_KEY);
        root.sessionStorage?.removeItem?.(AI_BINDING_KEY);
      }

      const receipt = committedReceipt({ revision: authorityRevision, backend: 'indexedDB+sessionStorage', operation: 'ai-authority-commit' });
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
        if (previousBinding === null) root.sessionStorage?.removeItem?.(AI_BINDING_KEY);
        else root.sessionStorage?.setItem?.(AI_BINDING_KEY, previousBinding);
      } catch (rollbackError) { rollbackErrors.push(rollbackError); }
      const receipt = failedReceipt({ revision: previousRevision, backend: 'indexedDB+sessionStorage', operation: 'ai-authority-commit', error: String(error?.message || error) });
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
    bindingKey: AI_BINDING_KEY,
    getCredential: settings => getBoundAICredential(root, settings),
    stripPortableAuthority: stripPortableAIAuthority,
  });
  return db;
}
