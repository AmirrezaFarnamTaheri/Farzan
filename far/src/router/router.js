/**
 * Hash-based SPA router (dependency-injected for tests and shell wiring).
 */
export function createRouter({
  $$,
  Progress,
  bus,
  getNotFoundView,
} = {}) {
  return {
    _routes: {},
    _current: null,

    on(path, handler) {
      this._routes[path] = handler;
      return this;
    },

    navigate(path) {
      window.location.hash = path;
    },

    init() {
      const handle = () => {
        const hash = window.location.hash || '#/';
        const handler = this._routes[hash];

        if (this._current === hash) return;
        this._current = hash;

        // Update active nav (match the actual <a href="#/..."> in index.html)
        if (typeof $$ === 'function') {
          $$('.nav-item').forEach((item) => {
            const href = item.getAttribute('href') || '';
            item.classList.toggle('active', href === hash);
          });
        }

        Progress?.pageBar?.start?.();

        const announce = () => {
          const main = document.getElementById('main-content');
          main?.focus?.({ preventScroll: true });
          const region = document.getElementById('aria-announcer');
          if (region) region.textContent = `Navigated to ${hash.replace('#/', '') || 'home'}`;
        };

        if (handler) {
          Promise.resolve(handler(hash)).then(() => {
            Progress?.pageBar?.finish?.();
            announce();
          });
        } else {
          console.warn(`[PlasmaDeck Router] No handler for "${hash}"`);
          try { getNotFoundView?.()?.(hash); } catch { /* ignore */ }
          Progress?.pageBar?.finish?.();
          announce();
        }

        bus?.emit?.('route:change', { hash });
      };

      window.addEventListener('hashchange', handle);
      handle();
    },
  };
}

