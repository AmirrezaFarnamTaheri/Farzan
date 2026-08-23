/**
 * Locale — i18n registration and lookup system.
 * Flat keys with dot notation: 'player.play', 'settings.theme'.
 * Fallback: current locale → 'en-US' → key itself.
 *
 * Usage:
 *   import { locale, t, tf, getCurrentLang, setCurrentLang } from './locale.js';
 *   locale('en-US', enMessages);
 *   locale('fa-IR', faMessages);
 *   setCurrentLang('fa-IR');
 *   const label = t('player.play'); // 'پخش'
 *   const getLabel = tf('player.play'); // () => 'پخش'
 */

/** @type {Object<string, Object<string, string>>} */
const locales = {};

/** @type {string} */
let currentLang = '';

/**
 * Register a locale with its messages.
 * @param {string} lang — language code (e.g. 'en-US', 'fa-IR')
 * @param {Object<string, string>} messages — flat key→value map
 */
export function locale(lang, messages) {
  if (!lang || !messages) return;
  locales[lang] = messages;
}

/**
 * Translate a key to the current locale.
 * @param {string} key — dot-notation key (e.g. 'player.play')
 * @param {Object<string, string>} [params] — interpolation params
 * @returns {string}
 */
export function t(key, params) {
  const lang = getCurrentLang();
  const msg = locales[lang]?.[key] || locales['en-US']?.[key] || key;
  if (!params) return msg;
  return msg.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
}

/**
 * Return a thunk that translates the key. Useful for lazy evaluation.
 * @param {string} key
 * @param {Object<string, string>} [params]
 * @returns {function(): string}
 */
export function tf(key, params) {
  return () => t(key, params);
}

/**
 * Get the current language code.
 * @returns {string}
 */
export function getCurrentLang() {
  if (currentLang) return currentLang;
  if (typeof document !== 'undefined') {
    return document.documentElement.lang || 'en-US';
  }
  return 'en-US';
}

/**
 * Set the current language. Updates <html lang="..."> and <html dir="...">.
 * @param {string} lang
 */
export function setCurrentLang(lang) {
  currentLang = lang;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    // RTL languages
    const rtlLangs = new Set(['fa-IR', 'fa', 'ar', 'ar-SA', 'ar-EG', 'he', 'ur']);
    const dir = rtlLangs.has(lang) ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    // Persist so boot (src/index.js reads 'ocd_dir') restores the same
    // direction on reload; otherwise switching to an RTL locale lasts only
    // until the next refresh.
    try { localStorage.setItem('ocd_dir', dir); } catch { /* storage blocked */ }
  }
}

/**
 * Get all registered locale keys.
 * @returns {string[]}
 */
export function getRegisteredLocales() {
  return Object.keys(locales);
}

/**
 * Check if a locale is registered.
 * @param {string} lang
 * @returns {boolean}
 */
export function hasLocale(lang) {
  return Boolean(locales[lang]);
}

/**
 * Get the full message map for a locale.
 * @param {string} lang
 * @returns {Object<string, string>|null}
 */
export function getMessages(lang) {
  return locales[lang] || null;
}
