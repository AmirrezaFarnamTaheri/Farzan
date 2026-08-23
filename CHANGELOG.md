# Changelog

All notable changes to this project will be documented in this file.

## [1.1.2] — 2026-07-29

First tagged release of OpenCourseDeck (tag `v1.1.2`).

- Tooling: esbuild bundling (`dist/opencoursedeck.js`), Workbox service worker generation, local fonts + Font Awesome vendoring.
- Fixes: splash dismiss, Progress namespace collision mitigation, canvas DPR transform, HttpClient cache TTL race, realtime disconnect payload, notes undo index.
- Security: DOMPurify-based sanitization for notes + view injection, CSP tightening (removed `unsafe-eval`), removed external font/CDN usage.
- UX: command palette, breadcrumb updates, storage meter, theme-color meta sync, SW update toast, skip link, overlay focus restore, app-root inert background, styled async confirm.
- Docs: expanded README, first-run guide, catalog guide, backup/restore guide, troubleshooting guide, and impact/effort roadmap.
- Performance: local debug timing marks for boot import, bundle-to-ready, and app init.
- UX: in-app Help route with first-run checklist, storage summary, docs links, backup entry, and shortcuts entry point.
- Fixes: route handlers are registered before router initialization so the initial hash resolves immediately.

## [Unreleased]

- PWA offline layer restored: nothing registered `/sw.js` since the root service-worker generator was retired in August, leaving precaching, the offline experience, and the update-toast contract dormant. The bundle now owns registration, update detection (`ocd:sw-update-ready`), and the accepted-update reload gate; covered by a runtime-wiring contract test and validated end-to-end in Edge via dist-browser-smoke.
- `locale.js` persisted the UI direction under the retired `plasma_dir` key, so switching to an RTL locale silently reverted on reload; it now writes `ocd_dir`.

- Flashcards Studio is now reachable: `#/flashcards` route registered (the sidebar link previously dead-ended), command-palette entry added, and review supports the advertised Space / 1 / 2 / 4 / 5 keyboard flow with screen-reader announcements.
- Create-card moved from blocking `window.prompt()` dialogs to an inline, validated form with focus management.
- SM-2 scheduling fixed to pure UTC day arithmetic so `nextReviewDate` no longer shifts a day depending on the local timezone.
- Rendering performance: route sections use `content-visibility: auto`; new `forced-colors` and `reduced-transparency` guards join the existing reduced-motion handling.
- dist-browser-smoke: `CHROME_BIN` now accepts absolute executable paths (Windows dev boxes); verified against Microsoft Edge.

- Release engineering: SBOM generation and verification, release attestation, digest-verified partial-release reconciliation, canonical release metadata (2026-08-01 series).
- Performance: optimized course progress aggregation; removed unused helpers (2026-08-06).
- De-branding: legacy PlasmaDeck/Farzan-era naming removed from docs, configs, guard scripts, and code identifiers; active preference keys migrated to a neutral `ocd_*` localStorage namespace with automatic one-time migration of existing user data.
- Storage hardening: database payload encryption upgraded to per-database random salt + 600,000 PBKDF2 iterations for new writes, with transparent fallback decryption of legacy envelopes.
- Cleanup: untracked the committed `.cargo` registry cache (~814 MB) from version control; deleted superseded PlasmaDeck-era audit documents; repaired the stale `native-windows.yml` workflow paths left over from the `far/` directory era.
- Consolidation: the app shell now uses the shared `EventEmitter` from `src/lib/eventEmitter.js`; the dead duplicate `src/core/keyboardShortcuts.js` module (which imported a nonexistent stylesheet-less overlays module) was removed in favor of the wired implementation in `app.js`.
