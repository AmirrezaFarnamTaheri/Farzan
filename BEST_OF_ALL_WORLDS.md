# OpenCourseDeck — Best of All Worlds

> Definitive technical decisions for every peer implementation. Which pattern wins, what to steal from runners-up, and exactly how to combine them.

---

## 1. Animation & Easing

### Winner: Anime.js v4
**Why:** Already vanilla JS. Spring physics (underdamped/critically/overdamped) is unique. Stagger with grid/center/random origins is irreplaceable. Timeline with labels/positioning is the most complete. Cubic bezier solver is production-grade.

### What to steal from runners-up

| Feature | From | How to integrate |
|---------|------|-----------------|
| `Ease = (time: number) => number` type signature | Ripl `ease.ts` | Use as the canonical easing function signature for custom registrations |
| Range-mapped timing `TimingFunction(value, from, to)` | Motion Canvas `timingFunctions.ts` | Add as optional overload for value-relative easings (e.g., progress bars that ease from 30% to 80%) |
| Per-element transition with staggered delays | Ripl `transition.ts` | Adopt `Task`-based promise pattern for canvas element animations |
| Generator-based frame stepping | Motion Canvas `tween.ts` | Do NOT port — requires entire MC runtime. Use Anime.js RAF engine instead |

### Implementation plan

```
src/lib/easing.js          ← Anime.js cubic-bezier + spring + presets
src/lib/stagger.js         ← Anime.js stagger with grid/center/random
src/lib/timeline.js        ← Anime.js timeline with labels/positioning
src/lib/transition.js      ← Ripl Task-based promise + Anime.js RAF engine
```

### Easing catalog (merged from all three)

From Anime.js: `linear`, `easeInQuad`→`easeInOutQuart`, `easeInQuint`→`easeInOutQuint`, `easeInExpo`→`easeInOutExpo`, `easeInCirc`→`easeInOutCirc`, `easeInBack`→`easeInOutBack`, `easeInElastic`→`easeInOutElastic`, `easeInBounce`→`easeInOutBounce`, `cubicBezier()`, `spring()`

From Ripl: `easeOutCubic`, `easeOutQuart` (already in Anime.js set)

From Motion Canvas: `createEaseInBack(strength)`, `createEaseOutElastic(amplitude, period)`, `createEaseOutBounce(bounces)` — factory pattern for parameterized easings

---

## 2. Video Player

### Winner: Vidstack (keyboard, storage, time ranges, request queue)

### What to steal from others

| Feature | From | How to integrate |
|---------|------|-----------------|
| IndexedDB schema (tracks, playlists, settings, podcasts, books) | Splayer `idb.ts` | Extend `bridge.js` with Splayer's typed store pattern and versioned upgrades |
| Waveform scrubber (AudioContext → Float32Array → canvas bars) | Splayer `WaveformScrubber.tsx` | Port to vanilla JS `src/features/waveformScrubber.js` |
| Frequency visualizer (AnalyserNode → frequency bars → gradient) | Splayer `Visualizer.tsx` | Enhance existing `player.js` visualizer |
| Keyboard rebind dialog with conflict detection | Splayer `ShortcutsDialog.tsx` | Port to vanilla JS `src/views/settingsRoute.js` |
| Playlist API shape (open/next/previous/jump/add/remove/move/shuffle) | media_kit README | Adopt as the playlist interface contract |
| Color utilities (hexToHsl, accentFgFromHex, isDarkColor) | Splayer `themes.ts:138-180` | Port to `src/lib/color.js` |
| Theme builder (4 colors → full CSS vars) | Splayer `themes.ts:182` | Port to `src/core/themeBuilder.js` |

### Implementation plan

```
src/features/mediaStorage.js     ← Vidstack LocalMediaStorage (throttled, per-mediaId)
src/lib/timeRange.js             ← Vidstack TimeRange + normalizeTimeIntervals
src/lib/requestQueue.js          ← Vidstack RequestQueue with keyed dedup
src/lib/rafLoop.js               ← Vidstack RAFLoop (auto-pause on hidden)
src/features/waveformScrubber.js ← Splayer WaveformScrubber (vanilla JS)
src/lib/color.js                 ← Splayer color utilities + Ripl interpolation
src/core/themeBuilder.js         ← Splayer buildUserThemeVars
src/views/settingsRoute.js       ← Splayer ShortcutsDialog (vanilla JS)
```

### Keyboard controller comparison

| Aspect | Vidstack | Splayer | Best |
|--------|----------|---------|------|
| Combo syntax | `"k Space"` (alternatives), `"ctrl+k"` (modifiers) | `"Ctrl+Shift+R"` (accelerator) | Vidstack — alternatives are essential for media |
| Seek accumulation | ±5s per press, shift=±10s, clamps, resets on keyup | Simple `onSeek(time)` | Vidstack — accumulation is critical UX |
| Number-key seeking | 1=10%, 2=20%, ..., 0=100% | None | Vidstack |
| Symbol mapping | `!@#$%^&*()` mapped to `1234567890` + shift | None | Vidstack |
| Conflict detection | Rejects combos with unlisted modifiers | Warns on rebind | Combine both |
| Context awareness | Per-player scope | Per-surface (global/player/editor) | Splayer — surface activation is better |

**Decision:** Use Vidstack's combo syntax and seek accumulation. Add Splayer's per-surface context activation. Add conflict detection from both.

### MediaStorage comparison

| Aspect | Vidstack | Splayer | Best |
|--------|----------|---------|------|
| Storage backend | localStorage | IndexedDB | Splayer — IndexedDB is more robust |
| Throttling | `just-throttle` at 1s | No throttling | Vidstack — throttle writes |
| Per-media state | `time`, `volume`, `rate`, `quality`, `lang`, `captions` | `playCount`, `lastPlayedAt`, `liked`, `duration` | Combine both |
| Schema versioning | No | 7 versions with migrations | Splayer |

**Decision:** IndexedDB (Splayer) + throttled writes (Vidstack) + combined fields from both.

---

## 3. DOM & Events

### Winner: wolf-table HElement + EventEmitter

### Comparison

| Aspect | wolf-table | x-spreadsheet | Best |
|--------|-----------|---------------|------|
| DOM wrapper | `HElement` (229 lines) | `Element` (275 lines) | wolf-table — smaller, fragment-based |
| Batch append | Fragment-based `append()` | Individual `appendChild` | wolf-table — perf advantage |
| Event system | Map-based `EventEmitter` | Direct DOM events | wolf-table — decoupled |
| Wildcard support | None | N/A | Add `*` wildcard to EventEmitter |
| Fluent API | `.css()`, `.attr()`, `.on()`, `.append()` | `.active()`, `.checked()`, `.toggleClass()` | Combine both |

**Decision:** wolf-table `HElement` as base. Add x-spreadsheet's `toggleClass`, `active`, `checked` helpers. Fix wolf-table's `EventEmitter.off()` bug (uses wrong comparison). Add wildcard `*` support.

### Implementation plan

```
src/lib/hElement.js     ← wolf-table element.ts (229 lines) + x-spreadsheet helpers
src/lib/eventEmitter.js ← wolf-table event.ts (fixed) + wildcard support
```

---

## 4. Undo/Redo & History

### Winner: x-spreadsheet History

### Comparison

| Aspect | x-spreadsheet | Canvas.js current | Notes.js current | Best |
|--------|---------------|-------------------|------------------|------|
| Model | Snapshot (JSON.stringify) | Snapshot | Snapshot | x-spreadsheet with improvements |
| Stack limit | Unlimited | 80 | 100 | Add limit (50) |
| Serialization | `JSON.stringify`/`parse` | Same | Same | Use `structuredClone` (faster, handles more types) |
| Redo | Pushes current to redo on undo | Same | Same | Same |
| Persistence | In-memory only | In-memory | In-memory | Add optional IndexedDB persistence |

**Decision:** x-spreadsheet pattern with: stack limit (50), `structuredClone` instead of JSON round-trip, optional IndexedDB persistence for crash recovery.

### Implementation plan

```
src/lib/history.js  ← x-spreadsheet core/history.js (37 lines) + improvements (not yet implemented — canvas.js has inline undo/redo)
```

Used by: canvas.js, notes.js, future inline editors.

---

## 5. Context Menu

### Winner: x-spreadsheet

### Comparison

| Aspect | x-spreadsheet | Notes.js current | Best |
|--------|---------------|------------------|------|
| Data model | `[{key, title, label}]` | Hardcoded HTML | x-spreadsheet — data-driven |
| Dividers | `divider` key | Manual `<hr>` | x-spreadsheet |
| Shortcut labels | Shown in menu | Not shown | x-spreadsheet |
| Position | Flips near edge | Manual | x-spreadsheet |
| Close | Click-outside | Click-outside | Same |
| Keyboard nav | None | None | Add arrow keys, enter, escape |
| Keyboard trigger | None | None | Add Shift+F10 |

**Decision:** x-spreadsheet data-driven pattern. Add keyboard navigation (arrow/enter/escape). Add Shift+F10 trigger. Add submenu support.

### Implementation plan

```
src/ui/contextMenu.js  ← x-spreadsheet contextmenu.js + keyboard nav + submenus
```

---

## 6. Clipboard

### Winner: x-spreadsheet

### Comparison

| Aspect | x-spreadsheet | Canvas.js current | Best |
|--------|---------------|-------------------|------|
| State machine | `clear → copy/cut` with `isCopy()/isCut()/isClear()` | Array of elements | x-spreadsheet — cleaner |
| System clipboard | `navigator.clipboard.writeText` + `evt.clipboardData` | None | x-spreadsheet |
| Format | TSV for paste | None | x-spreadsheet |
| Cross-subsystem | None | None | Add note↔canvas↔PDF paste |

**Decision:** x-spreadsheet state machine + system clipboard. Add cross-subsystem paste (PDF selection → note, note → canvas text element).

### Implementation plan

```
src/lib/clipboard.js  ← x-spreadsheet core/clipboard.js (35 lines) + cross-subsystem
```

---

## 7. Toolbar

### Winner: x-spreadsheet (composable items)

### Comparison

| Aspect | x-spreadsheet | Best |
|--------|---------------|------|
| Architecture | Class hierarchy: `Item` → `ToggleItem`, `DropdownItem`, `IconItem` | x-spreadsheet |
| State management | `setState()` per item | x-spreadsheet |
| Extension | `extendToolbar.left/right` | x-spreadsheet |
| Registration | Hardcoded arrays | **Change to:** `toolbar.register(item)` pattern |
| Overflow | `More` dropdown | x-spreadsheet |

**Decision:** x-spreadsheet class hierarchy. Replace hardcoded arrays with registration pattern so plugins can add toolbar items.

### Implementation plan

```
src/ui/toolbar.js       ← x-spreadsheet toolbar architecture + registration (not yet implemented)
src/features/canvasTools/ ← Each tool as separate file (pen.js, eraser.js, etc.)
```

---

## 8. Data Visualization

### Winner: Hybrid (Chart.js helpers + Ripl architecture + D3 modules)

### Comparison

| Aspect | Chart.js | D3 | Ripl | Best |
|--------|----------|-----|------|------|
| Plugin model | Lifecycle hooks, cancelable | Module composition | EventBus inheritance | Chart.js |
| Interaction | 6 modes + binary search | d3-brush + d3-drag + d3-zoom | mouseenter/leave | Chart.js + d3-zoom |
| Easing | 31 functions | d3-ease (same set) | 13 functions | Chart.js (already vendored) |
| Canvas text | LRU cache + measurement | No canvas helpers | Basic | Chart.js |
| Chart types | 8 built-in | 30+ modules | 4 types | Ripl focused set + Chart.js radar |
| Bundle | ~200KB | ~50KB per module | ~15KB | Ripl architecture, cherry-pick |

**Decision:**
- Use Chart.js for existing charts (already vendored)
- Write custom Chart.js plugins for: heatmap, sparkline, completion arc, gauge
- Use d3-zoom standalone for canvas whiteboard pan/zoom
- Use d3-force standalone for knowledge graph visualization
- Use d3-hierarchy standalone for course dependency tree
- Port Ripl's `Chart` base class pattern for canvas-native charts in whiteboard
- Port Chart.js `_measureText` LRU cache for all canvas text rendering

### Implementation plan

```
src/features/chartPlugins/heatmap.js     ← Chart.js plugin API
src/features/chartPlugins/sparkline.js   ← Chart.js plugin API
src/features/chartPlugins/arc.js         ← Chart.js plugin API
src/features/chartPlugins/gauge.js       ← Chart.js plugin API + Ripl gauge pattern
src/features/canvasCharts/               ← Ripl chart base class pattern
src/lib/textCache.js                     ← Chart.js _measureText LRU cache
```

---

## 9. UI Components

### Winner: Motion Canvas (ColorPicker, Slider, Timeline, Playback, Shortcuts) + Ant Design Pro (Dashboard, Error Boundary)

### ColorPicker

| Aspect | Motion Canvas | Best |
|--------|---------------|------|
| Model | HSV (hue, saturation, value, alpha) | Motion Canvas |
| Interaction | 2D gradient square + 1D hue strip | Motion Canvas |
| Pointer handling | `setPointerCapture` / `releasePointerCapture` | Motion Canvas |
| Dependencies | `chroma-js` for HSV↔hex | **Replace with** 30-line HSV→hex converter |

**Decision:** Port Motion Canvas ColorPicker to vanilla JS. Drop chroma-js.

### Slider

| Aspect | Motion Canvas | Best |
|--------|---------------|------|
| Orientation | Vertical (0→1 bottom-to-top) | Add horizontal mode |
| Pointer handling | `setPointerCapture` | Motion Canvas |
| Range (dual-thumb) | None | Add for OpenCourseDeck |

**Decision:** Port Motion Canvas Slider. Add horizontal + range mode.

### Timeline

| Aspect | Motion Canvas | Best |
|--------|---------------|------|
| Zoom | Wheel with ZOOM_SPEED, min/max | Motion Canvas |
| Scrub | Pointer capture on playhead | Motion Canvas |
| Conversion | `framesToPixels` / `pixelsToFrames` | Motion Canvas — adapt to `secondsToPixels` |
| Tracks | Scene, label, audio, range | Motion Canvas |
| Virtual density | Density-based label visibility | Motion Canvas |

**Decision:** Port Motion Canvas Timeline to vanilla JS. Adapt frame-based math to time-based. Use for: video chapter timeline, course progress timeline, study session timeline.

### Playback Controls

| Aspect | Motion Canvas | Best |
|--------|---------------|------|
| Speed selector | 0.25x–2x | Add custom speed input |
| Volume | Slider + mute toggle | Motion Canvas |
| Navigation | Prev/next frame, skip start/end | Motion Canvas |
| Loop | Toggle | Motion Canvas |
| Snapshot | Button | Motion Canvas |

**Decision:** Port Motion Canvas PlaybackControls. Wire to OpenCourseDeck's `MediaPlayer` interface.

### Shortcuts System

| Aspect | Motion Canvas | Splayer | Vidstack | Best |
|--------|---------------|---------|----------|------|
| Registration | `makeShortcuts(context, map)` | `register(accelerator, handler)` | `register(combo, handler)` | Motion Canvas — context-aware |
| Context | Per-context groups | Per-surface | Per-player | Motion Canvas — most flexible |
| Surface activation | Pointer enter/leave | None | None | Motion Canvas |
| Action state machine | Escape/Enter confirm/cancel | None | None | Motion Canvas |
| Display | `{key, modifiers, display, description}` | String accelerator | String combo | Motion Canvas — structured |
| Conflict detection | None | Yes | Yes | Add from Splayer/Vidstack |

**Decision:** Motion Canvas context-aware architecture + Splayer conflict detection + Vidstack seek accumulation.

### Error Boundary

| Aspect | Ant Design Pro | Best |
|--------|---------------|------|
| Chunk-load detection | Regex on error message | Ant Design Pro |
| Online/offline | `navigator.onLine` + events | Ant Design Pro |
| Retry | Increment key (remount) | Adapt: re-initialize app section |
| Error display | User-friendly message + retry button | Ant Design Pro |

**Decision:** Port Ant Design Pro error boundary pattern to vanilla JS. Wrap `#plasma-app` in try/catch. Add offline banner. Add chunk-load retry.

### Dashboard Cards

| Aspect | Ant Design Pro | Best |
|--------|---------------|------|
| ChartCard | Title + tooltip + total + sparkline + footer | Ant Design Pro |
| Trend | Up/down arrow + percentage | Ant Design Pro |
| Responsive grid | `xs/sm/md/lg/xl` props | Ant Design Pro |

**Decision:** Port ChartCard + Trend to vanilla JS components. Use for Home dashboard KPIs.

### Implementation plan

```
src/ui/colorPicker.js           ← Motion Canvas ColorPicker (vanilla JS, no chroma-js) (not yet implemented)
src/ui/slider.js                ← Motion Canvas Slider (horizontal + range) (not yet implemented)
src/ui/timeline.js              ← Motion Canvas Timeline (time-based) (not yet implemented)
src/ui/playbackControls.js      ← Motion Canvas PlaybackControls (not yet implemented)
src/core/keyboardShortcuts.js   ← Motion Canvas context-aware + Splayer conflict + Vidstack seek
src/features/errorBoundary.js   ← Ant Design Pro error boundary (vanilla JS)
src/components/chartCard.js     ← Ant Design Pro ChartCard (not yet implemented)
src/components/trend.js         ← Ant Design Pro Trend (not yet implemented)
src/features/offlineBanner.js   ← Ant Design Pro offline detection
```

---

## 10. Translation & Config

### Winner: PDFMathTranslate (cache + multi-provider + config)

### Comparison

| Aspect | PDFMathTranslate | Best |
|--------|-----------------|------|
| Cache | SQLite composite key | Adapt: IndexedDB composite key |
| Providers | 20+ with OpenAI-compatible base | Adopt base class + registry |
| Config | Singleton + cascade (config→env→default) | Adapt: IndexedDB→localStorage→default |
| Prompt templates | `string.Template` with `$lang_in`, `$lang_out`, `$text` | Adopt |

**Decision:**
- Cache in IndexedDB with composite key: `(engine, paramsHash, sourceText)`
- `BaseTranslator` with `translate()` (cache check) → `do_translate()` (override)
- `TranslatorRegistry.register(name, class)` for provider registration
- `OpenAITranslator` base class for any OpenAI-compatible API
- `ConfigManager` with cascade: IndexedDB → localStorage → default
- Cross-tab sync via BroadcastChannel

### Implementation plan

```
src/features/translator.js      ← PDFMathTranslate translator.py (vanilla JS)
src/features/translationCache.js ← PDFMathTranslate cache.py (IndexedDB)
src/core/configManager.js        ← PDFMathTranslate config.py (IndexedDB + localStorage) (not yet implemented)
src/locales/en-US.js             ← Ant Design Pro locale structure
src/locales/fa-IR.js             ← Persian locale
src/core/locale.js               ← x-spreadsheet locale registration + fallback
```

---

## 11. Data Structures

### Winner: Ripl Utilities

### What to port

| Function | From | Use in OpenCourseDeck |
|----------|------|-------------------|
| `arrayJoin(left, right, key, type)` | Ripl `collection.ts:101` | Join catalog topics with progress data |
| `arrayGroup(arr, keyFn)` | Ripl `collection.ts:108` | Group notes by date, course, tag |
| `arrayIntersection(a, b)` | Ripl | Find common topics between courses |
| `arrayDifference(a, b)` | Ripl | Find uncompleted topics |
| `arrayDedupe(arr, keyFn)` | Ripl | Deduplicate search results |
| `arrayMapRange(start, end, fn)` | Ripl | Generate grid coordinates for heatmap |
| `objectMap/Reduce/ForEach` | Ripl | Transform data objects |
| `setMap/Filter/Find/FlatMap` | Ripl | Set operations for tag filtering |

### Implementation plan

```
src/lib/collection.js  ← Ripl packages/utilities/src/collection.ts (258 lines)
```

---

## 12. Canvas Input

### Winner: Phaser (Pointer + KeyCombo)

### Comparison

| Aspect | Phaser | Best |
|--------|--------|------|
| Pointer | Position, velocity, angle, distance, smoothing, button bitmask, multi-touch | Phaser |
| KeyCombo | Sequence matching, maxKeyDelay, resetOnWrongKey, progress tracking | Phaser |
| Bundle | ~50KB (full input system) | **Extract only** Pointer + KeyCombo (~8KB) |

**Decision:** Extract `Pointer.js` and `KeyCombo.js` patterns from Phaser. Port to vanilla JS modules.

### Implementation plan

```
src/lib/pointer.js    ← Phaser Pointer (position, velocity, angle, distance, multi-touch)
src/lib/keyCombo.js        ← Phaser (sequence matching, maxKeyDelay) — not yet implemented (handled by src/core/keyboardShortcuts.js) ✗ file does not exist
```

---

## 13. Export & File Operations

### Winner: canvas2image (canvas export)

### What to port

| Function | From | Use |
|----------|------|-----|
| `saveAsImage(canvas, width, height, format)` | canvas2image | Whiteboard export |
| `convertToImage(canvas, width, height, format)` | canvas2image | In-memory conversion |
| `scaleCanvas(canvas, width, height)` | canvas2image | HiDPI export |
| `genBitmapImage(canvas)` | canvas2image | BMP fallback |
| Download via `<a>` click | canvas2image | Trigger download |

### Implementation plan

```
src/lib/canvasExport.js  ← canvas2image canvas2image.js (329 lines, vanilla JS)
```

---

## 14. Locale & i18n

### Winner: x-spreadsheet locale + Ant Design Pro structure

### Comparison

| Aspect | x-spreadsheet | Ant Design Pro | Best |
|--------|---------------|----------------|------|
| Registration | `locale(lang, message)` | Namespaced imports | x-spreadsheet — dynamic |
| Lookup | `t(key)` with dot-path, `tf(key)` returns thunk | `formatMessage({id})` | x-spreadsheet — simpler |
| Fallback | Language chain + global window | Default locale | x-spreadsheet |
| Structure | Flat keys | Namespaced flat keys | Ant Design Pro — organized |

**Decision:** x-spreadsheet registration + fallback. Ant Design Pro namespaced structure. Flat keys with dot notation: `'player.play'`, `'settings.theme'`.

---

## Final Module Map

```
src/
├── lib/
│   ├── dom.js              ← existing (add animateHeight, esc re-export)
│   ├── hElement.js          ← wolf-table (fluent DOM)
│   ├── eventEmitter.js      ← wolf-table (Map-based, fixed, wildcard)
│   ├── easing.js            ← Anime.js (30+ presets, spring, bezier)
│   ├── stagger.js           ← Anime.js (grid, center, random)
│   ├── timeline.js          ← Anime.js (labels, positioning)
│   ├── transition.js        ← Ripl (Task-based, cancellable) + Anime.js RAF
│   ├── collection.js        ← Ripl (arrayJoin, arrayGroup, etc.)
│   ├── color.js             ← Splayer (hex↔hsl, accentFg, isDark) + Ripl (interpolate)
│   ├── clipboard.js         ← x-spreadsheet (state machine, system clipboard)
│   ├── history.js           ← x-spreadsheet (undo/redo, structured clone) — not yet implemented (canvas.js has inline undo/redo)
│   ├── pointer.js           ← Phaser (position, velocity, multi-touch)
│   ├── keyCombo.js          ← Phaser (sequence matching, maxKeyDelay) — not yet implemented (handled by src/core/keyboardShortcuts.js)
│   ├── timeRange.js         ← Vidstack (interval merging, normalization)
│   ├── requestQueue.js      ← Vidstack (keyed dedup, deferred serve)
│   ├── rafLoop.js           ← Vidstack (auto-pause on hidden)
│   ├── canvasExport.js      ← canvas2image (PNG/JPEG/BMP, DPI scaling)
│   ├── textCache.js         ← Chart.js (LRU measurement cache) (not yet implemented)
│   ├── confirm.js           ← extracted from notes/pdf/progress
│   └── routeListeners.js    ← extracted from notes/pdf
│
├── core/
│   ├── themeManager.js      ← existing
│   ├── prefs.js             ← existing
│   ├── themeBuilder.js      ← Splayer (4 colors → full CSS vars)
│   ├── keyboardShortcuts.js ← Motion Canvas (context-aware) + Splayer (conflict) + Vidstack (seek)
│   ├── configManager.js     ← PDFMathTranslate (cascade: IDB→localStorage→default) — not yet implemented
│   ├── locale.js            ← x-spreadsheet (registration, fallback, t()/tf())
│   ├── storageMigrate.js    ← existing
│   └── beforeUnloadGuard.js ← existing
│
├── features/
│   ├── aiClient.js          ← existing
│   ├── pluginHost.js        ← existing
│   ├── commandPalette.js    ← existing
│   ├── topbarSearch.js      ← existing (restored)
│   ├── mediaStorage.js      ← Vidstack (throttled, per-mediaId, IndexedDB)
│   ├── waveformScrubber.js  ← Splayer (AudioContext → canvas bars)
│   ├── translator.js        ← PDFMathTranslate (multi-provider, cache-first)
│   ├── translationCache.js  ← PDFMathTranslate (IndexedDB composite key)
│   ├── errorBoundary.js     ← Ant Design Pro (offline, chunk-error, retry)
│   ├── offlineBanner.js     ← Ant Design Pro (online/offline detection)
│   ├── noteTemplates.js     ← new (Cornell, meeting, Q&A, summary)
│   ├── streakReminder.js    ← new — not yet implemented
│   ├── backupReminder.js    ← new — not yet implemented
│   ├── canvasTools/         ← x-spreadsheet pattern (one file per tool)
│   ├── chartPlugins/        ← Chart.js plugin API (heatmap, sparkline, arc, gauge)
│   └── canvasCharts/        ← Ripl chart base class (gauge, treemap, area, heatmap)
│
├── ui/
│   ├── contextMenu.js       ← x-spreadsheet (data-driven, keyboard nav)
│   ├── toolbar.js           ← x-spreadsheet (composable items, registration) — not yet implemented
│   ├── colorPicker.js       ← Motion Canvas (HSV, pointer capture) — not yet implemented
│   ├── slider.js            ← Motion Canvas (horizontal, range) — not yet implemented
│   ├── timeline.js          ← Motion Canvas (zoom, scrub, tracks) — not yet implemented
│   └── playbackControls.js  ← Motion Canvas (speed, volume, loop) — not yet implemented
│
├── components/
│   ├── chartCard.js         ← Ant Design Pro (title, total, sparkline, footer) — not yet implemented
│   └── trend.js             ← Ant Design Pro (up/down arrow + percentage) — not yet implemented
│
├── styles/
│   └── (existing, plus high-contrast theme)
│
└── locales/
    ├── en-US.js             ← Ant Design Pro structure
    └── fa-IR.js             ← Persian locale
```

---

## Source Project Contribution Summary

| Project | Items Ported | Difficulty | Impact |
|---------|-------------|------------|--------|
| **Anime.js** | Easing, stagger, timeline | Easy | High — all animations |
| **Vidstack** | MediaStorage, TimeRange, RequestQueue, RAFLoop, keyboard controller | Medium | High — video player |
| **Splayer** | Waveform, color utils, theme builder, IndexedDB schema, shortcuts rebind | Medium | High — UX polish |
| **media_kit** | Playlist API shape | Easy | Medium — interface contract |
| **Ripl** | Collection utils, transition system, chart base class | Medium | High — data + canvas |
| **canvas2image** | Canvas export | Easy | High — feature gap |
| **Chart.js** | Plugin API, easing helpers, text cache, interaction modes | Easy | Medium — already vendored |
| **D3** | d3-zoom, d3-force, d3-hierarchy | Medium | Medium — canvas + viz |
| **Motion Canvas** | ColorPicker, Slider, Timeline, PlaybackControls, shortcuts architecture | Medium | High — UI components |
| **Phaser** | Pointer abstraction, KeyCombo | Medium | Medium — canvas input |
| **PixOss** | Grid heatmap pattern | Easy | Low — progress viz |
| **Ant Design Pro** | Error boundary, ChartCard, Trend, locale structure | Medium | High — robustness |
| **PDFMathTranslate** | Translation cache, multi-provider, ConfigManager | Medium | High — i18n |
| **wolf-table** | HElement, EventEmitter, virtual scrollbar | Easy | Medium — DOM/events |
| **x-spreadsheet** | Undo/redo, context menu, clipboard, toolbar, locale | Easy | High — core UX |

**Total items to port:** 48 modules/components  
**Estimated effort:** 17 weeks (as detailed in ROADMAP.md)  
**Projects contributing:** 15 of 16 (Canvas iOS skipped — no web code)
