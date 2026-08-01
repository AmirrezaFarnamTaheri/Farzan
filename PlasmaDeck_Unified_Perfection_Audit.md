# PlasmaDeck Learning Studio: The Unified Perfection Audit & Roadmap

> **ARCHIVED — superseded snapshot (do not treat as current state).**
>
> This document is a point-in-time audit that predates the current tree. Most
> of its P0 findings have since been fixed; spot-checks confirm, among others:
> pdfjs-dist is 4.10.38 (not the vulnerable 3.11.x it cites), the CSP
> preload/onload conflict is gone (stylesheets are plain blocking links), the
> monolithic `style.css` is now a one-line shim over 17 split files under
> `src/styles/`, `/__debug` is opt-in gated with a size cap, `src/index.js`
> lazy-loads features, and the bundle is `dist/opencoursedeck.js`.
>
> Verify any claim here against the source tree before acting on it. For the
> current, code-verified status of planned work see `far/ROADMAP.md`.

## 1. Executive Summary & Vision
PlasmaDeck (identified as PlasmaDeck Learning Studio) is a local-first learning studio for videos, PDFs, notes, and more. While it has a strong foundation and privacy posture, it is currently "CI-stable but not product-polished." To reach the "Perfection" standard, the project must move from a functional prototype to an intentional, durable, and emotionally satisfying product where every character, pixel, and function is high-signal.

### The "Perfection" Definition
*   **Product:** Every visible feature is real, complete, and documented. No fake buttons or placeholder routes.
*   **Visual:** Pixel-perfect spacing (4px grid), consistent typography, and a unified icon system.
*   **Code:** Every module has a single job; no duplicate helpers, accidental globals, or monoliths.
*   **Data:** Sacred trust. Reset means reset; export means everything; sync is atomic.
*   **Security:** Local-first privacy that feels safer than a cloud app.

---

## 2. Phase 0: Critical Integrity (P0 Debug Fixes)
*These issues represent immediate risks to data integrity, first-run success, and runtime stability.*

### 2.1. Data & Storage Integrity
*   **Catalog Loading Breakage:**
    *   *Status:* Verified. `DataStore.init` in `bridge.js` fetches `./data/catalog.json` which points to the actual catalog file. If either fails, the app hangs or shows empty.
    *   *Audit Detail:* The `fetch` calls lack robust retry logic or friendly error UI on the splash screen.
    *   *Fix:* Implement a two-step resolution (pointer `data/catalog.json` -> target JSON) with a non-empty demo fallback.
*   **Notes Storage Split-Brain:**
    *   *Status:* Verified. `notes.js` uses `localStorage` (`plasma-notes`) for all operations, while `bridge.js` implements an IndexedDB mirror with a one-time migration. Export in `progress.js` reads from IndexedDB, leading to data loss if `notes.js` hasn't synced.
    *   *Audit Detail:* `Store.getNotes()` and `Store.saveNotes()` in `notes.js` must be refactored to use `window.DB` (IndexedDB).
    *   *Fix:* Choose IndexedDB as the canonical source of truth for all notes operations.
*   **"Reset All" Mismatch:**
    *   *Status:* Verified. `DB.clearAll()` in `bridge.js` only clears IndexedDB stores but misses many `localStorage` keys used for preferences and legacy storage.
    *   *Audit Detail:* Need an exhaustive list of all `plasma_*` keys in `localStorage` to be cleared.
    *   *Fix:* Implement `clearAllUserData()` that wipes all stores (notes, folders, settings, annotations) and relevant `localStorage` keys.
*   **Source Normalization Bug:**
    *   *Status:* Partially Verified. Current `bridge.js` seems to iterate over `sources`, but previous audits indicated it might be skipping data or using a legacy path.
    *   *Audit Detail:* Ensure `_normalize` in `bridge.js` correctly flattens all nested topics across all sources.
    *   *Fix:* Flatten all sources and topics during normalization.

### 2.2. Runtime Stability
*   **Notes Selection Error:**
    *   *Status:* Verified. Selection/SelectionChange listeners in `notes.js` do not always check if the editor is still mounted, leading to null pointer exceptions.
    *   *Audit Detail:* `TypeError: Cannot read properties of null (reading 'contains')` at `notes.js:526`.
*   **Boot Failure Hang:**
    *   *Status:* Verified. `boot.js` catches import errors but doesn't update the UI meaningfully for the user.
    *   *Fix:* Update `#splash-status` with a clear error/recovery message.
*   **Router Rejection:**
    *   *Status:* Verified. `src/router/router.js` lacks global error handling for failed route mounts.
    *   *Fix:* Wrap route handlers in `try/catch/finally` to finish the loading bar and restore UI state.

### 2.3. Visible UI Failures
*   **Courses Card Corruption:**
    *   *Status:* Verified. In `app.js` or `ui.js`, certain data-binding paths accidentally inject `HTMLElement` objects into templates instead of their text/HTML content.
*   **Canvas Schema Mismatch:**
    *   *Status:* Verified. `CircleElement` in `canvas.js` defines `cx/cy/rx/ry`, but `_drawCircle` expects `x/y/radius`.
    *   *Fix:* Normalize canvas schema to match the renderer's expectations.

---

## 3. Phase 1: Security & Hardening (P0/P1)
### 3.1. Security Vulnerabilities
*   **CSP/Preload Conflict:**
    *   *Status:* Verified. `index.html` uses `onload` on `<link rel="preload">` which is blocked by the defined CSP `script-src 'self'`.
    *   *Fix:* Replace preload-onload pattern with standard `<link rel="stylesheet">`.
*   **HTML Injection Paths:**
    *   *Status:* Verified. `TopbarSearch._render` (app.js:1037), `ProgressStats.renderStatsPage` (progress.js:154), and `Modal.create` all use `innerHTML` with unsanitized data.
    *   *Audit Detail:* `_plainText` in `app.js:1029` also uses `innerHTML` on an unattached div.
    *   *Fix:* Use `textContent` by default and enforce sanitization (DOMPurify) for trusted HTML.
*   **Debug Poisoning:**
    *   *Status:* Verified. `/__debug` endpoint in `dev-server.cjs` accepts any POST without validation.

### 3.2. Dependency Risks
*   **Vulnerable PDF.js:**
    *   *Status:* Verified. `package.json` specifies `3.11.174`.
    *   *Fix:* Upgrade to a patched version of `pdfjs-dist`.

---

## 4. Phase 2: Architecture & Engineering Roadmap
### 4.1. Monolith Refactoring
*   **`app.js` (3,316 lines):** Verified as a monolith. Contains shell, routing, UI components, and global state.
*   **`style.css` (4,998 lines):** Verified as a monolith. Contains global, component, and utility styles.
*   **Lazy Loading:** Currently all modules are imported eagerly in `src/index.js`.

### 4.2. Performance & Scale
*   **DOM Explosion:** Verified. The Courses view renders hundreds of elements at once without virtualization.
*   **Storage Throttling:** Verified. `player.js` saves session to storage on every `timeupdate`.
    *   *Fix:* Throttle writes to every 3-5 seconds.
*   **Search Optimization:** Verified. `pdf.js` search is a simple loop over pages that blocks the UI and cannot be cancelled.

---

## 5. Phase 3: UI/UX & Accessibility Polish
### 5.1. Visual System Reset
*   **Typography & Scale:** Headings and font sizes are inconsistent across features.
*   **Theme:** "Purple-heavy" accents need normalization into a refined theme system.

### 5.2. Accessibility (A11y)
*   **Aria-Live Noise:** Too many regions use `aria-live="polite"`, causing screen reader verbosity.
*   **Keyboard Parity:** Many custom UI elements (modals, dropdowns) lack proper focus management and ARIA roles.

---

## 6. Data Quality & Catalog Health
*   *Status:* Confirmed through `scripts/audit.cjs` output. Thousands of duplicate or missing media entries in the catalog.

---

## 7. Release, Tooling & Hygiene
### 7.1. Versioning & Build
*   **Lockfile Drift:** Confirmed version mismatch between `package.json` and `package-lock.json`.
*   **Generated Artifacts:** `dist/plasma.js` and `sw.js` are often out of sync with source files.

### 7.2. Documentation Needs
*   *Status:* Missing `ARCHITECTURE.md`, `DATA_MODEL.md`, `PRIVACY.md`, and `RELEASE.md`.

---

## Conclusion: The Path to Perfection
The immediate priority order is:
1.  **Safety & CSS Fixes:** CSP/Style fix + Boot failure UI.
2.  **Data Integrity:** Fix Catalog pointer, Notes storage, and Reset-All semantics.
3.  **Correctness:** Fix command palette actions, Notes filters, and listener cleanup.
4.  **Architecture:** Route-lazy loading and monolith splitting.
5.  **Quality Gates:** CI implementation, full regression suite, and documentation sync.

*This report is based on the comprehensive "corner to corner" audit completed on 2026-05-14.*
