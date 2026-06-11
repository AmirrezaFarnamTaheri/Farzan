## Roadmap And Backlog

This backlog keeps the high-RoI upgrade plan tied to concrete files, definitions of done, and test expectations.

### Prioritized Backlog

| Priority | Item | Impact | Effort | File Targets | Definition Of Done | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| Done | Overlay focus and inert background | High | Low | `index.html`, `app.js`, `src/lib/dom.js`, `src/features/commandPalette.js`, `tests/app-core.test.js`, `tests/dom.test.js`, `tests/command-palette.test.js` | Skip link and main focus target are present; `role="application"` is absent; modal, drawer, and command palette trap escaped focus, inert `#plasma-app`, and restore focus to the opener. Drawer openings now receive explicit dialog semantics, and palette close is idempotent so stale close events cannot corrupt inert bookkeeping. | Focus-trap, inert-depth, DOM-replacement, palette restore, idempotent close, and drawer dialog regression tests. |
| Done | Onboarding docs | High | Low | `README.md`, `docs/getting-started.md`, `docs/content-and-catalog.md`, `docs/backup-restore.md`, `docs/troubleshooting.md` | A new user can choose native or browser fallback launch, run first setup, understand storage buckets, add/open catalog content, export/import backups, preserve project-side catalog/media files, and recover from stale bundles, port changes, native packaging issues, and missing-data confusion. | Markdown link scan, `npm run validate`, `npm run repo:hygiene`, quickstart/smoke command checks. |
| Done | Styled async confirm | High | Low | `app.js`, `ui.js`, `progress.js`, `notes.js`, `pdf.js`, `tests/app-core.test.js`, `tests/ui.test.js` | App-level confirmation is Promise-based through `Modal.confirmAsync`; the stale synchronous `Modal.confirm` shorthand was removed, Settings account deletion awaits the styled dialog, and progress/notes/PDF adapters prefer the app UI/modal confirm before falling back to native `window.confirm()` only when the modal layer is unavailable. | DOM tests cover confirm/cancel Promise resolution; UI tests verify the styled modal adapter is used before native confirm; feature tests continue to cover import/delete confirm flows. |
| Done | Route heavy modules lazily | High | Medium | `src/index.js`, `app.js`, `notes.js`, `pdf.js`, `player.js`, `canvas.js`, `progress.js`, `tests/app-route-lifecycle.test.js`, `tests/assets-precache.test.js`, `tests/smoke-script.test.js`, `scripts/smoke-test.cjs`, `scripts/browser-smoke.cjs` | Entry boot keeps player, notes, PDF, canvas, and progress behind memoized dynamic imports; heavy routes call `loadRouteFeatures()` only when navigation reaches them, then re-check the route context before mounting so stale async imports cannot render over newer navigation. Route shells remain separately imported, production output emits lazy feature/route chunks, and smoke coverage probes chunk URLs instead of assuming a monolithic app bundle. | Unit coverage verifies route feature modules load before heavy route mounting, entry coverage verifies the dynamic import registry, smoke helpers collect nested lazy chunks, production smoke requires lazy route chunks, and browser smoke navigates Courses, Notes, PDF, Studio, and Progress. |
| Done | PDF search cache and cancellation | High | Medium | `pdf.js`, `tests/pdf.test.js` | New searches invalidate stale scans through `searchToken`; page text is cached by derived document fingerprint/source key; loading a different document clears stale text; results include snippet text and avoid re-running `getTextContent()` for cached pages. | PDF tests cover stale-search cancellation, page text caching, fingerprint-scoped cache keys, cache reset on new load, and snippet-bearing results. |
| Done | Notes scalable rendering | High | Medium | `notes.js`, `tests/notes.test.js` | Note lists render in cancelable batches, small editor saves patch the affected row through `refreshItem`, and plain-text extraction for excerpts/search is cached per note content and pruned when notes disappear so large lists avoid repeated DOM parsing. | Notes tests cover incremental large-list rendering/cancelation, DB-backed store updates, row refresh behavior through editor saves, and excerpt/search text cache reuse/pruning. |
| Done | Indexed DB query indexes | Medium | Medium | `db.js`, `bridge.js`, `tests/bridge.test.js` | Progress-by-course, timestamp-by-topic/course, note-by-topic/course/folder, recent-note, and folder-child helpers now use IndexedDB indexes/cursors where possible, with compatibility fallbacks for legacy localStorage and default-folder records. | fake-indexeddb coverage verifies indexed progress/timestamp/note/folder/recent queries and localStorage fallback behavior. |
| Done | Player visualizer resize fix | Medium | Low | `player.js`, `tests/player.test.js` | Canvas resizes via `ResizeObserver`, not every animation frame; reduced-motion users get a cleared static canvas instead of a continuous visualizer animation loop. | Player regression tests cover observer sizing, cleanup, and reduced-motion animation suppression. |
| Done | In-app Help route | Medium | Medium | `index.html`, `app.js`, docs links | Help page includes first-run checklist, storage summary, backup entry, and shortcuts entry point. | Build verification plus manual navigation. |
| Done | First-run Home dashboard | High | Low | `app.js`, `style.css`, `docs/getting-started.md` | Home gives launch actions, catalog snapshot, next steps, and newcomer guidance instead of a placeholder card. | Build plus manual Home route check. |
| Done | Windows-safe npm scripts | High | Low | `package.json`, `vitest.config.js`, `scripts/smoke-test.cjs`, `scripts/dev-server.cjs`, `docs/getting-started.md` | Build, lint, test, smoke, and service-worker scripts use local entry points, avoid fragile child-process paths where practical, and do not require `.bin` shims. | `npm test`, `npm run build`, `npm run smoke`. |
| Done | Brand refresh | Medium | Medium | `assets/favicon.svg`, `assets/icon-192.svg`, `assets/og-cover.svg`, `index.html`, `manifest.json` | One consistent SVG mark is used across app icon, favicon, shell fallback imagery, and OG cover; manifest theme colors match the refreshed identity. | Asset reference validation, catalog validation, and full CI. |

### Expansion Picks

Start with these because they improve first-run confidence and daily use without a framework rewrite:

1. Guided import/export with validation feedback.
2. Search facets for tags, courses, and materials.
3. Bundle trimming before large new runtime features, because route-level lazy loading for PDF, player, notes, canvas, and progress modules is now complete and verified.

### Acceptance Checks

- Keyboard can reach main content through the skip link.
- Dialogs, drawers, and the command palette cannot leak focus to the background.
- Focus returns to the opener after close.
- Route changes announce through the live region and focus `#main-content`.
- `npm run build` and `npm test` pass.
- `?debug=1` records boot timing entries in `debug.log`.
