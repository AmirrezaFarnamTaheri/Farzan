# Farzan — evidence-gated peer-module adoption registry

**Review date:** 2026-10-29  
**Source baseline:** `main` at `9fd315ed468cab7b3522b95b315957b166132e5d`  
**Source of design intent:** [Plasmato UX execution plan](./plasmato-ux-execution-2026-10-28.md), the four October 28 supplied visual reports, and the last archived PR #124 screenshots. The screenshots predate some subsequent PRs; they are not evidence that those defects persist in the latest executable build.

## Ground rules

- Preserve all saved HTML, Notes, imported/linked study data, IndexedDB migrations, backup/export formats and offline behavior. A read-only compatibility adapter is **not** an editor replacement.
- Prefer already-installed, well-maintained libraries and native APIs over new dependencies; prefer removal or deferral when an implementation has no real runtime consumer.
- First prove that a candidate is invoked in the live user journey, then add behavioral parity tests, measure chunk/aggregate bundle deltas, and only then replace its implementation.
- Preserve keyboard focus/ARIA, Persian-Latin bidirectional text, reduced motion, Windows Tauri packaging, and the browser build. No remote font/CDN dependency, broad CSS reset, or silent bundle-limit relaxation.

## Requested package identifiers — scope check

These ten package IDs come from instructions with a wider product vocabulary. The table maps **intent** to the inspected Farzan source without pretending it implements another app's provider fleet/workflow backend.

| Request | Farzan evidence | Adaptation and decision |
| --- | --- | --- |
| **U05 — Onboarding Back failure recovery** | Farzan has first-run study/documentation routes, not a confirmed multistep provider onboarding wizard; see `ONBOARDING.md`, `src/views/homeRoute.js`. | Address real first-run/import failures with a safe retry/back navigation only when reproduced. Do **not** add a non-existent wizard just to match an ID. |
| **P09 — Model catalog cache invalidation** | `src/views/settingsRoute.js` has a free-text model field; `src/features/aiClient.js` does not expose a remote model-catalog cache. `src/core/aiAuthority.js` already binds session keys to exact endpoint/model approval. | Preserve credential invalidation; test endpoint/model/key changes. A remote model-catalog cache and its invalidation should ship **together**, if the user-facing picker is approved. |
| **S05–S06 — Storage callback deadlocks** | `db.js`/Dexie and Notes async mutation paths are real. [PR #127](https://github.com/AmirrezaFarnamTaheri/Farzan/pull/127) adds per-note durability queues. | Extend fault injection and cross-tab storage tests; avoid introducing another custom queue when Dexie transactions cover the atomic unit. |
| **S01–S04 — Legacy SQLite migration** | Tauri's checked-in `Cargo.toml` only declares Tauri, not rusqlite or a native SQLite store. Prior to launch, the obsolete key-renaming startup pass was retired; primary study data uses IndexedDB. | **Not a SQLite migration.** Protect current IndexedDB transactions, user-initiated backups and large library blobs. Introducing SQLite would be a new persistence architecture, not remediation. |
| **F06 — Workflow-result pagination** | Farzan has no verified executable workflow-result service. `src/lib/virtualScroll.js` is a separate, currently exposed browser virtual-list utility. | Evaluate large Courses/Notes lists with measured DOM counts; use real windowing only if needed. Do not introduce a workflow backend. |
| **P01–P05 — Deferred feature loading** | `src/index.js` already dynamically imports Notes, PDF, Canvas, Player, Progress and Flashcards, with abort-aware feature loading. | Measure eager `app.js` graph/chart imports and vendor scripts. Split only after testing namespace API consumers and service-worker/offline prefetch behavior. |
| **K14–K16 — Safer provider editing** | Only an approved custom API endpoint and local summary mode are currently supported. `src/core/aiAuthority.js` commits and rolls back endpoint/key authority. | Strengthen draft/commit/undo tests for actual AI settings; do not fabricate multi-provider CRUD UI. |
| **M06 — Provider catalog parity** | No maintained multi-provider catalog in Farzan. User-selectable model is free-text; local Gemma options are limited/download-oriented. | Keep capability claims exact. A future catalog requires endpoint-specific discovery, authorization, cache invalidation, negative tests and a fallback. |
| **F01–F03 — Workflow graph correctness** | `src/features/knowledgeGraph.js` is a **note/wikilink visualization**, not an execution DAG. | Replace its custom force physics with existing D3 primitives ([PR #130](https://github.com/AmirrezaFarnamTaheri/Farzan/pull/130)); maintain stable note IDs and edges. Execution-graph validation is outside current product scope. |
| **K01–K12 — Native credential fleet** | No multi-account credential-rotation service in `src-tauri/Cargo.toml`, `aiClient.js`, or AI settings; session-scoped keys and explicit origin approval are intentional current boundaries. | **Not an equivalent replacement.** Requires independent product/security requirements and a complete provider-authority contract before any rollout. |

## Source-backed replacement candidates

| Candidate / existing source | Established alternative | Decision / evidence gate |
| --- | --- | --- |
| `src/features/knowledgeGraph.js`: custom D3-like simulation, link spring, alpha/velocity scheduler | Already-installed **d3-force** `forceSimulation`, `forceLink`, `forceCenter`, `forceCollide` | **Implement** as separate PR #130. Test graph layout, pinned dragging, stale links, node identity, cancellation, bundle. No new dependency. |
| `src/lib/virtualScroll.js`: homegrown variable-height virtualization exposed via `src/index.js` | **@tanstack/virtual-core** for framework-neutral dynamic measurement and stable keys | **Conditional.** Current code search finds the constructor exported but no confirmed production list consumer. Integrate on an actually slow list before removing API; benchmark 50/500/6,000 rows and keyboard navigation. [API](https://tanstack.com/virtual/latest/docs/api/virtualizer). |
| `src/features/canvasZoom.js`: custom wheel/drag/pinch zoom, exported from `app.js` | **d3-zoom**, already a supported D3 ecosystem module | **Conditional.** First verify a real caller, zoom-to-cursor and touch/pen behavior; do not add a dependency to replace dormant code. [Docs](https://d3js.org/d3-zoom). |
| `src/lib/timeline.js`: custom animation scheduler, exported globally | Native Web Animations API (`Element.animate`) for simple UI motion; **Motion mini** for supported cross-browser sequencing | **Conditional.** No confirmed app runtime caller. The existing pause/reverse/callback contract is richer than the native replacement; keep until parity tests justify changing it. [Motion](https://motion.dev/docs/animate). |
| `src/features/canvasCharts/*` and `src/features/chartPlugins/*`: bespoke Canvas chart engines eagerly imported by `app.js` | Installed **Chart.js 4**, already loaded on the Progress route | **Audit consumers first.** Do not load the full Chart.js package eagerly or delete exported APIs without deprecation/compatibility coverage. |
| `canvas.js`: stateful 2D Studio editing, history, layers, exports | Installed **Konva 10** with strict v1 read-only compatibility adapter (merged PR #113) | **Incremental parity-gated migration**, not a renderer swap: transform, pen, selection, undo/redo, text, export, roundtrip and Tauri acceptance before write access. |
| `notes.js`: classic editor, autosave, persisted HTML | Installed **Squire RTE** and conservative compatibility preflight (merged PRs #112/#118) | Preview is opt-in. Keep unsupported rich HTML in the classic editor until table/image/metadata/undo and IME losslessness are demonstrated. Durable-write guard merged in #127; navigation handoff and IME veto merged in #125. |
| Home/Courses topic counts, multilingual text, text search and dates | `Intl.NumberFormat`, `Intl.Segmenter`, `<bdi>`, installed Fuse.js | **Prefer native/installed APIs** to bespoke formatting and tokenizer loops; audit locale display and dynamic direction without new dependencies. |
| `db.js`/IndexedDB and local settings | Installed **Dexie 4** transactions and native IndexedDB | **Already adopted.** Avoid a second source of truth; extend transactional recovery and canonical receipt tests. No SQLite layer. |

## Design-audit application (not an unverified global CSS replacement)

Historical PRs #120–#124 and #126 are merged. They implement the workbench foundation, accessible lesson actions, five-metric Progress, Settings ledger, Studio focus and topic-correct resume. Draft PR #128 adds the reversible Courses focus/player outline; its current head extends visual QA to capture live playback on desktop/mobile/RTL. Preserve their tested behavior instead of importing the supplied remote-font/whole-shell CSS proposals.

Remaining acceptance is specific: Notes typography/toolbar prominence, split-pane focus, Studio actual canvas area and controls, Persian/English truncation, mobile course scrolling, current screenshot diffs and accurate 200% zoom. The old PR #124 screenshots cannot establish present-day PR #128 behavior.

## Implementation sequence and evidence

1. **Data integrity first:** PRs #127 and #125 merged with final-head CI, browser, visual (where relevant) and Windows verification. Keep cross-tab and rejection/retry probes in the durable-write regression suite.
2. **Low-risk peer replacement:** complete #130 with native D3 engine and preserved graph contracts; quantify bundle effect.
3. **User-facing study workbench:** accept #128 on a head synchronized with current main; inspect current captured screenshots, especially player mini-state and keyboard/mobile paths.
4. **Eager bundle and list profiling:** inspect `app.js` optional exports and large Courses/Notes list render paths. A dependency is justified only by a measured performance or correctness win. Native number grouping in the Home catalog is covered by [PR #132](https://github.com/AmirrezaFarnamTaheri/Farzan/pull/132), which uses `Intl.NumberFormat` rather than a new package.
5. **High-risk editor parity:** separately qualify full Studio Konva edits and Squire rich-HTML migration with rollback/backup trials; do not replace persisted schemas to satisfy a library-adoption target.
6. **Release:** finish only after final-head repository CI, Browser Assurance, visual QA, Native Windows build and actual installer/media/backup acceptance. Passing a web CI job is not equivalent to a signed published installer.

### Gates for any future replacement

- A failing regression test reproduced **before** the implementation.
- No user-facing loss of features, access, saved records or offline availability.
- Checked total and entry JS budgets; no hidden exclusion or silent threshold increase.
- Browser desktop/mobile/RTL and native Windows checks on the exact branch head.
- Review comments addressed, then one explicit merge action; source-verified acceptance is not a claim of a finished production release.
