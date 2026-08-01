# PlasmaDeck / Farzan Unified Audit and Remediation Plan

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

Generated: 2026-04-29
Updated: 2026-05-14 (Comprehensive Survey Update)

PlasmaDeck / Farzan is a local-first learning studio with a large amount of working ambition already present. The same breadth is also the source of the project’s current fragility. Too many critical behaviors depend on global state, generated artifacts that no longer match the checked-in files, route modules without lifecycle boundaries, and storage paths that do not agree on the source of truth.

This document is the unified version of the project audit. It is self-contained: every major defect, architectural risk, remediation step, test requirement, and product improvement path is described here in implementation-ready form.

## 1. Executive Summary
The central recommendation is simple: stabilize before expanding. First make the app boot reliably, render with the intended styles, load the complete catalog, reach the real media it advertises, preserve current user data, and survive route changes without losing event bindings or leaking resources.

## 2. Phase 0: Critical Integrity (P0 Debug Fixes)

### 2.1. Data & Storage Integrity
*   **Catalog Loading:**
    *   *Observation:* verified that `DataStore.init` in `bridge.js` is the single point of failure for catalog loading.
    *   *Implementation:* Implement a two-step resolution (pointer `data/catalog.json` -> target JSON) with a non-empty demo fallback.
*   **Notes Storage:**
    *   *Observation:* `notes.js` is currently bypassing the `bridge.js` storage layer and using `localStorage` directly.
    *   *Implementation:* Use IndexedDB as the canonical source of truth for notes. Refactor `Store.getNotes()`/`Store.saveNotes()` in `notes.js`.
*   **Reset All:**
    *   *Observation:* `DB.clearAll()` is incomplete.
    *   *Implementation:* Implement `clearAllUserData()` that includes an exhaustive allowlist of all stores and all `plasma_*` `localStorage` keys.
*   **Source Normalization:**
    *   *Observation:* Potential for data loss during flattening if nested topics aren't handled recursively.
    *   *Implementation:* Flatten all sources and topics during normalization to avoid data loss.
*   **IndexedDB Migrations:**
    *   *Observation:* Robustness needed for `onupgradeneeded`.
    *   *Implementation:* Loop over existing stores in `onupgradeneeded` and check index existence.

### 2.2. Runtime Stability
*   **Boot Failure:**
    *   *Observation:* Users are stuck on "Initializing..." if a module import fails.
    *   *Implementation:* Update `#splash-status` with clear error/recovery instructions in the boot catch block.
*   **Router:**
    *   *Observation:* Navigation errors leave the UI in an inconsistent state.
    *   *Implementation:* Wrap route handlers in `try/catch/finally` to finish the loading bar and restore focus.
*   **Listener Duplication:**
    *   *Observation:* Navigation often duplicates global listeners (e.g. `selectionchange` in `notes.js`).
    *   *Implementation:* Guard listeners or bind once in `init()`; implement unmount/destroy paths.

### 2.3. Visible UI Failures
*   **Schema/Rendering:**
    *   *Observation:* `CircleElement` uses `cx/cy` while renderer expects `x/y`.
    *   *Implementation:* Adopt a canonical canvas shape schema and implement a normalization adapter.
*   **Command Palette:**
    *   *Observation:* Theme API calls are mismatched.
    *   *Implementation:* Fix incorrect theme API calls (`apply` vs `set`).

## 3. Phase 1: Security, Hardening & UI/UX Polish
*   **CSP:**
    *   *Observation:* `index.html` preload patterns conflict with strict CSP.
    *   *Implementation:* Replace preload-onload pattern with standard `<link rel="stylesheet">`.
*   **HTML Injection:**
    *   *Observation:* `innerHTML` is used for course titles, search results, and modal content.
    *   *Implementation:* Enforce `textContent` default, sanitize with DOMPurify, and disallow `innerHTML` in `DataBind` without explicit opt-in.
*   **Debug Poisoning:**
    *   *Observation:* `/__debug` endpoint lacks origin check.
    *   *Implementation:* Add origin check and validate/serialize JSON server-side.
*   **Dependency Risks:**
    *   *Observation:* `pdfjs-dist` version `3.11.174` is vulnerable.
    *   *Implementation:* Upgrade vulnerable PDF.js.

## 4. Phase 2: Architecture & Engineering Roadmap
*   **Refactoring:**
    *   *Observation:* `app.js` and `style.css` are massive monoliths.
    *   *Implementation:* Decompose into smaller, governed modules.
*   **Lazy Loading:**
    *   *Observation:* Heavy features (Canvas, PDF) increase initial bundle size unnecessarily.
    *   *Implementation:* Implement route-level code splitting.
*   **Performance:**
    *   *Observation:* `player.js` saves state too frequently.
    *   *Implementation:* Throttle media state saves.

## Conclusion: The Path to Perfection
The priority order is:
1. Safety & CSS Fixes.
2. Data Integrity.
3. Correctness (palette, filters, listener cleanup, unmount leaks).
4. Architecture (lazy loading, monolith splitting).
5. Quality Gates (CI, regression suite, documentation).
