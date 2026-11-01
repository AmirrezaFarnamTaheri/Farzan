import { initBeforeUnloadGuard } from './core/beforeUnloadGuard.js';
import { initEndpointApprovalGuard } from './core/endpointApprovalGuard.js';
import { createOperationContext } from './core/operationContext.js';
import {
  withMutationRetry,
  isRetryableMutationError,
  computeBackoffDelay,
  configureMutationRetry,
} from './core/mutationRetry.js';
import '../data.js';
import '../db.js';
import '../ui.js';
import '../bridge.js';
import { installBridgeHardening } from './core/bridgeHardening.js';
import { installStorageSafety } from './core/storageSafety.js';
import { installAuxiliaryDbLifecycle } from './core/auxiliaryDbLifecycle.js';
import { installDataHardening } from './core/dataHardening.js';
import { installStoreHardening } from './core/storeHardening.js';
import { installAIAuthority } from './core/aiAuthority.js';
import { installPdfIdentityHardening } from './core/pdfIdentityHardening.js';
import { enforceProductReadiness } from './core/productReadiness.js';
import { loadVendorScript } from './core/vendorLoader.js';

import * as easing from './lib/easing.js';
import { HElement, h } from './lib/hElement.js';
import { RAFLoop } from './lib/rafLoop.js';
import { RequestQueue } from './lib/requestQueue.js';
import { stagger } from './lib/stagger.js';
import { normalizeTimeIntervals, updateTimeIntervals } from './lib/timeRange.js';
import { workerAssets } from './core/workerAssets.js';
import { createLazyWorkerPool } from './core/lazyWorkerPool.js';
import { buildUserThemeVars } from './core/themeBuilder.js';
import * as locale from './core/locale.js';
import enUS from './locales/en-US.js';
import faIR from './locales/fa-IR.js';
import { initAIClient } from './features/aiClient.js';
import { initErrorBoundary } from './features/errorBoundary.js';
import { initOfflineBanner } from './features/offlineBanner.js';
import { runIndependentInitializers } from './core/deferredRuntime.js';

installBridgeHardening(window);
installAuxiliaryDbLifecycle(window);
installStorageSafety(window);
installDataHardening(window);
installStoreHardening(window);
installAIAuthority(window);
initEndpointApprovalGuard(document);

const pd = window.OpenCourseDeck = window.OpenCourseDeck || {};

pd.easing = easing;
pd.loadVendorScript = loadVendorScript;
pd.HElement = HElement;
pd.h = h;
pd.AuxiliaryDbLifecycle = window.OpenCourseDeck.AuxiliaryDbLifecycle;
pd.RAFLoop = RAFLoop;
pd.RequestQueue = RequestQueue;
pd.stagger = stagger;
pd.timeRange = { normalizeTimeIntervals, updateTimeIntervals };
// Preserve the public synchronous WorkerPool namespace, but defer the worker
// pool's scheduling machinery until a feature makes a real worker request.
const lazyWorkerPool = createLazyWorkerPool({
  load: async () => {
    const workerPool = await import('./lib/workerPool.js');
    // Direct imports self-register. Restore the stable public facade after
    // loading for callers who captured it before the dynamic import.
    pd.WorkerPool = lazyWorkerPool;
    return workerPool;
  },
});
pd.WorkerPool = lazyWorkerPool;
pd.ThemeBuilder = { buildUserThemeVars };
pd.locale = { ...locale, messages: { 'en-US': enUS, 'fa-IR': faIR } };
locale.locale('en-US', enUS);
locale.locale('fa-IR', faIR);
pd.AI = initAIClient(window);
pd.workers = workerAssets;
// Automatic mutation retry primitives — db.js write paths already retry
// transient IndexedDB failures through withMutationRetry; this namespace
// exposes the same machinery (plus the quota-eviction hook) to features.
pd.mutationRetry = { withMutationRetry, isRetryableMutationError, computeBackoffDelay, configureMutationRetry };

const featureLoaders = {
  player: async () => {
    await import('./features/mediaStorage.js');
    // Wire the waveform scrubber namespace the player probes for at runtime.
    await import('./features/waveformScrubber.js');
    return import('../player.js');
  },
  notes: () => import('../notes.js'),
  pdf: async () => {
    const module = await import('../pdf.js');
    installPdfIdentityHardening(window);
    return module;
  },
  canvas: () => import('../canvas.js'),
  progress: async () => {
    // Chart.js is only consumed by the analytics dashboard; fetch it here
    // instead of on every page load. A failed fetch must not block the
    // route — progress.js already degrades to table-only when Chart is absent.
    await loadVendorScript('chartjs').catch((error) => {
      console.warn('[OpenCourseDeck] Chart.js unavailable; rendering progress without charts', error);
    });
    return import('../progress.js');
  },
  flashcards: () => import('../flashcards.js'),
};
const featureEntries = new Map();
const featureGenerations = new Map();

function abortError(reason = 'Feature load aborted') {
  if (typeof DOMException === 'function') return new DOMException(reason, 'AbortError');
  const error = new Error(reason);
  error.name = 'AbortError';
  return error;
}

function currentFeatureGeneration(name) {
  return featureGenerations.get(name) || 0;
}

pd.invalidateFeature = (name) => {
  const nextGeneration = currentFeatureGeneration(name) + 1;
  featureGenerations.set(name, nextGeneration);
  const existing = featureEntries.get(name);
  existing?.context?.invalidate?.();
  featureEntries.delete(name);
  return nextGeneration;
};

pd.loadFeature = (name, { signal = null, force = false } = {}) => {
  const loader = featureLoaders[name];
  if (!loader) return Promise.reject(new Error(`Unknown OpenCourseDeck feature: ${name}`));
  if (force) pd.invalidateFeature(name);
  let entry = featureEntries.get(name);
  if (!entry) {
    const generation = currentFeatureGeneration(name);
    const context = createOperationContext({ resource: `feature:${name}`, generation });
    entry = { generation, context, promise: null };
    entry.promise = Promise.resolve().then(loader).then((module) => {
      if (!context.isCurrent() || currentFeatureGeneration(name) !== generation) {
        const error = new Error(`Feature "${name}" load became stale`);
        error.code = 'STALE_FEATURE_LOAD';
        throw error;
      }
      return module;
    }).catch((error) => {
      if (featureEntries.get(name) === entry) featureEntries.delete(name);
      throw error;
    });
    featureEntries.set(name, entry);
  }
  if (!signal) return entry.promise;
  if (signal.aborted) return Promise.reject(abortError(signal.reason?.message || 'Feature load aborted'));
  return Promise.race([entry.promise, new Promise((_, reject) => signal.addEventListener('abort', () => reject(abortError(signal.reason?.message || 'Feature load aborted')), { once: true }))]);
};
pd.loadFeatures = (names = [], options = {}) => {
  // Tolerate a bare string (loadRouteFeatures historically spread one in),
  // otherwise .map on a string throws and every feature route dies.
  if (typeof names === 'string') names = [names];
  return Promise.all(names.map(name => pd.loadFeature(name, options)));
};

try { performance.mark?.('pd:bundle:evaluated'); } catch {}

initBeforeUnloadGuard();
initErrorBoundary();
initOfflineBanner();

// ── Service worker lifecycle ───────────────────────────────────────────────
// The generated dist/sw.js precaches the release and waits (skipWaiting:false)
// so an update can never interrupt an in-flight note/canvas/backup write.
// This side owns the contract that app.js update toast relies on:
//   1. dispatch ocd:sw-update-ready when a worker installs over a live page
//   2. reload on controllerchange once the user accepts the update
function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const secure = location.protocol === 'https:' ||
    ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!secure) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (window.__ocdSwUpdateAccepted && !window.__ocdSwReloading) {
      window.__ocdSwReloading = true;
      window.location.reload();
    }
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      const announceIfWaiting = () => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          document.dispatchEvent(new CustomEvent('ocd:sw-update-ready', { detail: { registration } }));
        }
      };
      registration.addEventListener('updatefound', () => {
        registration.installing?.addEventListener('statechange', (event) => {
          if (event.target?.state === 'installed') announceIfWaiting();
        });
      });
      // A waiting worker may already be parked from a previous session.
      announceIfWaiting();
    }).catch(() => { /* dev without a root sw.js, or storage blocked */ });
  });
}
initServiceWorker();
pd.ProductReadiness = enforceProductReadiness(document);

// The app shell is the only hard dependency. Optional utilities are isolated:
// a broken translation provider must not prevent the command palette or
// user-library actions from starting. Add Content runs first because the
// palette exposes commands that call its namespace.
import('../app.js').then(async () => {
  await runIndependentInitializers([
    {
      name: 'add-content',
      run: async () => {
        // Add Content owns the local-library UI, but it is not initialized
        // until after the app shell. Keep its substantial userLibrary helper
        // graph out of the synchronous entry without changing the order of
        // Add Content and command-palette registrations.
        const { initAddContent } = await import('./features/addContent.js');
        initAddContent(window);
      },
    },
  ]);

  await runIndependentInitializers([
    {
      name: 'translator',
      run: async () => {
        const translator = await import('./features/translator.js');
        Object.assign(pd, {
          TranslatorRegistry: translator.TranslatorRegistry,
          BaseTranslator: translator.BaseTranslator,
          OpenAITranslator: translator.OpenAITranslator,
          CustomAPITranslator: translator.CustomAPITranslator,
          GoogleTranslator: translator.GoogleTranslator,
          LANGUAGES: translator.LANGUAGES,
          getLanguageName: translator.getLanguageName,
        });
      },
    },
    {
      name: 'translation-cache',
      run: async () => {
        const translationCache = await import('./features/translationCache.js');
        const cacheApi = translationCache.translationCache || translationCache;
        Object.assign(pd, { TranslationCache: cacheApi });
      },
    },
    {
      name: 'note-templates',
      run: async () => {
        const noteTemplates = await import('./features/noteTemplates.js');
        const templateApi = noteTemplates.NoteTemplates || window.OpenCourseDeck.NoteTemplates;
        Object.assign(pd, { NoteTemplates: templateApi });
      },
    },
    {
      name: 'command-palette',
      run: async () => {
        const { initCommandPalette } = await import('./features/commandPalette.js');
        initCommandPalette();
      },
    },
  ]);
}).catch(error => console.error('[OpenCourseDeck] app shell failed to load', error));
