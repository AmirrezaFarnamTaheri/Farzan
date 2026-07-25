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

const __pdPost = (message, data) => {
  if (!__pdDebugEnabled) return;
  try {
    const payload = { message, data, timestamp: Date.now() };
    const body = JSON.stringify(payload);
    navigator.sendBeacon?.('/__debug?debug=1', body) ||
      fetch('/__debug?debug=1', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body }).catch(() => {});
  } catch {}
};

const __pdMark = (name) => {
  try { performance.mark(name); } catch {}
};

const __pdMeasure = (name, start, end) => {
  try {
    performance.measure(name, start, end);
    const entry = performance.getEntriesByName(name).at(-1);
    __pdPost('boot:timing', { name, duration: entry?.duration ?? null });
  } catch {}
};

async function initializeRuntimeCapabilities() {
  const pd = window.OpenCourseDeck = window.OpenCourseDeck || {};
  if (!pd.StorageSafety) throw new Error('Storage safety failed to initialize');
  if (!pd.AI) throw new Error('AI capability failed to initialize');

  // Settings and the command palette expose backup controls in a fresh session.
  // Load this capability before the shell becomes interactive so those controls
  // cannot degrade into optional-chaining no-ops based on route history.
  await pd.loadFeature?.('progress');
  if (!window.ProgressStats?.exportJSON || !window.ProgressStats?.importJSON) {
    throw new Error('Backup capability failed to initialize');
  }
}

__pdMark('pd:boot:start');
__pdPost('boot:start', { ua: navigator.userAgent });
window.addEventListener('error', (e) => {
  __pdPost('boot:window.error', {
    message: e?.message,
    filename: e?.filename,
    lineno: e?.lineno,
    colno: e?.colno,
  });
});
window.addEventListener('unhandledrejection', (e) => {
  __pdPost('boot:unhandledrejection', { reason: String(e?.reason) });
});

try {
  __pdPost('boot:import_plasma', { src: './opencoursedeck.js' });
  __pdMark('pd:boot:import:start');
  await import('./opencoursedeck.js');
  await initializeRuntimeCapabilities();
  __pdMark('pd:boot:import:end');
  __pdMeasure('pd:boot:import', 'pd:boot:import:start', 'pd:boot:import:end');
  __pdMeasure('pd:boot:total_to_import', 'pd:boot:start', 'pd:boot:import:end');
  __pdPost('boot:import_plasma_ok', {});
} catch (err) {
  __pdPost('boot:import_plasma_fail', { err: String(err), stack: err?.stack });
  const statusEl = document.getElementById('splash-status');
  if (statusEl) {
    statusEl.textContent = '';
    const errDiv = document.createElement('div');
    errDiv.style.cssText = 'color: #ef4444; margin-top: 1rem; font-family: sans-serif;';

    const strong = document.createElement('strong');
    strong.textContent = 'Failed to load application modules.';
    errDiv.appendChild(strong);
    errDiv.appendChild(document.createElement('br'));

    const small = document.createElement('small');
    small.textContent = 'Try running "npm run build" or hard refreshing (Ctrl+F5).';
    errDiv.appendChild(small);
    errDiv.appendChild(document.createElement('br'));

    const btn = document.createElement('button');
    btn.textContent = 'Retry';
    btn.style.cssText = 'margin-top: 10px; padding: 6px 16px; cursor: pointer; border-radius: 4px; border: 1px solid #ef4444; background: transparent; color: #ef4444;';
    btn.addEventListener('click', () => { window.location.reload(); });
    errDiv.appendChild(btn);

    statusEl.appendChild(errDiv);
  }
}
