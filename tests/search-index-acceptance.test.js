import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  readCatalogDocuments, measureSearchIndex, releaseSearchFootprint,
} = require('../scripts/search-index-acceptance.cjs');

describe('search source and index-cost acceptance evidence', () => {
  it('reads the real offline course archive with stable source-aware identities', () => {
    const records = readCatalogDocuments();
    const topics = records.filter(row => row.sourceType === 'topic');
    const courses = records.filter(row => row.sourceType === 'course');
    expect(courses.length).toBeGreaterThanOrEqual(32);
    expect(topics.length).toBeGreaterThanOrEqual(6421);
    expect(records.every(row => typeof row.label === 'string' && row.label.length > 0)).toBe(true);
    expect(records.every(row => row.sourceType && row.sourceId)).toBe(true);
    expect(new Set(records.map(row => row.sourceType + ':' + row.sourceId)).size).toBe(records.length);
    expect(topics.some(row => row.courseTitle && row.sourceLabel)).toBe(true);
  });

  it('benchmarks worker index builds and matching-cost on the same immutable document corpus', async () => {
    const items = [
      { label: 'Renal Physiology', sourceType: 'course', sourceId: 'renal' },
      { label: 'فیزیک کلیه', sourceType: 'topic', sourceId: 'topic:fa' },
      { label: 'Cardiology', sourceType: 'topic', sourceId: 'topic:en' },
    ];
    const original = structuredClone(items);
    const result = await measureSearchIndex(items, { iterations: 2, queries: ['renal', 'فيزيك'] });
    expect(result.documents).toBe(3);
    expect(result.queryCount).toBe(2);
    expect(result.iterations).toBe(2);
    expect(result.worker.initType).toBe('init:done');
    expect(result.worker.searchType).toBe('search:done');
    for (const metric of ['workerBuildMedianMs', 'workerQueryMedianMs', 'lexicalQueryMedianMs']) {
      expect(result[metric]).toEqual(expect.any(Number));
      expect(Number.isFinite(result[metric]) && result[metric] >= 0).toBe(true);
    }
    expect(result.queryEvidence.worker).toEqual(
      expect.arrayContaining([expect.objectContaining({ query: 'فيزيك', matches: 1 })]));
    expect(result.queryEvidence.lexical).toEqual(
      expect.arrayContaining([expect.objectContaining({ query: 'فيزيك', matches: 1 })]));
    expect(items).toEqual(original);
  });

  it('refuses fictitious footprints and measures only the exact release files and precache assets', () => {
    expect(() => releaseSearchFootprint('/directory/that/does/not/exist')).toThrow(/missing|release/i);
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'search-index-release-'));
    try {
      fs.mkdirSync(path.join(dist, 'src/workers'), { recursive: true });
      fs.writeFileSync(path.join(dist, 'opencoursedeck.js'), 'export const shell = 1;');
      fs.writeFileSync(path.join(dist, 'src/workers/search.worker.js'), 'self.onmessage = () => {}');
      fs.writeFileSync(path.join(dist, 'sw.js'),
        'precacheAndRoute([{url:"opencoursedeck.js",revision:"A"},{url:"src/workers/search.worker.js",revision:"B"}]);');
      const reported = releaseSearchFootprint(dist);
      expect(reported.searchWorkerBytes).toBeGreaterThan(0);
      expect(reported.entryBytes).toBeGreaterThan(0);
      expect(reported.precacheFiles).toBe(2);
      expect(reported.precacheBytes).toBe(reported.searchWorkerBytes + reported.entryBytes);
    } finally {
      fs.rmSync(dist, { recursive: true, force: true });
    }
  });
});
