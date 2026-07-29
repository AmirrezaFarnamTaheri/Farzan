/**
 * WaveformScrubber — AudioContext → Float32Array → canvas bars.
 * Based on Splayer WaveformScrubber pattern.
 * DPR-aware, theme-aware, cached per video ID in IndexedDB.
 */

// Dedicated database (like mediaStorage's 'opencoursedeck-media'):
// opening the main 'opencoursedeck' DB here with a different schema could
// win the creation race on a fresh profile and leave the app without its
// stores, and on normal profiles the missing 'waveforms' store made every
// cache call throw.
const CACHE_DB = 'opencoursedeck-waveforms';
const CACHE_STORE = 'waveforms';

/**
 * Ceiling on the media file size this module will download and decode to
 * build a waveform. See the fetch in render() for why the cost is high.
 */
const MAX_WAVEFORM_SOURCE_BYTES = 60 * 1024 * 1024;

function openCacheDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getCachedWaveform(id) {
  try {
    const db = await openCacheDB();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(CACHE_STORE, 'readonly');
        const req = tx.objectStore(CACHE_STORE).get(id);
        req.onsuccess = () => resolve(req.result?.data ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

async function setCachedWaveform(id, data) {
  try {
    const db = await openCacheDB();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(CACHE_STORE, 'readwrite');
        const req = tx.objectStore(CACHE_STORE).put({ id, data });
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    // Cache is optional
  }
}

/**
 * Decode audio buffer to normalized bar data.
 * @param {AudioContext} audioCtx
 * @param {ArrayBuffer} buffer
 * @param {number} barCount
 * @returns {Float32Array}
 */
function decodeToBars(audioCtx, buffer, barCount) {
  return audioCtx.decodeAudioData(buffer).then((audioBuffer) => {
    const rawData = audioBuffer.getChannelData(0);
    const blockSize = Math.floor(rawData.length / barCount);
    const bars = new Float32Array(barCount);
    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      const start = i * blockSize;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(rawData[start + j] || 0);
      }
      bars[i] = sum / blockSize;
    }
    let max = 0;
    for (let i = 0; i < bars.length; i++) {
      if (bars[i] > max) max = bars[i];
    }
    if (max > 0) {
      for (let i = 0; i < bars.length; i++) bars[i] /= max;
    }
    return bars;
  });
}

window.OpenCourseDeck = window.OpenCourseDeck ?? {};

export class WaveformScrubber {
  constructor() {
    this._cache = new Map();
    this._audioCtx = null;
  }

  _getAudioContext() {
    if (!this._audioCtx) {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this._audioCtx;
  }

  /**
   * Render waveform onto a canvas element.
   * @param {HTMLCanvasElement} canvas
   * @param {string} audioUrl
   * @param {Object} [options]
   * @param {number} [options.bars=200]
   * @param {string} [options.playedColor]
   * @param {string} [options.unplayedColor]
   * @param {string} [options.accentColor]
   * @param {number} [options.progress=0] 0-1
   * @param {string} [options.cacheId]
   * @returns {Promise<void>}
   */
  async render(canvas, audioUrl, options = {}) {
    const barCount = options.bars || 200;
    const cacheId = options.cacheId || audioUrl;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const logicalW = Math.max(1, rect.width);
    const logicalH = Math.max(1, rect.height);

    canvas.width = Math.round(logicalW * dpr);
    canvas.height = Math.round(logicalH * dpr);
    canvas.style.width = `${logicalW}px`;
    canvas.style.height = `${logicalH}px`;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, logicalW, logicalH);

    let bars = this._cache.get(cacheId);
    if (!bars) {
      bars = await getCachedWaveform(cacheId);
      if (bars) {
        bars = new Float32Array(bars);
        this._cache.set(cacheId, bars);
      }
    }

    if (!bars) {
      try {
        // Building a waveform requires the WHOLE media file: this is a second,
        // complete download on top of the streaming <audio>/<video> element,
        // followed by a full in-memory PCM decode. Refuse anything above the
        // size ceiling rather than pulling a multi-hundred-MB lecture video
        // twice and decoding it. Content-Length is checked first so an
        // oversized file is rejected before the body is buffered.
        const resp = await fetch(audioUrl);
        if (!resp.ok) return;
        const declaredLength = Number(resp.headers?.get?.('content-length'));
        if (Number.isFinite(declaredLength) && declaredLength > MAX_WAVEFORM_SOURCE_BYTES) return;
        const buffer = await resp.arrayBuffer();
        if (buffer.byteLength > MAX_WAVEFORM_SOURCE_BYTES) return;
        const audioCtx = this._getAudioContext();
        bars = await decodeToBars(audioCtx, buffer, barCount);
        this._cache.set(cacheId, bars);
        await setCachedWaveform(cacheId, Array.from(bars));
      } catch {
        return;
      }
    }

    const accent = options.accentColor || this._readAccent();
    const playedColor = options.playedColor || accent;
    const unplayedColor = options.unplayedColor || 'rgba(255,255,255,0.2)';
    const progress = Math.max(0, Math.min(1, options.progress || 0));
    const barWidth = logicalW / bars.length;
    const gap = Math.max(0.5, barWidth * 0.15);
    const drawWidth = barWidth - gap;
    const maxBarH = logicalH * 0.9;

    for (let i = 0; i < bars.length; i++) {
      const x = i * barWidth + gap / 2;
      const h = Math.max(1, bars[i] * maxBarH);
      const y = (logicalH - h) / 2;
      ctx.fillStyle = i / bars.length <= progress ? playedColor : unplayedColor;
      ctx.fillRect(x, y, drawWidth, h);
    }
  }

  /**
   * Set progress on an already-rendered canvas (fast repaint).
   * @param {HTMLCanvasElement} canvas
   * @param {string} cacheId
   * @param {number} progress 0-1
   * @param {Object} [colors]
   */
  repaintProgress(canvas, cacheId, progress, colors = {}) {
    const bars = this._cache.get(cacheId);
    if (!bars) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const logicalW = Math.max(1, rect.width);
    const logicalH = Math.max(1, rect.height);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, logicalW, logicalH);

    const accent = colors.accent || this._readAccent();
    const playedColor = colors.played || accent;
    const unplayedColor = colors.unplayed || 'rgba(255,255,255,0.2)';
    const pct = Math.max(0, Math.min(1, progress));
    const barWidth = logicalW / bars.length;
    const gap = Math.max(0.5, barWidth * 0.15);
    const drawWidth = barWidth - gap;
    const maxBarH = logicalH * 0.9;

    for (let i = 0; i < bars.length; i++) {
      const x = i * barWidth + gap / 2;
      const h = Math.max(1, bars[i] * maxBarH);
      const y = (logicalH - h) / 2;
      ctx.fillStyle = i / bars.length <= pct ? playedColor : unplayedColor;
      ctx.fillRect(x, y, drawWidth, h);
    }
  }

  _readAccent() {
    try {
      return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6366f1';
    } catch {
      return '#6366f1';
    }
  }

  destroy() {
    this._cache.clear();
    if (this._audioCtx) {
      try { this._audioCtx.close(); } catch {}
      this._audioCtx = null;
    }
  }
}

window.OpenCourseDeck.WaveformScrubber = WaveformScrubber;
