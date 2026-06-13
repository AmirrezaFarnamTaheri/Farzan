// Side-effect: migrate legacy UI keys before any other app module reads localStorage.
import './core/storageMigrate.js';

import { initBeforeUnloadGuard } from './core/beforeUnloadGuard.js';
import '../data.js';
import '../db.js';
import '../ui.js';
import '../bridge.js';
import { initCommandPalette } from './features/commandPalette.js';

const pd = window.PlasmaDeck = window.PlasmaDeck || {};
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
  if (!loader) return Promise.reject(new Error(`Unknown PlasmaDeck feature: ${name}`));
  if (!featurePromises.has(name)) {
    featurePromises.set(name, loader());
  }
  return featurePromises.get(name);
};

pd.loadFeatures = (names = []) => Promise.all(names.map((name) => pd.loadFeature(name)));

// Theme + layout pre-boot (FOUC) — runs after migration module, before async init().
(() => {
  try {
    const theme  = localStorage.getItem('plasma_theme')  || 'dark';
    const accent = localStorage.getItem('plasma_accent') || 'plasma';
    const dir    = localStorage.getItem('plasma_dir')    || 'ltr';
    const root   = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-accent', accent);
    root.setAttribute('dir', dir);

    const fontScale = localStorage.getItem('plasma_font_scale') || '1';
    root.style.setProperty('--font-scale', fontScale);

    const sidebarCollapsed = localStorage.getItem('plasma_sidebar_collapsed') === 'true';
    if (sidebarCollapsed) root.classList.add('sidebar-collapsed');

    const density = localStorage.getItem('plasma_density') || 'comfortable';
    root.setAttribute('data-density', density);
  } catch {
    // localStorage might be blocked
  }
})();

initBeforeUnloadGuard();

try { performance.mark?.('pd:bundle:evaluated'); } catch {
  // Performance API may be unavailable in unusual embedded browsers.
}

const __pdDebugEnabled = (() => {
  try {
    const isLocal =
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1' ||
      location.hostname === '[::1]';
    const qs = new URLSearchParams(location.search);
    return isLocal && qs.get('debug') === '1';
  } catch {
    return false;
  }
})();

window.__pdDebug = (payload) => {
  if (!__pdDebugEnabled) return;
  try {
    navigator.sendBeacon?.('/__debug?debug=1', JSON.stringify(payload));
  } catch {
    // ignore
  }
};

window.__pdMark = (name) => {
  try { performance.mark?.(name); } catch {
    // Timing marks are best-effort debug signals.
  }
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
  } catch {
    // Timing measures are best-effort debug signals.
  }
};

window.addEventListener('error', (e) => {
  window.__pdDebug?.({
    location: 'window:error',
    message: 'Unhandled error',
    data: { msg: String(e?.message || ''), file: String(e?.filename || ''), line: e?.lineno, col: e?.colno },
    timestamp: Date.now(),
  });
});
window.addEventListener('unhandledrejection', (e) => {
  window.__pdDebug?.({
    location: 'window:unhandledrejection',
    message: 'Unhandled rejection',
    data: { reason: String(e?.reason || '') },
    timestamp: Date.now(),
  });
});

if ('serviceWorker' in navigator) {
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (isLocal) {
    try {
      const key = 'pd_dev_sw_disabled_once';
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        navigator.serviceWorker.getRegistrations()
          .then((regs) => Promise.allSettled(regs.map((r) => r.unregister())))
          .then(() => {
            location.reload();
          })
          .catch(() => {});
      }
    } catch {
      // ignore
    }
  }

  window.addEventListener('load', () => {
    if (isLocal) return;
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              document.dispatchEvent(new CustomEvent('plasma:sw-update-ready'));
            }
          });
        });
      })
      .catch(() => {});
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (window.__plasmaSwReloading) return;
    window.__plasmaSwReloading = true;
  });
}

import('../app.js')
  .then(() => {
    try { initCommandPalette(); } catch (e) { console.warn('[PlasmaDeck] initCommandPalette failed', e); }
  })
  .catch((e) => {
    console.error('[PlasmaDeck] app shell failed to load', e);
  });


