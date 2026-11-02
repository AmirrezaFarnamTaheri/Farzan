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
- Modal and drawer primitives are owned by `src/ui/overlays.js`; the app shell uses them through their shared lifecycle.
- Modal, drawer, and command palette openings inert `#ocd-app`, trap focus inside the overlay, and restore focus to the opener on close.
- Route changes focus `#main-content` and announce through `#aria-announcer`.

### Storage

- `db.js` owns the IndexedDB schema, with `bridge.js` exposing the current canonical `window.DB` API.
- When a passphrase is set on `OpenCourseDB`, `put`/`add`/`bulkPut`/`get`/`getAll`/`getAllByIndex`/`queryIndex` encrypt and decrypt AES-GCM v2 envelopes. IndexedDB keyPath and index fields (`id`, `courseId`, …) stay in plaintext on the envelope so indexes still work. Library file blobs in `opencoursedeck-library-files` are not encrypted.

### Key modules

- `app.js`: router, views, UI kit, boot/init glue.
- `src/lib/dom.js`: shared DOM helpers such as focus trap, focus restore, inert app background, debounce, throttle, selectors, and IDs.
- `src/features/commandPalette.js`: command palette overlay and keyboard semantics.
- `src/core/prefs.js`: appearance preferences (accent, density, font scale, direction, language). Accent swatches opt in with `data-accent-option`; the root `<html data-accent>` attribute is the applied state, never a click target. `Prefs.init()` registers one delegated document listener and is idempotent — it returns a disposer, and `Prefs.dispose()` removes it.
- `app.js` owns `OpenCourseDeck.TopbarSearch`, which uses live Fuse.js and lexical search; there is no second application search engine.
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

- Active utilities include `OpenCourseDeck.dom`, `ThemeManager`, `Prefs`, `FontScale`, `KeyboardShortcuts`, `ContextMenu`, `CanvasExport`, `Clipboard`, and `Pointer`. Unused graph, custom CanvasTools and Chart.js adapter facades were deleted before release.
- The app-level `OpenCourseDeck.plugins` object is not an installable plugin system. The earlier unused manifest/registry prototype was retired; no `OpenCourseDeck.PluginHost`, worker plugin sandbox, marketplace or plugin lifecycle is shipped. Historical plugin registry keys are left intact for recovery and would require a separate, approved migration if a real plugin system is introduced.
- Locale dictionaries remain. No translator or translation-cache runtime is shipped; do not advertise a translation workflow before it is implemented and approved.
- Player-adjacent source modules `MediaStorage` and `WaveformScrubber` are imported by the lazy `player` feature loader in `src/index.js` (`pd.loadFeature('player')`). `player.js` still probes those namespaces at runtime and falls back if a custom embed loads the player without the feature loader.
- User library creation is a shipped product surface: `src/features/addContent.js` and `src/features/userLibrary.js` are initialized after the app shell resolves. Add video/PDF/topic/course/URL writes a user overlay (`ocd_user_library`) that `DataStore.mergeRaw(..., { userOwned: true })` keeps separate from the catalog so a catalog reload cannot resurrect a deleted user course. File blobs live in the `opencoursedeck-library-files` IndexedDB and play through `library-file:` refs resolved to blob URLs.

### Performance notes

- Startup timings are available through `?debug=1` and include bundle import, bundle-to-ready, and app init durations.
- Unused classic search/catalog workers and their public WorkerPool facade were removed. The shipped browser search uses Fuse.js and canonical lexical ranking; PDF.js maintains its own vendor worker.
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
