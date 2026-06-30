/**
 * Error Boundary — global error catching, chunk-load detection.
 * Wraps the app in error catching and provides retry/reload/home UI.
 * Offline detection is handled by offlineBanner.js.
 */

const CHUNK_LOAD_RE = /Loading chunk|Failed to fetch|ChunkLoadError|Loading CSS chunk/i;

let _container = null;
let _retryCount = 0;
const MAX_RETRIES = 3;

function isChunkLoadError(error) {
  const msg = error?.message ?? String(error ?? '');
  return CHUNK_LOAD_RE.test(msg);
}

function showErrorUI({ message, showRetry, showReload, showHome }) {
  if (!_container) return;
  _container.innerHTML = '';
  const box = document.createElement('div');
  box.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;padding:2rem;text-align:center;';

  const heading = document.createElement('h2');
  heading.textContent = 'Something went wrong';
  heading.style.cssText = 'margin-bottom:0.5rem;font-size:1.5rem;font-weight:600;';

  const desc = document.createElement('p');
  desc.textContent = message;
  desc.style.cssText = 'margin-bottom:1.5rem;opacity:0.7;max-width:400px;';

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:0.75rem;flex-wrap:wrap;justify-content:center;';

  const makeBtn = (label, onClick) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = 'btn btn-primary';
    btn.style.cssText = 'padding:0.5rem 1.25rem;border-radius:0.375rem;cursor:pointer;';
    btn.addEventListener('click', onClick);
    return btn;
  };

  if (showRetry) btnRow.appendChild(makeBtn('Retry', () => retryApp()));
  if (showReload) btnRow.appendChild(makeBtn('Reload Page', () => location.reload()));
  if (showHome) btnRow.appendChild(makeBtn('Go Home', () => { location.hash = '#/'; location.reload(); }));

  box.appendChild(heading);
  box.appendChild(desc);
  box.appendChild(btnRow);
  _container.appendChild(box);
}

function retryApp() {
  _retryCount++;
  if (_retryCount > MAX_RETRIES) {
    showErrorUI({ message: 'Multiple retries failed. Please reload the page.', showRetry: false, showReload: true, showHome: true });
    return;
  }
  _container.innerHTML = '';
  window.dispatchEvent(new CustomEvent('pd:app-retry', { detail: { attempt: _retryCount } }));
}

function onError(event) {
  const error = event?.error ?? event?.reason;
  if (!error) return;

  if (isChunkLoadError(error)) {
    event.preventDefault?.();
    showErrorUI({
      message: 'A resource failed to load. This may be due to a network issue or an outdated version.',
      showRetry: true,
      showReload: true,
      showHome: false,
    });
    return;
  }

  console.error('[ErrorBoundary]', error);
}

function onUnhandledRejection(event) {
  const reason = event?.reason;
  if (reason && isChunkLoadError(reason)) {
    event.preventDefault?.();
    showErrorUI({
      message: 'A resource failed to load. Please check your connection and try again.',
      showRetry: true,
      showReload: true,
      showHome: false,
    });
  }
}

/**
 * Initialize the error boundary.
 * @param {{ container?: HTMLElement }} options
 */
export function initErrorBoundary({ container } = {}) {
  _container = container ?? document.getElementById('plasma-app') ?? document.body;
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
}
