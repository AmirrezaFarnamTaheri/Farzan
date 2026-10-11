#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const dir = __dirname;
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'edition.json'), 'utf8'));
const w = {};
vm.runInNewContext(fs.readFileSync(path.join(dir, 'catalog_data.js'), 'utf8'), { window: w }, { timeout: 5000 });
assert.equal(typeof w.FARZAN_EMBEDDED_CATALOG_GZIP_BASE64, 'string');
const packed = Buffer.from(w.FARZAN_EMBEDDED_CATALOG_GZIP_BASE64, 'base64');
assert.equal(packed.length, meta.gzipBytes);
const original = zlib.gunzipSync(packed);
assert.equal(original.length, meta.originalBytes);
assert.equal(crypto.createHash('sha256').update(original).digest('hex'), meta.sha256);
const data = JSON.parse(original);
const actual = { courses: Object.keys(data).length, sources: 0, topics: 0, videos: 0, pdfs: 0, iframes: 0, issues: 0 };
for (const course of Object.values(data)) for (const source of course.sources || []) {
  actual.sources++;
  for (const topic of source.topics || []) {
    actual.topics++;
    actual.videos += topic.videos?.length || 0;
    actual.pdfs += topic.pdfs?.length || 0;
    actual.iframes += topic.iframes?.length || 0;
    if (topic.error) actual.issues++;
  }
}
assert.deepEqual(actual, meta.counts);
// Exercise the actual parser without loading any app UI or using a network.
const { window: appWindow, document: appDocument } = {
  window: { localStorage: null }, document: { addEventListener() {} },
};
vm.runInNewContext(fs.readFileSync(path.join(dir, 'app.js'), 'utf8'), {
  window: appWindow, document: appDocument, URL,
}, { timeout: 5000 });
const normal = appWindow.FARZAN_PLAYER_DEBUG.normalizePlasmatoCatalog(data);
assert.equal(normal.stats.courses, meta.counts.courses);
assert.equal(normal.stats.sources, meta.counts.sources);
assert.equal(normal.stats.topics, meta.counts.topics);
assert.equal(normal.stats.videos, meta.counts.videos);
assert.equal(normal.stats.pdfs, meta.counts.pdfs);
const hostile = appWindow.FARZAN_PLAYER_DEBUG.normalizePlasmatoCatalog({ hostile: {
  title: 'Test', productUrl: 'javascript:alert(1)',
  sources: [{ label: 'Test', entryUrl: 'javascript:alert(2)', topics: [{
    title: 'Unsafe link', url: 'javascript:alert(3)',
    videos: ['javascript:alert(4)'], iframes: ['javascript:alert(5)'],
  }] }],
} });
assert.equal(hostile.flatResources.length, 0);
assert.equal(hostile.courses[0].productUrl, '');
assert.equal(hostile.courses[0].sources[0].entryUrl, '');
console.log('Plasmato archive verified:', meta.sha256, JSON.stringify(actual));
