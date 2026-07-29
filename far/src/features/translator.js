/**
 * Multi-provider translation with explicit remote consent, bounded requests,
 * provider provenance, and provenance-partitioned cache identities.
 */

import { translationCache } from './translationCache.js';

const TRANSLATION_POLICY_VERSION = 'remote-translation-v2';
const DEFAULT_TIMEOUT_MS = 30_000;

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  return normalized === 'localhost'
    || normalized === '::1'
    || normalized === '127.0.0.1'
    || normalized.startsWith('127.');
}

export function validateTranslatorEndpoint(value, label = 'Translator endpoint') {
  const source = String(value || '').trim();
  if (!source) return '';
  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    throw new TypeError(`${label} is invalid — provide an absolute URL such as https://api.example.com/v1/translate`);
  }
  if (parsed.username || parsed.password) {
    throw new TypeError(`${label} must not contain embedded credentials — remove the user:password@ part and supply the API key separately`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new TypeError(`${label} must use HTTP or HTTPS — got "${parsed.protocol}"`);
  }
  if (parsed.protocol === 'http:' && !isLoopbackHostname(parsed.hostname)) {
    throw new TypeError(`${label} must use HTTPS unless it targets localhost`);
  }
  parsed.hash = '';
  return parsed.href;
}

function endpointIdentity(endpoint) {
  if (!endpoint) return 'none';
  try {
    const parsed = new URL(endpoint);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return 'invalid';
  }
}

function consentError(provider) {
  const error = new Error(`Remote translation consent is required before sending text to ${provider}`);
  error.code = 'TRANSLATION_CONSENT_REQUIRED';
  error.provider = provider;
  return error;
}

function createTimedSignal(externalSignal, timeoutMs) {
  if (typeof AbortController !== 'function') {
    return { signal: externalSignal, didTimeout: () => false, cleanup() {} };
  }
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) onAbort();
  else externalSignal?.addEventListener?.('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException('Translation timed out', 'TimeoutError'));
  }, Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup() {
      clearTimeout(timer);
      externalSignal?.removeEventListener?.('abort', onAbort);
    },
  };
}

function requestError(error, timed, signal) {
  if (timed.didTimeout()) {
    const timeout = new Error('Translation request timed out', { cause: error });
    timeout.code = 'TRANSLATION_TIMEOUT';
    return timeout;
  }
  if (signal?.aborted || error?.name === 'AbortError') {
    const aborted = new Error('Translation request was cancelled', { cause: error });
    aborted.code = 'TRANSLATION_ABORTED';
    return aborted;
  }
  return error;
}

export class BaseTranslator {
  constructor(options = {}) {
    this.name = options.name || 'base';
    this._remote = Boolean(options.remote);
    this._consent = options.consent === true;
    this._timeoutMs = Math.max(1, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
  }

  setConsent(consent) {
    this._consent = consent === true;
  }

  getProvenance() {
    return Object.freeze({
      provider: this.name,
      endpoint: 'none',
      model: 'none',
      transport: this._remote ? 'remote' : 'local',
      remote: this._remote,
      policyVersion: TRANSLATION_POLICY_VERSION,
    });
  }

  _assertConsent(options = {}) {
    if (this._remote && options.consent !== true && this._consent !== true) {
      throw consentError(this.name);
    }
  }

  async translate(text, from, to, options = {}) {
    const source = String(text || '');
    if (!source.trim()) return '';
    if (from === to) return source;
    this._assertConsent(options);

    const provenance = this.getProvenance();
    const params = {
      from: from || 'auto',
      to,
      provider: provenance.provider,
      endpoint: provenance.endpoint,
      model: provenance.model,
      transport: provenance.transport,
      remote: provenance.remote,
      policyVersion: provenance.policyVersion,
    };
    const cacheEngine = `${provenance.provider}@${provenance.policyVersion}`;
    const cached = await translationCache.get(source, cacheEngine, params);
    if (cached !== null) return cached;

    const timed = createTimedSignal(options.signal, options.timeoutMs || this._timeoutMs);
    try {
      const result = await this.doTranslate(source, from, to, { ...options, signal: timed.signal, provenance });
      if (result) await translationCache.set(source, cacheEngine, params, result, options.ttl);
      return result;
    } catch (error) {
      throw requestError(error, timed, options.signal);
    } finally {
      timed.cleanup();
    }
  }

  async translateWithProvenance(text, from, to, options = {}) {
    const translation = await this.translate(text, from, to, options);
    return Object.freeze({ translation, provenance: this.getProvenance() });
  }

  async doTranslate(_text, _from, _to, _options) {
    throw new Error(`${this.name}: doTranslate() not implemented`);
  }
}

export class GoogleTranslator extends BaseTranslator {
  constructor(options = {}) {
    super({ ...options, name: options.name || 'google', remote: true });
    this.name = options.name || 'google';
    this._endpoint = validateTranslatorEndpoint(
      options.endpoint || 'https://translate.googleapis.com/translate_a/single',
      'Google translator endpoint',
    );
  }

  getProvenance() {
    return Object.freeze({
      provider: this.name,
      endpoint: endpointIdentity(this._endpoint),
      model: 'google-translate-unofficial',
      transport: 'https-post-form',
      remote: true,
      policyVersion: TRANSLATION_POLICY_VERSION,
    });
  }

  async doTranslate(text, from, to, { signal } = {}) {
    const body = new URLSearchParams({
      client: 'gtx',
      sl: from || 'auto',
      tl: to,
      dt: 't',
      q: text,
    });
    const response = await fetch(this._endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body,
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal,
    });
    if (!response.ok) throw new Error(`Google translation failed with HTTP ${response.status}`);
    const data = await response.json();
    if (Array.isArray(data) && Array.isArray(data[0])) return data[0].map(segment => segment[0]).join('');
    return '';
  }
}

export class OpenAITranslator extends BaseTranslator {
  constructor(options = {}) {
    super({ ...options, name: options.name || 'openai', remote: true });
    this.name = options.name || 'openai';
    this._endpoint = validateTranslatorEndpoint(options.endpoint, 'OpenAI translator endpoint');
    this._apiKey = options.apiKey || '';
    this._model = options.model || 'gpt-3.5-turbo';
  }

  setEndpoint(endpoint) { this._endpoint = validateTranslatorEndpoint(endpoint, 'OpenAI translator endpoint'); }
  setApiKey(key) { this._apiKey = String(key || ''); }
  setModel(model) { this._model = String(model || 'gpt-3.5-turbo'); }

  getProvenance() {
    return Object.freeze({
      provider: this.name,
      endpoint: endpointIdentity(this._endpoint),
      model: this._model,
      transport: 'openai-compatible-json',
      remote: true,
      policyVersion: TRANSLATION_POLICY_VERSION,
    });
  }

  async doTranslate(text, from, to, { signal } = {}) {
    if (!this._endpoint) throw new Error('OpenAI endpoint not configured');
    const langMap = {
      en: 'English', fa: 'Persian', ar: 'Arabic', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
      de: 'German', fr: 'French', es: 'Spanish', ru: 'Russian', pt: 'Portuguese', it: 'Italian',
      tr: 'Turkish', hi: 'Hindi', nl: 'Dutch', pl: 'Polish',
    };
    const headers = { 'Content-Type': 'application/json' };
    if (this._apiKey) headers.Authorization = `Bearer ${this._apiKey}`;
    const response = await fetch(this._endpoint, {
      method: 'POST',
      headers,
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal,
      body: JSON.stringify({
        model: this._model,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: `Translate from ${langMap[from] || from} to ${langMap[to] || to}. Return only the translated text.`,
          },
          { role: 'user', content: text },
        ],
      }),
    });
    if (!response.ok) throw new Error(`OpenAI translation failed with HTTP ${response.status}`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content.trim() : '';
  }
}

export class CustomAPITranslator extends BaseTranslator {
  constructor(options = {}) {
    super({ ...options, name: options.name || 'custom', remote: true });
    this.name = options.name || 'custom';
    this._endpoint = validateTranslatorEndpoint(options.endpoint, 'Custom translator endpoint');
    this._apiKey = options.apiKey || '';
    this._headers = { ...(options.headers || {}) };
    this._model = options.model || 'custom-default';
  }

  setEndpoint(endpoint) { this._endpoint = validateTranslatorEndpoint(endpoint, 'Custom translator endpoint'); }
  setApiKey(key) { this._apiKey = String(key || ''); }
  setModel(model) { this._model = String(model || 'custom-default'); }

  getProvenance() {
    return Object.freeze({
      provider: this.name,
      endpoint: endpointIdentity(this._endpoint),
      model: this._model,
      transport: 'custom-json',
      remote: true,
      policyVersion: TRANSLATION_POLICY_VERSION,
    });
  }

  async doTranslate(text, from, to, { signal } = {}) {
    if (!this._endpoint) throw new Error('Custom endpoint not configured');
    const headers = { 'Content-Type': 'application/json', ...this._headers };
    if (this._apiKey) headers.Authorization = `Bearer ${this._apiKey}`;
    const response = await fetch(this._endpoint, {
      method: 'POST',
      headers,
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal,
      body: JSON.stringify({ text, from, to, model: this._model }),
    });
    if (!response.ok) throw new Error(`Custom translation failed with HTTP ${response.status}`);
    const data = await response.json();
    return typeof data?.translation === 'string' ? data.translation : '';
  }
}

export const TranslatorRegistry = {
  _translators: new Map(),
  _default: 'google',
  _instances: new Map(),

  register(name, cls) {
    this._translators.set(name, cls);
    this._instances.delete(name);
  },

  get(name, options) {
    const Cls = this._translators.get(name);
    if (!Cls) return null;
    if (options && Object.keys(options).length) return new Cls(options);
    if (!this._instances.has(name)) this._instances.set(name, new Cls());
    return this._instances.get(name);
  },

  clearInstance(name) {
    return this._instances.delete(name);
  },

  list() {
    return [...this._translators.keys()];
  },

  setDefault(name) {
    if (this._translators.has(name)) this._default = name;
  },

  getDefault(options) {
    return this.get(this._default, options);
  },

  getDefaultName() {
    return this._default;
  },

  async translate(text, from, to, options = {}) {
    const translator = this.getDefault(options.translatorOptions);
    if (!translator) throw new Error('No default translator registered');
    return translator.translate(text, from, to, options);
  },
};

TranslatorRegistry.register('google', GoogleTranslator);
TranslatorRegistry.register('openai', OpenAITranslator);
TranslatorRegistry.register('custom', CustomAPITranslator);

if (typeof window !== 'undefined') {
  const pd = window.OpenCourseDeck = window.OpenCourseDeck || {};
  pd.TranslatorRegistry = TranslatorRegistry;
}

export const LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
];

export function getLanguageName(code) {
  return LANGUAGES.find(language => language.code === code)?.name || code;
}

export const TRANSLATION_POLICY = Object.freeze({
  version: TRANSLATION_POLICY_VERSION,
  defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
});
