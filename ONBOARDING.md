# Developer quickstart

OpenCourseDeck is a browser-based study app built with JavaScript, CSS, IndexedDB, and a Tauri desktop wrapper.

## Start locally

From the repository root:

```bash
npm ci --ignore-scripts --legacy-peer-deps
npm run first-run
npm start
```

Then open `http://localhost:5173/`. Keep the terminal open while using the app. The Windows `Run-OpenCourseDeck.cmd` launcher builds and serves the browser version; it is not the Tauri installer.

## Find the code

| Task | Main source |
| --- | --- |
| Bootstrap | `index.html`, `boot.js`, `src/index.js` |
| Shell and navigation | `app.js`, `src/router/router.js` |
| Route UI | `src/views/*Route.js` |
| Shared styles | `src/styles/index.css`, `tokens.css`, `themes.css`, `workspace.css` |
| Data storage | `bridge.js`, `db.js`, `src/core/backupEngine.js` |
| Notes, PDF, video, canvas | `notes.js`, `pdf.js`, `player.js`, `canvas.js` |
| Flashcards | `flashcards.js` |
| Desktop | `src-tauri/`, `desktop/` |
| Verification | `tests/`, `.github/workflows/` |

## Common checks

```bash
npm run validate
npm run lint
npm test
npm run build:release
npm run check:generated
npm run ci
```

`npm run ci` also checks release artifacts, dependency and font budgets, and smoke tests. Native desktop validation requires the Windows/Rust toolchain; consult `desktop/README.md` and the Native Windows Assurance workflow.

## Working rules

- Keep the local storage schema and migration paths compatible. A read error must not become an empty library.
- Treat imports, deletes, resets, and backup restoration as data-changing operations; cover failure cases with tests.
- Edit the source stylesheet layers and modules, not generated production output.
- Keep CSS theme, accent, density, keyboard focus, and reduced-motion behavior intact.
- Render user-controlled strings as text unless a reviewed sanitizer is required.
- Do not claim that offline caching covers external media links or that exports contain the separate binary media database.
- Update documentation when visible behavior changes. Use the writing rules in [DESIGN.md](DESIGN.md).
