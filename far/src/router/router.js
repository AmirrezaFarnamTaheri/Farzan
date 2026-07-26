/**
 * Hash-based SPA router with cancellation-aware lifecycle handling.
 */
export function createRouter({ $$, Progress, bus, getNotFoundView, getRouteLabel } = {}) {
  const router = {
    _routes: {},
    _current: null,
    _currentController: null,
    _navSeq: 0,
    _currentAbortController: null,
    _hashChangeHandler: null,
    _handlePromise: Promise.resolve(),

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

    destroy() {
      this._currentAbortController?.abort?.();
      if (this._hashChangeHandler) {
        window.removeEventListener('hashchange', this._hashChangeHandler);
      }
      this._hashChangeHandler = null;
      this._currentController = null;
      this._current = null;
    },

    init() {
      if (this._hashChangeHandler) return this._handlePromise;

      const handle = async ({ force = false, detail = null } = {}) => {
        const rawHash = window.location.hash || '#/';
        if (!rawHash.startsWith('#/') && this._current) {
          // In-page anchor (e.g. #settings-appearance): let the browser
          // scroll to it instead of tearing down the mounted view for a
          // hash that can never match a route.
          return;
        }
        const hash = rawHash.startsWith('#/') ? rawHash : '#/';
        // Routes are registered as bare paths; anything after '?' is data
        // for the view, exposed via context.query.
        const [path, queryString = ''] = hash.split('?');
        const handler = this._routes[path];
        if (!force && this._current === hash) return;

        const from = this._current;
        const previousController = this._currentController;
        this._currentAbortController?.abort?.();

        const abortController = typeof AbortController === 'undefined'
          ? null
          : new AbortController();
        const navSeq = ++this._navSeq;

        this._currentAbortController = abortController;
        this._current = hash;
        this._currentController = null;

        const isCurrent = () => (
          navSeq === this._navSeq
          && this._current === hash
          && !abortController?.signal?.aborted
        );
        const context = {
          from,
          to: hash,
          hash,
          path,
          query: new URLSearchParams(queryString),
          refresh: force,
          detail,
          signal: abortController?.signal ?? null,
          isCurrent,
        };
        const routeEvent = force ? { hash, refresh: true, detail } : { hash };
        const beforeEvent = force
          ? { from, to: hash, refresh: true, detail }
          : { from, to: hash };

        bus?.emit?.('route:beforechange', beforeEvent);

        if (previousController) {
          try {
            await previousController.beforeLeave?.(context);
          } catch (error) {
            console.warn('[OpenCourseDeck Router] beforeLeave failed', error);
          }
          // Deliberately NOT gated on isCurrent(). unmount() is teardown, and
          // teardown of a route we have already committed to leaving is always
          // correct. Returning early here (as this did) stranded the previous
          // controller: each navigation captures previousController from
          // this._currentController and immediately nulls it, so a navigation
          // that supersedes this one during beforeLeave sees null and can never
          // unmount it either. The route's listeners, timers and media players
          // stayed live for the rest of the session while its replacement
          // mounted on top.
          try {
            await previousController.unmount?.(context);
          } catch (error) {
            console.warn('[OpenCourseDeck Router] unmount failed', error);
          }
          if (!isCurrent()) return;
        }

        if (typeof $$ === 'function') {
          $$('.nav-item').forEach((item) => {
            const href = item.getAttribute('href') || '';
            item.classList.toggle('active', href === path || href === hash);
          });
        }

        Progress?.pageBar?.start?.();

        const announce = () => {
          const main = document.getElementById('main-content');
          main?.focus?.({ preventScroll: true });
          const region = document.getElementById('aria-announcer');
          if (!region) return;
          const label = getRouteLabel?.(hash) ?? (hash.replace('#/', '') || 'home');
          region.setAttribute('role', region.getAttribute('role') || 'status');
          region.setAttribute('aria-live', region.getAttribute('aria-live') || 'polite');
          region.setAttribute('aria-atomic', region.getAttribute('aria-atomic') || 'true');
          region.textContent = `Navigated to ${label}`;
        };

        const finish = () => {
          if (!isCurrent()) return;
          Progress?.pageBar?.finish?.();
          announce();
          bus?.emit?.('route:change', routeEvent);
          bus?.emit?.('route:ready', routeEvent);
        };

        const showRouteError = (error) => {
          if (!isCurrent()) return;
          console.error(`[OpenCourseDeck Router] Handler failed for "${hash}"`, error);
          bus?.emit?.('route:error', { hash, error });
          const main = document.getElementById('main-content');
          if (!main) {
            try { getNotFoundView?.()?.(hash); } catch {}
            return;
          }
          main.innerHTML = `
            <section class="view view-error" aria-labelledby="route-error-title">
              <div class="empty-state">
                <div class="empty-state-icon" aria-hidden="true">!</div>
                <h1 id="route-error-title">This view could not load</h1>
                <p>OpenCourseDeck hit an error while opening this section.</p>
                <div class="empty-state-actions">
                  <button class="btn btn-primary" type="button" data-route-reload>Reload</button>
                  <a class="btn btn-secondary" href="#/home">Go home</a>
                </div>
              </div>
            </section>`;
          main.querySelector('[data-route-reload]')
            ?.addEventListener('click', () => location.reload());
        };

        if (!isCurrent()) return;

        if (!handler) {
          console.warn(`[OpenCourseDeck Router] No handler for "${hash}"`);
          try { getNotFoundView?.()?.(hash); } catch {}
          finish();
          return;
        }

        try {
          const controller = await handler(hash, context);
          if (!isCurrent()) {
            if (typeof controller === 'function') {
              await controller();
            } else {
              await controller?.unmount?.({ from: hash, to: this._current, stale: true });
            }
            return;
          }
          if (typeof controller === 'function') {
            this._currentController = { unmount: controller };
          } else if (controller && typeof controller === 'object') {
            this._currentController = controller;
          }
        } catch (error) {
          showRouteError(error);
          // Do not announce success or emit route:change/route:ready for a
          // failed navigation; just stop the progress bar.
          Progress?.pageBar?.finish?.();
          return;
        }

        finish();
      };

      this._handle = (options) => {
        const run = () => handle(options);
        this._handlePromise = this._handlePromise.then(run, run);
        return this._handlePromise;
      };
      this._hashChangeHandler = () => this._handle();
      window.addEventListener('hashchange', this._hashChangeHandler);
      return this._handle();
    },
  };

  return router;
}
