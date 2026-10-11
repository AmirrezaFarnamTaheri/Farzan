# Farzan — Plasmato Edition 1.0.0

A separate, self-contained **Plasmato course viewer**, preserved from the supplied Farzan Emergency Player archive. This edition does **not** replace OpenCourseDeck's main course catalog or data layer.

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

This edition is intentionally kept under `editions/plasmato-emergency/` on the dedicated `edition/plasmato-emergency-player-20261011` branch. It is **not** an alteration to `main`, not a production release, and not a proposal to merge the Plasmato extraction into the default catalog.
