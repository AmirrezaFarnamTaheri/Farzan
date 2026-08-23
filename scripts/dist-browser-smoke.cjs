'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const RESULT_ID = 'opencoursedeck-dist-smoke-result';
const RESULT_PATH = '/__smoke_result__';

function mimeType(file) {
  const extension = path.extname(file).toLowerCase();
  return {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json',
    '.woff2': 'font/woff2',
  }[extension] || 'application/octet-stream';
}

function makePdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'binary'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body, 'binary');
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  offsets.slice(1).forEach(offset => {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  body += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, 'binary');
}

function smokeModule() {
  return `
const result = document.createElement('pre');
const resultEndpoint = ${JSON.stringify(RESULT_PATH)};
result.id = ${JSON.stringify(RESULT_ID)};
result.dataset.status = 'running';
result.textContent = 'production distribution smoke running';
document.body.append(result);

const timeout = (promise, label, ms = 12000) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' timed out')), ms)),
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function report(status, detail) {
  await fetch(resultEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ status, detail }),
  });
}

function waitFor(predicate, label, ms = 12000) {
  return timeout(new Promise((resolve) => {
    const tick = () => {
      if (predicate()) return resolve(predicate());
      setTimeout(tick, 25);
    };
    tick();
  }), label, ms);
}

function openDatabase(name) {
  return new Promise((resolve, reject) => {
    let oldVersion = null;
    const request = indexedDB.open(name);
    request.onupgradeneeded = event => {
      oldVersion = event.oldVersion;
      if (!request.result.objectStoreNames.contains('smoke')) {
        request.result.createObjectStore('smoke');
      }
    };
    request.onerror = () => reject(request.error || new Error('open failed: ' + name));
    request.onblocked = () => reject(new Error('open blocked: ' + name));
    request.onsuccess = () => resolve({ db: request.result, oldVersion });
  });
}

function putSmoke(db, value) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('smoke', 'readwrite');
    transaction.objectStore('smoke').put(value, 'value');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('write failed'));
    transaction.onabort = () => reject(transaction.error || new Error('write aborted'));
  });
}

function deleteDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('delete failed: ' + name));
    request.onblocked = () => reject(new Error('delete blocked: ' + name));
  });
}

function workerRequest(worker, type, data, id) {
  return timeout(new Promise((resolve, reject) => {
    const onMessage = event => {
      if (event.data?.id !== id) return;
      worker.removeEventListener('message', onMessage);
      resolve(event.data);
    };
    const onError = event => {
      worker.removeEventListener('message', onMessage);
      reject(new Error(event.message || 'worker crashed'));
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError, { once: true });
    worker.postMessage({
      type,
      id,
      requestId: id,
      generation: 0,
      resource: 'dist-smoke',
      revision: 1,
      authority: null,
      data,
    });
  }), 'worker request ' + type);
}

async function run() {
  const indexResponse = await fetch('/index.html', { cache: 'no-store' });
  invariant(indexResponse.ok, 'served dist index.html was unavailable');
  invariant((await indexResponse.text()).includes('opencoursedeck'), 'served index did not reference the production bundle');

  await waitFor(() => window.OpenCourseDeck?.workers && window.OpenCourseDeck?.loadFeature && window.DB, 'application bundle');
  const pd = window.OpenCourseDeck;

  invariant('serviceWorker' in navigator, 'service workers are unavailable');
  const registration = await timeout(navigator.serviceWorker.register('/sw.js'), 'service worker registration');
  await timeout(navigator.serviceWorker.ready, 'service worker activation');
  invariant(Boolean(registration.active || registration.waiting || registration.installing), 'service worker has no lifecycle state');

  const catalog = new Worker(pd.workers.catalog, { type: 'classic' });
  const notReady = await workerRequest(catalog, 'search', { query: 'anything' }, 1);
  invariant(notReady.type === 'error' && notReady.code === 'WORKER_NOT_READY' && notReady.catalogState === 'uninitialized', 'catalog worker did not report uninitialized state');
  const parsed = await workerRequest(catalog, 'parse', { catalogJson: {} }, 2);
  invariant(parsed.type === 'parse:done' && parsed.catalogState === 'ready' && parsed.empty === true, 'empty catalog was not represented as a ready empty result');
  const emptySearch = await workerRequest(catalog, 'search', { query: 'anything' }, 3);
  invariant(emptySearch.type === 'search:done' && emptySearch.empty === true && emptySearch.catalogState === 'ready', 'ready empty catalog search was ambiguous');
  catalog.terminate();

  const search = new Worker(pd.workers.search, { type: 'classic' });
  const searchInit = await workerRequest(search, 'init', { items: [] }, 4);
  invariant(searchInit.type === 'init:done' && searchInit.itemCount === 0, 'search worker failed to initialise from the production asset');
  const searchEmpty = await workerRequest(search, 'search', { query: 'missing' }, 5);
  invariant(searchEmpty.type === 'search:done' && Array.isArray(searchEmpty.results) && searchEmpty.results.length === 0, 'search worker empty result failed');
  search.terminate();

  const primaryName = 'opencoursedeck-dist-smoke-primary';
  const primary = await openDatabase(primaryName);
  await putSmoke(primary.db, { persisted: true });
  primary.db.close();
  await deleteDatabase(primaryName);

  await import('/pdf-runtime.js');
  await waitFor(() => window.pdfjsLib?.getDocument, 'PDF runtime');
  const pdfResponse = await fetch('/__smoke__.pdf');
  invariant(pdfResponse.ok, 'smoke PDF was unavailable');
  const pdfTask = window.pdfjsLib.getDocument({ data: new Uint8Array(await pdfResponse.arrayBuffer()) });
  const pdf = await timeout(pdfTask.promise, 'PDF parse');
  invariant(pdf.numPages === 1, 'PDF runtime did not parse the one-page document');
  await pdf.destroy();

  await timeout(pd.loadFeature('player'), 'player feature load');
  invariant(typeof pd.MediaStorage === 'function', 'MediaStorage was not exposed by the production player feature');
  const media = new pd.MediaStorage();
  await media.set('dist-smoke-media', 'volume', 0.42);
  const mediaFlush = await media.flush();
  invariant(mediaFlush?.committed === true && mediaFlush?.durable === true, 'media state did not durably commit');
  const mediaDestroy = await media.destroy();
  invariant(mediaDestroy?.committed === true, 'media storage destroy did not return a committed final receipt');

  const auxiliaryNames = [...(pd.StorageSafety?.auxiliaryDatabases || [])];
  invariant(auxiliaryNames.length >= 5, 'auxiliary database registry was incomplete');
  for (const name of auxiliaryNames) {
    const opened = await openDatabase(name);
    if (opened.db.objectStoreNames.contains('smoke')) await putSmoke(opened.db, { name });
  }
  const wipe = await window.DB.clearAll();
  invariant(wipe?.committed === true && wipe?.durable === true, 'full wipe did not return a durable committed receipt');
  invariant(Array.isArray(wipe.cleared) && auxiliaryNames.every(name => wipe.cleared.includes(name)), 'full wipe receipt omitted auxiliary databases');
  for (const name of auxiliaryNames) {
    const reopened = await openDatabase(name);
    invariant(reopened.oldVersion === 0, 'auxiliary database survived full wipe: ' + name);
    reopened.db.close();
    await deleteDatabase(name);
  }

  const detail = {
    serviceWorker: true,
    workers: true,
    indexedDB: true,
    pdf: true,
    media: true,
    fullWipe: true,
  };
  result.dataset.status = 'passed';
  result.textContent = JSON.stringify(detail);
  try {
    await report('passed', detail);
  } catch (reportError) {
    console.error('[dist-browser-smoke] result report failed', reportError);
  }
}

run().catch(async error => {
  console.error('[dist-browser-smoke]', error);
  const detail = error?.stack || error?.message || String(error);
  result.dataset.status = 'failed';
  result.textContent = detail;
  try {
    await report('failed', detail);
  } catch (reportError) {
    console.error('[dist-browser-smoke] result report failed', reportError);
  }
});
`;
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
  ].filter(Boolean);
  for (const candidate of candidates) {
    // Absolute CHROME_BIN values (common on Windows dev boxes) are honored
    // directly; PATH lookup stays for POSIX environments.
    if (path.isAbsolute(candidate) && fs.existsSync(candidate)) return candidate;
    const result = childProcess.spawnSync('sh', ['-lc', `command -v ${JSON.stringify(candidate)}`], { encoding: 'utf8' });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  throw new Error(`No supported Chrome/Chromium executable found (${candidates.join(', ')})`);
}

async function removeProfileDirectory(directory, {
  rm = fs.promises.rm.bind(fs.promises),
  wait = delay => new Promise(resolve => setTimeout(resolve, delay)),
  terminate = terminateProfileProcesses,
  attempts = 12,
  retryDelayMs = 250,
} = {}) {
  terminate(directory);
  const retryableCodes = new Set(['EBUSY', 'ENOTEMPTY', 'EPERM']);
  const boundedAttempts = Math.max(1, Number(attempts) || 1);
  for (let attempt = 1; attempt <= boundedAttempts; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!retryableCodes.has(error?.code) || attempt === boundedAttempts) throw error;
      await wait(Math.max(0, Number(retryDelayMs) || 0) * attempt);
    }
  }
}

function terminateProfileProcesses(directory, spawnSync = childProcess.spawnSync) {
  if (process.platform !== 'linux') return;
  const marker = `--user-data-dir=${directory}`;
  for (const signal of ['TERM', 'KILL']) {
    spawnSync('pkill', [`-${signal}`, '-f', marker], {
      stdio: 'ignore',
      timeout: 5000,
    });
  }
}


async function stopChildProcess(child, {
  wait = delay => new Promise(resolve => setTimeout(resolve, delay)),
  graceMs = 2000,
} = {}) {
  if (!child || child.exitCode != null || child.signalCode) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  const graceful = await Promise.race([
    exited.then(() => true),
    wait(graceMs).then(() => false),
  ]);
  if (graceful || child.exitCode != null) return;
  child.kill('SIGKILL');
  await Promise.race([exited, wait(graceMs)]);
}

async function runChromeUntilResult(chrome, args, resultPromise, {
  spawn = childProcess.spawn,
  timeoutMs = 60000,
  stop = stopChildProcess,
} = {}) {
  const child = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout?.setEncoding?.('utf8');
  child.stderr?.setEncoding?.('utf8');
  child.stdout?.on?.('data', chunk => { stdout += chunk; });
  child.stderr?.on?.('data', chunk => { stderr += chunk; });

  const exit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ type: 'exit', code, signal })));
  const spawnError = new Promise(resolve => child.once('error', error => resolve({ type: 'spawn-error', error })));
  let timeoutHandle;
  const timeout = new Promise(resolve => {
    timeoutHandle = setTimeout(() => resolve({ type: 'timeout' }), timeoutMs);
  });
  const reported = Promise.resolve(resultPromise).then(
    value => ({ type: 'result', value }),
    error => ({ type: 'result-error', error }),
  );

  const outcome = await Promise.race([reported, exit, spawnError, timeout]);
  clearTimeout(timeoutHandle);

  if (outcome.type === 'result') {
    await stop(child);
    return { result: outcome.value, stdout, stderr };
  }

  await stop(child);
  const output = `${stdout}\n${stderr}`.slice(-12000);
  if (outcome.type === 'spawn-error' || outcome.type === 'result-error') throw outcome.error;
  if (outcome.type === 'timeout') {
    throw new Error(`Production browser smoke timed out after ${timeoutMs} ms.\n${output}`);
  }
  throw new Error(`Production browser exited before reporting a result (code ${outcome.code}, signal ${outcome.signal || 'none'}).\n${output}`);
}

function readJsonBody(request, { limit = 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (body.length > limit) reject(new Error('Browser smoke result exceeded the size limit'));
    });
    request.once('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (error) {
        reject(new Error(`Invalid browser smoke result: ${error.message}`));
      }
    });
    request.once('error', reject);
  });
}

function safeDistPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const resolved = path.resolve(DIST, relative);
  const relation = path.relative(DIST, resolved);
  if (relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) return null;
  return resolved;
}

async function main() {
  assert.ok(fs.existsSync(path.join(DIST, 'index.html')), 'dist/index.html is missing; run build:release first');
  assert.ok(fs.existsSync(path.join(DIST, 'sw.js')), 'dist/sw.js is missing; run build:release first');
  assert.ok(fs.existsSync(path.join(DIST, 'opencoursedeck.js')), 'dist/opencoursedeck.js is missing; run build:release first');

  const index = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const harnessHtml = index.replace(/<\/body>/i, `<script type="module" src="/__smoke__.mjs"></script></body>`);
  const pdf = makePdf();
  let scenarioSettled = false;
  let settleScenario;
  const scenarioResult = new Promise(resolve => { settleScenario = resolve; });
  const recordScenario = payload => {
    if (scenarioSettled) return;
    scenarioSettled = true;
    settleScenario(payload);
  };
  const server = http.createServer((request, response) => {
    try {
      if (request.url === RESULT_PATH && request.method === 'POST') {
        readJsonBody(request).then(payload => {
          recordScenario(payload);
          response.writeHead(204, { 'cache-control': 'no-store' });
          response.end();
        }).catch(error => {
          recordScenario({ status: 'failed', detail: error.message });
          response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
          response.end(error.message);
        });
        return;
      }
      if (request.url === '/__smoke__.mjs') {
        response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
        response.end(smokeModule());
        return;
      }
      if (request.url === '/__smoke__.pdf') {
        response.writeHead(200, { 'content-type': 'application/pdf', 'content-length': pdf.length, 'cache-control': 'no-store' });
        response.end(pdf);
        return;
      }
      if (request.url === '/__smoke__.html') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        response.end(harnessHtml);
        return;
      }
      const file = safeDistPath(request.url || '/');
      if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }
      response.writeHead(200, { 'content-type': mimeType(file), 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(response);
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(error?.stack || String(error));
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'opencoursedeck-chrome-'));
  try {
    const chrome = findChrome();
    const target = `http://127.0.0.1:${address.port}/__smoke__.html`;
    const execution = await runChromeUntilResult(chrome, [
      '--headless=new',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-gpu',
      '--disable-sync',
      '--no-first-run',
      '--no-sandbox',
      `--user-data-dir=${userData}`,
      target,
    ], scenarioResult);
    if (execution.result?.status !== 'passed') {
      const detail = typeof execution.result?.detail === 'string'
        ? execution.result.detail
        : JSON.stringify(execution.result?.detail || execution.result || {});
      const output = `${execution.stdout || ''}\n${execution.stderr || ''}`.slice(-12000);
      throw new Error(`Production browser smoke reported failure.\n${detail}\n${output}`);
    }
    console.log('[dist-browser-smoke] OK — served dist validated service worker, workers, IndexedDB, PDF, media, and full wipe lifecycle.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await removeProfileDirectory(userData);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('[dist-browser-smoke] FAIL:', error?.stack || error);
    process.exit(1);
  });
}

module.exports = { main, makePdf, readJsonBody, removeProfileDirectory, runChromeUntilResult, stopChildProcess, terminateProfileProcesses };
