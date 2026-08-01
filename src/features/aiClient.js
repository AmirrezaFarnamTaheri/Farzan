const AI_SETTINGS_KEY = 'plasma-ai-settings';
const AI_SESSION_KEY = 'plasma-ai-api-key-session';
const AI_MODEL_DB = 'opencoursedeck-ai-models';
const AI_MODEL_DB_VERSION = 2;
const AI_MODEL_STORE = 'models';
const AI_EMBEDDING_STORE = 'embeddings';
const ACTIVE_MODEL_ID = 'active-local-model';
const EMBEDDING_DIMS = 64;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MODEL_DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
const MAX_MODEL_BYTES = 2 * 1024 * 1024 * 1024;

export const GEMMA_MODEL_OPTIONS = [
  {
    id: 'gemma-4-local',
    label: 'Gemma 4',
    url: 'https://ai.google.dev/gemma',
  },
  {
    id: 'gemma-3n-local',
    label: 'Gemma 3n',
    url: 'https://ai.google.dev/gemma',
  },
];

const DEFAULT_SETTINGS = {
  mode: 'hidden',
  model: 'gemma-local',
  endpoint: '',
  keyStorage: 'session',
  hasKey: false,
  approvedEndpointOrigin: '',
  localModelStatus: 'not-installed',
  localModelSource: GEMMA_MODEL_OPTIONS[0].url,
  localModelFile: null,
};

function normalizeSettings(settings = {}) {
  const mode = ['hidden', 'disabled', 'local-gemma', 'custom-api'].includes(settings.mode)
    ? settings.mode
    : DEFAULT_SETTINGS.mode;
  const localModelFile = settings.localModelFile && typeof settings.localModelFile === 'object'
    ? {
        name: String(settings.localModelFile.name || '').slice(0, 200),
        size: Math.max(0, Number(settings.localModelFile.size) || 0),
        type: String(settings.localModelFile.type || ''),
        lastModified: Math.max(0, Number(settings.localModelFile.lastModified) || 0),
        importedAt: Math.max(0, Number(settings.localModelFile.importedAt) || 0),
      }
    : null;

  return {
    ...DEFAULT_SETTINGS,
    mode,
    model: String(settings.model || DEFAULT_SETTINGS.model).trim() || DEFAULT_SETTINGS.model,
    endpoint: String(settings.endpoint || '').trim(),
    keyStorage: 'session',
    hasKey: Boolean(settings.hasKey),
    approvedEndpointOrigin: String(settings.approvedEndpointOrigin || '').trim(),
    localModelStatus: ['installed', 'imported'].includes(settings.localModelStatus)
      ? settings.localModelStatus
      : 'not-installed',
    localModelSource: String(settings.localModelSource || DEFAULT_SETTINGS.localModelSource).trim()
      || DEFAULT_SETTINGS.localModelSource,
    localModelFile,
  };
}

function plainText(value = '') {
  // DOMParser instead of innerHTML on a detached element: innerHTML still
  // triggers resource loads and inline handlers (<img onerror>), so
  // summarizing hostile note content could execute script.
  try {
    const doc = new DOMParser().parseFromString(String(value || ''), 'text/html');
    return (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
  } catch {
    return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

function splitSentences(text) {
  return plainText(text)
    .split(/(?<=[.!?])\s+/)
    .map(item => item.trim())
    .filter(item => item.length > 12);
}

function scoreSentence(sentence, frequencies) {
  return sentence
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3)
    .reduce((score, word) => score + (frequencies.get(word) || 0), 0);
}

function localSummary(text, { bullets = 3 } = {}) {
  const sentences = splitSentences(text);
  if (!sentences.length) return '';
  const frequencies = new Map();
  sentences.join(' ').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)
    .filter(word => word.length > 3)
    .forEach(word => frequencies.set(word, (frequencies.get(word) || 0) + 1));
  return sentences
    .map((sentence, index) => ({ sentence, index, score: scoreSentence(sentence, frequencies) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(1, Math.min(6, Number(bullets) || 3)))
    .sort((a, b) => a.index - b.index)
    .map(item => `- ${item.sentence}`)
    .join('\n');
}

function extractMessage(payload) {
  if (typeof payload?.text === 'string') return payload.text;
  if (typeof payload?.summary === 'string') return payload.summary;
  const content = payload?.choices?.[0]?.message?.content ?? payload?.choices?.[0]?.text;
  if (typeof content === 'string') return content.trim();
  return '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function summaryHtml(summary, sourceLabel = '') {
  const lines = String(summary || '').split('\n').map(line => line.replace(/^-\s*/, '').trim()).filter(Boolean);
  const source = sourceLabel ? `<p><strong>Source:</strong> ${escapeHtml(sourceLabel)}</p>` : '';
  return `<section data-ai-summary-block="true"><h2>AI summary</h2>${lines.map(line => `<p>${escapeHtml(line)}</p>`).join('')}${source}</section>`;
}

function embedText(text) {
  const vector = new Array(EMBEDDING_DIMS).fill(0);
  plainText(text).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)
    .filter(word => word.length > 2)
    .forEach((word) => {
      let hash = 2166136261;
      for (let i = 0; i < word.length; i += 1) hash = Math.imul(hash ^ word.charCodeAt(i), 16777619);
      vector[Math.abs(hash) % EMBEDDING_DIMS] += 1;
    });
  const norm = Math.hypot(...vector) || 1;
  return vector.map(value => Number((value / norm).toFixed(6)));
}

function cosine(a = [], b = []) {
  let score = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) score += Number(a[i] || 0) * Number(b[i] || 0);
  return score;
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  return normalized === 'localhost'
    || normalized === '::1'
    || normalized === '127.0.0.1'
    || normalized.startsWith('127.');
}

function parseSecureHttpUrl(value, root, label = 'URL') {
  const source = String(value || '').trim();
  if (!/^https?:\/\//i.test(source)) throw new TypeError(`${label} must be an absolute HTTP or HTTPS URL`);
  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    throw new TypeError(`${label} is invalid`);
  }
  if (parsed.username || parsed.password) throw new TypeError(`${label} must not contain embedded credentials`);
  if (parsed.protocol === 'http:' && !isLoopbackHostname(parsed.hostname)) {
    throw new TypeError(`${label} must use HTTPS unless it targets localhost`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new TypeError(`${label} must use HTTP or HTTPS`);
  const currentOrigin = root?.location?.origin;
  return {
    href: parsed.href,
    origin: parsed.origin,
    sameOrigin: Boolean(currentOrigin && parsed.origin === currentOrigin),
  };
}

function createTimedSignal(root, externalSignal, timeoutMs) {
  const Controller = root?.AbortController || globalThis.AbortController;
  if (typeof Controller !== 'function') {
    return { signal: externalSignal, didTimeout: () => false, cleanup() {} };
  }

  const controller = new Controller();
  let timedOut = false;
  const onAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) onAbort();
  else externalSignal?.addEventListener?.('abort', onAbort, { once: true });

  const timeout = Math.max(1, Number(timeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS);
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup() {
      clearTimeout(timer);
      externalSignal?.removeEventListener?.('abort', onAbort);
    },
  };
}

function safeFilename(source) {
  const raw = new URL(source).pathname.split('/').filter(Boolean).pop() || 'local-model.bin';
  try {
    return decodeURIComponent(raw).slice(0, 200);
  } catch {
    return raw.slice(0, 200);
  }
}

function assertModelSize(size, maxBytes = MAX_MODEL_BYTES) {
  const value = Math.max(0, Number(size) || 0);
  const limit = Math.max(1, Number(maxBytes) || MAX_MODEL_BYTES);
  if (value > limit) {
    throw new RangeError(`Model file exceeds the ${Math.round(limit / (1024 * 1024))} MB safety limit`);
  }
  return value;
}

function openModelDb(root) {
  const indexedDB = root.indexedDB;
  if (!indexedDB) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AI_MODEL_DB, AI_MODEL_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AI_MODEL_STORE)) db.createObjectStore(AI_MODEL_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(AI_EMBEDDING_STORE)) db.createObjectStore(AI_EMBEDDING_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function modelStore(root, mode, fn, storeName = AI_MODEL_STORE) {
  const db = await openModelDb(root);
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = fn(store);
    let result;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      try { db.close(); } catch {}
      reject(tx.error);
    };
  });
}

export function createAIClient(root = window) {
  let localProvider = null;

  async function getSettings() {
    const saved = await Promise.resolve(root.DB?.getSetting?.(AI_SETTINGS_KEY));
    return normalizeSettings(saved);
  }

  async function getApiKey() {
    return String(root.sessionStorage?.getItem?.(AI_SESSION_KEY) || '').trim();
  }

  async function status() {
    const settings = await getSettings();
    if (settings.mode === 'hidden') return { available: false, mode: settings.mode, reason: 'hidden', settings };
    if (settings.mode === 'disabled') return { available: false, mode: settings.mode, reason: 'disabled', settings };
    if (settings.mode === 'local-gemma') {
      return {
        available: true,
        mode: settings.mode,
        provider: localProvider ? 'registered-local-runtime' : 'private-local-extractive',
        localModelStatus: localProvider ? 'runtime-ready' : settings.localModelStatus,
        localModelSource: settings.localModelSource,
        localModelFile: settings.localModelFile,
        settings,
      };
    }

    if (!settings.endpoint) return { available: false, mode: settings.mode, reason: 'missing-endpoint', settings };
    let endpoint;
    try {
      endpoint = parseSecureHttpUrl(settings.endpoint, root, 'AI endpoint');
    } catch (error) {
      return { available: false, mode: settings.mode, reason: 'invalid-endpoint', error: error.message, settings };
    }
    const approved = endpoint.sameOrigin || settings.approvedEndpointOrigin === endpoint.origin;
    if (!approved) {
      return {
        available: false,
        mode: settings.mode,
        reason: 'unapproved-endpoint',
        endpointOrigin: endpoint.origin,
        settings,
      };
    }
    const hasKey = Boolean(await getApiKey());
    return {
      available: hasKey,
      mode: settings.mode,
      reason: hasKey ? 'ready' : 'missing-api-key',
      endpointOrigin: endpoint.origin,
      settings,
    };
  }

  function registerLocalProvider(provider) {
    if (typeof provider !== 'function') throw new TypeError('Local AI provider must be a function');
    localProvider = provider;
    root.OpenCourseDeck?.bus?.emit?.('ai:provider-ready', { provider: 'local' });
    return () => {
      if (localProvider === provider) localProvider = null;
    };
  }

  async function complete({
    prompt,
    system = '',
    messages = [],
    temperature = 0.2,
    signal,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  } = {}) {
    const current = await status();
    if (!current.available) return { ok: false, reason: current.reason, text: '' };
    if (current.mode === 'local-gemma') {
      if (localProvider) {
        const result = await localProvider({ prompt, system, messages, temperature, model: current.settings.model, signal });
        return { ok: true, mode: current.mode, provider: 'registered-local-runtime', text: String(result?.text ?? result ?? '').trim() };
      }
      return { ok: true, mode: current.mode, provider: 'private-local-extractive', text: localSummary(prompt || messages.map(item => item.content).join(' ')) };
    }

    const endpoint = parseSecureHttpUrl(current.settings.endpoint, root, 'AI endpoint');
    const key = await getApiKey();
    const timed = createTimedSignal(root, signal, timeoutMs);
    try {
      const response = await root.fetch(endpoint.href, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: timed.signal,
        body: JSON.stringify({
          model: current.settings.model,
          temperature,
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            ...messages,
            ...(prompt ? [{ role: 'user', content: prompt }] : []),
          ],
        }),
      });
      if (!response?.ok) return { ok: false, reason: `http-${response?.status || 0}`, text: '' };
      const payload = await response.json();
      return { ok: true, mode: current.mode, provider: 'custom-api', text: extractMessage(payload) };
    } catch (error) {
      if (timed.didTimeout()) return { ok: false, reason: 'request-timeout', text: '' };
      if (signal?.aborted || error?.name === 'AbortError') return { ok: false, reason: 'request-aborted', text: '' };
      return { ok: false, reason: 'network-error', text: '' };
    } finally {
      timed.cleanup();
    }
  }

  async function summarizeText(text, options = {}) {
    const current = await status();
    if (!current.available) return { ok: false, reason: current.reason, text: '' };
    if (current.mode === 'local-gemma' && !localProvider) {
      return { ok: true, mode: current.mode, provider: 'private-local-extractive', text: localSummary(text, options) };
    }
    return complete({
      system: 'Summarize the supplied learning material into concise, faithful bullets without adding facts that are not present.',
      prompt: plainText(text),
      temperature: 0.1,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
  }

  async function saveSummaryNote({ summary, title, sourceLabel, note = {} } = {}) {
    const now = Date.now();
    const record = {
      id: note.id || `ai-summary-${now}-${Math.random().toString(36).slice(2, 7)}`,
      title: title || 'AI summary',
      content: summaryHtml(summary, sourceLabel),
      tags: ['ai-summary'],
      createdAt: now,
      updatedAt: now,
      ...note,
    };
    await root.DB?.saveNote?.(record);
    return record;
  }

  async function importLocalModelFile(file, { maxBytes = MAX_MODEL_BYTES } = {}) {
    if (!file || typeof file !== 'object') throw new TypeError('Model file is required');
    const size = assertModelSize(file.size, maxBytes);
    const record = {
      id: ACTIVE_MODEL_ID,
      name: String(file.name || 'local-model').slice(0, 200),
      size,
      type: String(file.type || 'application/octet-stream'),
      lastModified: Math.max(0, Number(file.lastModified) || 0),
      importedAt: Date.now(),
      blob: file,
    };
    await modelStore(root, 'readwrite', store => store.put(record));
    return { ...record, blob: undefined };
  }

  async function downloadLocalModel(url, {
    onProgress,
    signal,
    timeoutMs = DEFAULT_MODEL_DOWNLOAD_TIMEOUT_MS,
    maxBytes = MAX_MODEL_BYTES,
  } = {}) {
    const source = parseSecureHttpUrl(url, root, 'Model download URL').href;
    const timed = createTimedSignal(root, signal, timeoutMs);
    try {
      const response = await root.fetch(source, {
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: timed.signal,
      });
      if (!response?.ok) throw new Error(`Model download failed: ${response?.status || 0}`);
      const total = Math.max(0, Number(response.headers?.get?.('content-length')) || 0);
      if (total) assertModelSize(total, maxBytes);

      let loaded = 0;
      let blob;
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        const chunks = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          loaded += value?.byteLength || 0;
          if (loaded > maxBytes) {
            await reader.cancel?.('Model exceeds safety limit');
            assertModelSize(loaded, maxBytes);
          }
          chunks.push(value);
          onProgress?.({
            loaded,
            total,
            percent: total ? Math.min(100, Math.round((loaded / total) * 100)) : 0,
          });
        }
        blob = new Blob(chunks, { type: response.headers?.get?.('content-type') || 'application/octet-stream' });
      } else {
        blob = await response.blob();
        loaded = blob.size;
        assertModelSize(loaded, maxBytes);
        onProgress?.({ loaded, total: total || loaded, percent: 100 });
      }

      const file = new File([blob], safeFilename(source), {
        type: blob.type || 'application/octet-stream',
        lastModified: Date.now(),
      });
      return importLocalModelFile(file, { maxBytes });
    } catch (error) {
      if (timed.didTimeout()) throw new Error('Model download timed out', { cause: error });
      if (signal?.aborted || error?.name === 'AbortError') throw new Error('Model download was cancelled', { cause: error });
      throw error;
    } finally {
      timed.cleanup();
    }
  }

  async function getLocalModelFile() {
    return modelStore(root, 'readonly', store => store.get(ACTIVE_MODEL_ID));
  }

  async function clearLocalModelFile() {
    await modelStore(root, 'readwrite', store => store.delete(ACTIVE_MODEL_ID));
  }

  async function upsertEmbedding({ id, text, metadata = {} } = {}) {
    const recordId = String(id || '').trim();
    if (!recordId) throw new TypeError('Embedding id is required');
    const record = {
      id: recordId,
      vector: embedText(text),
      textPreview: plainText(text).slice(0, 500),
      metadata,
      provider: 'local-hash-v1',
      updatedAt: Date.now(),
    };
    await modelStore(root, 'readwrite', store => store.put(record), AI_EMBEDDING_STORE);
    return record;
  }

  async function searchEmbeddings(query, { limit = 8 } = {}) {
    const queryVector = embedText(query);
    const records = await modelStore(root, 'readonly', store => store.getAll(), AI_EMBEDDING_STORE) || [];
    return records
      .filter(record => Array.isArray(record.vector))
      .map(record => ({ ...record, score: Number(cosine(queryVector, record.vector).toFixed(6)) }))
      .filter(record => record.score > 0)
      .sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)))
      .slice(0, Math.max(1, Number(limit) || 8));
  }

  async function clearEmbeddings() {
    const db = await openModelDb(root);
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(AI_EMBEDDING_STORE, 'readwrite');
      tx.objectStore(AI_EMBEDDING_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function generateFlashcardsFromText(text = '', { limit = 5 } = {}) {
    const sentences = splitSentences(text);
    const count = Math.max(1, Math.min(10, Number(limit) || 5));
    const cards = sentences.slice(0, count).map((sentence, idx) => {
      const parts = sentence.split(/ is | contains | represents | refers to /i);
      const front = parts[0] ? `What is ${parts[0].trim()}?` : `Key concept ${idx + 1}`;
      const back = sentence;
      return { front, back, tags: ['auto-generated'] };
    });
    return cards;
  }

  async function extractKeywords(text = '', { limit = 6 } = {}) {
    const frequencies = new Map();
    plainText(text).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)
      .filter(word => word.length > 4)
      .forEach(word => frequencies.set(word, (frequencies.get(word) || 0) + 1));
    return Array.from(frequencies.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(1, Number(limit) || 6))
      .map(([word]) => word);
  }

  return {
    getSettings,
    getApiKey,
    status,
    registerLocalProvider,
    complete,
    summarizeText,
    saveSummaryNote,
    generateFlashcardsFromText,
    extractKeywords,
    importLocalModelFile,
    downloadLocalModel,
    getLocalModelFile,
    clearLocalModelFile,
    upsertEmbedding,
    searchEmbeddings,
    clearEmbeddings,
    gemmaModelOptions: GEMMA_MODEL_OPTIONS,
    limits: {
      requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
      modelDownloadTimeoutMs: DEFAULT_MODEL_DOWNLOAD_TIMEOUT_MS,
      maxModelBytes: MAX_MODEL_BYTES,
    },
    _localSummary: localSummary,
  };
}

export function initAIClient(root = window) {
  const pd = root.OpenCourseDeck = root.OpenCourseDeck || {};
  if (!pd.AI) pd.AI = createAIClient(root);
  return pd.AI;
}
