'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
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
  const { normalizeSearchQuery, rankLexicalMatches } = await import(
    pathToFileURL(path.join(ROOT, 'src/core/searchRanking.js')).href
  );
  // These are the real client-side search engines shipped with Farzan. There
  // is no registered in-app consumer of the retired classic search worker.
  const fields = ['label', 'title', 'description', 'searchText', 'category', 'tags', 'keywords', 'labels'];
  const lexicalOptions = { keys: fields, limit: 25 };
  const normalizedItems = items.map(item => ({
    ...item,
    __search: normalizeSearchQuery(fields.map(key =>
      Array.isArray(item[key]) ? item[key].join(' ') : item[key] ?? ''
    ).join(' ')),
  }));
  const buildSamples = [];
  const fuseQueries = [];
  const lexicalQueries = [];
  const queryEvidence = { fuse: [], lexical: [] };
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const start = performance.now();
    const index = new Fuse(normalizedItems, {
      keys: ['__search'], threshold: 0.35, ignoreLocation: true,
    });
    buildSamples.push(performance.now() - start);
    queries.forEach(query => {
      const fuseStart = performance.now();
      const found = index.search(normalizeSearchQuery(query), { limit: 25 });
      fuseQueries.push(performance.now() - fuseStart);
      const lexicalStart = performance.now();
      const lexical = rankLexicalMatches(items, query, lexicalOptions);
      lexicalQueries.push(performance.now() - lexicalStart);
      if (iteration === 0) {
        queryEvidence.fuse.push({ query, matches: found.length });
        queryEvidence.lexical.push({ query, matches: lexical.length });
      }
    });
  }
  return {
    documents: items.length,
    iterations, queryCount: queries.length,
    engine: 'client Fuse.js and canonical lexical ranking',
    fuseBuildMedianMs: median(buildSamples),
    fuseQueryMedianMs: median(fuseQueries),
    lexicalQueryMedianMs: median(lexicalQueries),
    queryEvidence,
  };
}

function releaseSearchFootprint(dist = path.join(ROOT, 'dist')) {
  const entry = path.join(dist, 'opencoursedeck.js');
  if (![entry, path.join(dist, 'sw.js')].every(file =>
    fs.existsSync(file) && fs.statSync(file).isFile())) {
    throw new TypeError('Missing built release entry or offline service worker');
  }
  const precache = measurePrecacheArtifacts(dist);
  return {
    entryBytes: fs.statSync(entry).size,
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
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    catalog: {
      courses: items.filter(item => item.sourceType === 'course').length,
      topics: items.filter(item => item.sourceType === 'topic').length,
    },
    costs: cost, footprint,
    scope: 'Offline reference catalog, active Fuse.js index/query and canonical lexical rank on the same immutable source rows; CI process timing is diagnostic only.',
    caveats: [
      'The command palette indexes local navigation/commands, not this course corpus; its actions are not interchangeable with search documents.',
      'Fuse.js uses fuzzy recall while lexical rank is exact/prefix/substring; quality and latency are not equivalent metrics.',
      'Offline install bytes are precached raw-file sizes, not first-visit transfer or measured user-visible latency.',
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
