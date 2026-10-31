import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import Fuse from 'fuse.js';
import { normalizeSearchQuery } from '../src/core/searchRanking.js';

function workerWithData(items, options = {}) {
  const sent = [];
  const worker = { postMessage: response => sent.push(JSON.parse(JSON.stringify(response))) };
  const sandbox = { self: worker, Fuse, console, importScripts: () => {}, Date };
  vm.runInNewContext(fs.readFileSync('src/workers/search.worker.js', 'utf8'), sandbox, {
    filename: 'search.worker.js',
  });
  const request = (type, data, id) => {
    sent.length = 0;
    worker.onmessage({ data: { id, requestId: id, generation: 0, type, data } });
    expect(sent).toHaveLength(1);
    return sent[0];
  };
  const init = request('init', { items, options }, 1);
  expect(init.type).toBe('init:done');
  return { search: (query, opts = {}, id = 2) => request('search', { query, options: opts }, id), init, items };
}

describe('search worker Unicode identity and stable protocol', () => {
  it('matches Persian text typed with Arabic keyboard Yeh/Kaf under an exact-only Fuse gate', () => {
    const label = 'فیزیک کلیه';
    const query = 'فيزيك كليه';
    expect(normalizeSearchQuery(label)).toBe(normalizeSearchQuery(query));
    const worker = workerWithData([{ id: 'note:fa', label, sourceType: 'note', sourceId: 'fa' }],
      { threshold: 0 });
    const result = worker.search(query);
    expect(result.type).toBe('search:done');
    expect(result.query).toBe(query);
    expect(result.results).toEqual([
      { id: 'note:fa', label, sourceType: 'note', sourceId: 'fa' },
    ]);
    expect(result.indexRevision).toBe(worker.init.indexRevision);
    expect(result.matches).toHaveLength(1);
  });

  it('returns distinct underlying resources before the result cap, preserving original documents', () => {
    const duplicate = { label: 'Physics', sourceType: 'course', sourceId: 'c-1' };
    const different = Array.from({ length: 4 }, (_, i) => ({
      label: 'Physics lesson ' + i, sourceType: 'course', sourceId: 'c-' + (i + 2),
    }));
    const data = [...Array(30).fill(duplicate), ...different];
    const snapshot = structuredClone(data);
    const worker = workerWithData(data, { threshold: 0.1 });
    const result = worker.search('physics', { limit: 3 });
    expect(result.results.map(item => item.sourceId)).toEqual(['c-1', 'c-2', 'c-3']);
    expect(result.matches).toHaveLength(3);
    expect(data).toEqual(snapshot);
    expect(result.results.every(item => !Object.keys(item).some(key => key.startsWith('__')))).toBe(true);
  });

  it('does not collapse same source ID in different categories or distinct timestamp positions', () => {
    const worker = workerWithData([
      { label: 'Chemistry notes', sourceType: 'note', sourceId: '42' },
      { label: 'Chemistry courses', sourceType: 'course', sourceId: '42' },
      { label: 'Chemistry 10s', sourceType: 'timestamp', sourceId: '42:10' },
      { label: 'Chemistry 50s', sourceType: 'timestamp', sourceId: '42:50' },
    ]);
    const result = worker.search('chemistry', { limit: 10 });
    expect(result.results.map(item => item.sourceType)).toEqual(
      ['note', 'course', 'timestamp', 'timestamp']);
    expect(result.matches).toHaveLength(4);
  });

  it('keeps cancellation and identity protocol unchanged after Unicode normalization', () => {
    const worker = workerWithData([{ id: 'n', label: 'فیزیک' }]);
    const response = worker.search('فيزيك', { limit: 8 }, 7);
    expect(response).toMatchObject({
      type: 'search:done', id: 7, requestId: 7, generation: 0,
      resource: null, revision: null, authority: null,
      query: 'فيزيك', indexRevision: 1,
    });
  });
});
