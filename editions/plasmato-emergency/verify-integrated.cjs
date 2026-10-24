#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '../..');
const dataDir = path.join(root, 'data');
const pointer = JSON.parse(fs.readFileSync(path.join(dataDir, 'catalog.json'), 'utf8'));
const starter = JSON.parse(fs.readFileSync(path.join(dataDir, 'opencoursedeck-starter.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(__dirname, 'edition.json'), 'utf8'));
const archives = pointer.additionalCatalogs || [];
assert.equal(archives.length, 1, 'Plasmato is a single explicitly declared additional catalog');
assert.equal(archives[0].sha256, meta.sha256);
const compressed = fs.readFileSync(path.join(root, archives[0].path));
const original = zlib.gunzipSync(compressed);
assert.equal(crypto.createHash('sha256').update(original).digest('hex'), meta.sha256);
const courses = JSON.parse(original);
assert.equal(Object.keys(courses).length, meta.counts.courses);
assert.equal(Object.keys(starter).length, 1, 'Starter course must remain available');
for (const courseId of Object.keys(courses)) {
  assert(!Object.hasOwn(starter, courseId), 'Catalog course ID collision: ' + courseId);
}

async function load({ failure = null } = {}) {
  const observed = [];
  const bus = [];
  const fetch = async (url) => {
    observed.push(url);
    const key = String(url).replace(/^\.\//, '');
    if (key === 'data/catalog.json') {
      return new Response(JSON.stringify(pointer), { status: 200 });
    }
    if (key === pointer.currentCatalog) {
      return new Response(JSON.stringify(starter), { status: 200 });
    }
    if (key === archives[0].path) {
      if (failure === 'missing') return new Response('missing', { status: 404 });
      if (failure === 'corrupt') return new Response(Buffer.from('not-gzip'), { status: 200 });
      return new Response(compressed, { status: 200 });
    }
    throw new Error('Unexpected network request: ' + url);
  };
  const window = {
    crypto: crypto.webcrypto,
    OpenCourseDeck: { bus: { emit(type, payload) { bus.push({ type, payload }); } } },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  };
  const context = vm.createContext({
    window, document: { getElementById() { return null; } }, fetch,
    Blob, Response, DecompressionStream, TextDecoder, Uint8Array, ArrayBuffer,
    setTimeout, clearTimeout, console, crypto: crypto.webcrypto,
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'bridge.js'), 'utf8'), context, {
    filename: 'bridge.js', timeout: 3000,
  });
  await window.DataStore.init();
  return { dataStore: window.DataStore, observed, bus };
}

(async () => {
  const { dataStore: full, observed, bus } = await load();
  assert.equal(full.getState().status, 'authoritative');
  assert.equal(full.allCourses().length, meta.counts.courses + 1);
  const topics = full.allTopics();
  assert.equal(topics.length, meta.counts.topics + 3);
  assert.equal(new Set(topics.map(topic => topic.topicId)).size, topics.length, 'Topic IDs must be unique');
  assert.equal(topics.filter(topic => topic.courseId !== 'getting-started').length, meta.counts.topics);
  assert.equal(topics.filter(topic => topic.catalogIssue).length, meta.counts.issues);
  const videos = topics.reduce((total, topic) => total + topic.videos.length, 0);
  const pdfs = topics.reduce((total, topic) => total + topic.pdfs.length, 0);
  assert.equal(videos, meta.counts.videos);
  assert.equal(pdfs, meta.counts.pdfs);
  assert(topics.some(t => t.courseId === 'comprehensive-internal-medicine-course'
    && t.sourceLabel && t.topicId.startsWith('https://plasmato.net/topics/')));
  assert.deepEqual(observed, ['./data/catalog.json', './data/opencoursedeck-starter.json', './data/plasmato-2026-04-11.json.gz']);
  assert(bus.some(event => event.type === 'data:loaded'));
  full.mergeRaw({ 'local-course': {
    title: 'Local course', sources: [{ label: 'User library', topics: [{ title: 'Local topic', url: 'local-1' }] }],
  } }, { userOwned: true });
  assert(full.allTopics().some(topic => topic.topicId === 'local-1'));
  assert.equal(full.allCourses().length, meta.counts.courses + 2);
  full.mergeRaw({}, { userOwned: true });
  assert.equal(full.allCourses().length, meta.counts.courses + 1);
  for (const failure of ['missing', 'corrupt']) {
    const { dataStore: fallback, bus: events } = await load({ failure });
    assert.equal(fallback.getState().status, 'degraded');
    assert.deepEqual(Array.from(fallback.allCourses(), course => String(course.id)), ['getting-started']);
    assert.equal(fallback.allTopics().length, 3);
    assert(events.some(event => event.type === 'data:degraded'));
  }
  console.log('Integrated Farzan Plasmato catalog verified: ' + full.allCourses().length
    + ' courses, ' + topics.length + ' topics, ' + videos + ' videos, ' + pdfs
    + ' PDFs, ' + meta.counts.issues + ' flagged source errors; baseline fallback and user overlays verified.');
})().catch(error => { console.error(error); process.exitCode = 1; });
