## Roadmap And Backlog

This backlog keeps the high-RoI upgrade plan tied to concrete files, definitions of done, and test expectations.

### Prioritized Backlog

| Priority | Item | Impact | Effort | File Targets | Definition Of Done | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | Overlay focus and inert background | High | Low | `index.html`, `style.css`, `app.js`, `src/lib/dom.js`, `src/features/commandPalette.js` | Skip link works; `role="application"` is removed; modal, drawer, and palette trap focus, inert `#plasma-app`, and restore focus to opener. | Unit tests for focus trap, inert depth, and focus restore. Manual keyboard check for Esc, backdrop, and close button. |
| P0 | Onboarding docs | High | Low | `README.md`, `docs/getting-started.md`, `docs/content-and-catalog.md`, `docs/backup-restore.md`, `docs/troubleshooting.md` | A new user can install, run, understand storage, add/open content, and recover from common startup issues. | Link check during review; quickstart command smoke check. |
| P1 | Styled async confirm | High | Low | `app.js`, `ui.js`, `progress.js`, future notes/PDF call sites | App-level confirm returns a Promise and uses styled modal UI instead of `window.confirm()` where the UI helper is available. | Unit or DOM test for resolve true/false after confirm/cancel. Manual reset/delete flow check. |
| P1 | Route heavy modules lazily | High | Medium | `src/index.js`, `app.js`, `notes.js`, `pdf.js`, `player.js`, `canvas.js`, `progress.js` | First paint and first route are not blocked by PDF/player/notes code until needed. Boot timing logs show improvement. | Build test plus route smoke test for each lazy module. |
| P1 | PDF search cache and cancelation | High | Medium | `pdf.js` | New search cancels old scan; page text is cached per document; results include snippets and do not re-run `getTextContent()` unnecessarily. | Unit test around cancel token and cached page text; manual large-PDF search. |
| P1 | Notes scalable rendering | High | Medium | `notes.js` | Small note updates patch only affected rows; excerpts are cached; list remains responsive with hundreds of notes. | Store/update tests plus manual large list check. |
| P2 | Indexed DB query indexes | Medium | Medium | `db.js`, `bridge.js` | Common queries use indexes/cursors instead of `getAll()` plus JS filtering where possible. | fake-indexeddb coverage for recent/progress/folder queries. |
| P2 | Player visualizer resize fix | Medium | Low | `player.js`, optional `src/core/prefs.js` | Canvas resizes via `ResizeObserver`, not every animation frame; reduced motion or low-power mode reduces visualizer cost. | Manual playback and reduced-motion check. |
| Done | In-app Help route | Medium | Medium | `index.html`, `app.js`, docs links | Help page includes first-run checklist, storage summary, backup entry, and shortcuts entry point. | Build verification plus manual navigation. |
| Done | First-run Home dashboard | High | Low | `app.js`, `style.css`, `docs/getting-started.md` | Home gives launch actions, catalog snapshot, next steps, and newcomer guidance instead of a placeholder card. | Build plus manual Home route check. |
| Done | Windows-safe npm scripts | High | Low | `package.json`, `vitest.config.js`, `scripts/smoke-test.cjs`, `scripts/dev-server.cjs`, `docs/getting-started.md` | Build, lint, test, smoke, and service-worker scripts use local entry points, avoid fragile child-process paths where practical, and do not require `.bin` shims. | `npm test`, `npm run build`, `npm run smoke`. |
| P3 | Brand refresh | Medium | Medium | `assets/favicon.svg`, `assets/icon-192.svg`, `assets/og-cover.svg`, `index.html`, `manifest.json` | One consistent SVG mark replaces emoji-only branding across app icon, favicon, shell, and OG cover. | Visual check and manifest validation. |

### Expansion Picks

Start with these because they improve first-run confidence and daily use without a framework rewrite:

1. Guided import/export with validation feedback.
2. Search facets for tags, courses, and materials.
3. Route-level lazy loading for PDF, player, notes, canvas, and progress modules.

### Acceptance Checks

- Keyboard can reach main content through the skip link.
- Dialogs, drawers, and the command palette cannot leak focus to the background.
- Focus returns to the opener after close.
- Route changes announce through the live region and focus `#main-content`.
- `npm run build` and `npm test` pass.
- `?debug=1` records boot timing entries in `debug.log`.
