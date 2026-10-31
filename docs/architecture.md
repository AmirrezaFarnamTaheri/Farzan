## Architecture

### Runtime model (current)

- `index.html` loads vendor bundles (`vendor/*.js`) as deferred classic scripts.
- `index.html` loads a single ES module entrypoint: `dist/opencoursedeck.js`.
- `dist/opencoursedeck.js` (currently) bundles the existing IIFE modules in a fixed order via `src/index.js`.
- The app exposes APIs on `window.OpenCourseDeck` and uses a hash router.
- `boot.js` imports the bundle and can report boot timing to `/__debug` when the app is opened with `?debug=1`.

### Accessibility model

- `index.html` provides native landmarks and a skip link to `#main-content`.
- Avoid `role="application"` on the app root; native browser and screen-reader navigation should stay available.
- Overlay primitives live in `app.js` and use helpers from `src/lib/dom.js`.
- Modal, drawer, and command palette openings inert `#ocd-app`, trap focus inside the overlay, and restore focus to the opener on close.
- Route changes focus `#main-content` and announce through `#aria-announcer`.

### Storage

- Phase 1 migration introduces IndexedDB-backed `window.DB` facade (see `bridge.js`).
- A one-time migration reads legacy localStorage keys and writes them into IndexedDB.
- When a passphrase is set on `OpenCourseDB`, `put`/`add`/`bulkPut`/`get`/`getAll`/`getAllByIndex`/`queryIndex` encrypt and decrypt AES-GCM v2 envelopes. IndexedDB keyPath and index fields (`id`, `courseId`, …) stay in plaintext on the envelope so indexes still work. Library file blobs in `opencoursedeck-library-files` are not encrypted.

### Key modules

- `app.js`: router, views, UI kit, boot/init glue.
- `src/lib/dom.js`: shared DOM helpers such as focus trap, focus restore, inert app background, debounce, throttle, selectors, and IDs.
- `src/features/commandPalette.js`: command palette overlay and keyboard semantics.
- `src/core/prefs.js`: appearance preferences (accent, density, font scale, direction, language). Accent swatches opt in with `data-accent-option`; the root `<html data-accent>` attribute is the applied state, never a click target. `Prefs.init()` registers one delegated document listener and is idempotent — it returns a disposer, and `Prefs.dispose()` removes it.
- `src/features/topbarSearch.js`: a thin facade over the app-shell search singleton. The live implementation lives in `app.js` and is published as `OpenCourseDeck.TopbarSearch`; the browser e2e suite asserts against that instance, so it is the single source of truth. Do not re-implement search here.
- `notes.js`: editor + notes UI (sanitized via DOMPurify).
- `pdf.js`: PDF viewer (pdfjs-dist vendored).
- `canvas.js`: whiteboard canvas (loop pauses when tab hidden).
- `progress.js`: progress stats + charts + progress UI toolkit (`ProgressUI`).

### Routes

The hash router in `app.js` registers 15 route handlers, all served by the
`Views` object (app.js:3160). Each `Views.*` member lazily imports its module
under `src/views/`.

| Route | View module | Notes |
| --- | --- | --- |
| `#/home` | `src/views/homeRoute.js` | Landing dashboard |
| `#/courses` | `src/views/coursesRoute.js` | Lazy: `loadRouteFeatures('player')` |
| `#/my-courses` | `src/views/myCoursesRoute.js` | User-owned courses |
| `#/materials` | `src/views/materialsRoute.js` | |
| `#/tags` | `src/views/tagsRoute.js` | |
| `#/playlists` | `src/views/playlistsRoute.js` | |
| `#/bookmarks` | `src/views/bookmarksRoute.js` | |
| `#/notes` | `src/views/notesRoute.js` | Lazy: `loadRouteFeatures('notes')` |
| `#/pdf` | `src/views/pdfRoute.js` | Lazy: `loadRouteFeatures('pdf')` |
| `#/studio` | `src/views/studioRoute.js` | Lazy: `loadRouteFeatures('canvas')` |
| `#/flashcards` | `flashcards.js` (repo root) | Side-effect module: registers `OpenCourseDeck.Flashcards`. Lazy: `loadRouteFeatures('flashcards')` |
| `#/progress` | `src/views/progressRoute.js` | Lazy: `loadRouteFeatures('progress')` |
| `#/achievements` | `src/views/achievementsRoute.js` | |
| `#/help` | `src/views/helpRoute.js` | |
| `#/settings` | `src/views/settingsRoute.js` | Owns the accent picker |

`src/views/notFoundRoute.js` is the catch-all view. Lazy routes await their
feature chunk and then re-check `ctx.isCurrent()` before rendering, so a fast
navigation during the load cannot paint a stale view.

### Active namespaces

- Utility/core namespaces exposed by the active app shell: `OpenCourseDeck.dom`, `OpenCourseDeck.ThemeManager`, `OpenCourseDeck.Prefs`, `OpenCourseDeck.FontScale`, `OpenCourseDeck.KeyboardShortcuts`, `OpenCourseDeck.ContextMenu`, `OpenCourseDeck.CanvasExport`, `OpenCourseDeck.Clipboard`, `OpenCourseDeck.Pointer`, and `OpenCourseDeck.CanvasTools`.
- Chart and visualization namespaces exposed by the active app shell: `OpenCourseDeck.Charts`, `OpenCourseDeck.ChartPlugins`, `OpenCourseDeck.CanvasCharts`, `OpenCourseDeck.CanvasZoom`, `OpenCourseDeck.CourseGraph`, `OpenCourseDeck.KnowledgeGraph`, and `OpenCourseDeck.Graphs`.
- `OpenCourseDeck.ChartPlugins` is bundled and exposes the Chart.js plugin objects imported in `app.js`: heatmap, sparkline, arc, and gauge. `OpenCourseDeck.CanvasCharts` is bundled and exposes `CanvasGauge`, `CanvasTreemap`, `CanvasAreaChart`, and `CanvasHeatmap`.
- These visualization namespaces are bundled and exposed for runtime use; deeper route-level UX integration is still separate from namespace exposure.
- Plugin runtime state currently exposes `OpenCourseDeck.plugins` as an app-level object. `src/features/pluginHost.js` exists and is tested, but it is not imported by `src/index.js` or `app.js`, so `OpenCourseDeck.PluginHost` is not part of the active runtime bundle by default.
- Translation modules ARE part of the active runtime bundle: `src/index.js` imports `src/features/translator.js` and `src/features/translationCache.js` and exposes them as `OpenCourseDeck.TranslatorRegistry` and `OpenCourseDeck.TranslationCache`. The registry is wired, but no view calls it yet (notes and the player have no translate action).
- Player-adjacent source modules `MediaStorage` and `WaveformScrubber` are imported by the lazy `player` feature loader in `src/index.js` (`pd.loadFeature('player')`). `player.js` still probes those namespaces at runtime and falls back if a custom embed loads the player without the feature loader.
- User library creation is a shipped product surface: `src/features/addContent.js` and `src/features/userLibrary.js` are initialized after the app shell resolves. Add video/PDF/topic/course/URL writes a user overlay (`ocd_user_library`) that `DataStore.mergeRaw(..., { userOwned: true })` keeps separate from the catalog so a catalog reload cannot resurrect a deleted user course. File blobs live in the `opencoursedeck-library-files` IndexedDB and play through `library-file:` refs resolved to blob URLs.

### Performance notes

- Startup timings are available through `?debug=1` and include bundle import, bundle-to-ready, and app init durations.
- The generic `src/lib/workerPool.js` has no confirmed live caller and is not eagerly imported. A small `OpenCourseDeck.WorkerPool` facade keeps `runInWorker()` (Promise-returning), `getWorkerStatus()` and `terminateAll()` available synchronously; it imports the original pool only on an actual request. Direct exports remain available. The `OpenCourseDeck.workers` URLs and both shipped workers remain stable and precached for offline/browser verification.
- High-impact lazy-init candidates are `notes.js`, `pdf.js`, `player.js`, `canvas.js`, and progress charts.
- Known hotspots are tracked in `docs/roadmap.md`.

### Rendering performance

- Route sections (`#view-container > .view`) use `content-visibility: auto` with a
  720px intrinsic-size hint, so offscreen route content skips layout and paint and
  the scrollbar stays stable before first paint.
- `prefers-reduced-motion`, `forced-colors`, and `reduced-transparency` each have
  dedicated guards in `src/styles/enhancements.css`; glass surfaces degrade to
  solid cards instead of stacking blur over the WebGL background.
- Feature chunks stay lazy through `loadFeature()` (player, notes, pdf, canvas,
  progress, flashcards); `runtime-wiring.test.js` pins which modules may ship in
  the eager bundle versus a feature chunk.

### Module lifecycle conventions

Two sanctioned patterns exist for route-scoped teardown; both are correct, pick
per situation and stay consistent within a file:

- **Local `routeListeners` array** — used by the materials, settings, and studio
  views. Each view declares its own `const routeListeners = []`, an `on()`
  helper that registers and records `{ target, type, handler, options }`, and an
  `unmount()` that walks the array calling `removeEventListener`. (This is a
  per-view pattern, not a shared module.)
- **Hand-rolled disposer arrays / explicit `removeEventListener` in `unmount()`**
  — used by the remaining views (coursesRoute player disposer array is the
  reference example). Element-local listeners that die with the view innerHTML
  need no teardown at all.

### Internationalization status

The locale engine (`src/core/locale.js`, dictionaries in `src/locales/`, en-US +
fa-IR) is bundled and registered on `OpenCourseDeck.locale`, but view strings are
not yet keyed through it — the UI is English-only at runtime despite shipping a
Persian dictionary. Wiring view strings through the locale lookup is tracked as
future work; do not add new user-facing strings to the dictionaries without also
consuming them.
