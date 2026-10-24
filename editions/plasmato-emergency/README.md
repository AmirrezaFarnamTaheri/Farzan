# Farzan — Plasmato Edition 1.0.5 (release candidate)

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

The reviewed Farzan `main` branch now includes **both** a Farzan app with the archive added to the canonical DataStore and this standalone emergency player (the original edition branch remains historical). The production pointer `data/catalog.json` retains the starter course and adds `data/plasmato-2026-04-11.json.gz` (SHA-256 verified). All 31 Plasmato courses become ordinary Farzan lessons with stable source topic URLs. The combined catalog contains 32 courses and 6,421 topics.

Run the normal app from the repository root (`npm ci --ignore-scripts --legacy-peer-deps && npm run first-run && npm start`); open `#/courses`, `#/materials`, or search for a Plasmato topic. For the emergency player visit `editions/plasmato-emergency/index.html`.

**Publishing:** The reviewable v1.0.5 release workflow is triggered only by a new edition-version commit on `main`, or by an explicit workflow dispatch on `main`. Pull requests build and verify but never publish. Publication requires the browser visual gate and a locked Windows NSIS installer before creating the immutable [v1.0.5 release](https://github.com/AmirrezaFarnamTaheri/Farzan/releases/tag/plasmato-edition-v1.0.5). A separate post-publish job downloads all six artifacts and verifies their SHA-256 checksums and source commit; the release is **not** accepted until that job passes. For the previous [v1.0.4 release](https://github.com/AmirrezaFarnamTaheri/Farzan/releases/tag/plasmato-edition-v1.0.4), the Windows installer is absent and must not be claimed as published. Hosted Pages remains optional via the repository's `ENABLE_PLASMATO_PAGES=true` variable and a configured GitHub Pages Actions source. The standalone player appears at `/editions/plasmato-emergency/index.html` on the hosted site. External media and 13 issue-marked source pages remain unverified.

Progress in the **main Farzan application** uses its existing profile, notes, media and backup data. The **standalone emergency player** continues to use independent `farzanEmergency:*` storage and does not synchronize progress with Farzan; use the main app for unified tracking.

## Native Windows packaging

The Plasmato distribution uses its own Tauri product name and identifier (`Farzan Plasmato Edition`, `app.opencoursedeck.plasmato`), so its Windows installer is distinct from the normal OpenCourseDeck desktop application. The release workflow must build a real locked NSIS installer and attach it to the edition-specific GitHub Release. The underlying Tauri app runtime remains OpenCourseDeck 1.1.2; `1.0.5` is the independently versioned Plasmato catalog/distribution. Installers may be unsigned and can trigger Windows SmartScreen warnings. Media URLs remain remote and are not guaranteed available.

## Visual and functional acceptance

Historical v1.0.4 visual evidence includes 18 actual Chrome Playwright scenarios from tests/e2e/plasmato-visual.spec.js, covering 308 full-size screenshots: all 15 Farzan routes across the original five responsive/theme modes plus ten expanded layout, keyboard, font, motion and RTL-stress modes; 77 real interaction states and 15 standalone-player states. Scenarios verify saved notes, course completions, Materials filters, user-created courses, PDF document and page notes, flashcards, Studio persistence, playlists, local controlled video playback, timestamp bookmarks, search, settings, responsive layout and the standalone hierarchy. The historical v1.0.4 visual evidence ZIP contains screenshots, 24 contact sheets, a SHA-256 manifest, an audit inventory, and machine-readable observations.

[Completed visual QA run](https://github.com/AmirrezaFarnamTaheri/Farzan/actions/runs/38177326118) · [Actual screenshot evidence](https://github.com/AmirrezaFarnamTaheri/Farzan/tree/evidence/plasmato-visual-38177326118/visual-evidence). Provider video/PDF availability and native installer lifecycle still require manual verification.

## v1.0.4 visual regression review

The expanded release gate exercises **476 live Chrome screenshot states** in **35 contact-sheet groups**, including all 15 app routes at portrait/landscape phone and tablet sizes, light/dark/RTL directional layouts, forced-colors, higher contrast, effective 200% browser reflow, keyboard focus, scrolling and real functional actions. Every capture has its viewport, pixel statistics, file-size threshold, observation and SHA-256 recorded. Incomplete matrices prevent release.

The review corrected the mobile drawer's inaccessible expanded state and stuck-scroll behavior, a near-blank landscape PDF view, and PDF controls that appeared to accept notes when no document was open. Empty PDF controls now remain disabled until the viewer has loaded real page data. The old CSS transform simulation of 200% zoom was replaced by a 640×450 CSS-pixel effective-layout test; it is **not** certification of all browser zoom configurations.

The screenshots contain a real browser-recorded local WebM, a rendered local PDF, saved/reopened notes and timestamp bookmarks, Studio edits and flashcard interactions. External Plasmato hosts are not mirrored or guaranteed to play. Full screen-reader and on-device Windows installer acceptance remain manual tasks; RTL layout screenshots do not certify Farsi translation.


## v1.0.5 acceptance limits

The Windows workflow now performs a silent NSIS installation smoke test on a GitHub-hosted Windows runner. This checks packaged installer behavior and an installed executable; it is **not** a substitute for a physical user's Windows fresh install, existing-profile restart/upgrade, full WebView2 UI acceptance, code signing or publisher/store approval. Original Plasmato media access and rights also remain externally owned and unverified. No previous release tag or asset should be overwritten to close these gaps.
