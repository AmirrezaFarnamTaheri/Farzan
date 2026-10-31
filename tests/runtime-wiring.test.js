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
    './features/addContent.js',
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

  it('loads optional runtime utilities without an all-or-nothing dependency group', () => {
    expect(indexSource).toContain("import { runIndependentInitializers } from './core/deferredRuntime.js'");
    expect(indexSource).not.toContain('const [translator, translationCache, noteTemplates, { initCommandPalette }] = await Promise.all');
    for (const name of ['add-content', 'translator', 'translation-cache', 'note-templates', 'command-palette']) {
      expect(indexSource).toContain(`name: '${name}'`);
    }
    // User-library actions must exist before command-palette commands are registered.
    expect(indexSource.indexOf("name: 'add-content'")).toBeLessThan(indexSource.indexOf("name: 'command-palette'"));
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

  it('keeps dormant graph, canvas-chart and zoom constructors out of the eager application', () => {
    const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

    const dormantModules = [
      './src/features/knowledgeGraph.js',
      './src/features/courseGraph.js',
      './src/features/canvasZoom.js',
      './src/features/canvasCharts/area.js',
      './src/features/canvasCharts/gauge.js',
      './src/features/canvasCharts/heatmap.js',
      './src/features/canvasCharts/treemap.js',
    ];
    for (const specifier of dormantModules) {
      expect(appSource, specifier).not.toContain(`from '${specifier}'`);
      expect(indexSource, specifier).not.toContain(specifier);
    }
    // These names had no live constructors/callers; remove their old globals.
    for (const oldGlobal of [
      'OpenCourseDeck.Graphs =',
      'OpenCourseDeck.CanvasZoom =',
      'OpenCourseDeck.CourseGraph =',
      'OpenCourseDeck.KnowledgeGraph =',
      'OpenCourseDeck.CanvasCharts =',
    ]) {
      expect(appSource).not.toContain(oldGlobal);
    }
    // The chart plugins are used by Charts.registerPlugins() and stay wired.
    expect(appSource).toContain("import { chartGauge as GaugePlugin }");
    expect(appSource).toContain('OpenCourseDeck.ChartPlugins = Charts.plugins');
  });

  it('preserves each optional visual module as a direct import without eager startup cost', async () => {
    const [zoom, courses, knowledge, area, gauge, heatmap, treemap] = await Promise.all([
      import('../src/features/canvasZoom.js'),
      import('../src/features/courseGraph.js'),
      import('../src/features/knowledgeGraph.js'),
      import('../src/features/canvasCharts/area.js'),
      import('../src/features/canvasCharts/gauge.js'),
      import('../src/features/canvasCharts/heatmap.js'),
      import('../src/features/canvasCharts/treemap.js'),
    ]);
    for (const ctor of [zoom.CanvasZoom, courses.CourseGraph, knowledge.KnowledgeGraph,
      area.CanvasAreaChart, gauge.CanvasGauge, heatmap.CanvasHeatmap, treemap.CanvasTreemap]) {
      expect(typeof ctor).toBe('function');
    }
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

  it('feature-route loading passes arrays, not spread strings (route-death regression)', () => {
    const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    const indexSource2 = fs.readFileSync(path.join(root, 'src', 'index.js'), 'utf8');
    // loadRouteFeatures once spread 'player' into loadFeatures(names=[]), making
    // names.map undefined and killing every feature route in real builds.
    expect(appSource).not.toContain('loader(...names)');
    expect(appSource).toContain('await loader(names);');
    expect(indexSource2).toContain("typeof names === 'string'");
  });
  it('service worker lifecycle owns the update-toast contract', () => {
    // Registration + update detection live here so app.js can stay purely
    // reactive to ocd:sw-update-ready / controllerchange.
    expect(indexSource).toContain("navigator.serviceWorker.register('/sw.js')");
    expect(indexSource).toContain('ocd:sw-update-ready');
    expect(indexSource).toContain('__ocdSwUpdateAccepted');
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
