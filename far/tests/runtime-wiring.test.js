import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const indexSource = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');

/**
 * Guards against the "implemented but imported by nothing" failure mode.
 *
 * Several modules were fully written, exposed on window.OpenCourseDeck, and
 * consumed behind optional chaining by their callers — but never imported by
 * src/index.js. The callers therefore took their fallback branch forever and
 * the feature was silently inert, while the roadmap recorded it as shipped.
 * Optional chaining means nothing throws, so no other test could catch it.
 */
describe('runtime wiring', () => {
  const requiredModules = [
    './features/mediaStorage.js',
    './features/aiClient.js',
    './features/translator.js',
    './features/translationCache.js',
    './features/errorBoundary.js',
    './features/offlineBanner.js',
    './features/commandPalette.js',
    './features/knowledgeGraph.js',
    './features/courseGraph.js',
    './features/canvasZoom.js',
    './core/storageSafety.js',
    './core/dataHardening.js',
    './core/endpointApprovalGuard.js',
    './core/beforeUnloadGuard.js',
    './core/storageMigrate.js',
    './core/productReadiness.js',
    './core/themeBuilder.js',
    './core/locale.js',
    './lib/workerPool.js',
    './lib/virtualScroll.js',
    './lib/timeline.js',
    './lib/timeRange.js',
    './lib/stagger.js',
    './lib/rafLoop.js',
    './lib/requestQueue.js',
    './lib/hElement.js',
    './lib/easing.js',
  ];

  it.each(requiredModules)('src/index.js imports %s', (specifier) => {
    expect(indexSource).toContain(specifier);
  });

  it('player.js media-storage integration has a provider on the namespace', async () => {
    // player.js reads window.OpenCourseDeck.MediaStorage and falls back to null.
    // The module self-registers on import, so importing it must be enough.
    const playerSource = fs.readFileSync(path.join(root, 'player.js'), 'utf8');
    expect(playerSource).toContain('window.OpenCourseDeck?.MediaStorage');

    await import('../src/features/mediaStorage.js');
    expect(typeof window.OpenCourseDeck?.MediaStorage).toBe('function');
  });

  it('MediaStorage exposes the surface player.js calls', async () => {
    const { MediaStorage } = await import('../src/features/mediaStorage.js');
    const storage = new MediaStorage();
    try {
      for (const method of ['get', 'set', 'flush', 'destroy']) {
        expect(typeof storage[method]).toBe('function');
      }
    } finally {
      storage.destroy();
    }
  });

  it('waveformScrubber stays out of the bundle until its double-download is solved', () => {
    // Deliberate: render() fetches and PCM-decodes the entire media file, a
    // second full download on top of the streaming element. If you wire it in,
    // delete this assertion and record the reason in ROADMAP 3.6.
    expect(indexSource).not.toContain('waveformScrubber');
  });

  it('caps the media size waveformScrubber will download and decode', () => {
    const source = fs.readFileSync(path.join(root, 'src/features/waveformScrubber.js'), 'utf8');
    expect(source).toContain('MAX_WAVEFORM_SOURCE_BYTES');
    expect(source).toMatch(/content-length/i);
  });
});
