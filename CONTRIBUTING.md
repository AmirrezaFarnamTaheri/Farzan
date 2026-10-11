## Contributing

### Setup

```bash
npm ci --ignore-scripts --legacy-peer-deps
npm run vendor
```

### Common Commands

- `npm start`: serve locally on `http://localhost:5173/`.
- `npm run build`: build `dist/opencoursedeck.js`.
- `npm run build:sw`: generate `sw.js`.
- `npm run lint`: lint `src/`, `scripts/`, tests, and config.
- `npm test`: run Vitest.
- `npm run audit`: check package.json/lockfile consistency and lockfile integrity (not a validate/lint/test run).
- `npm run ci`: the full gate — encoding, validate, lint, release build, generated-artifact check, test, audit, bundle report, and smoke tests.

### Where To Change What

- App shell and landmarks: `index.html`.
- Styles: edit `src/styles/index.css` and its imported CSS files, especially `tokens.css`, `themes.css`, and `workspace.css`; `style.css` is a compatibility entry.
- App shell and common controls: `app.js`; route markup and handlers: `src/views/*Route.js`.
- Shared DOM helpers: `src/lib/dom.js`.
- Command palette: `src/features/commandPalette.js`.
- Reusable UI helpers: `ui.js`.
- Notes: `notes.js`.
- PDF viewer: `pdf.js`.
- Player and visualizer: `player.js`.
- Storage engine and bridge: `db.js`, `bridge.js`.
- Boot, service worker, and pre-init wiring: `boot.js`, `src/index.js`.
- Catalog selection: `data/catalog.json`.

### Guardrails

- Keep the app self-contained. Do not add CDN dependencies.
- Keep CSP healthy in `index.html`; do not add `unsafe-eval` or broad script sources.
- Prefer shared utilities in `src/lib/dom.js` over duplicating focus, selector, debounce, throttle, or ID helpers.
- Preserve keyboard behavior, focus restoration, readable contrast, reduced motion and responsive layouts when changing overlays or shared CSS.
- Keep storage errors visible. Do not replace a failed authoritative IndexedDB read with an empty array or a success toast.
- Avoid silently merging backup formats or changing persistent keys without migration tests.
- Treat service worker cache as a production concern; local dev should remain easy to refresh.

### Test Strategy

- Add unit tests for pure or DOM utility behavior in `tests/`.
- Use fake-indexeddb when touching storage behavior.
- Add regression tests for fragile UX primitives: router focus, overlay focus trap, inert state, and async confirm.
- Run `npm run build` after module import changes.
- Run `npm test` for every behavior change.

### UI and writing changes

Use the component and writing guidance in [DESIGN.md](DESIGN.md). Verify empty, loading, failure, and populated states. Preserve keyboard focus, translated layouts, and saved data. Do not add decorative "Ready" badges or imply a feature works when it does not.

### Common Pitfalls

- Opening with `file://` breaks module/fetch/service worker behavior.
- Changing the dev port changes the browser storage origin.
- Updating source files without `npm run build` leaves `dist/opencoursedeck.js` stale.
- `getAll()` storage queries are easy but can become slow at scale; prefer indexed/cursor paths for new hot queries.
