# Farzan engine replacement: compatibility gates

This document defines concrete acceptance for replacing the remaining three substantial custom engines. **It does not claim the editor, whiteboard, or player has been replaced.** Each migration must pass the same data, browser, Windows, and release checks as the completed smaller library-first replacements.

## Notes editor: Squire 2 (HTML-canonical, compatibility-gated)

Current: `notes.js` lazy-loads `src/features/notesSquireAdapter.js` only when the user selects the modern preview. This uses `squire-rte`, **not** Tiptap/ProseMirror. The classic editor remains the fallback for unsupported saved HTML or live drafts. The adapter's canonical `createSquireNoteEditor` name retains `createTiptapNoteEditor` as a deprecated compatibility alias; neither implies a storage migration.

- Preserve the exact saved HTML field as the source of truth; never persist Squire-only state or silently rewrite untouched notes. Do not automatically switch users to the modern editor until the compatibility gates below pass.
- Inventory real legacy content: mixed paragraphs and nested lists, Persian/Chinese/RTL, safe colors/fonts/sizes/alignment, links, block quotes, code/pre, tables, local and permission-gated remote images, and AI-summary metadata.
- Use `assessNoteForSquire` on the **original saved HTML and the unsaved DOM draft** before replacing an editor. Route unsupported tables, images, code metadata, unknown styles/classes and other user-owned data to the classic editor; reject imports that change the note's text.
- Preserve meaningful HTML formatting on the **first edit and save**, not only on an untouched mount. Round-trip tests must compare direction, alignment, font/color metadata, links, list structure, Unicode text and reopened content.
- Keep DOMPurify HTML-only sanitization plus the narrow `safeNoteStyles` allowlist. Preserve explicit user consent for remote images and do not introduce executable tags, remote CSS, inline event handlers or SVG external-resource loads.
- Flush pending MutationObserver edits before a mode switch or save, never save unfinished IME composition, and maintain note-epoch guards for asynchronous module load, remote refresh, backup and cross-tab synchronization.
- Retire the classic editor only when representative legacy fixtures, browser/Windows acceptance, accessibility and bundle-size parity demonstrate a genuinely lossless replacement. The current preview has **not** met that retirement gate.

Acceptance: `tests/notes-tiptap-adapter.test.js` (historical test filename for the current Squire adapter), `tests/notes-tiptap-compatibility.test.js`, `tests/notes.test.js`, real mixed-script browser tests and backup round trips, with the original note records unchanged on unsupported input.

## Studio canvas: Konva

Candidate: Konva for canvas rendering, hit-testing, transforms, and shape primitives. Existing canvas.js is a roughly 2,800-line custom renderer with pointer inputs, board v1 JSON, layers, autosave, race fencing, and PNG/PDF/SVG exports.

- Keep the **application-owned v1 board JSON** canonical. Do not substitute Konva Stage.toJSON() or Node.create() for backup serialization. Konva explicitly recommends maintaining application state separately for nontrivial scenes: https://konvajs.org/docs/data_and_serialization/Best_Practices.html.
- Use a reversible mapping for every element type and property: IDs, paths/points, text, images, shape geometry, font, stroke, opacity, locked/hidden layers, active layer, grid and viewport.
- Retain protected media URL validation and offline behavior. Preserve autosave, reset, board-epoch stale-restore protection, undo/redo, and public Canvas APIs until consumers are migrated.
- Validate pen, select, drag, multi-touch, zoom and high-DPI viewport transform at desktop, 390x844 and 844x390. Test SVG, PNG and PDF exports against saved fixtures, not only whether the board looks plausible.
- Compare startup, memory, large-board frame rate and bundle size. Load renderer only on the Studio route, not the global shell.

Acceptance: new v1 mixed-layer fixture in tests/canvas.test.js plus existing restore-race, rendering, image URL and export tests.

### Experimental Konva draft lab — not a renderer migration

The opt-in Studio **Konva draft lab** exists only to collect interaction-parity
evidence. Its modal is imported on demand; normal Studio boot still uses the
existing Canvas2D editor. It copies the current board on first use and resumes a
separately saved `ocd_studio_konva_draft` on subsequent visits. The lab does not
write `ocd_studio_board`, switch export engines, or auto-apply edits to the live
board. Unsupported v1 metadata and unsupported geometry must fail closed.

Current draft capabilities: visible/unlocked shape drag, rectangle and card transform
handles, object selection, accessible nudge controls, single-pointer pen strokes
stored as legacy-v1 polylines, canonical-v1 undo/redo, and affirmative draft
persistence receipts with rollback on refusal. Pen strokes use world coordinates
under the saved viewport; a second touch cancels the active stroke instead of
turning a pinch gesture into ink. This is **not** image, links, multi-touch
pan/zoom, grid, SVG/PDF export or full accessibility parity. Keep the classic
editor as the only main-board writer until all of those gates pass in real
Chromium, mobile and Windows builds.

Safety acceptance: test the saved draft separately from the unchanged original
board, returning to the original after closing, resuming the draft, incompatible
draft refusal, route unmount during lazy load, and late/rejected storage writes.

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
