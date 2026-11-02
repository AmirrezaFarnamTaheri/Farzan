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
    './core/productReadiness.js',
    './core/themeBuilder.js',
    './core/locale.js',
    './lib/timeRange.js',
    './lib/easing.js',
  ];

  it.each(requiredModules)('src/index.js imports %s', (specifier) => {
    expect(indexSource).toContain(specifier);
  });

  it('initializes Add Content from a lazy chunk after the app shell, before command palette commands', () => {
    // Add Content and userLibrary have no synchronous exported namespace
    // until initAddContent() runs. Keep them outside the initial entry while
    // preserving the interactive menu and palette action registration order.
    const appShellImport = indexSource.indexOf("import('../app.js').then");
    const addContentImport = indexSource.indexOf("await import('./features/addContent.js')");
    const addContentInitializer = indexSource.indexOf("name: 'add-content'");
    const paletteInitializer = indexSource.indexOf("name: 'command-palette'");
    expect(addContentImport).toBeGreaterThan(appShellImport);
    expect(addContentInitializer).toBeLessThan(paletteInitializer);
    expect(indexSource).not.toMatch(/import\s*\{\s*initAddContent\s*\}\s*from\s*['"]\.\/features\/addContent\.js['"]/);
    expect(indexSource.slice(addContentInitializer, paletteInitializer)).toContain('initAddContent(window)');
  });

  it('defers note-template utilities until the app shell resolves', () => {
    const appImport = indexSource.indexOf("import('../app.js')");
    for (const specifier of ['./features/noteTemplates.js']) {
      expect(indexSource).toContain(`import('${specifier}')`);
      expect(indexSource).not.toMatch(new RegExp(`from ["']${specifier.replaceAll('.', '\\.')}["']`));
      expect(indexSource.indexOf(`import('${specifier}')`)).toBeGreaterThan(appImport);
    }
    expect(indexSource).toContain('const templateApi = noteTemplates.NoteTemplates || window.OpenCourseDeck.NoteTemplates');
    expect(indexSource).toContain('NoteTemplates: templateApi');
  });

  it('loads optional runtime utilities without an all-or-nothing dependency group', () => {
    expect(indexSource).toContain("import { runIndependentInitializers } from './core/deferredRuntime.js'");
    for (const name of ['add-content', 'note-templates', 'command-palette']) {
      expect(indexSource).toContain(`name: '${name}'`);
    }
    // User-library actions must exist before command-palette commands are registered.
    expect(indexSource.indexOf("name: 'add-content'")).toBeLessThan(indexSource.indexOf("name: 'command-palette'"));
  });

  it('exports stable deferred utility contracts', async () => {
    const noteTemplates = await import('../src/features/noteTemplates.js');

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

  it('omits unconsumed graph, chart and CanvasTools public facades from the app', () => {
    const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    const canvas = fs.readFileSync(path.join(root, 'canvas.js'), 'utf8');
    for (const obsolete of ['knowledgeGraph', 'courseGraph', 'canvasCharts/', 'chartPlugins/', 'canvasTools/']) {
      expect(appSource).not.toContain(obsolete);
      expect(indexSource).not.toContain(obsolete);
    }
    expect(canvas).not.toContain('CanvasTools');
  });

  it('has no unused WorkerPool or worker-asset namespace in the pre-release app entry', () => {
    for (const old of ['WorkerPool', 'workerAssets', 'pd.workers', 'lazyWorkerPool']) {
      expect(indexSource).not.toContain(old);
    }
    const script = fs.readFileSync(path.join(root, 'scripts/workbox-dist.config.cjs'), 'utf8');
    expect(script).not.toContain('src/workers/');
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
