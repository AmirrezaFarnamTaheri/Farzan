'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { performance } = require('node:perf_hooks');
const Fuse = require('fuse.js');
const { measurePrecacheArtifacts } = require('./bundle-report.cjs');

const ROOT = path.resolve(__dirname, '..');
const median = samples => {
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function readCatalogDocuments(root = ROOT) {
  const data = path.join(root, 'data');
  const pointer = JSON.parse(fs.readFileSync(path.join(data, 'catalog.json'), 'utf8'));
  const catalogName = String(pointer.currentCatalog || 'data/opencoursedeck-starter.json');
  if (!/^data\/[A-Za-z0-9._-]+\.json$/.test(catalogName)) {
    throw new TypeError('Untrusted canonical catalog pointer');
  }
  const raw = JSON.parse(fs.readFileSync(path.join(root, catalogName), 'utf8'));
  const merged = { ...raw };
  for (const spec of pointer.additionalCatalogs || []) {
    if (!spec || !/^data\/[A-Za-z0-9._-]+\.json\.gz$/.test(spec.path || '')
        || !/^[a-f0-9]{64}$/i.test(spec.sha256 || '') || spec.compression !== 'gzip') {
      throw new TypeError('Unverified catalog archive descriptor');
    }
    const decompressed = zlib.gunzipSync(fs.readFileSync(path.join(root, spec.path)));
    const hash = crypto.createHash('sha256').update(decompressed).digest('hex');
    if (hash.toLowerCase() !== spec.sha256.toLowerCase()) {
      throw new TypeError('Search source catalog checksum mismatch');
    }
    const edition = JSON.parse(decompressed.toString('utf8'));
    for (const [courseId, course] of Object.entries(edition)) {
      if (Object.hasOwn(merged, courseId)) throw new TypeError('Duplicate course ID in search corpus');
      merged[courseId] = course;
    }
  }

  const rows = [];
  const seen = new Set();
  const append = row => {
    const identity = row.sourceType + ':' + row.sourceId;
    if (seen.has(identity)) throw new TypeError('Duplicate canonical search identity: ' + identity);
    seen.add(identity);
    rows.push(row);
  };
  for (const [courseId, course] of Object.entries(merged)) {
    const courseTitle = String(course?.title || courseId);
    append({
      sourceType: 'course', sourceId: courseId,
      label: courseTitle, title: courseTitle, category: 'Course',
      searchText: courseId.replace(/[-_]+/g, ' '),
    });
    const sources = [...(Array.isArray(course?.sources) ? course.sources : [])];
    if (Array.isArray(course?.topics)) {
      sources.push({ label: 'Direct Topics', topics: course.topics });
    }
    sources.forEach((source, sourceIndex) => {
      const sourceLabel = String(source?.label || 'Source ' + (sourceIndex + 1));
      (Array.isArray(source?.topics) ? source.topics : []).forEach((topic, topicIndex) => {
        const topicId = String(topic?.url || `${courseId}-${sourceIndex}-${topicIndex}`);
        append({
          sourceType: 'topic', sourceId: `${courseId}:${topicId}`,
          label: String(topic?.title || topic?.url || 'Untitled topic'),
          category: Array.isArray(topic?.pdfs) && topic.pdfs.length ? 'PDF topic'
            : Array.isArray(topic?.videos) && topic.videos.length ? 'Video topic' : 'Topic',
          courseTitle, sourceLabel, description: sourceLabel,
          searchText: [courseId.replace(/[-_]+/g, ' '), courseTitle, sourceLabel].join(' '),
          tags: Array.isArray(topic?.tags) ? topic.tags : [],
          keywords: Array.isArray(topic?.keywords) ? topic.keywords : [],
          labels: Array.isArray(topic?.labels) ? topic.labels : [],
        });
      });
    });
  }
  return rows;
}

async function measureSearchIndex(items, { iterations = 3,
  queries = ['فیزیک', 'cardiology', 'lecture'] } = {}) {
  if (!Array.isArray(items) || !items.length) throw new TypeError('Search benchmark requires a real corpus');
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10) {
    throw new RangeError('Search benchmark requires 1 to 10 iterations');
  }
  if (!Array.isArray(queries) || !queries.length || queries.some(query => typeof query !== 'string')) {
    throw new TypeError('Search benchmark needs literal test queries');
  }
  const { rankLexicalMatches } = await import('../src/core/searchRanking.js');
  const script = fs.readFileSync(path.join(ROOT, 'src/workers/search.worker.js'), 'utf8');
  const buildSamples = [];
  const workerQueries = [];
  const lexicalQueries = [];
  const queryEvidence = { worker: [], lexical: [] };
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sent = [];
    const self = { postMessage: value => sent.push(value) };
    vm.runInNewContext(script, {
      self, Fuse, importScripts() {}, Date, console,
    }, { filename: 'search.worker.js', timeout: 10000 });
    const request = (type, data, id) => {
      sent.length = 0;
      self.onmessage({
        data: {
          type, id, requestId: id, generation: 0,
          resource: 'search-index-acceptance', revision: 1, authority: null, data,
        },
      });
      if (sent.length !== 1 || sent[0].type === 'error') {
        throw new Error('Unexpected indexed worker protocol receipt: ' + JSON.stringify(sent[0]));
      }
      return sent[0];
    };
    const start = performance.now();
    const init = request('init', { items }, 1);
    buildSamples.push(performance.now() - start);
    if (init.type !== 'init:done' || init.itemCount !== items.length) {
      throw new Error('Worker index build lost canonical catalog rows');
    }
    queries.forEach((query, index) => {
      const workerStart = performance.now();
      const searched = request('search', { query, options: { limit: 25 } }, index + 2);
      workerQueries.push(performance.now() - workerStart);
      if (searched.type !== 'search:done' || !Array.isArray(searched.results)) {
        throw new Error('Worker query did not honor the shipping message protocol');
      }
      const lexicalStart = performance.now();
      const lexical = rankLexicalMatches(items, query, {
        keys: ['label', 'title', 'description', 'searchText', 'category', 'tags', 'keywords', 'labels'],
        limit: 25,
      });
      lexicalQueries.push(performance.now() - lexicalStart);
      if (iteration === 0) {
        queryEvidence.worker.push({ query, matches: searched.results.length });
        queryEvidence.lexical.push({ query, matches: lexical.length });
      }
    });
  }
  return {
    documents: items.length,
    iterations, queryCount: queries.length,
    worker: { initType: 'init:done', searchType: 'search:done', vendor: 'local Fuse.js' },
    workerBuildMedianMs: median(buildSamples),
    workerQueryMedianMs: median(workerQueries),
    lexicalQueryMedianMs: median(lexicalQueries),
    queryEvidence,
  };
}

function releaseSearchFootprint(dist = path.join(ROOT, 'dist')) {
  const entry = path.join(dist, 'opencoursedeck.js');
  const worker = path.join(dist, 'src/workers/search.worker.js');
  if (![entry, worker, path.join(dist, 'sw.js')].every(file =>
    fs.existsSync(file) && fs.statSync(file).isFile())) {
    throw new TypeError('Missing built release entry, search worker or offline service worker');
  }
  const precache = measurePrecacheArtifacts(dist);
  return {
    entryBytes: fs.statSync(entry).size,
    searchWorkerBytes: fs.statSync(worker).size,
    precacheFiles: precache.count,
    precacheBytes: precache.totalBytes,
    precacheJsBytes: precache.jsBytes,
  };
}

async function main() {
  const items = readCatalogDocuments();
  const cost = await measureSearchIndex(items);
  const footprint = releaseSearchFootprint();
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    catalog: {
      courses: items.filter(item => item.sourceType === 'course').length,
      topics: items.filter(item => item.sourceType === 'topic').length,
    },
    costs: cost, footprint,
    scope: 'Offline reference catalog, worker Fuse build/query and main-thread lexical rank on the same immutable source rows; CI process timing is diagnostic only.',
    caveats: [
      'The command palette indexes local navigation/commands, not this course corpus; its actions are not interchangeable with search documents.',
      'Worker search has fuzzy recall while lexical rank is deliberately exact/prefix/substring and metadata-token only; timings are not equivalent quality scores.',
      'Offline install bytes are precached raw-file sizes, not first-visit transfer or measured user-visible latency.',
      'Public worker compatibility and its message protocol are retained even without an in-app callsite.',
    ],
  };
  const target = path.join(ROOT, 'reports/ci/search-index-acceptance.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
  console.log('[search-index] acceptance evidence ' + JSON.stringify(report));
  return report;
}

if (require.main === module) {
  main().catch(error => { console.error('[search-index] FAIL', error); process.exitCode = 1; });
}

module.exports = { readCatalogDocuments, measureSearchIndex, releaseSearchFootprint, main };
