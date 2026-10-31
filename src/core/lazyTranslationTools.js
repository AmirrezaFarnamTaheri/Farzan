/**
 * Explicit-on-request translation integrations.
 *
 * No translation provider, cache database, endpoint or network request is
 * initialized simply by booting the app. Import both modules before exposing
 * any legacy namespace aliases; a failed chunk can be retried.
 */
export function createLazyTranslationTools({ target, loadTranslator, loadCache } = {}) {
  if (!target || typeof target !== 'object'
    || typeof loadTranslator !== 'function' || typeof loadCache !== 'function') {
    throw new TypeError('Lazy translation tools require a namespace and two module loaders');
  }

  let pending = null;
  return function loadTranslationTools() {
    if (pending) return pending;
    let requested;
    try {
      requested = Promise.all([loadTranslator(), loadCache()]);
    } catch (error) {
      return Promise.reject(error);
    }
    pending = requested.then(([translator, cacheModule]) => {
      const api = {
        TranslatorRegistry: translator.TranslatorRegistry,
        BaseTranslator: translator.BaseTranslator,
        OpenAITranslator: translator.OpenAITranslator,
        CustomAPITranslator: translator.CustomAPITranslator,
        GoogleTranslator: translator.GoogleTranslator,
        LANGUAGES: translator.LANGUAGES,
        getLanguageName: translator.getLanguageName,
        TranslationCache: cacheModule.translationCache || cacheModule,
      };
      Object.assign(target, api);
      return api;
    }).catch(error => {
      pending = null;
      throw error;
    });
    return pending;
  };
}
