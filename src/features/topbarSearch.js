/**
 * Topbar search — module entry point.
 *
 * The live implementation lives in the app shell (app.js), where it is
 * created as an app-lifetime singleton and published as
 * window.OpenCourseDeck.TopbarSearch. The browser smoke/e2e scripts
 * assert against that instance (tests/e2e/plasmato-visual.spec.js reads
 * `.search-result-item` children plus `input`, `resultsBox` and
 * `_universalData` off it), so app.js is the single source of truth and
 * the e2e contract is pinned to it.
 *
 * This file previously held a SECOND, divergent copy of the search
 * implementation. Nothing imported it, so it never shipped, but it was
 * still a trap for the next reader:
 *
 *   - It built its own Fuse index with keys (`label`, `description`,
 *     `searchText`, `tags`) that do not match the live result shape, so
 *     "fixing" it would have fixed nothing.
 *   - Its result icons were literal '??' placeholders instead of the
 *     sprite icons the live renderer emits.
 *   - It called `window.OpenCourseDeck?.WorkerPool?.runInWorker` with a
 *     message shape the search worker does not accept, so the fuzzy path
 *     could only ever have failed over to the main thread.
 *   - Its `_plainText()` used `innerHTML`, the exact XSS sink that
 *     docs/forensic-audit-2026-07.md records as finding S-2 and that was
 *     fixed in app.js. The dead copy still carried the vulnerable form.
 *
 * Rather than keep a parallel implementation that can silently drift from
 * the one the e2e suite exercises, this module now only forwards to the
 * canonical singleton. The worker-backed fuzzy index stays out of the live
 * path on purpose: the search worker is shipped and precached, but the live
 * searcher's substring matching is the behaviour the e2e suite asserts, so
 * changing it is a product decision rather than a cleanup.
 */

/**
 * @returns {object|null} the canonical topbar search instance, or null when
 *   the app shell has not booted yet.
 */
export function getTopbarSearch() {
  return window.OpenCourseDeck?.TopbarSearch ?? null;
}

/**
 * Facade over the canonical app-shell singleton.
 *
 * Property reads are forwarded live, so `TopbarSearch.input` and
 * `TopbarSearch.resultsBox` reflect the mounted widget rather than a
 * snapshot. Methods are forwarded with the singleton as the receiver so
 * they keep their `this` binding.
 */
export const TopbarSearch = {
  get instance() {
    return getTopbarSearch();
  },
  get input() {
    return getTopbarSearch()?.input ?? null;
  },
  get resultsBox() {
    return getTopbarSearch()?.resultsBox ?? null;
  },
  get _universalData() {
    return getTopbarSearch()?._universalData ?? null;
  },
  init() {
    return getTopbarSearch()?.init?.();
  },
  setData(data) {
    return getTopbarSearch()?.setData?.(data);
  },
  _onInput(value) {
    return getTopbarSearch()?._onInput?.(value);
  },
  _queryUniversal(value) {
    return getTopbarSearch()?._queryUniversal?.(value);
  },
  _loadUniversalData() {
    return getTopbarSearch()?._loadUniversalData?.();
  },
  _plainText(value) {
    return getTopbarSearch()?._plainText?.(value) ?? '';
  },
  _render(results, query) {
    return getTopbarSearch()?._render?.(results, query);
  },
  _appendHighlighted(parent, text, query, matches) {
    return getTopbarSearch()?._appendHighlighted?.(parent, text, query, matches);
  },
  _close() {
    return getTopbarSearch()?._close?.();
  },
};
