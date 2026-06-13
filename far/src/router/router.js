/**
 * Hash-based SPA router (dependency-injected for tests and shell wiring).
 */
export function createRouter({
  $$,
  Progress,
  bus,
  getNotFoundView,
  getRouteLabel,
} = {}) {
  return {
    _routes: {},
    _current: null,
    _currentController: null,
    _navSeq: 0,
    _currentAbortController: null,

    on(path, handler) {
      this._routes[path] = handler;
      return this;
    },

    navigate(path) {
      window.location.hash = path;
    },

    refresh(detail = {}) {
      return this._handle?.({ force: true, detail });
    },

    init() {
      const handle = async ({ force = false, detail = null } = {}) => {
        const hash = window.location.hash || '#/';
        const handler = this._routes[hash];

        if (!force && this._current === hash) return;
        const from = this._current;
        const previousController = this._currentController;
        this._currentAbortController?.abort?.();
        const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
        this._currentAbortController = abortController;
        this._current = hash;
        this._currentController = null;
        const navSeq = ++this._navSeq;
        const isCurrent = () => navSeq === this._navSeq && this._current === hash && !abortController?.signal?.aborted;
        const routeContext = {
          from,
          to: hash,
          hash,
          refresh: force,
          detail,
          signal: abortController?.signal ?? null,
          isCurrent,
        };

        const routeEvent = force ? { hash, refresh: true, detail } : { hash };
        const beforeEvent = force ? { from, to: hash, refresh: true, detail } : { from, to: hash };
        bus?.emit?.('route:beforechange', beforeEvent);
        if (previousController) {
          try { await previousController.beforeLeave?.({ from, to: hash }); } catch (err) { console.warn('[PlasmaDeck Router] beforeLeave failed', err); }
          try { await previousController.unmount?.({ from, to: hash }); } catch (err) { console.warn('[PlasmaDeck Router] unmount failed', err); }
        }

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
          if (region) {
            const label = getRouteLabel?.(hash) ?? (hash.replace('#/', '') || 'home');
            region.setAttribute('role', region.getAttribute('role') || 'status');
            region.setAttribute('aria-live', region.getAttribute('aria-live') || 'polite');
            region.setAttribute('aria-atomic', region.getAttribute('aria-atomic') || 'true');
            region.textContent = `Navigated to ${label}`;
          }
        };

        const showRouteError = (err) => {
          if (!isCurrent()) return;
          console.error(`[PlasmaDeck Router] Handler failed for "${hash}"`, err);
          bus?.emit?.('route:error', { hash, error: err });
          const main = document.getElementById('main-content');
          if (main) {
            main.innerHTML = `
              <section class="view view-error" aria-labelledby="route-error-title">
                <div class="empty-state">
                  <div class="empty-state-icon" aria-hidden="true">!</div>
                  <h1 id="route-error-title">This view could not load</h1>
                  <p>PlasmaDeck hit an error while opening this section. Try reloading, or return home and continue from there.</p>
                  <div class="empty-state-actions">
                    <button class="btn btn-primary" type="button" data-route-reload>Reload</button>
                    <a class="btn btn-secondary" href="#/home">Go home</a>
                  </div>
                </div>
              </section>`;
            main.querySelector('[data-route-reload]')?.addEventListener('click', () => location.reload());
          } else {
            try { getNotFoundView?.()?.(hash); } catch { /* ignore */ }
          }
        };

        if (handler) {
          Promise.resolve()
            .then(() => handler(hash, routeContext))
            .then((controller) => {
              if (!isCurrent()) return;
              if (typeof controller === 'function') {
                this._currentController = { unmount: controller };
              } else if (controller && typeof controller === 'object') {
                this._currentController = controller;
              }
            })
            .catch(showRouteError)
            .finally(() => {
              if (!isCurrent()) return;
              Progress?.pageBar?.finish?.();
              announce();
              bus?.emit?.('route:change', routeEvent);
              bus?.emit?.('route:ready', routeEvent);
            });
        } else {
          console.warn(`[PlasmaDeck Router] No handler for "${hash}"`);
          try { getNotFoundView?.()?.(hash); } catch { /* ignore */ }
          Progress?.pageBar?.finish?.();
          announce();
          bus?.emit?.('route:change', routeEvent);
          bus?.emit?.('route:ready', routeEvent);
        }
      };

      this._handle = handle;
      window.addEventListener('hashchange', () => handle());
      handle();
    },
  };
}
