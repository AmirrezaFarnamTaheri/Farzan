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
  __pdPost('boot:import_plasma', { src: './dist/plasma.js' });
  __pdMark('pd:boot:import:start');
  await import('./dist/plasma.js');
  __pdMark('pd:boot:import:end');
  __pdMeasure('pd:boot:import', 'pd:boot:import:start', 'pd:boot:import:end');
  __pdMeasure('pd:boot:total_to_import', 'pd:boot:start', 'pd:boot:import:end');
  __pdPost('boot:import_plasma_ok', {});
} catch (err) {
  __pdPost('boot:import_plasma_fail', { err: String(err), stack: err?.stack });
}
