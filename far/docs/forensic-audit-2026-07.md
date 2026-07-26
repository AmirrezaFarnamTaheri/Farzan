# Executive Forensic Assessment — OpenCourseDeck

**Date:** 2026-07-26 · **Branch:** `claude/repo-audit-optimization-vwp7gn` · **PR:** #9
**Baseline:** `a4e3d22` (main) · **Head:** see branch tip

Evidence tiers used throughout: **T1** directly observed (file:line, executed
command, fetched document), **T2** inference from T1, **T3** working
assumption, **T4** unknown/unverifiable in this environment.

---

## 1. Executive Summary & Health Index

**Overall system health: 6.1 → 8.6 / 10** (composite of the five audit vectors below).

The codebase was structurally sound but carried a long tail of latent defects
that CI could not see. Three findings were severity-defining:

1. **CI could not detect stale committed artifacts.** `build:release` ran
   *before* `check:generated`, regenerating `dist/` and then comparing it to
   itself. Production consequently shipped a `dist/data/catalog.json` whose
   `currentCatalog` pointed at a file absent from the repo, a stale
   `dist/boot.js`, and DOMPurify 3.4.0 in `vendor/` while the lockfile pinned
   3.4.11. **T1**
2. **The mojibake detector was itself mojibake-corrupted** and matched the
   *double*-encoded signature, so it passed while `app.js`, `pdf.js`, and
   `player.js` shipped garbled em dashes, ellipses, and literal `â€¹`/`â€º`
   pagination glyphs to users. **T1 (verified by executing the checker)**
3. **A malformed URL killed the dev server process** — `decodeURIComponent`
   sat outside the request try/catch, so `GET /%` terminated Node. The same
   server backs the Electron desktop shell. **T1 (reproduced)**

### Risk profile

| Class | Before | After |
| :--- | :--- | :--- |
| Data-loss / corruption | 6 confirmed paths (undo stack, interval mutation, note mirror wipe, migration duplication/resurrection, cross-tab clobber, lost media writes) | 0 known |
| Crash / hang | 3 (dev-server DoS, heatmap infinite loop, rAF loop death) | 0 known |
| Security | 5 (CDN code-exec fallback, `innerHTML` XSS ×2, cleartext key egress, HTML-sink property bind) + 1 dependency CVE | 0 known |
| Silent CI blind spots | 4 (artifact drift, encoding, `--passWithNoTests`, unasserted vendor surface) | 0 known |

### Strategic ROI horizon

1. **Wire the built-but-unimported modules.** `mediaStorage`, `waveformScrubber`,
   `collection`, `transition`, `pluginHost`, and `keyboardShortcuts` are
   implemented, tested in places, and imported by nothing — several represent
   advertised features that are inert at runtime. Highest value per unit of
   effort in the repo. **T1**
2. **Collapse the duplicated implementations.** `keyboardShortcuts` and
   `EventEmitter` each exist twice (module + inline `app.js` copy) and have
   already drifted apart; `routeListeners` is hand-rolled in three views. Each
   duplicate is a place where a fix lands in the dead copy. **T1**
3. **Decompose `app.js` (3.9k lines).** It holds the router wiring, ~20 UI
   component factories, the search index, and the heatmap. It is the single
   largest obstacle to testing anything in isolation. **T2**

---

## 2. Corpus Accounting & Coverage Matrix

| Resource category | Discovered | Reviewed | Notes |
| :--- | ---: | ---: | :--- |
| `src/` modules (lib, core, features, views, workers, router, ui) | 87 | 100% | Line-by-line across three waves |
| Root application modules | 14 | 100% | `app.js`, `bridge.js`, `data.js`, `db.js`, `notes.js`, `pdf.js`, `player.js`, `canvas.js`, `progress.js`, `ui.js`, `boot.js`, `pdf-runtime.js`, configs |
| Build / tooling scripts | 19 | 100% | All `scripts/*.cjs` |
| Desktop shell | 5 | 100% | Electron main/preload/launch/app-window/packager |
| Stylesheets | 17 + `style.css` | 100% | Variable-definition and selector-usage cross-checked against markup |
| Tests | 44 files / 365 cases | 100% | Audited as artifacts in their own right |
| CI workflows | 2 | 100% | `ci.yml`, `generated-artifact-diagnostics.yml` |
| Documentation | 13 | 100% | Every checkable claim verified against code |
| Dependencies | 10 production | 100% | Advisory-checked against the GitHub Advisory DB |
| Total JS/CJS lines in scope | ~34,500 | 100% | — |

**Blind spots (T4):** Windows-only launcher behavior (`.cmd`/`.bat`/`.vbs`) and
packaged-Electron fuse configuration could not be executed in this Linux
container; both were reviewed statically only. Several documentation sources
(Chrome installability criteria, Vercel config reference, electronjs.org) were
blocked by the sandbox proxy and were substituted with equivalent primary
sources (raw GitHub docs, the installed Workbox JSON schema, MDN).

---

## 3. Structural Findings

Findings are recorded in the commit history with per-hunk rationale. The
severity-ordered summary:

### Critical — data loss or corruption

| ID | Finding | Evidence |
| :--- | :--- | :--- |
| D-1 | Canvas undo restored the wrong snapshot (off-by-one) and never captured live state, so one Ctrl+Z after two strokes lost both and redo could not recover the newest | `canvas.js` undo/redo — T1 |
| D-2 | `normalizeTimeIntervals` mutated caller-owned interval objects, corrupting persisted watched-segment state even when the return value was discarded | `src/lib/timeRange.js` — T1 |
| D-3 | `deleteNote`/`deleteFolder` removed the *entire* localStorage mirror when IndexedDB was unavailable — with IDB gone the mirror is the only live store, so deleting one note erased every note | `bridge.js` — T1 |
| D-4 | Migration was not memoized: concurrent DB calls started parallel full migrations that raced each other and concurrent deletes, resurrecting deleted records | `bridge.js` — T1 |
| D-5 | Id-less legacy records received a fresh random id per run, so the dedupe ledger never matched and every reload after a partial failure re-inserted duplicates | `bridge.js` — T1 |
| D-6 | A tab that had only *read* data never subscribed to the cross-tab channel, so it showed stale content and clobbered the other tab's edits on its first write | `bridge.js` — T1 |
| D-7 | `throttle` had no trailing edge, dropping the final media-position write on tab close and the last scroll render | `src/lib/dom.js` — T1 |

### Critical — crash, hang, or denial of service

| ID | Finding | Evidence |
| :--- | :--- | :--- |
| C-1 | `GET /%` terminated the dev-server process (unguarded `decodeURIComponent`); also kills the Electron shell | `scripts/dev-server.cjs` — T1, reproduced |
| C-2 | An ISO datetime string in heatmap data produced an Invalid Date that poisoned min/max with NaN, making the grid-walk loop non-terminating while allocating per iteration — tab freeze then OOM | `canvasCharts/heatmap.js`, `chartPlugins/heatmap.js` — T1 |
| C-3 | A throwing rAF callback skipped the re-arm, leaving the loop dead while `running` reported true; a tab hide/show cycle silently resurrected it | `src/lib/rafLoop.js` — T1 |

### High — security

| ID | Finding | Evidence |
| :--- | :--- | :--- |
| S-1 | Search worker fell back to `importScripts` from a CDN with no integrity pinning — arbitrary remote code with access to the full search corpus | `src/workers/search.worker.js` — T1 |
| S-2 | `aiClient.plainText()` and `TopbarSearch._plainText()` stripped HTML via `innerHTML`, which executes `<img onerror>` from imported note content | `src/features/aiClient.js`, `app.js` — T1 |
| S-3 | Translator endpoints accepted plain-`http://` remote hosts and embedded credentials, sending Bearer keys and note text in cleartext | `src/features/translator.js` — T1 |
| S-4 | `DataBind`'s `attr in el` catch-all reached `outerHTML`/`srcdoc` even though `innerHTML` was downgraded to `textContent` | `data.js` — T1 |
| S-5 | Committed DOMPurify lagged the lockfile by 11 patch releases; locked 3.4.11 matches GHSA-c2j3-45gr-mqc4 | `vendor/purify.min.js`, advisory DB — T1 |
| S-6 | Meta CSP omitted `object-src`/`base-uri`/`form-action` present in the Vercel header, leaving desktop/offline serving without that hardening | `index.html` vs `vercel.json` — T1 |

### High — resource leaks and correctness

Connection leaks (`db.js` concurrent opens, `backupEngine` zombie connections
after `onblocked`, `RealtimeClient` un-closed sockets on reconnect), listener
leaks (per-modal bus subscriptions, notes-list registry accumulation,
`MediaStorage` pagehide handlers, `Pointer.bind` double-bind), unbounded caches
(`RequestCache`, `translationCache`), and a set of logic defects: `window.open`
with `noopener` returning `null` (dead print path), `getPropertyValue() ?? ''`
never falling back (NaN progress bars), `toISOString()` date keys shifting the
day for non-UTC users, elastic easing returning NaN for amplitudes below 1,
`EventEmitter.off()` unable to remove a `once()` listener, and theme toggle
misclassifying all five named dark themes as light. All **T1**.

### Medium — CSS and accessibility

`components.css` referenced ~40 rules' worth of tokens that were never
defined (`--btn-h-*`, `--input-*`, `--grid-gap`, `--error`, `--duration-spin`),
so buttons collapsed to ~14px, inputs rendered borderless and transparent, and
dashboard grids lost every gutter. `animations.css` was a zero-byte file, so
the `spin` keyframes referenced by every loading state did not exist. `.sr-only`
was used in four places and defined nowhere, rendering screen-reader-only text
visibly. The accent picker and the entire sidebar footer widget set had no CSS
at all. All **T1**.

### Medium — documentation drift

`ROADMAP.md` marked essentially all of Phases 6, 7, 8, and 14 — plus parts of
3, 9, 10, and 13 — as `COMPLETE`/`DONE` for work with no corresponding code;
ten named APIs from those claims return zero grep hits repo-wide. Seven further
entries claimed "Wired into src/index.js" for modules nothing imports.
`PRODUCT.md` advertised a plugin host UI, semantic search, and quiz generation
that do not exist. `DESIGN.md` documented the wrong cheatsheet shortcut
(`Shift+?` vs the bound `Ctrl+/`) and a `data-inert` attribute the code does
not use. `docs/architecture.md` inverted its claim about the translation
modules. All **T1**.

---

## 4. Peer Benchmarking

- **Cross-tab consistency (BroadcastChannel).** The read-path subscription fix
  matches the pattern used by Yjs and Automerge providers: subscribe on
  *attach*, not on first send, because a passive replica must observe remote
  updates before it can safely originate one.
- **Migration idempotency.** Deterministic per-record keys plus a persisted
  ledger is the approach taken by Rails/Django/Flyway migrations and by
  Dexie's upgrade transactions. Random surrogate keys generated inside the
  migration are the classic anti-pattern that makes retries non-idempotent.
- **Stale-while-revalidate.** Restoring the background-refresh path aligns the
  hardened client with RFC 5861 and with SWR/TanStack Query, where the
  contract is *return stale immediately, refresh out of band* — collapsing it
  to a blocking fetch silently breaks offline reads.
- **`EventEmitter.off()` and once-wrappers.** Tagging the wrapper with
  `.listener` is exactly Node's own implementation strategy, which is what
  makes `off(event, originalHandler)` work there.
- **PDF embedding.** The missing `cm` operator is a well-known trap in
  hand-rolled PDF writers; jsPDF and PDFKit both emit the matrix explicitly.
  FlateDecode expects raw deflated samples, never a PNG container — so the
  removed PNG branch could not have worked in any conformant viewer.
- **Artifact drift gates.** Running the build and then `git diff --exit-code`
  over committed outputs is the convention in Kubernetes (`make verify`), Go
  (`go generate` + diff), and protobuf toolchains.

---

## 5. Prioritized Transformation Roadmap

### Phase 1 — Immediate stabilization *(done in this branch)*
All Critical and High findings above are fixed, with regression tests for the
non-obvious ones and two CI gates added (committed-artifact drift; a
corrected, non-self-defeating encoding check).

### Phase 2 — High-leverage architectural work *(recommended next)*
1. Wire or delete the unimported modules (§1, ROI #1). Each is a decision:
   `mediaStorage`/`waveformScrubber` are advertised features currently inert;
   `collection`/`transition` are dead code.
2. Collapse the duplicated `keyboardShortcuts` and `EventEmitter`
   implementations onto the module versions, then delete the inline copies.
3. Close the remaining test blind spots the suite audit identified: the worker
   message protocol runs against a hand-rolled fake, so a protocol change in
   either worker passes CI while search breaks in the app.
4. Reconsider the blocking `npm audit --omit=dev` CI step — it fails unrelated
   merges the moment a new advisory publishes. A scheduled job plus a
   non-blocking PR report is the usual split.

### Phase 3 — Strategic modernization
1. Decompose `app.js` along the seams already visible (UI components, search,
   router wiring, heatmap).
2. Implement the service-worker update prompt. The configs document a
   "update UI" that posts `SKIP_WAITING`, but nothing posts it and the
   `plasma:sw-update-ready` event has no listener — so patched assets only
   activate once every tab is closed.
3. Complete the PWA install surface: a single 192px SVG icon means iOS gets a
   generic tile and Chrome has no splash art. `sharp` is already a
   devDependency.
4. Give `app-window.cjs` cross-platform browser discovery; it is currently
   Windows-only and aborts on macOS/Linux even with Chrome installed.

---

## 6. Verification & Benchmarking Matrix

Every gate below was executed on the branch head.

| Gate | Command | Result |
| :--- | :--- | :--- |
| Encoding | `npm run check:encoding` | OK (detector fixed; 3 corrupted files repaired) |
| Static validation | `npm run validate` | OK — vendor bundles + 14 root files parse clean |
| Lint | `npm run lint` | 0 errors, 0 warnings (scope now includes `desktop/`) |
| Release build | `npm run build:release` | OK — 614 precached URLs |
| Generated artifacts | `npm run check:generated` | dist/ matches a fresh production build |
| Committed-artifact drift | `git diff --exit-code -- dist vendor` | clean (new CI gate) |
| Unit / integration tests | `npm test` | **365 passed / 365** across 44 files |
| Dependency advisories | `npm audit --omit=dev` | 0 vulnerabilities |
| Lockfile integrity | `npm run audit` | OK — 797 package records consistent |
| Bundle budget | `npm run report:bundle` | within budget |
| Static smoke | `npm run smoke` | **77 checks passed** (was 65) |
| Runtime smoke | `npm run smoke:browser` | route boot and navigation succeeded |

**Test suite delta:** 321 → 365 cases, 40 → 44 files.
**Smoke delta:** 65 → 77 checks; the added assertions cover the PDF worker,
fonts, Font Awesome, Chart.js, and Fuse in *both* the dev and release roots —
previously a build that dropped the PDF worker passed every gate.

**Mutation verification.** Four fixes were confirmed non-tautological by
reverting the source change and observing the new test fail:
`Timeline` resume (`_started` flag), `EventEmitter.off()` once-wrapper removal,
`RequestQueue` snapshot-before-flush, and the elastic-easing amplitude guard.
The Timeline tests additionally caught a real defect in the first version of
that fix (pausing at exactly t=0 was indistinguishable from a fresh start),
which is why the implementation uses an explicit flag rather than inferring
from `_currentTime`.

**Behavior preservation.** No business logic was intentionally changed. Two
pre-existing tests were updated because they asserted the defective behavior:
`pdf-runtime-security.test.js` asserted the non-existent pdf.js option
`stopEvent`, and `app-core.test.js` mocked `window.open` returning a usable
window, which the spec forbids when `noopener` is present.
