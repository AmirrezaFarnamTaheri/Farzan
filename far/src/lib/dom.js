export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  'audio[controls]',
  'video[controls]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function throttle(fn, limit = 100) {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Some click targets can be Text nodes; normalize to an Element for closest().
export function eventTargetEl(e) {
  const t = e?.target;
  if (!t) return null;
  if (t.nodeType === 1) return t; // Element
  return t.parentElement ?? null;
}

export function uid(prefix = 'pd') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getFocusableElements(container) {
  if (!container?.querySelectorAll) return [];
  return $$(FOCUSABLE_SELECTOR, container).filter(isFocusable);
}

export function isFocusable(el) {
  if (!el || typeof el.focus !== 'function') return false;
  if (!el.isConnected) return false;
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
  if (el.matches?.(':disabled')) return false;
  const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  return true;
}

export function restoreFocus(target, fallback = document.getElementById('main-content')) {
  const focusTarget = isFocusable(target) ? target : fallback;
  try {
    focusTarget?.focus?.({ preventScroll: true });
    return document.activeElement === focusTarget;
  } catch {
    return false;
  }
}

let appInertDepth = 0;

export function setAppInert(active, root = document.getElementById('plasma-app')) {
  if (!root) return;
  appInertDepth = Math.max(0, appInertDepth + (active ? 1 : -1));
  const shouldInert = appInertDepth > 0;

  root.toggleAttribute('inert', shouldInert);
  root.setAttribute('aria-hidden', shouldInert ? 'true' : 'false');
  if (!shouldInert) root.removeAttribute('aria-hidden');

  try {
    root.inert = shouldInert;
  } catch {
    // Older browsers ignore the inert property but still receive the attribute.
  }
}

/**
 * Trap focus inside a container (for modals, drawers, palette).
 * Returns a cleanup function.
 * @param {HTMLElement} container
 * @param {{ initialFocus?: boolean }} options
 */
export function trapFocus(container, { initialFocus = true } = {}) {
  function onKeyDown(e) {
    if (e.key !== 'Tab') return;
    const focusable = getFocusableElements(container);
    if (!focusable.length) {
      e.preventDefault();
      container?.focus?.({ preventScroll: true });
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first || document.activeElement === container) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  container.addEventListener('keydown', onKeyDown);
  if (initialFocus) {
    const first = getFocusableElements(container)[0] ?? container;
    first?.focus?.({ preventScroll: true });
  }

  return () => container.removeEventListener('keydown', onKeyDown);
}
