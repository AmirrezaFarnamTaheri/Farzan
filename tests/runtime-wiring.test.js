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
    './core/bridgeHardening.js',
    './core/pdfIdentityHardening.js',
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

  it('defers translation and note-template utilities until the app shell resolves', () => {
    const appImport = indexSource.indexOf("import('../app.js')");
    for (const specifier of ['./features/translator.js', './features/translationCache.js', './features/noteTemplates.js']) {
      expect(indexSource).toContain(`import('${specifier}')`);
      expect(indexSource).not.toMatch(new RegExp(`from ["']${specifier.replaceAll('.', '\\.')}["']`));
      expect(indexSource.indexOf(`import('${specifier}')`)).toBeGreaterThan(appImport);
    }
    expect(indexSource).toContain('const cacheApi = translationCache.translationCache || translationCache');
    expect(indexSource).toContain('const templateApi = noteTemplates.NoteTemplates || window.OpenCourseDeck.NoteTemplates');
    expect(indexSource).toContain('TranslationCache: cacheApi');
    expect(indexSource).toContain('NoteTemplates: templateApi');
    expect(indexSource).not.toContain('TranslationCache: translationCache,');
  });

  it('exports stable deferred utility contracts', async () => {
    const translationCache = await import('../src/features/translationCache.js');
    const noteTemplates = await import('../src/features/noteTemplates.js');

    for (const method of ['init', 'get', 'set', 'clear', 'size', 'prune', 'clearEngine', 'hashParams']) {
      expect(typeof translationCache.translationCache[method]).toBe('function');
    }
    for (const method of ['getAllTemplates', 'getTemplate', 'saveAsTemplate', 'updateTemplate', 'deleteTemplate', 'getTemplatePickerItems']) {
      expect(typeof noteTemplates.NoteTemplates[method]).toBe('function');
    }
    expect(window.OpenCourseDeck.NoteTemplates).toBe(noteTemplates.NoteTemplates);
  });

  it('installs PDF identity hardening only after the lazy PDF runtime is available', () => {
    const pdfImport = indexSource.indexOf("await import('../pdf.js')");
    const hardeningCall = indexSource.indexOf('installPdfIdentityHardening(window)');
    expect(pdfImport).toBeGreaterThan(-1);
    expect(hardeningCall).toBeGreaterThan(pdfImport);
  });

  it('keeps graph constructors owned by the lazy app shell instead of duplicating them in the entry bundle', () => {
    const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

    for (const specifier of ['./src/features/knowledgeGraph.js', './src/features/courseGraph.js', './src/features/canvasZoom.js']) {
      expect(appSource).toContain(specifier);
      expect(indexSource).not.toContain(specifier);
    }
    expect(appSource).toContain('OpenCourseDeck.Graphs = { CourseGraph, KnowledgeGraph }');
  });

  it('uses one document-relative resolver for public and pooled production workers', () => {
    const poolSource = fs.readFileSync(path.join(root, 'src/lib/workerPool.js'), 'utf8');
    const assetSource = fs.readFileSync(path.join(root, 'src/core/workerAssets.js'), 'utf8');

    expect(indexSource).toContain("import { workerAssets } from './core/workerAssets.js'");
    expect(indexSource).toContain('pd.workers = workerAssets');
    expect(poolSource).toContain("import { workerAssets } from '../core/workerAssets.js'");
    expect(poolSource).toContain('createDefinition(workerAssets.search)');
    expect(poolSource).toContain('createDefinition(workerAssets.catalog)');
    expect(assetSource).toContain('globalThis.document?.baseURI');
    expect(assetSource).toContain('src/workers/${file}');
  });

  it('player.js media-storage integration has a provider on the namespace', async () => {
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

  it('waveformScrubber is wired through the lazy player feature loader', () => {
    // The player probes window.OpenCourseDeck.WaveformScrubber at runtime;
    // shipping it inside the player chunk keeps it out of the eager bundle
    // while making the namespace available (the old double-download concern).
    expect(indexSource).toContain("import('./features/waveformScrubber.js')");
  });

  it('caps the media size waveformScrubber will download and decode', () => {
    const source = fs.readFileSync(path.join(root, 'src/features/waveformScrubber.js'), 'utf8');
    expect(source).toContain('MAX_WAVEFORM_SOURCE_BYTES');
    expect(source).toMatch(/content-length/i);
  });
});
