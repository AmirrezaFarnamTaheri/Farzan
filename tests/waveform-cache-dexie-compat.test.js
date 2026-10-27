import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const DB = 'opencoursedeck-waveforms';
let waveforms;
let scrubber;

function seedRawV1(records) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('waveforms', { keyPath: 'id' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('waveforms', 'readwrite');
      for (const record of records) tx.objectStore('waveforms').put(record);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}

function inspectRaw(id) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('waveforms', 'readonly');
      const store = tx.objectStore('waveforms');
      const schema = { version: db.version, keyPath: store.keyPath, indexes: [...store.indexNames] };
      const get = store.get(id);
      get.onerror = () => { db.close(); reject(get.error); };
      get.onsuccess = () => { db.close(); resolve({ schema, record: get.result ?? null }); };
    };
  });
}

function canvasFixture() {
  const canvas = document.createElement('canvas');
  const context = {
    setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(),
  };
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ width: 160, height: 40 });
  vi.spyOn(canvas, 'getContext').mockReturnValue(context);
  return { canvas, context };
}

describe('Dexie waveform cache compatibility with native IndexedDB v1', () => {
  beforeEach(async () => {
    vi.resetModules();
    window.OpenCourseDeck = {};
    await Dexie.delete(DB);
    waveforms = await import('../src/features/waveformScrubber.js');
    scrubber = new waveforms.WaveformScrubber();
  });
  afterEach(async () => {
    scrubber?.destroy();
    waveforms?.closeWaveformCache?.();
    await Dexie.delete(DB);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders pre-existing raw-v1 waveform bars without redownloading media', async () => {
    await seedRawV1([{ id: 'lesson-legacy', data: [0.2, 0.7, 1, 0.4] }]);
    const fetching = vi.fn();
    vi.stubGlobal('fetch', fetching);
    const { canvas, context } = canvasFixture();
    await scrubber.render(canvas, 'https://example.org/lesson.mp3', {
      cacheId: 'lesson-legacy', bars: 4, accentColor: '#000',
    });
    expect(context.fillRect).toHaveBeenCalledTimes(4);
    expect(fetching).not.toHaveBeenCalled();
    expect((await inspectRaw('lesson-legacy')).schema).toEqual({
      version: 1, keyPath: 'id', indexes: [],
    });
  });

  it('stores decoded waveform bars in the original database and key', async () => {
    const decodeAudioData = vi.fn(async () => ({
      getChannelData: () => new Float32Array([0.1, 0.3, 0.5, 0.7]),
    }));
    window.AudioContext = class {
      decodeAudioData = decodeAudioData;
      close() { return Promise.resolve(); }
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      headers: { get: () => '4' },
      arrayBuffer: async () => new ArrayBuffer(4),
    })));
    const { canvas, context } = canvasFixture();
    await scrubber.render(canvas, 'https://example.org/fresh.wav', {
      cacheId: 'lesson-new', bars: 4, accentColor: '#000',
    });
    expect(decodeAudioData).toHaveBeenCalledOnce();
    expect(context.fillRect).toHaveBeenCalledTimes(4);
    const saved = await inspectRaw('lesson-new');
    expect(saved.schema).toEqual({ version: 1, keyPath: 'id', indexes: [] });
    expect(saved.record.data).toHaveLength(4);
    expect(saved.record.data[3]).toBeCloseTo(1);
    delete window.AudioContext;
  });
});
