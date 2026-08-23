// Side-effect: migrate legacy UI keys before any other app module reads localStorage.
import './core/storageMigrate.js';

import { initBeforeUnloadGuard } from './core/beforeUnloadGuard.js';
import { initEndpointApprovalGuard } from './core/endpointApprovalGuard.js';
import { createOperationContext } from './core/operationContext.js';
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

import * as easing from './lib/easing.js';
import { HElement, h } from './lib/hElement.js';
import { RAFLoop } from './lib/rafLoop.js';
import { RequestQueue } from './lib/requestQueue.js';
import { stagger } from './lib/stagger.js';
import { Timeline } from './lib/timeline.js';
import { normalizeTimeIntervals, updateTimeIntervals } from './lib/timeRange.js';
import { VirtualList } from './lib/virtualScroll.js';
import { runInWorker, terminateAll, getWorkerStatus } from './lib/workerPool.js';
import { workerAssets } from './core/workerAssets.js';
import { buildUserThemeVars } from './core/themeBuilder.js';
import * as locale from './core/locale.js';
import enUS from './locales/en-US.js';
import faIR from './locales/fa-IR.js';
import { initAIClient } from './features/aiClient.js';
import { initErrorBoundary } from './features/errorBoundary.js';
import { initOfflineBanner } from './features/offlineBanner.js';

installBridgeHardening(window);
installAuxiliaryDbLifecycle(window);
installStorageSafety(window);
installDataHardening(window);
installStoreHardening(window);
installAIAuthority(window);
initEndpointApprovalGuard(document);

const pd = window.OpenCourseDeck = window.OpenCourseDeck || {};

pd.easing = easing;
pd.HElement = HElement;
pd.h = h;
pd.AuxiliaryDbLifecycle = window.OpenCourseDeck.AuxiliaryDbLifecycle;
pd.RAFLoop = RAFLoop;
pd.RequestQueue = RequestQueue;
pd.stagger = stagger;
pd.Timeline = Timeline;
pd.timeRange = { normalizeTimeIntervals, updateTimeIntervals };
pd.VirtualList = VirtualList;
pd.WorkerPool = { runInWorker, terminateAll, getWorkerStatus };
pd.ThemeBuilder = { buildUserThemeVars };
pd.locale = { ...locale, messages: { 'en-US': enUS, 'fa-IR': faIR } };
locale.locale('en-US', enUS);
locale.locale('fa-IR', faIR);
pd.AI = initAIClient(window);
pd.workers = workerAssets;

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
  progress: () => import('../progress.js'),
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
pd.loadFeatures = (names = [], options = {}) => Promise.all(names.map(name => pd.loadFeature(name, options)));

try { performance.mark?.('pd:bundle:evaluated'); } catch {}

initBeforeUnloadGuard();
initErrorBoundary();
initOfflineBanner();
pd.ProductReadiness = enforceProductReadiness(document);

import('../app.js').then(async () => {
  try {
    const [translator, translationCache, noteTemplates, { initCommandPalette }] = await Promise.all([
      import('./features/translator.js'),
      import('./features/translationCache.js'),
      import('./features/noteTemplates.js'),
      import('./features/commandPalette.js'),
    ]);
    const cacheApi = translationCache.translationCache || translationCache;
    const templateApi = noteTemplates.NoteTemplates || window.OpenCourseDeck.NoteTemplates;
    Object.assign(pd, {
      TranslatorRegistry: translator.TranslatorRegistry,
      BaseTranslator: translator.BaseTranslator,
      OpenAITranslator: translator.OpenAITranslator,
      CustomAPITranslator: translator.CustomAPITranslator,
      GoogleTranslator: translator.GoogleTranslator,
      LANGUAGES: translator.LANGUAGES,
      getLanguageName: translator.getLanguageName,
      TranslationCache: cacheApi,
      NoteTemplates: templateApi,
    });
    initCommandPalette();
  } catch (error) {
    console.warn('[OpenCourseDeck] deferred runtime initialization failed', error);
  }
}).catch(error => console.error('[OpenCourseDeck] app shell failed to load', error));
