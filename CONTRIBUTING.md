## Contributing

### Setup

```bash
npm install
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
- Global design system and responsive rules: `style.css`.
- App behavior, routes, overlays, settings, and view builders: `app.js`.
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
- Preserve keyboard behavior when changing overlays.
- Treat service worker cache as a production concern; local dev should remain easy to refresh.

### Test Strategy

- Add unit tests for pure or DOM utility behavior in `tests/`.
- Use fake-indexeddb when touching storage behavior.
- Add regression tests for fragile UX primitives: router focus, overlay focus trap, inert state, and async confirm.
- Run `npm run build` after module import changes.
- Run `npm test` for every behavior change.

### Common Pitfalls

- Opening with `file://` breaks module/fetch/service worker behavior.
- Changing the dev port changes the browser storage origin.
- Updating source files without `npm run build` leaves `dist/opencoursedeck.js` stale.
- `getAll()` storage queries are easy but can become slow at scale; prefer indexed/cursor paths for new hot queries.
