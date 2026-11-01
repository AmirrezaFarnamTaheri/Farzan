# Search consumers, offline vocabulary and measurement — 2026-11-01

## Owner/consumer inventory (verified against the current source tree)

| Surface | Files | Actual corpus / feature | Authority / behavior |
| --- | --- | --- | --- |
| Topbar combobox | `app.js` `TopbarSearch`, `src/core/searchRanking.js`, `src/core/searchSelection.js` | Canonical course/topic catalog plus personal `UserLibrary` overlay; saved Notes, timestamps, PDF annotations and durable `pdfBookmarks`; extension hook `search:query` | Reads `DataStore` and `DB`, fails closed when implemented readers reject, caches a versioned snapshot, removes stale results after a new query, normalizes Persian Yeh/Kaf and ZWNJ, dedupes by source identity. The personal library must be awaited before caching the initial snapshot (#306). |
| Command palette | `src/features/commandPalette.js` | Navigation commands, theme/settings actions, Add Content, export/help/reload | Intentionally **not** a catalog/document search. Local Fuse.js is loaded lazily; while loading, same shared Unicode lexical ranker provides fallback. The currently selected visible option determines Enter, not a newly computed fuzzy index. |
| General search worker | `src/workers/search.worker.js`, `src/lib/workerPool.js`, `src/core/workerAssets.js` | Caller-supplied documents and keys through versioned worker message protocol | Classic offline worker with locally vendored Fuse.js; accepts `init`/`update`/`search`/`cancel`; retains request identity, generation, cancellation and index revision. The internal repository callsites found for `runInWorker('search', …)` are tests; the production-dist smoke separately creates this worker directly. **Absence of a current in-app callsite is not evidence that the public worker can be deleted.** |
| Catalog worker | `src/workers/catalog.worker.js` | Canonical catalog parse and topic search | Independent offline catalog worker and parser, not interchangeable with the general Fuse worker or command actions. |
| Indexed saved documents | `bridge.js`, `src/features/userLibrary.js`, `src/views/bookmarksRoute.js` | Personal courses, renamed local topics/media references, Notes, timestamps, annotations, saved PDF pages | `UserLibrary` is a canonical `getSetting`/overlay; imported media files remain in auxiliary IndexedDB and must not be read as search text. A stable `docId` gates PDF page handoffs; anonymous page-only records go to Materials source discovery. |

The search worker, topbar and palette intentionally **do not** share a single Fuse index: they have different document authorities and executable actions. They share the lexical vocabulary and keyboard-selection behavior wherever equivalence is safe, without flattening command actions into saved study documents. `pdf.js`'s in-document text search and external plugin hooks remain separate consumers.

## Canonical document vocabulary

The topbar catalog scope includes `sourceType`, `sourceId`, visible `label`/`title`, `category`, optional `description` and `searchText`, plus scalar/array text-bearing `tags`, `keywords`, and `labels`. The same field vocabulary is accepted by the general worker by default, but explicit `options.keys` are respected. Metadata objects must not become the phantom text `[object Object]`. A course ID names one course, a `courseId:topicId` source ID names a topic in its course, and saved-note/PDF/timestamp identities remain category-aware; duplicate suggestions dedupe *after* relevance tiering but *before* display limits.

Persian Arabic Yeh/Kaf variants, Arabic marks and ZWNJ use the shared normalized matching vocabulary. English medical terms remain LTR in display and are indexed as written; normalization is applied to the private search copy, not to the stored document. The worker retains fuzzy typo recall, which the simpler lexical fallback does not claim.

## Reproducible index and footprint measurements

Run **after** `npm run build:release`:

```sh
npm run report:search-index
```

The command reads the actual offline catalog pointer, verifies each archived `.json.gz` SHA-256, and produces `reports/ci/search-index-acceptance.json`. It builds the vendored-Fuse worker index in a classic-worker VM, then runs the existing main-thread lexical ranker against **the same source documents and query set**. It captures three iteration medians for worker init and worker/lexical queries; all emitted worker message receipts must match the shipping protocol. It also reads the *built* search worker, app entry, and Workbox precache manifest for raw-byte accounting. `npm run ci` includes this report immediately after the emitted JS bundle budget check, and unit tests independently validate its dataset, schema, Unicode behavior and release-file paths.

These are **CI process observations**, not a cross-version speedup, a fair quality-adjusted race between different ranking algorithms, a device load-time promise, or a cold-network comparison. #165 independently measured first-visit JS/CSS transfer and shell readiness. Retaining the general worker avoids changing public protocol or deleting unsupported external consumers.

## Qualification remaining outside this report

Browser and native Windows CI on the exact commit remain release gates for any behavioral changes. This audit does not claim to have exercised an unconsented personal database, Windows IME, remote PDF text indexing or every public extension. Results should be reviewed before reconsidering redundant search implementations; no worker is removed merely for appearing unused in this source repository.
