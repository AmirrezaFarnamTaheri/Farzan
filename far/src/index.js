// Side-effect: migrate legacy UI keys before any other app module reads localStorage.
import './core/storageMigrate.js';

import { initBeforeUnloadGuard } from './core/beforeUnloadGuard.js';
import '../data.js';
import '../db.js';
import '../ui.js';
import '../bridge.js';
import { initCommandPalette } from './features/commandPalette.js';

import * as easing from './lib/easing.js';
import { HElement, h } from './lib/hElement.js';
import { RAFLoop } from './lib/rafLoop.js';
import { RequestQueue } from './lib/requestQueue.js';
import { stagger } from './lib/stagger.js';
import { Timeline } from './lib/timeline.js';
import { normalizeTimeIntervals, updateTimeIntervals } from './lib/timeRange.js';
import { VirtualList } from './lib/virtualScroll.js';
import { runInWorker, terminateAll, getWorkerStatus } from './lib/workerPool.js';
import { buildUserThemeVars } from './core/themeBuilder.js';
import * as locale from './core/locale.js';
import enUS from './locales/en-US.js';
import faIR from './locales/fa-IR.js';
import { TranslatorRegistry, BaseTranslator, GoogleTranslator, OpenAITranslator, CustomAPITranslator, LANGUAGES, getLanguageName } from './features/translator.js';
import * as translationCache from './features/translationCache.js';
import { getAllTemplates, getTemplate, saveAsTemplate, updateTemplate, deleteTemplate, getTemplatePickerItems } from './features/noteTemplates.js';
import { initErrorBoundary } from './features/errorBoundary.js';
import { initOfflineBanner } from './features/offlineBanner.js';
import { CanvasZoom } from './features/canvasZoom.js';
import { CourseGraph } from './features/courseGraph.js';
import { KnowledgeGraph } from './features/knowledgeGraph.js';

const pd = window.OpenCourseDeck = window.OpenCourseDeck || {};

pd.easing = easing;
pd.HElement = HElement;
pd.h = h;
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
pd.TranslatorRegistry = TranslatorRegistry;
pd.BaseTranslator = BaseTranslator;
pd.GoogleTranslator = GoogleTranslator;
pd.OpenAITranslator = OpenAITranslator;
pd.CustomAPITranslator = CustomAPITranslator;
pd.LANGUAGES = LANGUAGES;
pd.getLanguageName = getLanguageName;
pd.TranslationCache = translationCache;
pd.NoteTemplates = { getAllTemplates, getTemplate, saveAsTemplate, updateTemplate, deleteTemplate, getTemplatePickerItems };
pd.CanvasZoom = CanvasZoom;
pd.CourseGraph = CourseGraph;
pd.KnowledgeGraph = KnowledgeGraph;
pd.workers = {
  search: new URL('./workers/search.worker.js', import.meta.url).href,
  catalog: new URL('./workers/catalog.worker.js', import.meta.url).href,
};

const featureLoaders = {
  player: () => import('../player.js'),
  notes: () => import('../notes.js'),
  pdf: () => import('../pdf.js'),
  canvas: () => import('../canvas.js'),
  progress: () => import('../progress.js'),
};
const featurePromises = new Map();

pd.loadFeature = (name) => {
  const loader = featureLoaders[name];
  if (!loader) return Promise.reject(new Error(`Unknown OpenCourseDeck feature: ${name}`));
  if (!featurePromises.has(name)) featurePromises.set(name, loader());
  return featurePromises.get(name);
};

pd.loadFeatures = (names = []) => Promise.all(names.map((name) => pd.loadFeature(name)));

(() => {
  try {
    const theme = localStorage.getItem('plasma_theme') || 'dark';
    const accent = localStorage.getItem('plasma_accent') || 'plasma';
    const dir = localStorage.getItem('plasma_dir') || 'ltr';
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-accent', accent);
    root.setAttribute('dir', dir);
    root.style.setProperty('--font-scale', localStorage.getItem('plasma_font_scale') || '1');
    if (localStorage.getItem('plasma_sidebar_collapsed') === 'true') root.classList.add('sidebar-collapsed');
    root.setAttribute('data-density', localStorage.getItem('plasma_density') || 'comfortable');
  } catch {
    // Storage can be unavailable in hardened or embedded browsers.
  }
})();

initBeforeUnloadGuard();
initErrorBoundary();
initOfflineBanner();

try { performance.mark?.('pd:bundle:evaluated'); } catch {}

const isLocalHost = (() => {
  try {
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname);
  } catch {
    return false;
  }
})();

const debugEnabled = (() => {
  try {
    return isLocalHost && new URLSearchParams(location.search).get('debug') === '1';
  } catch {
    return false;
  }
})();

window.__pdDebug = (payload) => {
  if (!debugEnabled) return;
  try { navigator.sendBeacon?.('/__debug?debug=1', JSON.stringify(payload)); } catch {}
};

window.__pdMark = (name) => {
  try { performance.mark?.(name); } catch {}
};

window.__pdMeasure = (name, start, end) => {
  try {
    performance.measure?.(name, start, end);
    const entry = performance.getEntriesByName?.(name)?.at?.(-1);
    window.__pdDebug?.({
      location: 'performance',
      message: 'timing',
      data: { name, duration: entry?.duration ?? null },
      timestamp: Date.now(),
    });
  } catch {}
};

window.addEventListener('error', (event) => {
  window.__pdDebug?.({
    location: 'window:error',
    message: 'Unhandled error',
    data: {
      msg: String(event?.message || ''),
      file: String(event?.filename || ''),
      line: event?.lineno,
      col: event?.colno,
    },
    timestamp: Date.now(),
  });
});

window.addEventListener('unhandledrejection', (event) => {
  window.__pdDebug?.({
    location: 'window:unhandledrejection',
    message: 'Unhandled rejection',
    data: { reason: String(event?.reason || '') },
    timestamp: Date.now(),
  });
});

if ('serviceWorker' in navigator) {
  if (isLocalHost) {
    try {
      const key = 'pd_dev_sw_disabled_once';
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        navigator.serviceWorker.getRegistrations()
          .then((registrations) => Promise.allSettled(registrations.map((registration) => registration.unregister())))
          .then(() => location.reload())
          .catch(() => {});
      }
    } catch {}
  }

  window.addEventListener('load', () => {
    if (isLocalHost) return;
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              document.dispatchEvent(new CustomEvent('plasma:sw-update-ready'));
            }
          });
        });
      })
      .catch((error) => {
        window.__pdDebug?.({
          location: 'service-worker',
          message: 'Registration failed',
          data: { reason: String(error?.message || error || '') },
          timestamp: Date.now(),
        });
      });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (window.__plasmaSwReloading) return;
    window.__plasmaSwReloading = true;
    location.reload();
  });
}

import('../app.js')
  .then(() => {
    try { initCommandPalette(); } catch (error) {
      console.warn('[OpenCourseDeck] initCommandPalette failed', error);
    }
  })
  .catch((error) => {
    console.error('[OpenCourseDeck] app shell failed to load', error);
  });
