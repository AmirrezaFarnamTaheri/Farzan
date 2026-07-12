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
    _hashChangeHandler: null,
    _handlePromise: Promise.resolve(),

    on(path, handler) {
      this._routes[path] = handler;
      return