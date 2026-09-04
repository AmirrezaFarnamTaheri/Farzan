/**
 * On-demand loader for classic (non-module) vendor scripts.
 *
 * Chart.js (~208 KB) is only needed by the Progress route, so it is no longer
 * a render-blocking `<script defer>` in index.html. Instead the route's
 * feature loader awaits `loadVendorScript('chartjs')` right before importing
 * progress.js. Loads are memoised per id and resolve immediately when the
 * global already exists (e.g. an older shell that still inlines the tag, or a
 * test harness that stubbed `window.Chart`).
 */

const VENDOR_SCRIPTS = Object.freeze({
  chartjs: Object.freeze({ src: './vendor/chart.umd.js', global: 'Chart', id: 'lib-chartjs' }),
});

const pending = new Map();

function resolveSrc(src, root) {
  const base = root.document?.baseURI || root.location?.href;
  try { return new URL(src, base).href; } catch { return src; }
}

export function loadVendorScript(name, { root = window } = {}) {
  const spec = VENDOR_SCRIPTS[name];
  if (!spec) return Promise.reject(new Error(`Unknown vendor script: ${name}`));
  if (root[spec.global]) return Promise.resolve(root[spec.global]);
  if (pending.has(name)) return pending.get(name);

  const doc = root.document;
  const promise = new Promise((resolve, reject) => {
    if (!doc?.createElement) {
      reject(new Error(`Cannot load ${name}: no document`));
      return;
    }
    let el = doc.getElementById(spec.id);
    const done = () => {
      if (root[spec.global]) resolve(root[spec.global]);
      else reject(new Error(`${name} loaded but did not expose window.${spec.global}`));
    };
    const fail = () => reject(new Error(`Failed to load ${spec.src}`));
    if (el) {
      // A tag already exists (older shell) — wait for it instead of duplicating.
      el.addEventListener('load', done, { once: true });
      el.addEventListener('error', fail, { once: true });
      return;
    }
    el = doc.createElement('script');
    el.id = spec.id;
    el.src = resolveSrc(spec.src, root);
    el.async = true;
    el.addEventListener('load', done, { once: true });
    el.addEventListener('error', fail, { once: true });
    (doc.head || doc.documentElement).appendChild(el);
  }).catch((error) => {
    pending.delete(name);
    throw error;
  });

  pending.set(name, promise);
  return promise;
}

export const vendorScripts = VENDOR_SCRIPTS;
