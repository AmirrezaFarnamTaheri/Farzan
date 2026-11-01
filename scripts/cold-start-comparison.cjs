'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MARKER = '[dist-browser-smoke] cold-shell resource timing ';
const REQUIRED_SCOPE = 'first-visit same-origin JavaScript/CSS resource timing at app-shell readiness (excludes later precache/worker network)';

function assertSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.scope !== REQUIRED_SCOPE
      || !Number.isFinite(value.observedAtMs) || value.observedAtMs <= 0
      || !Number.isInteger(value.resourceCount) || value.resourceCount < 1
      || !Array.isArray(value.resourcePaths)
      || value.resourcePaths.length !== value.resourceCount
      || value.resourcePaths.some(item => typeof item !== 'string' || !item.startsWith('/'))
      || !Number.isFinite(value.transferSizeBytes) || value.transferSizeBytes < 0
      || !Number.isFinite(value.encodedBodyBytes) || value.encodedBodyBytes < 0
      || !Number.isInteger(value.missingTransferSizes) || value.missingTransferSizes < 0
      || value.missingTransferSizes > value.resourceCount) {
    throw new TypeError('Invalid cold-shell resource timing snapshot');
  }
  return value;
}

function parseColdShellLog(log) {
  const lines = String(log).split(/\r?\n/);
  const snapshots = lines.filter(line => line.startsWith(MARKER));
  if (snapshots.length !== 1) throw new Error('Expected exactly one cold-shell resource timing sample');
  let parsed;
  try { parsed = JSON.parse(snapshots[0].slice(MARKER.length)); }
  catch { throw new Error('Malformed cold-shell resource timing JSON'); }
  return assertSnapshot(parsed);
}

const median = values => {
  const ordered = [...values].sort((a, b) => a - b);
  const mid = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[mid] : (ordered[mid - 1] + ordered[mid]) / 2;
};

function compareColdShellSnapshots({ baseline, current, baselineRef = 'baseline', currentRef = 'current' }) {
  if (!Array.isArray(baseline) || !Array.isArray(current) || baseline.length < 1 || current.length < 1) {
    throw new TypeError('Cold-start comparison requires both baseline and current first-visit samples');
  }
  const previous = baseline.map(assertSnapshot);
  const next = current.map(assertSnapshot);
  const scopes = new Set([...previous, ...next].map(row => row.scope));
  if (scopes.size !== 1) throw new TypeError('Mismatched cold-shell resource timing scope');
  const all = [...previous, ...next];
  const transferComplete = all.every(row => row.transferSizeBytes > 0 && row.missingTransferSizes === 0);
  const readiness = field => {
    const baselineMedian = median(previous.map(row => row[field]));
    const currentMedian = median(next.map(row => row[field]));
    return { baselineMedian, currentMedian, deltaMs: currentMedian - baselineMedian };
  };
  let transferSizeBytes = null;
  if (transferComplete) {
    const baselineMedian = median(previous.map(row => row.transferSizeBytes));
    const currentMedian = median(next.map(row => row.transferSizeBytes));
    transferSizeBytes = { baselineMedian, currentMedian, deltaBytes: currentMedian - baselineMedian };
  }
  const caveats = [
    'CI first-visit measurements on one runner are not real-user performance or a network-controlled transfer guarantee.',
    'Only same-origin JavaScript/CSS resources at app-shell readiness are included; worker fetches and Workbox precache install are excluded.',
    'Time observations are wall-clock measurements influenced by CI scheduling, CPU, cache and network variability.',
  ];
  if (!transferComplete) caveats.push('One or more transfer timings are missing; do not report a transfer-byte reduction.');
  return {
    baselineRef, currentRef, scope: REQUIRED_SCOPE,
    samples: { baseline: previous.length, current: next.length },
    shellReadinessMs: readiness('observedAtMs'),
    transferSizeBytes,
    resourceCount: {
      baselineMedian: median(previous.map(row => row.resourceCount)),
      currentMedian: median(next.map(row => row.resourceCount)),
    },
    caveats,
  };
}

function main({ baselineDist = process.argv[2], currentDist = process.argv[3], iterations = 3 } = {}) {
  if (!baselineDist || !currentDist) {
    throw new Error('Usage: node scripts/cold-start-comparison.cjs <baseline-dist> <current-dist>');
  }
  const roots = [path.resolve(baselineDist), path.resolve(currentDist)];
  for (const root of roots) {
    if (!fs.existsSync(path.join(root, 'opencoursedeck.js'))
      || !fs.existsSync(path.join(root, 'index.html'))) {
      throw new Error('Missing production dist for cold-shell comparison: ' + root);
    }
  }
  const samples = { baseline: [], current: [] };
  for (let i = 0; i < iterations; i += 1) {
    // Alternate the build order on every pair to limit warm CPU and runner
    // scheduling effects. Every Chrome invocation still gets a fresh profile.
    const order = i % 2 ? ['current', 'baseline'] : ['baseline', 'current'];
    for (const label of order) {
      const root = roots[label === 'baseline' ? 0 : 1];
      const stdout = childProcess.execFileSync(process.execPath, [
        path.join(__dirname, 'dist-browser-smoke.cjs'),
      ], {
        cwd: ROOT,
        env: { ...process.env, FARZAN_DIST_ROOT: root, FARZAN_COLD_ONLY: '1' },
        encoding: 'utf8',
        maxBuffer: 2 * 1024 * 1024,
        timeout: 90000,
      });
      const snapshot = parseColdShellLog(stdout);
      samples[label].push(snapshot);
      process.stderr.write('[cold-start] ' + label + ' sample ' + (i + 1) +
        ': ' + snapshot.observedAtMs + ' ms, ' + snapshot.transferSizeBytes + ' transfer B\n');
    }
  }
  const result = compareColdShellSnapshots({
    ...samples,
    baselineRef: process.env.FARZAN_BASELINE_REF || 'd8a4ca3bb7b397816fb29cacfe0ac3b86833ab96',
    currentRef: process.env.GITHUB_SHA || 'working-tree',
  });
  const reportPath = path.join(ROOT, 'reports', 'ci', 'controlled-cold-start.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ ...result, rawSamples: samples }, null, 2) + '\n');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return result;
}

if (require.main === module) {
  try { main(); }
  catch (error) { console.error('[cold-start] FAILED', error?.stack || String(error)); process.exitCode = 1; }
}

module.exports = { parseColdShellLog, compareColdShellSnapshots, main };
