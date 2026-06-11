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
    _routeDisposers: [],

    on(path, handler) {
      this._routes[path] = handler;
      return this;
    },

    navigate(path) {
      window.location.hash = path;
    },

    init() {
      const handle = async () => {
        const hash = window.location.hash || '#/';
        const handler = this._routes[hash];

        if (this._current === hash) return;

        // Cleanup previous route
        if (this._routeDisposers) {
          this._routeDisposers.forEach(fn => { try { fn(); } catch(e) { console.warn('[Router] Cleanup failed', e); } });
          this._routeDisposers = [];
        }

        this._current = hash;

        // Update active nav
        if (typeof $$ === 'function') {
          $$('.nav-item').forEach((item) => {
            const href = item.getAttribute('href') || '';
            item.classList.toggle('active', href === hash);
          });
        }

        Progress?.pageBar?.start?.();

        const announce = () => {
          try {
            const main = document.getElementById('main-content');
            main?.focus?.({ preventScroll: true });
            const region = document.getElementById('aria-announcer');
            const getLabel = typeof this._getRouteLabel === 'function' ? this._getRouteLabel : h => h.replace('#/', '') || 'home';
            const label = getLabel(hash);
            if (region) region.textContent = `Navigated to ${label}`;
          } catch {}
        };

        try {
          const viewResult = handler ? handler(hash) : getNotFoundView?.()?.(hash);
          const result = await Promise.resolve(viewResult);

          if (result && typeof result === 'object') {
            const { beforeLeave, unmount } = result;
            if (typeof beforeLeave === 'function') this._routeDisposers.push(beforeLeave);
            if (typeof unmount === 'function') this._routeDisposers.push(unmount);
          }

          Progress?.pageBar?.finish?.();
          announce();
          bus?.emit?.('route:ready', { hash });
        } catch (error) {
          console.error(`[PlasmaDeck Router] Error mounting "${hash}":`, error);
          Progress?.pageBar?.fail?.();
          
          // Attempt fallback to 404
          try { 
            const fallback = getNotFoundView?.()?.(hash);
            await Promise.resolve(fallback);
          } catch { /* critical failure */ }
          
          announce();
          bus?.emit?.('route:ready', { hash, error: String(error) });
        } finally {
          bus?.emit?.('route:change', { hash });
        }
      };

      window.addEventListener('hashchange', handle);
      // Guard initial call
      try { handle(); } catch(e) { console.error('[Router] Initial handle failed', e); }
    },
  };
}
