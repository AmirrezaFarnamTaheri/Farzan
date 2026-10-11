# Farzan — Plasmato Edition 1.0.3

A dedicated **Plasmato edition of Farzan/OpenCourseDeck**, with the supplied archive integrated into the normal Courses, Materials, search, notes and progress flows. The original emergency player is also preserved as a self-contained browser viewer.

The supplied hierarchy is preserved as `course → source → topic → resource`. The bundled snapshot contains **31 courses, 100 sources, 6,418 topics, 5,990 video references, 280 PDF references, and 13 issue topics**. Videos and PDFs remain external links and may be unavailable without an Internet connection or access rights. The player does not request any remote media on initial load; select a resource to play it.

## Run

- **Standalone:** open `index.html` in a modern Chromium-based browser, Firefox, or Safari supporting `DecompressionStream('gzip')`. Bundled course metadata works offline from `file://`; remote media does not.
- **Local HTTP server:** from this directory, run `python3 -m http.server 8000` and open `http://localhost:8000`. The **Refresh disk** control loads an optional `plasmato_full_2026-04-11.json` file if present, and otherwise returns to the bundled snapshot.
- **Manual import:** use **Load catalog** to open an extracted Plasmato JSON or a compatible CSV. The browser does not upload the selected file.

## Files

- `index.html`, `styles.css`, `app.js`: source player shell and logic, with explicit URL safety and offline catalog loading.
- `catalog_data.js`: the **complete original JSON**, gzip-compressed and base64-encoded into an ordinary browser script for use without an HTTP server.
- `edition.json`: source size, SHA-256, expected hierarchy counts, and edition identity.
- `verify.cjs`: no-dependencies checks for lossless catalog expansion and data counts; run `node verify.cjs`.
- `extract.cjs`: recover an exact copy of `plasmato_full_2026-04-11.json` with `node extract.cjs` for inspection or refresh testing. The extracted file is ignored by Git to avoid duplicate payloads.

The imported archive also contains a `catalog.json` with `courses: []` and text claiming the full source was unavailable. That placeholder is intentionally **not** shipped: the embedded catalog here carries the real provided data. Do not interpret the included URLs as proof that hosts, playback or access are currently available.

Progress and saved-resource preferences are browser-local under `farzanEmergency:*` keys. They are **not** synchronized with the main OpenCourseDeck profile or portable backup. Use the browser profile/origin consistently if you need to keep edition progress.

## Controls

Search and filters operate across the course, source, topic and resource hierarchy. Use focus mode, save/unsave, show more and next/previous navigation as in the source player. Shortcuts: `/` search, `Esc` clear/leave focus, `N` next, `P` previous, `F` save, `A` auto-next, `T` focus mode.

## Scope and branch policy

The dedicated branch `edition/plasmato-emergency-player-20261011` includes **both** a Farzan app with the archive added to the canonical DataStore and this standalone emergency player. The production pointer `data/catalog.json` retains the starter course and adds `data/plasmato-2026-04-11.json.gz` (SHA-256 verified). All 31 Plasmato courses become ordinary Farzan lessons with stable source topic URLs. The combined catalog contains 32 courses and 6,421 topics.

Run the normal app from the repository root (`npm ci --ignore-scripts --legacy-peer-deps && npm run first-run && npm start`); open `#/courses`, `#/materials`, or search for a Plasmato topic. For the emergency player visit `editions/plasmato-emergency/index.html`.

**Publishing:** The branch's workflow runs full Farzan verification and publishes a dedicated [GitHub Release](https://github.com/AmirrezaFarnamTaheri/Farzan/releases/tag/plasmato-edition-v1.0.3) containing the production ZIP and SHA256SUMS. The release uses the edition-specific tag, not the main app release channel. A hosted Pages site is optional: the repository owner must enable Pages with **GitHub Actions** as source at [Settings → Pages](https://github.com/AmirrezaFarnamTaheri/Farzan/settings/pages) and set the repository Actions variable `ENABLE_PLASMATO_PAGES=true` before rerunning the branch workflow. GitHub's default GITHUB_TOKEN cannot enable Pages for an unconfigured repository. The emergency viewer appears at `/editions/plasmato-emergency/index.html` on the published site. `main` remains unchanged. Media files are external; 13 source pages that returned errors remain as flagged catalog entries.

Progress in the **main Farzan application** uses its existing profile, notes, media and backup data. The **standalone emergency player** continues to use independent `farzanEmergency:*` storage and does not synchronize progress with Farzan; use the main app for unified tracking.

## Native Windows packaging

The Plasmato branch uses its own Tauri product name and identifier (`Farzan Plasmato Edition`, `app.opencoursedeck.plasmato`), so its Windows installer is distinct from the normal OpenCourseDeck desktop application. The release workflow must build a real locked NSIS installer and attach it to the edition-specific GitHub Release. The app runtime remains OpenCourseDeck 1.1.2; `1.0.3` is the Plasmato edition version. Installers may be unsigned and can trigger Windows SmartScreen warnings. Media URLs remain remote and are not guaranteed available.

## Visual and functional acceptance

Version 1.0.3 is gated on 18 actual Chrome Playwright scenarios from tests/e2e/plasmato-visual.spec.js, covering 308 full-size screenshots: all 15 Farzan routes across the original five responsive/theme modes plus ten expanded layout, keyboard, font, motion and RTL-stress modes; 77 real interaction states and 15 standalone-player states. Scenarios verify saved notes, course completions, Materials filters, user-created courses, PDF document and page notes, flashcards, Studio persistence, playlists, local controlled video playback, timestamp bookmarks, search, settings, responsive layout and the standalone hierarchy. The release includes a separately checksum-verified visual evidence ZIP containing all screenshots, 24 contact sheets, a SHA-256 manifest, an audit inventory, and machine-readable observations.

[Completed visual QA run](https://github.com/AmirrezaFarnamTaheri/Farzan/actions/runs/38177326118) · [Actual screenshot evidence](https://github.com/AmirrezaFarnamTaheri/Farzan/tree/evidence/plasmato-visual-38177326118/visual-evidence). Provider video/PDF availability and native installer lifecycle still require manual verification.
