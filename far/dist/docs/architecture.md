## Architecture

### Runtime model (current)

- `index.html` loads vendor bundles (`vendor/*.js`) as deferred classic scripts.
- `index.html` loads a single ES module entrypoint: `dist/plasma.js`.
- `dist/plasma.js` (currently) bundles the existing IIFE modules in a fixed order via `src/index.js`.
- The app exposes APIs on `window.PlasmaDeck` and uses a hash router.
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

### Performance notes

- Startup timings are available through `?debug=1` and include bundle import, bundle-to-ready, and app init durations.
- High-impact lazy-init candidates are `notes.js`, `pdf.js`, `player.js`, `canvas.js`, and progress charts.
- Known hotspots are tracked in `docs/roadmap.md`.
