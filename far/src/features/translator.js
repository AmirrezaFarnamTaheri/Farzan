/**
 * Translator — multi-provider translation system with cache-first strategy.
 * Providers: Google (free), OpenAI-compatible, Custom endpoint.
 *
 * Usage:
 *   const translator = new GoogleTranslator();
 *   const result = await translator.translate('Hello', 'en', 'fa');
 */

import { translationCache } from './translationCache.js';

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || '').toLowerCase();
  return normalized === 'localhost'
    || normalized === '::1'
    || normalized === '[::1]'
    || normalized === '127.0.0.1'
    || normalized.startsWith('127.');
}

/**
 * Validate a translator endpoint with the same floor the AI client
 * enforces: absolute HTTP(S), HTTPS unless loopback, and no embedded
 * credentials — API keys and note text must never go out over cleartext.
 * @param {string} value
 * @param {string} [label]
 * @returns {string} normalized href, or '' when value is empty
 */
export function validateTranslatorEndpoint(value, label = 'Translator endpoint') {
  const source = String(value || '').trim();
  if (!source) return '';
  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    throw new TypeError(`${label} is invalid`);
  }
  if (parsed.username || parsed.password) throw new TypeError(`${label} must not contain embedded credentials`);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new TypeError(`${label} must use HTTP or HTTPS`);
  if (parsed.protocol === 'http:' && !isLoopbackHostname(parsed.hostname)) {
    throw new TypeError(`${label} must use HTTPS unless it targets localhost`);
  }
  return parsed.href;
}

/**
 * Base translator class with cache integration.
 * Subclasses implement doTranslate().
 */
export class BaseTranslator {
  constructor() {
    /** @type {string} */
    this.name = 'base';
  }

  /**
   * Translate text with cache check.
   * @param {string} text
   * @param {string} from — source language code
   * @param {string} to — target language code
   * @returns {Promise<string>}
   */
  async translate(text, from, to) {
    if (!text || !text.trim()) return '';
    if (from === to) return text;

    const params = { from, to };
    const cached = await translationCache.get(text, this.name, params);
    if (cached !== null) return cached;

    const result = await this.doTranslate(text, from, to);
    if (result) {
      await translationCache.set(text, this.name, params, result);
    }
    return result;
  }

  /**
   * Perform the actual translation. Override in subclasses.
   * @param {string} text
   * @param {string} from
   * @param {string} to
   * @returns {Promise<string>}
   */
  async doTranslate(_text, _from, _to) {
    throw new Error(`${this.name}: doTranslate() not implemented`);
  }
}

/**
 * Google Translate (free unofficial API).
 */
export class GoogleTranslator extends BaseTranslator {
  constructor() {
    super();
    this.name = 'google';
    this._endpoint = 'https://translate.googleapis.com/translate_a/single';
  }

  async doTranslate(text, from, to) {
    const params = new URLSearchParams({
      client: 'gtx',
      sl: from || 'auto',
      tl: to,
      dt: 't',
      q: text,
    });

    try {
      const response = await fetch(`${this._endpoint}?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      // Response format: [[["translated","original",...], ...], ...]
      if (Array.isArray(data) && Array.isArray(data[0])) {
        return data[0].map(seg => seg[0]).join('');
      }
      return '';
    } catch (err) {
      console.warn('[GoogleTranslator]', err.message);
      return '';
    }
  }
}

/**
 * OpenAI-compatible translator (works with any OpenAI-compatible endpoint).
 */
export class OpenAITranslator extends BaseTranslator {
  constructor(options = {}) {
    super();
    this.name = options.name || 'openai';
    this._endpoint = validateTranslatorEndpoint(options.endpoint, 'OpenAI translator endpoint');
    this._apiKey = options.apiKey || '';
    this._model = options.model || 'gpt-3.5-turbo';
  }

  setEndpoint(endpoint) { this._endpoint = validateTranslatorEndpoint(endpoint, 'OpenAI translator endpoint'); }
  setApiKey(key) { this._apiKey = key; }
  setModel(model) { this._model = model; }

  async doTranslate(text, from, to) {
    if (!this._endpoint) throw new Error('OpenAI endpoint not configured');

    const langMap = {
      en: 'English', fa: 'Persian', ar: 'Arabic', zh: 'Chinese',
      ja: 'Japanese', ko: 'Korean', de: 'German', fr: 'French',
      es: 'Spanish', ru: 'Russian', pt: 'Portuguese', it: 'Italian',
      tr: 'Turkish', hi: 'Hindi', nl: 'Dutch', pl: 'Polish',
    };
    const fromName = langMap[from] || from;
    const toName = langMap[to] || to;

    const headers = {
      'Content-Type': 'application/json',
    };
    if (this._apiKey) headers.Authorization = `Bearer ${this._apiKey}`;

    try {
      const response = await fetch(this._endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this._model,
          temperature: 0.1,
          messages: [
            {
              role: 'system',
              content: `You are a precise translator. Translate the following text from ${fromName} to ${toName}. Return ONLY the translated text, no explanations or notes.`,
            },
            { role: 'user', content: text },
          ],
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      return typeof content === 'string' ? content.trim() : '';
    } catch (err) {
      console.warn('[OpenAITranslator]', err.message);
      return '';
    }
  }
}

/**
 * Custom API translator for user-defined endpoints.
 * Expects the endpoint to accept POST with { text, from, to } and return { translation }.
 */
export class CustomAPITranslator extends BaseTranslator {
  constructor(options = {}) {
    super();
    this.name = options.name || 'custom';
    this._endpoint = validateTranslatorEndpoint(options.endpoint, 'Custom translator endpoint');
    this._apiKey = options.apiKey || '';
    this._headers = options.headers || {};
  }

  setEndpoint(endpoint) { this._endpoint = validateTranslatorEndpoint(endpoint, 'Custom translator endpoint'); }
  setApiKey(key) { this._apiKey = key; }

  async doTranslate(text, from, to) {
    if (!this._endpoint) throw new Error('Custom endpoint not configured');

    const headers = {
      'Content-Type': 'application/json',
      ...this._headers,
    };
    if (this._apiKey) headers.Authorization = `Bearer ${this._apiKey}`;

    try {
      const response = await fetch(this._endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text, from, to }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return typeof data?.translation === 'string' ? data.translation : '';
    } catch (err) {
      console.warn('[CustomAPITranslator]', err.message);
      return '';
    }
  }
}

/**
 * Translator registry — register, retrieve, and manage translator providers.
 */
export const TranslatorRegistry = {
  /** @type {Map<string, typeof BaseTranslator>} */
  _translators: new Map(),
  /** @type {string} */
  _default: 'google',
  /** @type {Map<string, BaseTranslator>} */
  _instances: new Map(),

  /**
   * Register a translator class.
   * @param {string} name
   * @param {typeof BaseTranslator} cls
   */
  register(name, cls) {
    this._translators.set(name, cls);
  },

  /**
   * Get a translator instance (lazy-created singletons).
   * @param {string} name
   * @param {Object} [options]
   * @returns {BaseTranslator|null}
   */
  get(name, options) {
    if (this._instances.has(name)) return this._instances.get(name);
    const Cls = this._translators.get(name);
    if (!Cls) return null;
    const instance = new Cls(options);
    this._instances.set(name, instance);
    return instance;
  },

  /**
   * List registered translator names.
   * @returns {string[]}
   */
  list() {
    return [...this._translators.keys()];
  },

  /**
   * Set the default translator.
   * @param {string} name
   */
  setDefault(name) {
    if (this._translators.has(name)) this._default = name;
  },

  /**
   * Get the default translator instance.
   * @returns {BaseTranslator|null}
   */
  getDefault() {
    return this.get(this._default);
  },

  /**
   * Get the default translator name.
   * @returns {string}
   */
  getDefaultName() {
    return this._default;
  },

  /**
   * Translate using the default translator.
   * @param {string} text
   * @param {string} from
   * @param {string} to
   * @returns {Promise<string>}
   */
  async translate(text, from, to) {
    const translator = this.getDefault();
    if (!translator) throw new Error('No default translator registered');
    return translator.translate(text, from, to);
  },
};

// Register built-in providers
TranslatorRegistry.register('google', GoogleTranslator);
TranslatorRegistry.register('openai', OpenAITranslator);
TranslatorRegistry.register('custom', CustomAPITranslator);

if (typeof window !== 'undefined') {
  const pd = window.OpenCourseDeck = window.OpenCourseDeck || {};
  pd.TranslatorRegistry = TranslatorRegistry;
}

/**
 * Supported language codes.
 */
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
  const lang = LANGUAGES.find(l => l.code === code);
  return lang ? lang.name : code;
}
