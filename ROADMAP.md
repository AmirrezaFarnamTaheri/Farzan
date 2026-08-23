> **Status note (2026-08):** This roadmap is a historical planning artifact from the July 2026 build sprint. Phases 0-2 are fully landed; later phases are partially superseded by shipped work documented in CHANGELOG.md and docs/HISTORY.md. Consult it for intent, not current state.

# OpenCourseDeck — Complete Roadmap

> Every implementation, feature, widget, capability, performance refinement, subsystem, and visual component. Nothing omitted.

> **Status accuracy.** Every `Status:` line below was re-verified against the
> source tree. A substantial number previously read `COMPLETE`/`DONE` for work
> that has no corresponding code, and several read "Wired into src/index.js"
> for modules that nothing imports. Those are now marked `PARTIAL` or
> `NOT STARTED` with the specific gap named.
>
> Three status values are used:
> - **DONE** — implemented *and* reachable at runtime.
> - **PARTIAL** — implemented but not wired in, or only some listed items exist.
>   The line says which part is missing.
> - **NOT STARTED** — no corresponding code.
>
> When you complete an item, verify the claim (grep for the named symbol, and
> confirm it is imported by `src/index.js` or by something that is) before
> promoting its status.

---

## Phase 0 — Foundation & Cleanup (Week 1)

### 0.1 Shared Utility Extraction
Extract duplicated helpers from IIFE modules (`player.js`, `notes.js`, `pdf.js`, `ui.js`) into `src/lib/`.

| Item | Source | Target | Ported From |
|------|--------|--------|-------------|
| `esc()` / `escapeHtmlText` (7 duplicate copies) | `app.js:295`, `ui.js:14`, `notes.js:54`, `pdf.js:40`, `pdfRoute.js:1`, `aiClient.js:106` | `src/lib/dom.js` (already exported as `esc`) | — |
| `pdConfirm` (3 copies) | `notes.js:31`, `pdf.js:32`, `progress.js:19` | `src/lib/confirm.js` | — |
| `RouteListeners` (2 copies) | `notes.js:39`, `pdf.js:17` | `src/lib/routeListeners.js` | — |
| `$` selector (5 local copies) | `player.js:13`, `notes.js:19`, `ui.js:11`, `pdf.js:14` | Expose on `OpenCourseDeck.dom.$` | — |
| `uid` generator (4 copies) | `player.js:14`, `ui.js:13`, `notes.js:22` | Expose on `OpenCourseDeck.dom.uid` | — |
| `animateHeight` / `animH` (2 copies) | `app.js:622`, `ui.js:21` | `src/lib/dom.js` | — |
| `debounce` (2 copies) | `src/lib/dom.js:17`, `notes.js:26` | Expose on `OpenCourseDeck.dom.debounce` | — |

> **Status: DONE** — Created `src/lib/confirm.js` (13 lines), `src/lib/routeListeners.js` (19 lines). Updated `app.js` to expose `esc` on `OpenCourseDeck.dom`. Updated IIFE modules (`player.js`, `notes.js`, `pdf.js`, `ui.js`) to use `OpenCourseDeck.dom.$` etc. with fallback.

### 0.2 EventEmitter
| Item | Target | Ported From |
|------|--------|-------------|
| Map-based EventEmitter class | `src/lib/eventEmitter.js` | wolf-table `src/event.ts:30-65` |

Replace ad-hoc event dispatchers across all modules with a single clean emitter.

> **Status: PARTIAL** — `src/lib/eventEmitter.js` exists and is used as a base class by CourseGraph/KnowledgeGraph, but it is not imported by `src/index.js` and is not exposed on the `OpenCourseDeck` namespace; `app.js` still defines its own separate `EventEmitter`. The "single clean emitter" consolidation is not done.

### 0.3 HElement DOM Utility
| Item | Target | Ported From |
|------|--------|-------------|
| Fluent DOM wrapper: `h('div', '.class').css({...}).on('click', fn).append(child)` | `src/lib/hElement.js` | wolf-table `src/element.ts` (229 lines) |

Optional — for new code. Existing vanilla DOM code stays as-is.

> **Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. `src/lib/hElement.js` (347 lines). `h()` function with CSS selector syntax, fluent DOM manipulation. Exports `HElement` class and `h()` factory.

### 0.4 Data Model Separation
| Item | Target | Ported From |
|------|--------|-------------|
| Separate serializable data model from runtime state | `bridge.js` refactor | wolf-table `src/data/index.ts` pattern |

Currently `bridge.js` mixes IndexedDB CRUD with runtime catalog normalization. Split into pure data layer + runtime facade.

> **Status: DONE** — bridge.js refactored with typed query methods (`queryByIndex`, `queryByRange`, `countByIndex`), migration runner, backup/restore, and clear separation between data operations and runtime state.

### 0.5 Error Boundary + Offline Detection
| Item | Target | Ported From |
|------|--------|-------------|
| Global error boundary wrapping `#plasma-app` | `app.js` init | Ant Design Pro `src/components/ErrorBoundary/index.tsx` |
| Offline detection banner | `src/features/offlineBanner.js` | Ant Design Pro pattern |
| Chunk-load error recovery with retry | `boot.js` | Ant Design Pro pattern |
| Storage quota monitoring UI | `src/features/storageAlerts.js` (extend) | — |

> **Status: DONE** — Created `src/features/errorBoundary.js` (113 lines): `initErrorBoundary()` with chunk-load regex detection, online/offline events, retry/reload/home UI. Created `src/features/offlineBanner.js` (62 lines): `initOfflineBanner()` with persistent banner, auto-hide on reconnect, CSS token styling.
>
> **Audit fixes:** Removed duplicate online/offline event handling from `errorBoundary.js` — `offlineBanner.js` already handles this independently. Removed `updateOnlineStatus()` function and its event listeners. Error boundary now focuses solely on error catching and chunk-load recovery.

### 0.6 Generated Artifacts Sync
| Item | Action |
|------|--------|
| Regenerate `sw.js` after every build | `npm run build:sw` |
| Run `npm run check:generated` | Verify precache manifest |

> **Status: DONE** — Build system operational with esbuild. `sw.js` and `workbox-*.js` generated. `scripts/build.cjs` handles vendor chunk splitting, metafile output, and static asset staging.

---

## Phase 1 — Core Utilities & Easing (Week 2)

### 1.1 Easing Library
| Item | Target | Ported From |
|------|--------|-------------|
| Cubic-bezier solver | `src/lib/easing.js` | Anime.js `src/easings/cubic-bezier/index.js` |
| Spring solver (bounce/stiffness/damping/mass) | `src/lib/easing.js` | Anime.js `src/easings/spring/index.js` |
| Quintic ease in/out/inOut | `src/lib/easing.js` | Ripl `packages/core/src/animation/ease.ts` |
| 30+ easing functions (sine, quad, cubic, quart, quint, expo, circ, back, elastic, bounce) | `src/lib/easing.js` | Motion Canvas `packages/core/src/tweening/timingFunctions.ts` |
| Factory pattern: `createEaseInBack(s)`, `createEaseOutElastic(amplitude, period)` | `src/lib/easing.js` | Motion Canvas |

Use everywhere: CSS transitions, canvas animations, progress bars, UI polish.

> **Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. `src/lib/easing.js` (278 lines). All 31 presets. Cubic-bezier solver. Spring physics. Factory functions. Registry with `registerEasing`, `getEasing`, `parseEasing`.

### 1.2 Color Utilities
| Item | Target | Ported From |
|------|--------|-------------|
| `hexToHsl`, `hslToHex`, `hexToRgb`, `rgbToHex` | `src/lib/color.js` | Splayer `src/lib/themes.ts:138-180` |
| `accentFgFromHex` — foreground color for any background | `src/lib/color.js` | Splayer |
| `isDarkColor` — detect dark/light backgrounds | `src/lib/color.js` | Splayer |
| Color interpolation (hex/HSL/RGB) | `src/lib/color.js` | Ripl `packages/core/src/interpolators/color.ts` |
| Number interpolation | `src/lib/color.js` | Ripl `packages/core/src/interpolators/number.ts` |

> **Status: PARTIAL** — `src/lib/color.js` (128 lines) implements all conversions, contrast, and interpolation, and reaches the bundle indirectly via `src/core/themeBuilder.js`; it is NOT imported by `src/index.js` and is not exposed on the `OpenCourseDeck` namespace.

### 1.3 Theme Builder
| Item | Target | Ported From |
|------|--------|-------------|
| `buildUserThemeVars(bg, panel, text, accent)` — generate full CSS variable set from 4 hex colors | `src/core/themeBuilder.js` | Splayer `src/lib/themes.ts:182` |
| Settings UI: color pickers for 4 base colors | `src/views/settingsRoute.js` (extend) | Splayer |
| Save/load custom themes to IndexedDB | `bridge.js` (new store) | — |

> **Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. `src/core/themeBuilder.js` (77 lines). `buildUserThemeVars(bg, panel, text, accent)` generates full CSS variable set.

### 1.4 Collection Utilities
| Item | Target | Ported From |
|------|--------|-------------|
| `arrayJoin(left, right, key, type)` — left/inner/right join with Map optimization | `src/lib/collection.js` | Ripl `packages/utilities/src/collection.ts:101` |
| `arrayGroup(arr, keyFn)` — group by key | `src/lib/collection.js` | Ripl `packages/utilities/src/collection.ts:108` |
| `arrayIntersection(a, b)` | `src/lib/collection.js` | Ripl |
| `arrayDifference(a, b)` | `src/lib/collection.js` | Ripl |
| `arrayDedupe(arr, keyFn)` | `src/lib/collection.js` | Ripl |
| `objectMap(obj, fn)`, `objectReduce(obj, fn)` | `src/lib/collection.js` | Ripl |

> **Status: PARTIAL** — `src/lib/collection.js` (254 lines) implements all 13 functions, but it is imported by nothing: not by `src/index.js`, not by any feature or view. It is currently dead code and is not exposed on the `OpenCourseDeck` namespace.

### 1.5 TimeRange Interval Merging
| Item | Target | Ported From |
|------|--------|-------------|
| `TimeRange` class — merge, normalize, find gaps in time intervals | `src/lib/timeRange.js` | Vidstack `src/core/time-ranges.ts` |

Use for: watched-segment tracking ("you watched 40-65min"), buffered ranges, progress intervals.

> **Status: DONE** — Created `src/lib/timeRange.js` (41 lines). `normalizeTimeIntervals(intervals)` — sort and merge overlapping/adjacent intervals. `updateTimeIntervals(intervals, newInterval)` — add interval and merge. Handles edge cases: empty arrays, single intervals, fully overlapping, adjacent (end === start).
>
> **Audit fixes:** Fixed bug where all-invalid intervals returned `[undefined]` instead of `[]`. Added `sorted.length === 0` guard after filtering.

### 1.6 RequestQueue
| Item | Target | Ported From |
|------|--------|-------------|
| Deferred callback queue with `start()`/`stop()`/`serve()` | `src/lib/requestQueue.js` | Vidstack `src/foundation/queue/request-queue.ts` |

Use for: plugin host operations, lazy loading, sequential async tasks.

> **Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. `src/lib/requestQueue.js` (67 lines). `RequestQueue` class with `serve`, `start`, `stop`, `reset`, `has`, `size`.

---

## Phase 2 — Animation & Transition System (Week 3)

### 2.1 Transition System
| Item | Target | Ported From |
|------|--------|-------------|
| `Task`-based cancellable animation extending `Promise` | `src/lib/transition.js` | Ripl `packages/core/src/animation/transition.ts` |
| Pause/play/seek controls | `src/lib/transition.js` | Ripl |
| Keyframe support | `src/lib/transition.js` | Ripl |
| `AbortController` integration for cancellation | `src/lib/transition.js` | Ripl |

> **Status: PARTIAL** — `src/lib/transition.js` implements the cancellable `Transition` class (play/pause/seek/cancel), but it is imported by nothing and is not exposed on the `OpenCourseDeck` namespace.

### 2.2 Stagger Utility
| Item | Target | Ported From |
|------|--------|-------------|
| `stagger(value, { from, start, grid, easing })` — grid-aware, center/first/last/random origin | `src/lib/stagger.js` | Anime.js `src/utils/stagger.js` |

Use for: animating lists (progress bars, note cards, search results) with staggered delays.

> **Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. `src/lib/stagger.js` (61 lines). `stagger(value, config)` returns `(index, total) => staggeredValue`.

### 2.3 Timeline System
| Item | Target | Ported From |
|------|--------|-------------|
| `Timeline` — sequenced/parallel animations with labels and position offsets | `src/lib/timeline.js` | Anime.js `src/timeline/timeline.js` |

Use for: orchestrating multi-step UI transitions (panel open/close, onboarding, canvas tool animations).

> **Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. `src/lib/timeline.js` (267 lines). `Timeline` class with `add`, `set`, `call`, `label`. Controls: `play()`, `pause()`, `seek(time)`, `reverse()`.

### 2.4 RAF Loop
| Item | Target | Ported From |
|------|--------|-------------|
| Clean `requestAnimationFrame` wrapper with start/stop, auto-pause on `document.hidden` | `src/lib/rafLoop.js` | Vidstack `src/foundation/observers/raf-loop.ts` |

Replace ad-hoc rAF loops in `canvas.js` and `player.js`.

> **Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. `src/lib/rafLoop.js` (66 lines). `RAFLoop` class with `start()`, `stop()`, `running` getter. Auto-pause on `document.hidden`.

### 2.5 Apply to Existing UI
| Target | Enhancement |
|--------|-------------|
| `app.js` Modal open/close | Use easing library + transition system for spring/bounce effects |
| `app.js` Drawer slide | Use cubic-bezier easing |
| `app.js` Toast show/dismiss | Use stagger for multiple toasts |
| `app.js` Accordion expand/collapse | Use transition system |
| `app.js` Ripple effect | Use easing |
| `progress.js` progress bars | Use stagger + easing for animated fills |
| `canvas.js` element animations | Use timeline + transition |

---

## Phase 3 — Video Player Enhancements (Week 4)

### 3.1 MediaStorage (Throttled Progress Persistence)
| Item | Target | Ported From |
|------|--------|-------------|
| Abstract storage interface for volume, time, playback rate per video | `src/features/mediaStorage.js` | Vidstack `src/core/state/media-storage.ts` |
| Throttled saves (batch writes every 2s instead of every frame) | `src/features/mediaStorage.js` | Vidstack |
| IndexedDB-backed (not just sessionStorage) | `bridge.js` (extend timestamps store) | — |

> **Status: DONE** — `src/features/mediaStorage.js` is imported by `src/index.js` and self-registers as `OpenCourseDeck.MediaStorage`; `player.js` uses it at 13 call sites for per-video volume, muted, time, and rate. Reads are de-duplicated per media id, writes are throttled, and `destroy()` releases the pagehide listener on player teardown.

### 3.2 Keyboard Controller
| Item | Target | Ported From |
|------|--------|-------------|
| Composable key shortcut matching with modifier handling | `player.js` (refactor keyboard section) | Vidstack `src/core/keyboard/controller.ts` |
| Seek accumulation (press L three times = seek 30s) | `player.js` | Vidstack |
| Number-key seeking (1=10%, 2=20%, ..., 0=100%) | `player.js` | Vidstack |
| Conflict detection with global shortcuts | `player.js` | Vidstack |

> **Status: DONE** — `player.js:_bindKeyboard()`. Linear seek accumulation (10s per press, 3×L = +30s). Number keys 1-9=10%-90%, 0=100%. Input/textarea/contenteditable guard via `eventTargetEl`. 500ms idle reset.

### 3.3 Watched Segments Tracking
| Item | Target | Ported From |
|------|--------|-------------|
| Track which time ranges have been watched per video | `bridge.js` (new IndexedDB store) | Vidstack `TimeRange` |
| Visual overlay on seek bar showing watched regions | `player.js` UI | — |
| "Resume from where you left off" with segment awareness | `player.js` | — |

> **Status: DONE** — `bridge.js`: `addWatchedSegment`, `getWatchedSegments`, `getWatchedPercent`. `player.js`: `_startWatchedSegmentTracking`, `_renderWatchedOverlay`, `_showResumeHint`. Uses `timeRange.js` for merging.

### 3.4 Playlist Queue API
| Item | Target | Ported From |
|------|--------|-------------|
| `add()`, `remove()`, `move()`, `next()`, `previous()`, `jump()`, `shuffle` | `player.js` (already has most) | media_kit playlist API |
| `PlaylistMode` (none/single/loop) — persistent | `player.js` | media_kit |
| Queue UI in mini-player | `app.js` mini-player section | — |

> **Status: DONE** — `player.js`: `addToQueue`, `removeFromQueue`, `moveQueueItem`, `next`, `prev`, `playAt`, `toggleShuffle`, `cycleRepeat`, `setPlaylistMode`. `app.js`: `MiniPlayer` with queue panel.

### 3.5 Screenshot Capture
| Item | Target | Ported From |
|------|--------|-------------|
| `player.screenshot()` — capture current frame as image | `player.js` | media_kit |
| Save to canvas whiteboard or notes | `canvas.js` / `notes.js` integration | — |

> **Status: DONE** — `player.js`: `screenshot()` → data URL, `screenshotToClipboard()`, `screenshotToCanvas()`.

### 3.6 Waveform Scrubber
| Item | Target | Ported From |
|------|--------|-------------|
| Decode audio to waveform bars using Web Audio API | `src/features/waveformScrubber.js` | Splayer `src/components/WaveformScrubber.tsx` |
| Canvas-rendered waveform on seek bar | `player.js` UI | Splayer |
| Cache waveform data per video ID in IndexedDB | `bridge.js` | Splayer |
| DPR-aware rendering | `src/features/waveformScrubber.js` | Splayer |
| Theme-aware colors (CSS `--accent`) | `src/features/waveformScrubber.js` | Splayer |

> **Status: PARTIAL — deliberately not wired.** The module works and now has its own `opencoursedeck-waveforms` database and a 60 MB source ceiling, but it is intentionally NOT imported by `src/index.js`. Building a waveform requires fetching and PCM-decoding the entire media file — a second full download on top of the streaming element. Before enabling it, add a cheaper path (precomputed peaks shipped with the catalog, ranged requests, or a decode in a worker) so opening a long lecture video does not download it twice.

### 3.7 Frequency Visualizer
| Item | Target | Ported From |
|------|--------|-------------|
| Web Audio API `AnalyserNode` → canvas bars | `player.js` (already has basic visualizer) | Splayer `src/components/Visualizer.tsx` |
| Throttled CSS variable reading for theming | `player.js` | Splayer |
| Rounded-rect clipping | `player.js` | Splayer |

> **Status: DONE** — `player.js:_startViz()`. AnalyserNode → frequency bars with gradient fill. Rounded-rect via `roundRect()`. CSS `--accent` cached for 500ms. Auto-pause on hidden tab.

### 3.8 AB Loop
| Item | Target | Ported From |
|------|--------|-------------|
| Set A point, set B point, loop between them | `player.js` | — |
| Keyboard shortcut (e.g., Shift+A/B to set, Shift+L to toggle) | `player.js` | — |

> **Status: DONE** — `player.js`: `setLoopA()`, `setLoopB()`, `clearLoop()`, `toggleLoop()`, `toggleABLoop()`. Visual loop region on seek bar. Auto-seek to A when position >= B. Keyboard: Shift+A/B/L.

### 3.9 Fine Speed Control
| Item | Target | Ported From |
|------|--------|-------------|
| Speed slider with 0.05 increments | `player.js` UI | — |
| Preset speeds (0.5, 0.75, 1, 1.25, 1.5, 2) | `player.js` UI | — |
| Persist speed per course/topic | `bridge.js` | Vidstack MediaStorage |

> **Status: DONE** — `player.js`: `setSpeed(rate)`, `showSpeedPanel()`. Slider 0.25–3 with 0.05 step. Presets: [0.5, 0.75, 1, 1.25, 1.5, 2]. Custom input. Persisted via `MediaStorage`.

---

## Phase 4 — Canvas Whiteboard Enhancements (Week 5)

### 4.1 Canvas Export
| Item | Target | Ported From |
|------|--------|-------------|
| Export to PNG with background | `canvas.js` | canvas2image `canvas2image.js:252-295` |
| Export to JPEG with quality slider | `canvas.js` | canvas2image |
| `scaleCanvas()` utility for HiDPI export | `canvas.js` | canvas2image `canvas2image.js:21-37` |
| Download-via-anchor pattern | `canvas.js` | canvas2image |
| Export to PDF (multi-page) | `canvas.js` | — |

> **Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. `src/lib/canvasExport.js` (222 lines). `exportToPNG`, `exportToJPEG`, `scaleCanvas`, `downloadCanvas`, `exportToPDF`, `videoFrameToCanvas`, `videoFrameToClipboard`.

### 4.2 Undo/Redo (Operation-Based)
| Item | Target | Ported From |
|------|--------|-------------|
| Replace snapshot-based undo with operation-based | `canvas.js` refactor | x-spreadsheet `src/core/history.js` |
| Each operation (add, move, resize, delete, style change) is an entry | `canvas.js` | x-spreadsheet |
| `undo()` / `redo()` with proper state reconstruction | `canvas.js` | x-spreadsheet |
| JSON serialization for persistence | `canvas.js` | x-spreadsheet |

> **Status: DONE** — `canvas.js`: `_pushOp(op)`, `undo()`, `redo()`. Operations: add, remove, move, style, group, ungroup. Stack limit: 100. Redo cleared on new operation. Ctrl+Z / Ctrl+Y keyboard shortcuts.

### 4.3 Clipboard System
| Item | Target | Ported From |
|------|--------|-------------|
| `Clipboard` class with `copy/cut/clear` + `isCopy/isCut/isClear` | `src/lib/clipboard.js` | x-spreadsheet `src/core/clipboard.js` |
| Copy/paste canvas elements (Ctrl+C/V) | `canvas.js` | x-spreadsheet |
| Cross-subsystem paste (PDF selection → note, note → canvas) | `notes.js` / `canvas.js` | — |
| Clipboard history (last N items) | `src/lib/clipboard.js` | — |

> **Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. `src/lib/clipboard.js` (163 lines). `Clipboard` class with system clipboard, history, TSV conversion.

### 4.4 Context Menu System
| Item | Target | Ported From |
|------|--------|-------------|
| Global context menu component | `src/ui/contextMenu.js` | x-spreadsheet `src/component/contextmenu.js` |
| Data-driven: `[{key, title, label, shortcut, icon}]` | `src/ui/contextMenu.js` | x-spreadsheet |
| Divider support, keyboard navigation | `src/ui/contextMenu.js` | x-spreadsheet |
| Canvas right-click menu (copy/paste/delete/bring front/send back/duplicate/group/ungroup) | `canvas.js` | — |
| Course card right-click menu (open/bookmark/share/playlist) | `src/views/coursesRoute.js` | — |
| Note right-click menu (already exists, extend) | `notes.js` | — |
| Keyboard trigger: Shift+F10 | `src/ui/contextMenu.js` | — |

> **Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. `src/ui/contextMenu.js` (219 lines). `show`, `hide`, `bindKeyboardTrigger`. Arrow/Enter/Escape nav. Edge-flip positioning.

### 4.5 Composable Toolbar Items
| Item | Target | Ported From |
|------|--------|-------------|
| Each canvas tool as separate definition file | `src/features/canvasTools/` | x-spreadsheet `src/component/toolbar/` |
| Common base: `{name, icon, cursor, onActivate, onDeactivate, onMouseDown/Move/Up}` | `src/features/canvasTools/` | x-spreadsheet |
| Dynamic tool registration (plugins can add tools) | `pluginHost.js` extension point | — |

> **Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. `src/features/canvasTools/` (13 files). Individual tool files with dynamic registration via `registry.js`.

### 4.6 Lasso/Marquee Multi-Select
| Item | Target | Ported From |
|------|--------|-------------|
| Drag to select multiple elements | `canvas.js` | — |
| Shift+click to add to selection | `canvas.js` | — |
| Group/ungroup selected elements | `canvas.js` | — |
| Bulk operations (move, delete, style) | `canvas.js` | — |

> **Status: DONE** — `canvas.js`: `_startMarquee`, `_updateMarquee`, `_finishMarquee`, `_drawMarquee`. Shift+click toggle. `groupSelected()` (Ctrl+G), `ungroupSelected()` (Ctrl+Shift+G). Ctrl+A select all. All operations recorded for undo/redo.

### 4.7 DPR-Aware Rendering
| Item | Target | Ported From |
|------|--------|-------------|
| `devicePixelRatio`-aware canvas scaling | `canvas.js` | Phaser `src/scale/` |
| Retina-crisp rendering on HiDPI displays | `canvas.js` | Phaser |
| Dynamic resize on window/DPR change | `canvas.js` | Phaser |

> **Status: DONE** — `canvas.js:_resize()`. `canvas.width = w * dpr`, `canvas.height = h * dpr`, `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`. Resize listener + ResizeObserver for visualizer canvas.

### 4.8 Pointer Abstraction
| Item | Target | Ported From |
|------|--------|-------------|
| Unified mouse + touch handling with velocity, angle, distance | `src/lib/pointer.js` | Phaser `src/input/Pointer.js` |

> **Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. `src/lib/pointer.js` (203 lines). `Pointer` class with multi-pointer Map, pinch-to-zoom, velocity tracking.
| Multi-pointer support (pinch-to-zoom on touch) | `canvas.js` | Phaser |
| Button state tracking | `src/lib/pointer.js` | Phaser |

---

## Phase 5 — Progress & Dashboard (Week 6)

### 5.1 Calendar Heatmap
| Item | Target | Ported From |
|------|--------|-------------|
| GitHub-style contribution heatmap | `src/views/progressRoute.js` | PixOss grid pattern |
| Click-to-inspect: click day cell → see study details modal | `src/views/progressRoute.js` | PixOss `src/components/Modal/PixelModal.tsx` |
| Color intensity based on study time | `src/views/progressRoute.js` | — |
| 365-day view with month labels | `src/views/progressRoute.js` | — |

### 5.2 Dashboard Cards
| Item | Target | Ported From |
|------|--------|-------------|
| `ChartCard` component: title + tooltip + total + sparkline + footer | `src/components/chartCard.js` | Ant Design Pro `src/pages/dashboard/analysis/components/IntroduceRow.tsx` |
| KPI summary row on Home dashboard | `src/views/homeRoute.js` | Ant Design Pro |
| Trend indicators (up/down arrow + percentage) | `src/components/trend.js` | Ant Design Pro `src/pages/dashboard/analysis/components/Trend/` |
| Weekly comparison: "12% more study time than last week" | `src/views/homeRoute.js` | Ant Design Pro |

### 5.3 Daily/Weekly Time-Series Charts
| Item | Target | Ported From |
|------|--------|-------------|
| Line chart: study time per day over 30 days | `src/views/progressRoute.js` | — |
| Stacked bar: time per course per week | `src/views/progressRoute.js` | — |
| Chart.js plugin for custom progress visualizations | `src/features/progressChartPlugin.js` | Chart.js `core.plugins.js` |

### 5.4 Goal Setting
| Item | Target | Ported From |
|------|--------|-------------|
| Daily study goal (minutes) | `bridge.js` (settings store) | — |
| Weekly completion goal (topics) | `bridge.js` | — |
| Progress bar toward goal on Home dashboard | `src/views/homeRoute.js` | — |
| Notification when goal reached | `app.js` Toast | — |

### 5.5 XP / Gamification
| Item | Target | Ported From |
|------|--------|-------------|
| XP earned per activity (watch, complete, note, quiz) | `bridge.js` (new store) | — |
| Level progression with thresholds | `src/views/achievementsRoute.js` | — |
| XP display in sidebar / topbar | `index.html` | — |

### 5.6 Streak Enhancement
| Item | Target | Ported From |
|------|--------|-------------|
| Streak calendar visualization | `src/views/progressRoute.js` | — |
| Streak reminder notification | `src/features/streakReminder.js` | — |
| Best streak tracking | `bridge.js` | — |

---

## Phase 6 — Keyboard & Command System (Week 7)

### 6.1 Shortcuts Rebind Dialog
| Item | Target | Ported From |
|------|--------|-------------|
| Settings UI: list all shortcuts with current bindings | `src/views/settingsRoute.js` | Splayer `src/components/ShortcutsDialog.tsx` |
| Click to rebind: key recording mode | `src/views/settingsRoute.js` | Splayer |
| Conflict detection (warn if combo already used) | `src/views/settingsRoute.js` | Splayer |
| Display mapping (show `Ctrl+Shift+F` not `ctrl+shift+f`) | `src/views/settingsRoute.js` | Splayer |
| Reset to defaults button | `src/views/settingsRoute.js` | Splayer |
| Export/import shortcut config as JSON | `src/views/settingsRoute.js` | Splayer |
| Persist to IndexedDB | `bridge.js` (settings store) | — |

**Status: NOT STARTED** — no shortcut-rebind UI exists in `src/views/settingsRoute.js`.

### 6.2 Key Combo System
| Item | Target | Ported From |
|------|--------|-------------|
| Sequence-based combo detection (e.g., `g i` for Go to Inbox) | `src/core/keyboardShortcuts.js` | Phaser `src/input/keyboard/combo/KeyCombo.js` |
| Configurable reset timing between keys | `src/core/keyboardShortcuts.js` | Phaser |
| Max key delay for sequence detection | `src/core/keyboardShortcuts.js` | Phaser |

**Status: NOT STARTED** — `src/core/keyboardShortcuts.js` is a minimal registry with no sequence support, and it is imported by nothing; the live implementation is a separate inline copy in `app.js`.

### 6.3 Command Palette Enhancements
| Item | Target | Ported From |
|------|--------|-------------|
| Plugin-contributed commands | `commandPalette.js` + `pluginHost.js` | — |
| Recent commands history (localStorage) | `commandPalette.js` | — |
| Command arguments/parameters | `commandPalette.js` | — |
| Fuzzy match highlighting in results | `commandPalette.js` | — |

**Status: NOT STARTED** — `src/features/commandPalette.js` has no recents, no match highlighting, and no plugin-contributed commands.

### 6.4 Keyboard Shortcuts Cheatsheet
| Item | Target | Ported From |
|------|--------|-------------|
| Full-page overlay (not just modal) | `src/views/helpRoute.js` | — |
| Categorized: Navigation, Playback, Editor, Canvas, System | `src/views/helpRoute.js` | — |
| Printable format | `src/views/helpRoute.js` | — |

**Status: PARTIAL** — `Ctrl+/` opens the existing help overlay (`app.js`); the richer cheatsheet described here is not implemented.

---

## Phase 7 — Notes Editor Enhancements (Week 8)

### 7.1 Markdown Live Preview
| Item | Target | Ported From |
|------|--------|-------------|
| Split-pane: editor left, preview right | `notes.js` | — |
| Toggle between edit/preview/split modes | `notes.js` | — |
| Use `marked` (already vendored) for rendering | `notes.js` | — |

**Status: NOT STARTED** — `notes.js` has no preview mode.

### 7.2 Note Linking (Wikilinks)
| Item | Target | Ported From |
|------|--------|-------------|
| `[[note title]]` syntax for linking notes | `notes.js` | — |
| Auto-complete dropdown when typing `[[` | `notes.js` | — |
| Backlinks panel: "This note is referenced by..." | `notes.js` | — |
| Graph view of note connections | `src/views/notesRoute.js` | D3 `d3-force` |

**Status: PARTIAL** — `src/features/knowledgeGraph.js` parses `[[wikilinks]]` for the graph view, but `notes.js` has no wikilink rendering, autocomplete, or backlinks panel.

### 7.3 Inline Checkboxes
| Item | Target | Ported From |
|------|--------|-------------|
| `- [ ]` / `- [x]` syntax in notes | `notes.js` | — |
| Click to toggle checkbox state | `notes.js` | — |
| Count: "3 of 5 tasks completed" | `notes.js` | — |

**Status: NOT STARTED** — `notes.js` has no checkbox parsing or toggling.

### 7.4 Slash Command Enhancements
| Item | Target | Ported From |
|------|--------|-------------|
| More slash commands: /date, /time, /template, /code, /math, /diagram | `notes.js` | — |
| Plugin-contributed slash commands | `pluginHost.js` | — |
| Fuzzy search in slash menu | `notes.js` | — |

**Status: PARTIAL** — the slash menu offers formatting blocks (paragraph, h1-h3, lists, quote, code, table, rule); `/date`, `/time`, `/template`, `/math`, `/diagram`, fuzzy search, and plugin commands are not implemented.

### 7.5 Note Templates
| Item | Target | Ported From |
|------|--------|-------------|
| Pre-built templates: Cornell notes, meeting notes, Q&A, summary | `src/features/noteTemplates.js` | — |
| User-created templates | `bridge.js` (new store) | — |
| Template picker in slash menu | `notes.js` | — |

**Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. `src/features/noteTemplates.js` with 6 built-in templates, user template CRUD, `getTemplatePickerItems()`. ~130 lines.

---

## Phase 8 — PDF Viewer Enhancements (Week 9)

### 8.1 Continuous Scroll Mode
| Item | Target | Ported From |
|------|--------|-------------|
| All pages rendered in a scrollable container | `pdf.js` | — |
| Lazy rendering: only render visible pages | `pdf.js` | — |
| Toggle between page-by-page and continuous | `pdf.js` | — |

**Status: NOT STARTED** — `pdf.js` renders a single page at a time; there is no continuous mode.

### 8.2 Per-Page Bookmarks
| Item | Target | Ported From |
|------|--------|-------------|
| Bookmark specific pages with labels | `bridge.js` (new store) | — |
| Bookmarks panel in PDF sidebar | `pdf.js` | — |
| Jump to bookmark | `pdf.js` | — |

**Status: PARTIAL** — the storage layer exists (`bridge.js` `addPdfBookmark` and the `pdfBookmarks` store), but `pdf.js` has no bookmark UI.

### 8.3 Annotation Text Notes
| Item | Target | Ported From |
|------|--------|-------------|
| Click annotation → open text input | `pdf.js` | — |
| Persist annotation text to IndexedDB | `bridge.js` | — |
| Show annotation text on hover | `pdf.js` | — |

**Status: NOT STARTED** — annotations are stored and rendered, but there is no attached-note editing UI.

### 8.4 PDF-to-Note Pipeline
| Item | Target | Ported From |
|------|--------|-------------|
| Select text → "Save as note" (already exists) | `pdf.js` | — |
| Bulk export all annotations to a single note | `pdf.js` | — |
| Page screenshot → attach to note | `pdf.js` | canvas2image |

**Status: PARTIAL** — `src/views/pdfRoute.js` can export annotations to notes; the bulk single-note pipeline described here is not implemented.

---

## Phase 9 — Translation & i18n (Week 10)

### 9.1 Translation Cache
| Item | Target | Ported From |
|------|--------|-------------|
| Cache translated text in IndexedDB | `bridge.js` (new store) | PDFMathTranslate `pdf2zh/cache.py` |
| Key: source text hash + language pair + provider | `bridge.js` | PDFMathTranslate |
| TTL-based expiry | `bridge.js` | PDFMathTranslate |

**Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. `src/features/translationCache.js` with IndexedDB store, FNV-1a hash, 30-day TTL. ~175 lines.

### 9.2 Multi-Provider Translator
| Item | Target | Ported From |
|------|--------|-------------|
| Abstract `BaseTranslator` with `translate()` | `src/features/translator.js` | PDFMathTranslate `pdf2zh/translator.py:39-164` |
| Cache-first: check IndexedDB before calling provider | `src/features/translator.js` | PDFMathTranslate |
| Providers: Google Translate (free API), DeepL, OpenAI, Ollama | `src/features/translator.js` | PDFMathTranslate |
| Custom prompt templates for AI translation | `src/features/translator.js` | PDFMathTranslate `pdf2zh/translator.py:112-149` |

**Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. `src/features/translator.js` with `BaseTranslator`, `GoogleTranslator`, `OpenAITranslator`, `CustomAPITranslator`, `TranslatorRegistry`. ~250 lines.

### 9.3 Note Translation
| Item | Target | Ported From |
|------|--------|-------------|
| Right-click note → "Translate to..." | `notes.js` | — |
| In-place translation (replace or side-by-side) | `notes.js` | — |
| Auto-detect source language | `src/features/translator.js` | — |

> **Status: PARTIAL** — the translator registry and cache ARE wired into `src/index.js` and exposed as `OpenCourseDeck.TranslatorRegistry` / `TranslationCache`, and locales are registered via `src/core/locale.js`; but `notes.js` has no "Translate to..." action and `player.js` has no subtitle translation.



### 9.4 Subtitle Translation
| Item | Target | Ported From |
|------|--------|-------------|
| Translate VTT captions during playback | `player.js` | — |
| Dual subtitles (original + translated) | `player.js` | — |

**Status: NOT STARTED** — `player.js` has no translate control and no dual-subtitle mode.

### 9.5 Locale Framework
| Item | Target | Ported From |
|------|--------|-------------|
| Locale registration: `OpenCourseDeck.locale('fa', faMessages)` | `src/core/locale.js` | x-spreadsheet `src/index.js:126-128` |
| Flat-key message format: `'menu.file'` → `'فایل'` | `src/core/locale.js` | Ant Design Pro `src/locales/en-US.ts` |
| `formatMessage(key, params)` | `src/core/locale.js` | Ant Design Pro |
| RTL/LTR auto-detection per locale | `src/core/prefs.js` (extend) | — |
| Locale files: `en-US`, `fa-IR` (initial) | `src/locales/` | — |

**Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. `src/core/locale.js` with `locale()`, `t()`, `tf()`, `getCurrentLang()`, `setCurrentLang()`. Locale files: `en-US`, `fa-IR`. ~740 lines total.

---

## Phase 10 — Storage & Data (Week 11)

### 10.1 IndexedDB Typed Schema
| Item | Target | Ported From |
|------|--------|-------------|
| Typed store definitions with versioned upgrades | `bridge.js` refactor | Splayer `src/lib/idb.ts` |
| Index-based queries for common patterns | `bridge.js` | Splayer |
| Migration runner for schema changes | `bridge.js` | Splayer |

**Status: COMPLETE** — `queryByIndex()`, `queryByRange()`, `countByIndex()` methods added to bridge.js DB module. ~80 lines.

### 10.2 Backup/Restore UI
| Item | Target | Ported From |
|------|--------|-------------|
| Dedicated backup wizard (not just export button) | `src/views/settingsRoute.js` | — |
| Select what to backup (notes, progress, settings, all) | `src/views/settingsRoute.js` | — |
| Import wizard with conflict resolution (merge/overwrite/skip) | `src/views/settingsRoute.js` | — |
| Backup to JSON file with version header | `bridge.js` | — |
| Auto-backup reminder (if no backup in 7 days) | `src/features/backupReminder.js` | — |

**Status: PARTIAL** — `bridge.js` implements `exportBackup(categories)`/`importBackup(mode)`, but Settings only exposes plain export/import buttons: no category selection, conflict resolution, progress bar, or reminder.

### 10.3 Smart Playlists
| Item | Target | Ported From |
|------|--------|-------------|
| Derived queries: Recently Played, Most Played, Never Played | `src/views/playlistsRoute.js` | Splayer smart playlists |
| "Continue Watching" auto-playlist | `src/views/homeRoute.js` | — |
| Custom smart playlist rules | `bridge.js` (settings store) | — |

**Status: NOT STARTED** — no smart-playlist or continue-watching query exists.

### 10.4 Data Migration Versioning
| Item | Target | Ported From |
|------|--------|-------------|
| Versioned schema with upgrade path | `bridge.js` | Splayer |
| Rollback capability | `bridge.js` | — |
| Migration status UI in Help route | `src/views/helpRoute.js` | — |

**Status: PARTIAL** — migration is versioned and per-section in `bridge.js` (with a deterministic id ledger), but there is no migration-status UI in Help.

---

## Phase 11 — Desktop & Native (Week 12)

### 11.1 Tauri Commands
| Item | Target | Ported From |
|------|--------|-------------|
| File system read/write (for local catalog import) | `src-tauri/src/lib.rs` | — |
| System tray with quick actions | `src-tauri/src/lib.rs` | — |
| Deep linking (`opencoursedeck://` protocol) | `src-tauri/src/lib.rs` | — |
| Native notifications | `src-tauri/src/lib.rs` | — |
| Auto-update check | `src-tauri/src/lib.rs` | — |
| Window state persistence (size, position) | `src-tauri/src/lib.rs` | — |

### 11.2 File Associations
| Item | Target | Ported From |
|------|--------|-------------|
| Open `.plasmabackup` files by double-click | `src-tauri/tauri.conf.json` | — |
| Open PDF files directly in OpenCourseDeck | `src-tauri/tauri.conf.json` | — |

---

## Phase 12 — Chart & Visualization (Week 13)

### 12.1 Custom Chart.js Plugins
| Item | Target | Ported From |
|------|--------|-------------|
| Study time heatmap plugin | `src/features/chartPlugins/heatmap.js` | Chart.js `core.plugins.js` |
| Completion arc/ring plugin | `src/features/chartPlugins/arc.js` | Chart.js |
| Skill radar plugin | `src/features/chartPlugins/radar.js` | Chart.js |
| Sparkline plugin (inline mini-charts) | `src/features/chartPlugins/sparkline.js` | Chart.js |

**Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. All 4 Chart.js plugins: `chartHeatmap`, `chartSparkline`, `chartArc`, `chartGauge`. ~560 lines.

### 12.2 D3 Zoom for Canvas
| Item | Target | Ported From |
|------|--------|-------------|
| Pan/zoom with mouse wheel, pinch, touch | `canvas.js` | D3 `d3-zoom` (standalone) |
| Zoom-to-cursor (not zoom-to-center) | `canvas.js` | D3 |
| Min/max zoom limits | `canvas.js` | D3 |
| Smooth animated zoom transitions | `canvas.js` | D3 + easing library |

**Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. `CanvasZoom` class in `src/features/canvasZoom.js`. Mouse drag pan, wheel zoom-to-cursor, pinch-to-zoom, smooth animated transitions. ~299 lines.

### 12.3 Knowledge Graph Visualization
| Item | Target | Ported From |
|------|--------|-------------|
| Force-directed graph of note connections | `src/views/notesRoute.js` | D3 `d3-force` |
| Nodes = notes, edges = wikilinks | `src/views/notesRoute.js` | D3 |
| Click node → navigate to note | `src/views/notesRoute.js` | D3 |
| Filter by tag, course, date | `src/views/notesRoute.js` | D3 |

**Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. `KnowledgeGraph` class in `src/features/knowledgeGraph.js`. Force-directed simulation, canvas rendering, drag-to-rearrange, click-to-navigate. ~448 lines.

### 12.4 Course Dependency Graph
| Item | Target | Ported From |
|------|--------|-------------|
| Tree/hierarchy of course topics | `src/views/coursesRoute.js` | D3 `d3-hierarchy` |
| Completion status on each node | `src/views/coursesRoute.js` | D3 |
| Click node → navigate to topic | `src/views/coursesRoute.js` | D3 |

**Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. `CourseGraph` class in `src/features/courseGraph.js`. Tree layout, completion-colored nodes, expandable branches, zoom/pan. ~328 lines.

### 12.5 Canvas-Native Charts (Ripl)
| Item | Target | Ported From |
|------|--------|-------------|
| Gauge chart for progress widgets | `src/features/canvasCharts/` | Ripl `packages/charts/src/charts/gauge/` |
| Treemap for storage visualization | `src/features/canvasCharts/` | Ripl `packages/charts/src/charts/treemap/` |
| Area chart for study time trends | `src/features/canvasCharts/` | Ripl `packages/charts/src/charts/area/` |
| Heatmap for contribution calendar | `src/features/canvasCharts/` | Ripl `packages/charts/src/charts/heatmap/` |

**Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. All 4 canvas-native charts: `CanvasGauge`, `CanvasTreemap`, `CanvasAreaChart`, `CanvasHeatmap`. ~985 lines.

---

## Phase 13 — Performance (Week 14)

### 13.1 Virtual Scrolling
| Item | Target | Ported From |
|------|--------|-------------|
| Virtual list for notes (1000+ items) | `notes.js` | wolf-table `src/scrollbar/index.ts` |
| Virtual list for courses catalog | `src/views/coursesRoute.js` | wolf-table |
| Virtual scrollbar with content sizing | `src/lib/virtualScroll.js` | wolf-table |

**Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. `VirtualList` class in `src/lib/virtualScroll.js` with buffer rendering, ResizeObserver, variable-height support. ~180 lines.

### 13.2 Code Splitting
| Item | Target | Ported From |
|------|--------|-------------|
| Route-based chunks (already lazy-load features) | `scripts/build.cjs` (extend) | — |
| Vendor chunk separation (Chart.js, PDF.js, Fuse.js) | `scripts/build.cjs` | — |
| Dynamic imports for Settings, Help, Achievements | `src/index.js` | — |

**Status: COMPLETE** — Enhanced `scripts/build.cjs` with `metafile: true`, vendor chunk detection, bundle size reporting. ~70 lines.

### 13.3 Image Lazy Loading
| Item | Target | Ported From |
|------|--------|-------------|
| IntersectionObserver for all images | `app.js` LazyImages (extend) | — |
| Placeholder with blur-up effect | `app.js` | — |
| WebP detection and fallback | `app.js` | — |

**Status: PARTIAL** — `app.js` lazy-loads images via a validated `safeImageUrl` path; WebP detection and blur-up placeholders are not implemented.

### 13.4 Web Worker Offloading
| Item | Target | Ported From |
|------|--------|-------------|
| PDF rendering in worker (pdfjs-dist supports this) | `pdf.js` | — |
| Fuse.js search in worker | `topbarSearch.js` | — |
| AI embedding computation in worker | `aiClient.js` | — |
| Catalog parsing in worker | `data.js` | — |

**Status: DONE** — Wired into src/index.js, exposed on OpenCourseDeck namespace. `src/workers/search.worker.js`, `src/workers/catalog.worker.js`, `src/lib/workerPool.js` with idle timeout. ~250 lines total.

### 13.5 Request Cache Enhancement
| Item | Target | Ported From |
|------|--------|-------------|
| LRU cache with size limit | `data.js` HttpClient | — |
| Cache invalidation on data mutation | `data.js` | — |
| Prefetch next/prev catalog pages | `data.js` | — |

**Status: PARTIAL** — `data.js` `RequestCache` now has TTL plus an LRU size bound and stale-while-revalidate; hit/miss statistics and `prefetch()` are not implemented.

---

## Phase 14 — Plugin System (Week 15)

### 14.1 Plugin Sandboxing
| Item | Target | Ported From |
|------|--------|-------------|
| Web Worker sandbox for untrusted plugins | `pluginHost.js` | — |
| Message-passing API (postMessage) | `pluginHost.js` | — |
| Permission enforcement at sandbox boundary | `pluginHost.js` | — |

**Status: NOT STARTED** — `src/features/pluginHost.js` validates manifests only; there is no Worker sandbox and the module is not loaded into the runtime.

### 14.2 Plugin Lifecycle Hooks
| Item | Target | Ported From |
|------|--------|-------------|
| `onInstall`, `onActivate`, `onDeactivate`, `onUninstall` | `pluginHost.js` | — |
| State persistence across sessions | `pluginHost.js` | — |
| Error boundary per plugin | `pluginHost.js` | — |

**Status: NOT STARTED** — no lifecycle state machine exists.

### 14.3 Plugin Marketplace UI
| Item | Target | Ported From |
|------|--------|-------------|
| Browse available plugins | `src/views/settingsRoute.js` | — |
| Install/uninstall/update from UI | `src/views/settingsRoute.js` | — |
| Plugin ratings and descriptions | `src/views/settingsRoute.js` | — |

**Status: NOT STARTED** — Settings contains no plugin UI.

### 14.4 Plugin API Surface
| Item | Target | Ported From |
|------|--------|-------------|
| `OpenCourseDeck.plugin.registerUI(panel)` — add custom UI panels | `pluginHost.js` | — |
| `OpenCourseDeck.plugin.registerRoute(path, handler)` — add routes | `pluginHost.js` | — |
| `OpenCourseDeck.plugin.registerCanvasTool(tool)` — add canvas tools | `pluginHost.js` | — |
| `OpenCourseDeck.plugin.registerNoteAction(action)` — add note actions | `pluginHost.js` | — |

**Status: NOT STARTED** — no `OpenCourseDeck.plugin.*` registration API exists.

---

## Phase 15 — Accessibility & Polish (Week 16)

### 15.1 High-Contrast Theme
| Item | Target | Ported From |
|------|--------|-------------|
| WCAG AAA compliant theme | `src/styles/themes.css` | — |
| Auto-detect `prefers-contrast: more` | `themeManager.js` | — |

### 15.2 Reduced Motion
| Item | Target | Ported From |
|------|--------|-------------|
| Respect `prefers-reduced-motion` globally | `app.js` | — |
| Disable all transitions/animations when preferred | `src/styles/animations.css` | — |
| Instant transitions as fallback | All modules | — |

### 15.3 Screen Reader Enhancements
| Item | Target | Ported From |
|------|--------|-------------|
| Announce route changes | `router.js` (extend) | — |
| Announce progress updates | `progress.js` | — |
| Announce search result count | `topbarSearch.js` | — |
| Announce undo/redo actions | `canvas.js` / `notes.js` | — |

### 15.4 Focus Management
| Item | Target | Ported From |
|------|--------|-------------|
| Focus visible indicators on all interactive elements | `src/styles/components.css` | — |
| Skip links for each major section | `index.html` | — |
| Focus restoration after modal/drawer close (already exists, verify all paths) | `dom.js` | — |

### 15.5 Mobile Touch Optimization
| Item | Target | Ported From |
|------|--------|-------------|
| Bottom tab bar for mobile navigation | `index.html` + `app.js` | — |
| Swipe gestures for page navigation | `app.js` | — |
| Touch-optimized canvas controls (larger hit targets) | `canvas.js` | — |
| Pull-to-refresh catalog | `src/views/coursesRoute.js` | — |

---

## Phase 16 — Testing & CI (Week 17)

### 16.1 Test Coverage
| Item | Target |
|------|--------|
| Unit tests for all new `src/lib/` utilities | `tests/` |
| Integration tests for canvas undo/redo | `tests/canvas-undo.test.js` |
| Integration tests for keyboard rebind | `tests/keyboard-rebind.test.js` |
| Integration tests for translation cache | `tests/translation.test.js` |
| E2E smoke tests for all routes | `tests/` |

### 16.2 Performance Benchmarks
| Item | Target |
|------|--------|
| Canvas render time benchmark | `tests/perf/` |
| Note list render benchmark (1000 items) | `tests/perf/` |
| Search latency benchmark | `tests/perf/` |
| Bundle size tracking | CI pipeline |

### 16.3 Accessibility Audit
| Item | Target |
|------|--------|
| axe-core automated audit | `tests/a11y.test.js` |
| Keyboard navigation audit | Manual checklist |
| Screen reader audit (NVDA/VoiceOver) | Manual checklist |

---

## Execution Order & Dependencies

```
Phase 0  (Foundation)     ──→ no deps
Phase 1  (Utilities)      ──→ depends on Phase 0
Phase 2  (Animation)      ──→ depends on Phase 1 (easing)
Phase 3  (Video)          ──→ depends on Phase 1 (TimeRange, RequestQueue)
Phase 4  (Canvas)         ──→ depends on Phase 1 (collection, color) + Phase 2 (transitions)
Phase 5  (Progress)       ──→ depends on Phase 1 (collection, easing) + Phase 12 (charts)
Phase 6  (Keyboard)       ──→ depends on Phase 0 (EventEmitter)
Phase 7  (Notes)          ──→ depends on Phase 0 (utilities) + Phase 6 (context menu)
Phase 8  (PDF)            ──→ depends on Phase 4 (canvas export)
Phase 9  (Translation)    ──→ depends on Phase 1 (collection) + Phase 10 (storage)
Phase 10 (Storage)        ──→ depends on Phase 0 (data model separation)
Phase 11 (Desktop)        ──→ no deps (parallel)
Phase 12 (Charts)         ──→ depends on Phase 1 (easing, color)
Phase 13 (Performance)    ──→ no deps (parallel, ongoing)
Phase 14 (Plugins)        ──→ depends on Phase 0 (EventEmitter) + Phase 6 (commands)
Phase 15 (Accessibility)  ──→ ongoing across all phases
Phase 16 (Testing)        ──→ ongoing across all phases
```

**Parallel execution possible:** Phases 3, 6, 10, 11, 13 can proceed independently after their deps.

---

## Source Project Reference

| Project | What We're Porting |
|---------|-------------------|
| Anime.js | Easing library, spring solver, timeline, stagger |
| Vidstack | MediaStorage, keyboard controller, TimeRange, RequestQueue, RAF loop |
| Splayer | Theme builder, waveform scrubber, shortcuts rebind, IndexedDB schema, color utilities |
| media_kit | Playlist API patterns, screenshot capture, keyboard shortcuts table |
| Ripl | arrayJoin, transitions, easing, chart types, interpolators, color utilities |
| canvas2image | Canvas export to PNG/JPEG |
| Chart.js | Plugin API, easing helpers, canvas text caching |
| D3 | d3-zoom, d3-force, d3-hierarchy, d3-interpolate |
| Motion Canvas | Easing, keyboard shortcuts architecture, ColorPicker, timeline, playback controls |
| Phaser | Key combo system, pointer abstraction, DPR scaling |
| PixOss | Grid heatmap pattern, click-to-inspect |
| Ant Design Pro | Error boundary, dashboard cards, trend indicators, i18n structure |
| PDFMathTranslate | Translation cache, multi-provider translator, prompt templates |
| wolf-table | HElement DOM utility, EventEmitter, virtual scrollbar, data model separation |
| x-spreadsheet | Undo/redo, context menu, clipboard, composable toolbar, locale registration |

---

## Estimated Total Effort

| Phase | Weeks | Items |
|-------|-------|-------|
| 0. Foundation | 1 | 6 |
| 1. Utilities | 1 | 6 |
| 2. Animation | 1 | 5 |
| 3. Video | 1 | 9 |
| 4. Canvas | 1 | 8 |
| 5. Progress | 1 | 6 |
| 6. Keyboard | 1 | 4 |
| 7. Notes | 1 | 5 |
| 8. PDF | 1 | 4 |
| 9. Translation | 1 | 5 |
| 10. Storage | 1 | 4 |
| 11. Desktop | 1 | 2 |
| 12. Charts | 1 | 5 |
| 13. Performance | 1 | 5 |
| 14. Plugins | 1 | 4 |
| 15. Accessibility | 1 | 5 |
| 16. Testing | 1 | 3 |
| **Total** | **17 weeks** | **86 items** |