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
- Modal, drawer, and command palette openings inert `#plasma-app`, trap focus inside the overlay, and restore focus to the opener on close.
- Route changes focus `#main-content` and announce through `#aria-announcer`.

### Storage

- Phase 1 migration introduces IndexedDB-backed `window.DB` facade (see `bridge.js`).
- A one-time migration reads legacy localStorage keys and writes them into IndexedDB.

### Key modules

- `app.js`: router, views, UI kit, boot/init glue.
- `src/lib/dom.js`: shared DOM helpers such as focus trap, focus restore, inert app background, debounce, throttle, selectors, and IDs.
- `src/features/commandPalette.js`: command palette overlay and keyboard semantics.
- `notes.js`: editor + notes UI (sanitized via DOMPurify).
- `pdf.js`: PDF viewer (pdfjs-dist vendored).
- `canvas.js`: whiteboard canvas (loop pauses when tab hidden).
- `progress.js`: progress stats + charts + progress UI toolkit (`ProgressUI`).

### Active namespaces

- Utility/core namespaces exposed by the active app shell: `OpenCourseDeck.dom`, `OpenCourseDeck.ThemeManager`, `OpenCourseDeck.Prefs`, `OpenCourseDeck.FontScale`, `OpenCourseDeck.KeyboardShortcuts`, `OpenCourseDeck.ContextMenu`, `OpenCourseDeck.CanvasExport`, `OpenCourseDeck.Clipboard`, `OpenCourseDeck.Pointer`, and `OpenCourseDeck.CanvasTools`.
- Chart and visualization namespaces exposed by the active app shell: `OpenCourseDeck.Charts`, `OpenCourseDeck.ChartPlugins`, `OpenCourseDeck.CanvasCharts`, `OpenCourseDeck.CanvasZoom`, `OpenCourseDeck.CourseGraph`, `OpenCourseDeck.KnowledgeGraph`, and `OpenCourseDeck.Graphs`.
- `OpenCourseDeck.ChartPlugins` is bundled and exposes the Chart.js plugin objects imported in `app.js`: heatmap, sparkline, arc, and gauge. `OpenCourseDeck.CanvasCharts` is bundled and exposes `CanvasGauge`, `CanvasTreemap`, `CanvasAreaChart`, and `CanvasHeatmap`.
- These visualization namespaces are bundled and exposed for runtime use; deeper route-level UX integration is still separate from namespace exposure.
- Plugin runtime state currently exposes `OpenCourseDeck.plugins` as an app-level object. `src/features/pluginHost.js` exists and is tested, but it is not imported by `src/index.js` or `app.js`, so `OpenCourseDeck.PluginHost` is not part of the active runtime bundle by default.
- Translation modules ARE part of the active runtime bundle: `src/index.js` imports `src/features/translator.js` and `src/features/translationCache.js` and exposes them as `OpenCourseDeck.TranslatorRegistry` and `OpenCourseDeck.TranslationCache`. The registry is wired, but no view calls it yet (notes and the player have no translate action).
- Player-adjacent source modules such as `MediaStorage` and `WaveformScrubber` expose namespaces when their modules are imported, and `player.js` checks for those namespaces. They are not imported by the active entrypoint in the current runtime, so the player falls back when those namespaces are absent.

### Performance notes

- Startup timings are available through `?debug=1` and include bundle import, bundle-to-ready, and app init durations.
- High-impact lazy-init candidates are `notes.js`, `pdf.js`, `player.js`, `canvas.js`, and progress charts.
- Known hotspots are tracked in `docs/roadmap.md`.
