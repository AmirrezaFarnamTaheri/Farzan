import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/features/translationCache.js', () => ({
  translationCache: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => {}),
  },
}));

const {
  CustomAPITranslator,
  OpenAITranslator,
  validateTranslatorEndpoint,
} = await import('../src/features/translator.js');

describe('translator endpoint security', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts HTTPS endpoints and loopback HTTP', () => {
    expect(validateTranslatorEndpoint('https://api.example.com/v1/chat')).toBe('https://api.example.com/v1/chat');
    expect(validateTranslatorEndpoint('http://localhost:11434/api')).toBe('http://localhost:11434/api');
    expect(validateTranslatorEndpoint('http://127.0.0.1:8080/translate')).toBe('http://127.0.0.1:8080/translate');
    expect(validateTranslatorEndpoint('')).toBe('');
  });

  it('treats 127-prefixed internet hostnames as remote', () => {
    for (const endpoint of ['http://127.attacker.example/v1', 'http://127.0.0.1.evil.example/x']) {
      expect(() => validateTranslatorEndpoint(endpoint)).toThrow(/HTTPS/);
      expect(() => new CustomAPITranslator({ endpoint })).toThrow(/HTTPS/);
    }
  });

  it('rejects cleartext remote endpoints', () => {
    expect(() => validateTranslatorEndpoint('http://api.example.com/v1')).toThrow(/HTTPS/);
  });

  it('does not allow remote translations to follow redirects with source text or credentials', async () => {
    const response = { ok: true, json: async () => ({ translation: 'ok' }) };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    try {
      const translator = new CustomAPITranslator({ endpoint: 'https://api.example.test/translate', apiKey: 'private-key' });
      await expect(translator.doTranslate('Private study text', 'en', 'fa')).resolves.toBe('ok');
      expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/translate', expect.objectContaining({ redirect: 'error' }));
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('rejects embedded credentials and non-HTTP protocols', () => {
    expect(() => validateTranslatorEndpoint('https://user:pass@example.com/')).toThrow(/credentials/);
    expect(() => validateTranslatorEndpoint('ftp://example.com/x')).toThrow();
    expect(() => validateTranslatorEndpoint('not a url')).toThrow(/invalid/);
  });

  it('OpenAI translator refuses insecure endpoints at construction and via setEndpoint', () => {
    expect(() => new OpenAITranslator({ endpoint: 'http://remote.example.com/v1' })).toThrow(/HTTPS/);
    const translator = new OpenAITranslator({ endpoint: 'https://api.example.com/v1/chat/completions' });
    expect(() => translator.setEndpoint('http://remote.example.com/v1')).toThrow(/HTTPS/);
  });

  it('Custom translator refuses insecure endpoints', () => {
    expect(() => new CustomAPITranslator({ endpoint: 'http://remote.example.com/api' })).toThrow(/HTTPS/);
    const translator = new CustomAPITranslator({ endpoint: 'https://api.example.com/translate' });
    expect(() => translator.setEndpoint('https://user:pw@example.com/x')).toThrow(/credentials/);
  });
});
