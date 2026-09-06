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
 * Normalize language tag or alias to canonical form.
 * @param {string} lang
 * @returns {string}
 */
export function normalizeLang(lang) {
  if (!lang) return 'en-US';
  const l = String(lang).trim();
  if (l === 'fa' || l === 'fa_IR' || l.toLowerCase().startsWith('fa-')) return 'fa-IR';
  if (l === 'en' || l === 'en_US' || l.toLowerCase().startsWith('en-')) return 'en-US';
  return l;
}

/**
 * Register a locale with its messages.
 * @param {string} lang — language code (e.g. 'en-US', 'fa-IR')
 * @param {Object<string, string>} messages — flat key→value map
 */
export function locale(lang, messages) {
  if (!lang || !messages) return;
  const canonical = normalizeLang(lang);
  locales[canonical] = messages;
  if (canonical !== lang) {
    locales[lang] = messages;
  }
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
 * Format a number using Intl.NumberFormat according to current or target locale.
 * @param {number} value
 * @param {string} [lang]
 * @returns {string}
 */
export function formatNumber(value, lang) {
  const effectiveLang = lang ? normalizeLang(lang) : getCurrentLang();
  try {
    return new Intl.NumberFormat(effectiveLang).format(value);
  } catch {
    return String(value);
  }
}

/**
 * Get the current language code.
 * @returns {string}
 */
export function getCurrentLang() {
  if (currentLang) return currentLang;
  try {
    const saved = localStorage.getItem('ocd_lang');
    if (saved) {
      currentLang = normalizeLang(saved);
      return currentLang;
    }
  } catch { /* storage blocked */ }
  if (typeof document !== 'undefined') {
    const docLang = document.documentElement.lang;
    if (docLang) {
      return normalizeLang(docLang);
    }
  }
  return 'en-US';
}

/**
 * Set the current language. Updates <html lang="..."> and <html dir="...">.
 * Persists both ocd_lang and ocd_dir in localStorage and emits change events.
 * @param {string} lang
 */
export function setCurrentLang(lang) {
  const canonical = normalizeLang(lang);
  currentLang = canonical;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = canonical;
    // RTL languages
    const rtlLangs = new Set(['fa-IR', 'fa', 'ar', 'ar-SA', 'ar-EG', 'he', 'ur']);
    const dir = rtlLangs.has(canonical) ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    // Persist language and direction so boot restores both on reload
    try {
      localStorage.setItem('ocd_lang', canonical);
      localStorage.setItem('ocd_dir', dir);
    } catch { /* storage blocked */ }

    try {
      window.dispatchEvent(new CustomEvent('localechange', { detail: { lang: canonical, dir } }));
      window.OpenCourseDeck?.bus?.emit?.('locale:change', { lang: canonical, dir });
    } catch { /* ignore */ }
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
