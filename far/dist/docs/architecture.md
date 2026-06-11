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

### Canonical storage model

PlasmaDeck treats IndexedDB, exposed through the `window.DB` bridge in `bridge.js`, as the canonical store for user-generated learning data. `localStorage` remains for small preferences, compatibility mirrors, and bridge-less fallback contexts; it is not the primary source of truth for notes, folders, annotations, progress, timestamps, playlists, or Studio boards when the bridge is available.

| Data type | Canonical owner | Bridge/API path | Notes |
| --- | --- | --- | --- |
| Catalog pointer | `data/catalog.json` | `DataStore.init()` through `bridge.js` | The pointer and resolved active catalog are fetched with `cache: no-cache` so the service worker may revalidate them without permanently serving stale catalog metadata. |
| Catalog course/topic/source data | Active catalog JSON | `DataStore.allCourses()`, `DataStore.allTopics()`, `DataStore.getTopic()` | Course sources are flattened so every source contributes topics, videos, PDFs, and search records. |
| Progress | IndexedDB `progress` store | `DB.getAllProgress()`, `DB.saveProgress()` | Export/import, progress stats, achievements, reset, and rollback all use this store. |
| Video timestamps | IndexedDB `timestamps` store | `DB.getAllTimestamps()`, `DB.saveTimestamp()` | Used by bookmarks, playlists, backup export/import, and media-study resets. |
| Notes | IndexedDB `notes` store | `DB.getAllNotes()`, `DB.saveNote()`, `DB.deleteNote()` | Notes UI hydrates an in-memory cache from the bridge and writes create/update/delete/import operations back through the bridge. Legacy localStorage notes are merged by newest timestamp during repair/migration paths. |
| Note folders | IndexedDB `folders` store | `DB.getAllFolders()`, `DB.saveFolder()`, `DB.deleteFolder()` | Folder creation, deletion, import, export, and repair share the same bridge path. |
| Notes settings | IndexedDB `settings` store | `DB.getSetting('plasma-notes-settings')`, `DB.saveSetting()` | Notes settings are scoped separately from playlists and Studio board state during reset. |
| Saved playlists | IndexedDB `settings` store | `DB.getSetting('plasma-playlists')`, `DB.saveSetting()` | Saved playlists are backup-portable and have their own Settings wipe scope. |
| Studio board | IndexedDB `settings` store | `DB.getSetting('plasma-studio-board')`, `DB.saveSetting()` | The active canvas board is included in backup/import and can be wiped independently. |
| PDF annotations | IndexedDB `annotations` store | `DB.getAnnotations()`, `DB.getAllAnnotations()`, `DB.saveAnnotations()` | Annotation records are grouped by document id and page, exported with backups, and included in media-study reset. |
| Preferences | `localStorage` | `Prefs`, `ThemeManager`, `FontScale` | Preferences are intentionally small and origin-local. They are included in full local wipe semantics, not in the learning-data backup schema. |
| Backup/import state | Canonical stores plus schema metadata | `ProgressStats.exportJSON()`, `ProgressStats.importJSON()` | Backup schema `1.3` includes progress, timestamps, notes, folders, notes settings, playlists, Studio board state, annotations, storage estimates, validation counts, conflict skips, and rollback-on-write-error behavior. |

Scoped clearing follows the same ownership rules. Progress, notes, media study data, saved playlists, Studio boards, preferences, and all local app-owned data each have explicit wipe paths through `DB.clearUserData(scope)`, while `DB.clearAll()` clears the complete app-owned IndexedDB and compatibility mirror surface.

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
