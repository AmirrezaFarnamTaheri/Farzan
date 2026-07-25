/**
 * Offline Banner — persistent banner when offline, auto-hide when back online.
 * Uses existing CSS tokens for styling.
 */

let _banner = null;

function createBanner() {
  const el = document.createElement('div');
  el.id = 'pd-offline-banner';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = [
    'position:fixed',
    'bottom:0',
    'left:0',
    'right:0',
    'z-index:9999',
    'display:none',
    'align-items:center',
    'justify-content:center',
    'gap:0.5rem',
    'padding:0.5rem 1rem',
    'background:var(--surface-2, #1e1e2e)',
    'color:var(--text-primary, #cdd6f4)',
    'border-top:1px solid var(--border, #45475a)',
    'font-size:0.875rem',
    'text-align:center',
  ].join(';');

  const icon = document.createElement('span');
  icon.textContent = '\u26A0';
  icon.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.textContent = 'You are offline. Some features may be unavailable.';

  el.appendChild(icon);
  el.appendChild(text);
  return el;
}

function updateVisibility() {
  if (!_banner) return;
  const offline = !navigator.onLine;
  _banner.style.display = offline ? 'flex' : 'none';
  _banner.setAttribute('aria-hidden', String(!offline));
}

/**
 * Initialize the offline banner.
 * @param {{ parent?: HTMLElement }} options
 */
export function initOfflineBanner({ parent } = {}) {
  if (_banner) return;
  _banner = createBanner();
  (parent ?? document.body).appendChild(_banner);
  window.addEventListener('online', updateVisibility);
  window.addEventListener('offline', updateVisibility);
  updateVisibility();
}
