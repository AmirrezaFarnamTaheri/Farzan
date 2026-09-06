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
  let inThrottle = false;
  let trailingArgs = null;
  const run = (args) => {
    fn(...args);
    inThrottle = true;
    setTimeout(() => {
      inThrottle = false;
      // Trailing edge: replay the last suppressed call so the final
      // event in a burst (last scroll position, last state write) is
      // never silently dropped.
      if (trailingArgs) {
        const args2 = trailingArgs;
        trailingArgs = null;
        run(args2);
      }
    }, limit);
  };
  return (...args) => {
    if (inThrottle) {
      trailingArgs = args;
      return;
    }
    run(args);
  };
}

export function eventTargetEl(e) {
  const t = e?.target;
  if (!t) return null;
  if (t.nodeType === 1) return t;
  return t.parentElement ?? null;
}

// Native W3C Web Cryptography API randomUUID
// Source: https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID
export function uid(prefix = 'pd') {
  if (typeof crypto?.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
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

const appInertDepths = new WeakMap();

export function setAppInert(active, root = document.getElementById('ocd-app')) {
  if (!root) return;
  const currentDepth = appInertDepths.get(root) || 0;
  const nextDepth = Math.max(0, currentDepth + (active ? 1 : -1));
  if (nextDepth > 0) appInertDepths.set(root, nextDepth);
  else appInertDepths.delete(root);
  const shouldInert = nextDepth > 0;

  root.toggleAttribute('inert', shouldInert);
  if (shouldInert) root.setAttribute('aria-hidden', 'true');
  else root.removeAttribute('aria-hidden');

  try {
    root.inert = shouldInert;
  } catch {
    // Older browsers ignore the inert property but still receive the attribute.
  }
}

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
    } else if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  container.addEventListener('keydown', onKeyDown);
  if (initialFocus) {
    const first = getFocusableElements(container)[0] ?? container;
    first?.focus?.({ preventScroll: true });
  }

  return () => container.removeEventListener('keydown', onKeyDown);
}

export function createElement(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'class') {
      el.className = v;
    } else if (k.startsWith('data-')) {
      el.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(el.style, v);
    } else {
      el.setAttribute(k, v);
    }
  }
  const append = (parent, content) => {
    if (Array.isArray(content)) {
      content.forEach(c => append(parent, c));
    } else if (content != null) {
      parent.append(typeof content === 'string' ? document.createTextNode(content) : content);
    }
  };
  append(el, children);
  return el;
}

export function appendContent(parent, content) {
  if (content == null) return;
  const append = (item) => {
    if (item == null) return;
    if (item instanceof Node) parent.appendChild(item);
    else parent.appendChild(document.createTextNode(String(item)));
  };
  if (Array.isArray(content)) content.forEach(append);
  else append(content);
}

export const esc = s => {
  if (s == null) return '';
  if (s instanceof Node) return s.outerHTML || '';
  return String(s).replace(/[&<>"']/g, m =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
};
