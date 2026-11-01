import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

function workerWithCatalog(raw) {
  const sent = [];
  const self = { postMessage: value => sent.push(JSON.parse(JSON.stringify(value))) };
  vm.runInNewContext(fs.readFileSync('src/workers/catalog.worker.js', 'utf8'), {
    self, Date, Map, console,
  }, { filename: 'catalog.worker.js' });
  const request = (type, data, id) => {
    sent.length = 0;
    self.onmessage({ data: { type, id, requestId: id, generation: 0, data } });
    expect(sent).toHaveLength(1);
    return sent[0];
  };
  const parsed = request('parse', { catalogJson: raw }, 1);
  expect(parsed.type).toBe('parse:done');
  return { parsed, search: (query, limit = 25, id = 2) =>
    request('search', { query, limit }, id) };
}

describe('offline catalog worker shared Unicode search semantics', () => {
  const catalog = () => ({
    medicine: {
      title: 'Biology course',
      sources: [{ id: 'chapters', label: 'مباحث فارسى', topics: [
        { id: 'heart', title: 'فیزیک قلب', url: 'https://example.test/heart.mp4' },
        { id: 'kidney', title: 'سلام\u200cعلیکم', url: 'https://example.test/kidney.mp4' },
      ] }],
    },
  });

  it('normalizes Persian/Arabic spelling and ZWNJ without changing canonical topic records', () => {
    const data = catalog();
    const copy = structuredClone(data);
    const worker = workerWithCatalog(data);
    expect(worker.search('فيزيك', 10, 2)).toMatchObject({
      type: 'search:done', requestId: 2, generation: 0,
      results: [expect.objectContaining({ title: 'فیزیک قلب', topicId: 'medicine:chapters:heart' })],
    });
    expect(worker.search('سلام علیکم', 10, 3).results.map(row => row.title)).toEqual(['سلام\u200cعلیکم']);
    expect(data).toEqual(copy);
  });

  it('matches course and source labels in the same catalog vocabulary while respecting limits', () => {
    const worker = workerWithCatalog(catalog());
    const byCourse = worker.search('BIOLOGY', 1, 4);
    expect(byCourse.results).toHaveLength(1);
    expect(byCourse.results[0].courseId).toBe('medicine');
    expect(worker.search('مباحث فارسی', 2, 5).results).toHaveLength(2);
    expect(worker.search('no such title', 10, 6)).toMatchObject({ results: [], empty: true });
  });

  it('keeps protocol and cancellation unchanged and caps invalid result limits', () => {
    const worker = workerWithCatalog(catalog());
    const result = worker.search('medicine', 0, 7);
    expect(result.type).toBe('search:done');
    expect(result.results).toHaveLength(0);
    expect(result.id).toBe(7);
  });
});
