# Farzan engine replacement: compatibility gates

This document defines concrete acceptance for replacing the remaining three substantial custom engines. **It does not claim the editor, whiteboard, or player has been replaced.** Each migration must pass the same data, browser, Windows, and release checks as the completed smaller library-first replacements.

## Notes editor: Tiptap 3 / ProseMirror

Candidate: Tiptap 3 with StarterKit and explicit extensions for tables, images, links, text alignment, and any note-specific nodes. The existing Notes editor uses contenteditable, deprecated execCommand, custom undo history, DOM selection, imports and autosave.

- Preserve saved notes in the existing HTML content field, not new Tiptap JSON. Do not rewrite stored notes automatically on first open.
- Inventory all old HTML elements and attributes: nested lists, headings, quotes, pre/code, tables, external-image placeholders with data-remote-src, AI-summary blocks, links, color/font/size/alignment metadata, Persian/Chinese/RTL and pasted content.
- Tiptap's strict schema silently loses unsupported HTML. Enable content checking and handle content errors: if a note is incompatible, retain original bytes and render a safe read-only legacy view instead of saving a partially parsed document. Source: https://tiptap.dev/docs/editor/core-concepts/schema and https://tiptap.dev/docs/guides/invalid-schema.
- Preserve DOMPurify HTML-only sanitization and user-controlled remote image permission; do not allow SVG external image requests or imported script/event handlers.
- Migrate toolbar and shortcuts to Tiptap commands, eliminating dual undo or execCommand histories. Prove dirty-draft sync, beforeUnload, import/export, mobile composition/IME, keyboard, screen readers, offline, and Windows behavior.
- Keep strict bundle budgets: lazy-load the editor, tree-shake plugins, and measure against the 1 MiB total JavaScript gate. Do not override the budget merely to declare a new library installed.

Acceptance: new rich legacy HTML round-trip test in tests/notes.test.js, and existing Notes sync, import, sanitization and Unicode tests.

## Studio canvas: Konva

Candidate: Konva for canvas rendering, hit-testing, transforms, and shape primitives. Existing canvas.js is a roughly 2,800-line custom renderer with pointer inputs, board v1 JSON, layers, autosave, race fencing, and PNG/PDF/SVG exports.

- Keep the **application-owned v1 board JSON** canonical. Do not substitute Konva Stage.toJSON() or Node.create() for backup serialization. Konva explicitly recommends maintaining application state separately for nontrivial scenes: https://konvajs.org/docs/data_and_serialization/Best_Practices.html.
- Use a reversible mapping for every element type and property: IDs, paths/points, text, images, shape geometry, font, stroke, opacity, locked/hidden layers, active layer, grid and viewport.
- Retain protected media URL validation and offline behavior. Preserve autosave, reset, board-epoch stale-restore protection, undo/redo, and public Canvas APIs until consumers are migrated.
- Validate pen, select, drag, multi-touch, zoom and high-DPI viewport transform at desktop, 390x844 and 844x390. Test SVG, PNG and PDF exports against saved fixtures, not only whether the board looks plausible.
- Compare startup, memory, large-board frame rate and bundle size. Load renderer only on the Studio route, not the global shell.

Acceptance: new v1 mixed-layer fixture in tests/canvas.test.js plus existing restore-race, rendering, image URL and export tests.

## Media player: Video.js 10

Candidate: Video.js 10 HTML/Web Components, installed from the dedicated @videojs/html package, rather than the legacy v8 APIs. Video.js 10 was released 2026-10-01 and is not a drop-in replacement. Source: https://videojs.org/blog/videojs-10.

**Avoid new Vidstack 1.x adoption**: its maintainers announced security-only maintenance through January 2028 and recommend Video.js 10 instead. Source: https://vidstack.io/docs/player/.

- Preserve MediaPlayer queue, playback and event contracts: trackChange, beforeTrackChange, seeked, timeupdate, pause, snapshot/restoreSnapshot, track IDs/topics/courses, queueIndex, currentTime, duration, mute, rate, shuffle, repeat and captions.
- Preserve the existing Dexie media-state cache, keys, receipts, position restoration and error/recovery behavior; prevent two engines writing the same media state.
- Build one route-local Video.js 10 adapter for native media and supported sources. Test local library-file refs, HTTPS, autoplay, picture-in-picture, fullscreen, speed, quality, captions, accessibility, media/artwork URL safety and real Chrome/Windows playback.
- Do not remove the existing engine until adapter parity, data compatibility, bundle budget and real-media tests pass.

Acceptance: existing tests/player.test.js queue/event/snapshot tests and tests/media-storage-dexie-compat.test.js.

## Primary database

Do not indiscriminately replace db.js because Dexie has succeeded in isolated auxiliary stores. The primary app database has its own native schema, versions, indexes, backup/rollback, cross-store transactions and sync expectations. Capture the complete native database contract, upgrade paths and failure/recovery fixtures before a separate migration.

## Release and merge policy

1. Capture real legacy content and native storage fixtures before changing behavior.
2. Reject unsupported saved formats without overwriting original user content.
3. Verify storage, gestures, Unicode, privacy/security, offline behavior, undo/redo, exports, and accessibility with focused unit, real browser and Windows tests.
4. Run the full repository CI, Browser Assurance, Native Windows Assurance, and visual/performance/bundle checks on the final PR head.
5. Merge only if every required gate is green and review findings are resolved. Publish a new installer only from a verified released source commit.
