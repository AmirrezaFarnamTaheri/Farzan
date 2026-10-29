# Farzan - complete product-wide UX reconstruction roadmap (October 29, 2026)

Baseline: main 926e9a067494e66a28f7c95a77305a4ee2c88f6a. This is a reviewable implementation program, NOT a claim that every visual/state has been captured or redesigned. The expanded offline audit records 128 findings, including the prior desktop review and new cross-component analysis.

## Evidence and coverage

The Oct 29 archive has 31 screenshots: 7 desktop light, 8 desktop dark including study focus, 8 mobile light including study focus, 8 mobile RTL including study focus. It visually covers Home, Courses, My Courses, Notes, Progress, Settings and Studio plus one playback state. Materials, PDF, Playlists, Bookmarks, Tags, Flashcards, Achievements, Help and invalid-route recovery have no current latest-release captures, although archived screenshots and source exist. Live dialogs, notifications, imports, a playing video, populated data and native Windows UX are also absent from this gallery.

Current styling is about 337 KB across 20 src/styles CSS files. Key selectors such as .home-hero, .sidebar, .topic-row and .select are defined in several different files. Do not add yet another permanent override layer: assign ownership and consolidate existing styles.

Evidence tags: L latest screenshot; A archived screenshot; C current source; R plausible risk requiring reproduction. A screenshot of loading is not proof of a permanent stall. A prior version screenshot is not proof that a defect persists.

## Route and component coverage

| Product surface | Owner | Required redesign |
| --- | --- | --- |
| Shell, navigation, status, dialogs | index.html; app.js; ui.js; src/styles/layout.css | Task-focused navigation, one search/command model, coherent feedback and modal/notification semantics |
| Home | src/views/homeRoute.js | Resume/Continue action first; de-emphasize decorative hero and repeated catalog actions |
| Courses + focus | src/views/coursesRoute.js; player.js | Explicit play/resume/completion actions, compact searchable outline, video-first theater with accessible note and transcript |
| My Courses | src/views/myCoursesRoute.js | One Create/Import flow, no redundant nested empty state, contextual backup/relink guidance |
| Materials | src/views/materialsRoute.js | Compact filter/search, dense scannable media list, relevant preview and keyboard navigation |
| PDF | src/views/pdfRoute.js; pdf.js | Reader-first state; navigation/search/annotation controls appear only in proper context |
| Notes | src/views/notesRoute.js; notes.js | Writing-first layout, compact toolbar, clearly durable save/fail status, supported Persian font |
| Studio | src/views/studioRoute.js; canvas.js | Canvas-first layout, contextual inspector, distinct Create/View/Export, persist board schema |
| Flashcards | flashcards.js | Clear Review / Decks / Edit modes, Due now action, better import and scheduling copy |
| Playlists | src/views/playlistsRoute.js | Compact editable queues with recognizable names, durations, Play all and reorder |
| Bookmarks | src/views/bookmarksRoute.js | Unified saved moments with source, page/time, search and direct jump |
| Tags | src/views/tagsRoute.js | Searchable tag taxonomy and guided creation from notes/materials |
| Progress | src/views/progressRoute.js; progress.js | Task-centered metrics, charts only when meaningful, no backup as primary CTA |
| Achievements | src/views/achievementsRoute.js | Next attainable goal, meaningful incremental progress; no huge default wall of locked cards |
| Settings | src/views/settingsRoute.js | Honest section navigation, clearer AI states, font/RTL settings, separate Backup Center |
| Help and error routes | src/views/helpRoute.js; src/views/notFoundRoute.js | End-user copy rather than npm/localhost instructions; clear recovery and fallback |
| Mini-player | app.js | Stable controls and focus, fewer repeated subtree replacements/live-region updates |
| Notifications | app.js | Do not mark all read on open; preserve actionable event history |
| Keyboard/search | app.js; src/features/commandPalette.js; src/core/keyboardShortcuts.js; ui.js | Consolidated shortcut and query contracts |
| Offline/backup/import | src/features/offlineBanner.js; src/core/backupEngine.js; src/features/addContent.js | Shared progress/retry/validation states and explicit file-data vs metadata handling |
| Platform | src-tauri; desktop | Installed Windows font/scale, file dialogs and upgrade parity |

## Major new source findings

- NAV-P1: NotificationsPanel in app.js opens the drawer then markAllRead immediately. Reading must be explicit and notifications should not disappear on opening.
- NAV-P1: The mini-player recreates its interactive DOM via replaceChildren during rendering, risking focus loss. Its outer status live region may announce progress changes excessively. Maintain stable buttons and limit speech to track/status transitions.
- NAV-P2: Global quick search, topbar search, command palette and shortcut registries have separate owners. Preserve distinct entrypoints but share state, ranking, keyboard selection and focus return.
- NAV-P2: ui.js can fall back to native confirm while custom dialogs are used elsewhere. Provide consistent, accessible confirmation and destructive-action interaction.
- MED-P0: The existing player loading overlay is inside the controls rather than the video stage; the latest screenshot visibly obscures transport. PR #137 begins the stage redesign, stacked on #134.
- MED-P1: Playback completion and resume position must be separate; PR #136 exists to fix destructive reset.
- I18N-P1: Main bundles no dedicated Persian typeface; PR #138 adds self-hosted Vazirmatn. Notes font picker still does not offer that family. Font assets are not a substitute for actual Persian locale strings.
- I18N-P1: Current mobile RTL evidence mirrors layout but leaves English labels and shows uneven bidi treatment. Keep timecodes, technical IDs and URLs LTR; test mixed Persian/English content with real typing.
- EDIT-P1: Notes has a two-row format toolbar and on mobile the editing surface is below the first 844px viewport. Use a dedicated mobile editor and progressive formatting disclosure.
- EDIT-P1: Studio has toolbar and inspector competing with the canvas; mobile tools wrap above the stage. Make inspector contextual and move advanced actions off-canvas.
- PDF-P1: The PDF toolbar exposes many search/navigation/annotation controls before any PDF is loaded. Show reader empty state first, then toolbar based on document state.
- REVIEW-P1: Achievements catches failed data reads and substitutes empty arrays; an error can therefore render falsely as zero progress. Show recoverable data errors rather than artificial zero.
- REVIEW-P1: Flashcards, Playlists, Bookmarks and Tags need user-first task states rather than zero counters or large catalog preview cards.
- SETTINGS-P1: Settings backup actions are prominent above Appearance and AI state uses technical labels. Move backup to a dedicated location and use plain-language mode descriptions.
- HELP-P1: Current Help still instructs users to run npm start / open localhost. Provide end-user steps and a separate developer troubleshooting area.

## Architecture and design contract

Navigation groups: Study (Home/Courses/Materials/PDF), Create (Notes/Studio/My Courses), Review (Flashcards/Bookmarks/Playlists/Progress/Achievements), Organize (Tags), Settings/Help. Preserve current paths and deep-links.

One primary action per task context; unique selected/disabled/complete styles; keyboard focus and accessible names for every icon action. Use consistent Loading, Saving, Saved, Failed with Retry, Offline and Restore confirmation states across routes. A loading overlay must never block its exit or retry action.

Typography roles: Persian UI, Latin UI, author-specified note fonts, reading text, numeric/timecode and code. Self-host Persian glyphs, preserve Latin Inter, bidi isolate mixed content. Do not force text direction on entire records or replace saved formatting.

Prefer native HTMLMediaElement transport and native dialog/details/Popover when they satisfy compatibility. Finish existing Squire/Konva/Chart.js/Dexie adoption. Evaluate PDF.js viewer layer, Floating UI DOM and TanStack Virtual core only if testing proves the extra dependency reduces total code and complexity. Avoid a wholesale React rewrite solely for aesthetics.

Bundle budgets may increase if initial paint, memory, mobile and startup measurements justify it. Track initial entry separately from lazily loaded content and fonts.

## Incremental implementation waves

| Wave | Work | Merge gate |
| --- | --- | --- |
| 0 | Fix PRs #134 #135 #136 | Replay/failed-write tests and green final-head checks; no data loss |
| 1 | Shell, shared feedback, keyboard/search and typography #138 | Focus/RTL/language capture and explicit error recovery |
| 2 | Course navigation, player theater #137, Materials, PDF | Real playing screenshot, note/chapters, unblocked controls, no lost position |
| 3 | Notes, Studio, custom course import | Actual input/selection/undo, data-format parity and mobile usability |
| 4 | Flashcards, bookmarks, playlists, tags, progress and achievements | Empty and populated state evidence, meaningful statistics |
| 5 | Settings, AI, backup/relink, Help, Windows | Successful and failed restores, platform screenshots and offline |
| 6 | Component/CSS cleanup and measured budgets | One owner per shared control, no old functionality removed silently |

## QA matrix

For each applicable route: 1440x900 and 1280x800 desktop; 390x844 and 320px mobile; tablet width; RTL with actual Persian text and mixed scripts; light/dark; 200% zoom; reduced motion; keyboard-only; realistic populated and empty states; loading, save success/fail, user-facing error/retry, offline and import/backup recovery. Capture real playback; PDF search/annotation; Notes editing and IME; canvas pen/select/undo; flashcard review; bookmark jumps; reloaded completion and media resume; native Windows DPI and file picker.

No route may count as covered just because the shell rendered. Record before/after screenshots and functional acceptance. Maintain release/schema compatibility, avoid increasing arbitrary package counts, and require green final-head CI and visual QA before promotion.

## Open PR dependencies and status

PRs #134, #135, #136, #137 and #138 are currently draft. #137 is stacked on #134; an earlier CI head failed two retry regressions and needs the underlying fix carried forward or rebased. #138 had an earlier lockfile integrity audit failure; a newer head includes the integrity hash but still needs final-head verification. No redesign component is considered shipped until merged and validated.

## Latest expanded screenshot results (PR #139, run 40880201415)

The expanded visual run captured 68 PNGs: all 15 sidebar routes, missing-route recovery, and study-focus playback in each of desktop-light/dark and mobile-light/RTL. Its first run failed on an image-size-only assertion: a minimal mobile-light not-found screenshot compressed to 6,534 bytes and fell under an arbitrary 9,000-byte floor. Importantly, that screenshot appears *visually blank* despite DOM being present; do not dismiss it solely as compression. Follow-up now asserts actual in-viewport bounds, fully painted opacity, route heading, and recovery links before capture.

Current full-resolution route observations (no longer just historical):
- Materials: 6,421 items; search/filter plus a second pagination panel consume substantial space before results; no-media entries appear before playable lectures.
- PDF: full navigation/search/rotation/annotation controls displayed before document open; mobile toolbar wraps into multiple rows.
- Playlists: 1 active queue, 0 saved playlists, catalog previews dominate; mobile stacked metrics/form push playlist content below the fold.
- Bookmarks: four counters and a large results card wrap a single Untitled Note.
- Tags: four zero metrics and unused filter chips lack an obvious creation path.
- Flashcards: three zero counters and a large empty state; review/create action should be task-first.
- Achievements: six oversized locked cards and five zero counters, no progress toward next milestone.
- Help: technical first-run commands and local port URLs are crowded and unsuitable as default user guidance.
- Not found: breadcrumb incorrectly says OpenCourseDeck. Fixed by replacing the unknown-route fallback label with Page not found in app.js and guarding it in the e2e suite.

Current artifacts and screenshots cannot yet prove actual playing media, populated decks, successful saves, native Windows rendering, 200% zoom, or true Persian translation. Those require seeded state and interactive acceptance.
