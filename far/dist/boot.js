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

const __pdSetSplashStatus = (message) => {
  try {
    const status = document.getElementById('splash-status');
    if (status) status.textContent = message;
  } catch {}
};

const __pdShowBootFailure = (err) => {
  try {
    const loading = document.getElementById('app-loading');
    if (!loading) return;

    loading.classList.remove('fade-out');
    loading.setAttribute('role', 'alert');
    loading.setAttribute('aria-label', 'PlasmaDeck failed to start');
    loading.textContent = '';

    const panel = document.createElement('div');
    panel.style.cssText = [
      'max-width:560px',
      'padding:24px',
      'border:1px solid rgba(255,255,255,0.14)',
      'border-radius:16px',
      'background:rgba(15,15,26,0.94)',
      'color:#fff',
      'box-shadow:0 24px 80px rgba(0,0,0,0.35)',
      'font-family:Inter,system-ui,sans-serif',
      'text-align:left',
    ].join(';');

    const title = document.createElement('h1');
    title.textContent = 'PlasmaDeck could not start';
    title.style.cssText = 'margin:0 0 12px;font-size:1.35rem;line-height:1.2';

    const body = document.createElement('p');
    body.textContent = 'The app bundle failed to load. This can happen after an incomplete build, a stale service worker, or a local server cache issue.';
    body.style.cssText = 'margin:0 0 16px;color:rgba(255,255,255,0.72);line-height:1.55';

    const detail = document.createElement('pre');
    detail.textContent = String(err?.message || err || 'Unknown startup error');
    detail.style.cssText = [
      'max-height:150px',
      'overflow:auto',
      'margin:0 0 16px',
      'padding:12px',
      'border-radius:10px',
      'background:rgba(255,255,255,0.08)',
      'white-space:pre-wrap',
      'font-size:0.82rem',
      'color:rgba(255,255,255,0.82)',
    ].join(';');

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px';

    const makeButton = (label, onClick) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.style.cssText = [
        'border:0',
        'border-radius:10px',
        'padding:10px 14px',
        'font-weight:700',
        'cursor:pointer',
        'color:#fff',
        'background:linear-gradient(135deg,#7c3aed,#06b6d4)',
      ].join(';');
      btn.addEventListener('click', onClick);
      return btn;
    };

    actions.append(
      makeButton('Reload', () => location.reload()),
      makeButton('Clear service worker and reload', async () => {
        try {
          const regs = await navigator.serviceWorker?.getRegistrations?.();
          await Promise.all((regs || []).map((reg) => reg.unregister()));
          if (window.caches?.keys) {
            const keys = await caches.keys();
            await Promise.all(keys.filter((key) => key.includes('plasma')).map((key) => caches.delete(key)));
          }
        } catch (clearErr) {
          __pdPost('boot:clear_sw_fail', { err: String(clearErr) });
        } finally {
          location.reload();
        }
      })
    );

    const hint = document.createElement('p');
    hint.textContent = 'For local development, run npm run build and then refresh this page from the local server.';
    hint.style.cssText = 'margin:16px 0 0;color:rgba(255,255,255,0.56);font-size:0.9rem;line-height:1.45';

    panel.append(title, body, detail, actions, hint);
    loading.append(panel);
  } catch (displayErr) {
    console.error('[PlasmaDeck boot] Failed to render startup error', displayErr);
  }
};

__pdMark('pd:boot:start');
__pdPost('boot:start', { ua: navigator.userAgent });
__pdSetSplashStatus('Loading app bundle...');
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
  __pdPost('boot:import_plasma', { src: './plasma.js' });
  __pdMark('pd:boot:import:start');
  await import('./plasma.js');
  __pdMark('pd:boot:import:end');
  __pdMeasure('pd:boot:import', 'pd:boot:import:start', 'pd:boot:import:end');
  __pdMeasure('pd:boot:total_to_import', 'pd:boot:start', 'pd:boot:import:end');
  __pdPost('boot:import_plasma_ok', {});
} catch (err) {
  __pdPost('boot:import_plasma_fail', { err: String(err), stack: err?.stack });
  __pdSetSplashStatus('Startup failed');
  __pdShowBootFailure(err);
}
