import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import Fuse from 'fuse.js';
import { normalizeSearchQuery } from '../src/core/searchRanking.js';

function workerWithData(items, options = {}, { FuseCtor = Fuse } = {}) {
  const sent = [];
  const worker = { postMessage: response => sent.push(JSON.parse(JSON.stringify(response))) };
  const sandbox = { self: worker, Fuse: FuseCtor, console, importScripts: () => {}, Date };
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
  return { search: (query, opts = {}, id = 2) => request('search', { query, options: opts }, id),
    update: (items, opts = {}, id = 3) => request('update', { items, options: opts }, id), init, items };
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

  it('keeps the prior index and revision intact when a reindex fails halfway', () => {
    let failNext = false;
    function FaultyFuse(items, options) {
      if (failNext) throw new Error('new Fuse index failed');
      return new Fuse(items, options);
    }
    const old = { label: 'Physics textbook', sourceType: 'note', sourceId: 'original' };
    const worker = workerWithData([old], { threshold: 0 }, { FuseCtor: FaultyFuse });
    const before = worker.search('physics', {}, 2);
    expect(before.results).toEqual([old]);

    failNext = true;
    const rejected = worker.update([
      { label: 'Physics secret newer', sourceType: 'note', sourceId: 'replacement' },
    ], {}, 3);
    expect(rejected).toMatchObject({
      type: 'error', requestId: 3, error: 'new Fuse index failed',
    });

    // Old Fuse offsets must never point at unrelated new records.
    const after = worker.search('physics', {}, 4);
    expect(after.results).toEqual([old]);
    expect(after.indexRevision).toBe(before.indexRevision);
    expect(after.matches[0].item).toEqual(old);
  });

  it('publishes a new index and revision only after a successful update', () => {
    const old = { label: 'Biology old', sourceType: 'note', sourceId: 'old' };
    const next = { label: 'Biology new', sourceType: 'note', sourceId: 'new' };
    const worker = workerWithData([old], { threshold: 0 });
    const receipt = worker.update([next], { threshold: 0 }, 3);
    expect(receipt).toMatchObject({
      type: 'update:done', success: true, itemCount: 1, indexRevision: 2,
    });
    const result = worker.search('biology', {}, 4);
    expect(result.results).toEqual([next]);
    expect(result.indexRevision).toBe(2);
  });

  it('promotes canonical exact/prefix/substring labels above fuzzies without changing within-tier Fuse order', () => {
    // A deterministic alternative Fuse ranking proves that lexically exact
    // source labels win even if the engine initially places fuzzy hits first.
    function InvertedFuse(rows) {
      this.search = () => rows.map((item, index) => ({ item, score: index / 10, matches: [] }));
    }
    const rows = [
      { label: 'Cariology-ish', sourceType: 'note', sourceId: 'fuzzy' },
      { label: 'Learning cardiology today', sourceType: 'note', sourceId: 'substring' },
      { label: 'Cardiology introduction', sourceType: 'note', sourceId: 'prefix' },
      { label: 'CARDIOLOGY', sourceType: 'note', sourceId: 'exact' },
      { label: 'Cardiology second chapter', sourceType: 'note', sourceId: 'prefix2' },
      { label: 'Cardiology chapter clone', sourceType: 'note', sourceId: 'prefix2' },
    ];
    const worker = workerWithData(rows, {}, { FuseCtor: InvertedFuse });
    const response = worker.search('cardiology', { limit: 4 }, 8);
    expect(response.results.map(row => row.sourceId))
      .toEqual(['exact', 'prefix', 'prefix2', 'substring']);
    expect(response.matches.map(row => row.item.sourceId))
      .toEqual(['exact', 'prefix', 'prefix2', 'substring']);
    expect(response.indexRevision).toBe(worker.init.indexRevision);
    expect(response.type).toBe('search:done');
  });

  it('promotes Persian/Arabic keyboard-equivalent exact labels while leaving unrelated fuzzy matches reachable', () => {
    function InvertedFuse(rows) {
      this.search = () => rows.map((item, index) => ({ item, score: index / 10, matches: [] }));
    }
    const rows = [
      { title: 'فیزیک کلیه - topic', sourceType: 'topic', sourceId: 'topic-1' },
      { title: 'فيزيك كليه', sourceType: 'note', sourceId: 'exact-1' },
      { title: 'فیزیک کلیه', sourceType: 'note', sourceId: 'exact-2' },
    ];
    const worker = workerWithData(rows, {}, { FuseCtor: InvertedFuse });
    const response = worker.search('فیزیک کلیه', { limit: 3 }, 9);
    expect(response.results.map(row => row.sourceId))
      .toEqual(['exact-1', 'exact-2', 'topic-1']);
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
