import { describe, expect, it, vi } from 'vitest';

const provider = () => ({
  TranslatorRegistry: { register: vi.fn() },
  BaseTranslator: class BaseTranslator {},
  OpenAITranslator: class OpenAITranslator {},
  CustomAPITranslator: class CustomAPITranslator {},
  GoogleTranslator: class GoogleTranslator {},
  LANGUAGES: { en: 'English' },
  getLanguageName: () => 'English',
});

describe('explicitly lazy translation tool loading', () => {
  it('does not import providers or touch a global until requested and shares one in-flight load', async () => {
    const { createLazyTranslationTools } = await import('../src/core/lazyTranslationTools.js');
    const target = { unrelated: 17 };
    const translator = provider();
    const cache = { init: vi.fn(), get: vi.fn() };
    const loadTranslator = vi.fn(async () => translator);
    const loadCache = vi.fn(async () => ({ translationCache: cache }));
    const load = createLazyTranslationTools({ target, loadTranslator, loadCache });

    expect(loadTranslator).not.toHaveBeenCalled();
    expect(loadCache).not.toHaveBeenCalled();
    expect(target).toEqual({ unrelated: 17 });
    const first = load();
    const second = load();
    expect(first).toBe(second);
    const api = await first;
    expect(loadTranslator).toHaveBeenCalledOnce();
    expect(loadCache).toHaveBeenCalledOnce();
    expect(api).toMatchObject({ TranslationCache: cache,
      TranslatorRegistry: translator.TranslatorRegistry });
    expect(target.TranslationCache).toBe(cache);
    expect(target.TranslatorRegistry).toBe(translator.TranslatorRegistry);
    expect(target.unrelated).toBe(17);
    expect(await load()).toBe(api);
    expect(loadTranslator).toHaveBeenCalledOnce();
  });

  it('does not publish a partial provider namespace when the cache import fails, and retries', async () => {
    const { createLazyTranslationTools } = await import('../src/core/lazyTranslationTools.js');
    const target = { version: 1 };
    const translator = provider();
    const loadTranslator = vi.fn(async () => translator);
    const cache = { init: vi.fn(), get: vi.fn() };
    const loadCache = vi.fn()
      .mockRejectedValueOnce(new Error('Cache chunk not available'))
      .mockResolvedValueOnce({ translationCache: cache });
    const load = createLazyTranslationTools({ target, loadTranslator, loadCache });
    await expect(load()).rejects.toThrow(/cache chunk/i);
    expect(target).toEqual({ version: 1 });
    const result = await load();
    expect(result.TranslationCache).toBe(cache);
    expect(loadTranslator).toHaveBeenCalledTimes(2);
    expect(loadCache).toHaveBeenCalledTimes(2);
    expect(target.BaseTranslator).toBe(translator.BaseTranslator);
  });

  it('accepts the documented translation cache fallback export', async () => {
    const { createLazyTranslationTools } = await import('../src/core/lazyTranslationTools.js');
    const cache = { get: vi.fn(), set: vi.fn() };
    const load = createLazyTranslationTools({
      target: {},
      loadTranslator: async () => provider(),
      loadCache: async () => cache,
    });
    expect((await load()).TranslationCache).toBe(cache);
  });
});
