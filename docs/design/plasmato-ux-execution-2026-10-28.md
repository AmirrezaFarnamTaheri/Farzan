# Plasmato UX Reconstruction — Repository-Grounded Execution Plan
**Baseline:** `main` at `b761ec3e` (2026-10-28)  
**Working UI PR:** #120 (`feat/plasmato-workbench-ux-wave1`)  
**Independent editor migration:** #112 (Squire Notes, draft)

## Source and verification boundaries

This roadmap reconciles the four supplied Farzan/Plasmato visual audits with the current source tree. Screenshot observations are **audit claims** until a corresponding current build/screenshot is inspected. Source findings are distinct from runtime acceptance.

Current code already includes `src/styles/farzan-redesign.css`, semantic themes, `.ocd-app` 100dvh isolation, scrollable `.view-container` and `.sidebar-nav`, reduced-motion rules, mobile navigation, and offline font assets under `vendor/fonts`. Do not replace them with a second `.app-shell` grid, global `html, body { overflow:hidden }`, `* { margin:0; padding:0 }`, remote Google Fonts, or CSS pretending `content-visibility:auto` is DOM virtualization. Preserve route-specific behavior, native Windows, the browser build, and all established themes.

## Evidence-driven decisions

| Observation from audits | Source evidence / interpretation | Decision |
| --- | --- | --- |
| White Home focus card glares in dark mode | `farzan-redesign.css` hardcodes `.home-focus-panel {background:#fff}` across themes | Override only for dark/named themes, keep paper/light presentation |
| Double header and crowded sidebar | `--topbar-height:66px`, `.topbar-context` is static “YOUR STUDY SPACE”, nav rows have 43px min height | Compact chrome and hide redundant static label; keep both keyboard-accessible search affordances until their scopes are proven redundant |
| Triple scrollbars / clipped sidebar search | Current root already locks `.ocd-app` to 100dvh; sidebar-nav is independently scrollable; search outside scrolling nav | Verify at Windows widths/heights, then repair specific overflow rather than wholesale resetting viewport |
| My Courses shows a large creation form above data | `myCoursesRoute.js` unconditionally renders `.my-courses-create-card` before list and metrics | Native on-demand dialog with focus/ESC/cancel; saved courses first; use only two useful KPIs |
| Playlist cards repeat `شروع این دوره` | `playlistsRoute.js` prefers `topic.sourceLabel` to `courseTitle` in a catalog group's card title | Use parent course title, retain chapter as secondary label, `dir=auto`, previews capped to four plus remaining count |
| Notes duplicates actions / heavy editor chrome | `notesRoute.js` has header and explorer add buttons; active Squire migration touches this file | Do not mix UI markup changes into #112 until it is verified/merged; compose a separate follow-up |
| Courses topic list repeats Play/Done controls | `coursesRoute.js` still builds row actions; old screens report clipping | Design a semantic full-row play target **without nesting buttons**, separate completion button, keyboard and touch parity, proper truncation tests |
| Studio crowded canvas | Existing Studio routes and styles include Konva read-only compatibility and classic editing | Expand canvas only with verified inspector/keyboard/pointer/undo/export acceptance; never equate read-only Konva rendering with feature parity |
| Settings control wrapping / duplicate labels | Existing `settingsRoute.js` + `settings-enhancements.css` | Single-column settings ledger after a responsive audit; preserve all controls, import/export and accessibility |
| Persian/Latin typography | Existing offline fonts include Inter, mono, Playfair; no verified local Vazirmatn asset | Use `dir=auto` and `bdi` at dynamic content boundaries now; consider a licensed, vendored Persian font subset **after** measuring size and accessibility; no CDN dependency |

## Execution waves and acceptance

### Wave 1 — compact shell, course creation, playlist correctness (#120)
- [x] Add regression tests for playlist course/chapter labeling, capped previews, course-creation default hidden state, opener/focus restoration, and empty-state creation
- [x] Implement explicit course-title binding and chapter metadata, `dir=auto`, capped preview + overflow count, footer alignment
- [x] Move My Courses creation to a native dialog; preserve canonical `UserLibrary.upsertCourse` and existing media handling
- [x] Put saved courses above metrics, remove the `With descriptions` filler metric
- [x] Scope shell/Home colors and sizing to existing theme/layout selectors; do not replace/reset the app
- [ ] Final-head `npm run ci` plus Browser, Visual QA, and Native Windows workflows pass
- [ ] Inspect final captured desktop/light/mobile/RTL screenshots for overflow, contrast, focus and no missing controls
- [ ] Review comments, declare ready only after acceptance

### Wave 2 — learning workbench (separate focused PR)
1. Verify current `Courses` course-card clipping in Windows classic-scrollbar mode, 1366×768 and 1024×768. Fix only if reproduced.
2. Reorganize topic rows to one accessible play target with a distinct completion control. Avoid a `role=button` parent containing child `button`; use semantic siblings or a proper composite widget. Preserve status actions, metadata, and media routing.
3. Remove repeated chapter subtitles only when the chapter grouping remains legible and relevant for filtering and search.
4. Implement a theater/focus player layout **after** confirming mini-player transfer and route lifecycle. Keep playback, PiP, captions, timestamps, keyboard seeking, and queue navigation working.
5. Add playback-with-Notes/PDF/flashcard docking only after ensuring source ownership and no route teardown or autosave loss. Prefer progressive split panes over an always-open 35% dock on narrow screens.

### Wave 3 — Notes and Studio (after #112 is accepted or explicitly abandoned)
1. Preserve saved note HTML, undo stacks, IME, paste, cross-tab conflicts, AI output insertion, table/image support, and offline persistence.
2. Make Notes document canvas borderless, move tags to unobtrusive inline controls, consolidate toolbar only if all commands remain discoverable and accessible.
3. Deduplicate New Note entry points; keep a reachable main CTA and keyboard command.
4. Studio: maximize interactive board area with collapsible layers/inspector and a floating tool dock; test desktop touch/mouse/pen, zoom/pan, exports, scene restoration and Windows builds.
5. Scope visual changes to real view classes; do not disable focus outlines, screen-reader status, or fallback controls.

### Wave 4 — Progress, Settings, accessibility and release
1. Consolidate low-value Progress metrics and redundant export buttons without dropping any supported export/import format.
2. Replace crowded Settings cards with responsive rows, preserving language, theme, density, color, sizing, AI/privacy and storage features.
3. Ensure bilingual content uses `dir=auto` / `bdi`, normal letter-spacing for joining scripts and locale-aware/tabular numerals.
4. Conduct browser visual review at 390×844, 768×1024, 1024×768, 1366×768, 1440×900, dark/light themes, Persian mixed-direction content; test 200% zoom and forced colors.
5. Verify zero unintended outer scroll bleed; avoid hiding scrollbars that are necessary for discoverability.
6. Finalize release only after all final-head gates, real Windows bundle/build, backup/restore and local-media workflows pass.

## Bundle budget decision — explicit and bounded

Baseline `main` CI #40663026669 measured **1,047,917 B / 1,048,576 B** aggregate JS (659 B headroom). The first complete wave-1 implementation measured **1,049,703 B**, only **1,786 B** higher, but above the gate by **1,127 B**. All 1,171 tests and lint passed; only the aggregate bundle check failed.

The approved adjustment for the UI branch is **1,088 KiB (1,114,112 B)**, giving 64 KiB growth allowance while keeping the 320 KiB largest-chunk, 240 KiB entry, 80 KiB gzipped-entry and CSP enforcement unchanged. Existing generated chunks remain counted; no vendor relabeling or exclusions. This is separate from the draft Squire editor's proposed 1.25 MiB decision. The allowance is explicit in code and asserted by `tests/bundle-report.test.js`. Do not escalate further without a measured change and written rationale.

## Non-negotiable engineering constraints

- No second source of truth for Notes/course/library data; no storage-schema rewrite driven by appearance alone.
- No style-only hiding of primary controls or routes; progressive disclosure must retain keyboard/screen-reader reachability.
- Theme tokens must work across light, paper, dark and named themes; hardcoded white panels are theme-scoped.
- No breaking public selector/data attributes used by tests and delegated listeners.
- Local/offline assets, dependency integrity, CSP, JS/font budgets and responsive navigation remain protected.
- All behavior changes get regression-first tests; final claims require actual latest-head test logs.
- Visual QA is not replaced by green unit tests; inspect screenshots and resolve findings before merge.

## Status interpretation

Checked implementation items record pushed code, **not** automatic visual acceptance. CI and browser/Windows/visual checks are tracked separately. The long-term workbench scope remains open even after wave 1 lands; #120 does not claim every screen has been redesigned.
