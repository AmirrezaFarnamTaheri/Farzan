import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('catalog normalization', () => {
  beforeEach(async () => {
    vi.resetModules();
    try { delete window.DataStore; } catch {}
    try { delete window.DB; } catch {}
    window.OpenCourseDeck = { bus: { emit: vi.fn() } };
    globalThis.fetch = vi.fn(async (url) => {
      const requested = String(url);
      const body = requested.includes('data/catalog.json')
        ? { currentCatalog: 'catalog-test.json' }
        : {
            courseA: {
              title: 'Course A',
              sources: [
                {
                  label: 'Source One',
                  entryUrl: 'https://example.test/source-1',
                  curriculum: 'Curriculum 1',
                  topics: [{ title: 'Topic 1', url: 'topic-1', videos: ['video-1.mp4'] }],
                },
                {
                  label: 'Source Two',
                  entryUrl: 'https://example.test/source-2',
                  curriculum: 'Curriculum 2',
                  topics: [
                    { title: 'Topic 2', url: 'topic-2', pdfs: ['doc-2.pdf'] },
                    { title: '', error: 'HTTP 503', videos: [], pdfs: [] },
                  ],
                },
              ],
            },
          };
      return {
        ok: true,
        status: 200,
        json: async () => body,
      };
    });
    await import('../bridge.js');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads the pointer catalog and preserves topics from every source', async () => {
    await window.DataStore.init();

    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, './data/catalog.json', { cache: 'no-cache' });
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, './catalog-test.json', { cache: 'no-cache' });
    expect(window.DataStore.catalogPath()).toBe('./catalog-test.json');
    expect(window.DataStore.allCourses()).toEqual([
      expect.objectContaining({
        id: 'courseA',
        title: 'Course A',
        sources: expect.arrayContaining([
          expect.objectContaining({ label: 'Source One' }),
          expect.objectContaining({ label: 'Source Two' }),
        ]),
      }),
    ]);
    expect(window.DataStore.allTopics()).toEqual([
      expect.objectContaining({
        title: 'Topic 1',
        sourceIndex: 0,
        sourceLabel: 'Source One',
        sourceEntryUrl: 'https://example.test/source-1',
        sourceCurriculum: 'Curriculum 1',
      }),
      expect.objectContaining({
        title: 'Topic 2',
        sourceIndex: 1,
        sourceLabel: 'Source Two',
        sourceEntryUrl: 'https://example.test/source-2',
        sourceCurriculum: 'Curriculum 2',
      }),
      expect.objectContaining({
        title: 'Catalog issue: HTTP 503',
        sourceIndex: 1,
        sourceLabel: 'Source Two',
        error: 'HTTP 503',
        catalogIssue: true,
      }),
    ]);
  });

  it('exposes degraded state and recovers through an explicit retry', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let fail = true;
    globalThis.fetch = vi.fn(async (url) => {
      if (fail) throw new Error('temporary network failure');
      const requested = String(url);
      return {
        ok: true,
        status: 200,
        json: async () => requested.includes('data/catalog.json')
          ? { currentCatalog: 'catalog-recovered.json' }
          : { recovered: { title: 'Recovered', topics: [] } },
      };
    });
    delete window.DataStore;
    delete window.DB;
    window.OpenCourseDeck = { bus: { emit: vi.fn() } };
    vi.resetModules();
    await import('../bridge.js');

    await window.DataStore.init();
    expect(window.DataStore.getState()).toMatchObject({ status: 'degraded', source: 'demo-fallback' });

    fail = false;
    await window.DataStore.retry();
    expect(window.DataStore.getState()).toMatchObject({ status: 'authoritative', source: './catalog-recovered.json' });
    expect(window.DataStore.allCourses()).toEqual([expect.objectContaining({ id: 'recovered' })]);
  });
});
