# OpenCourseDeck Shipping & Production Launch Verification (`SHIPPING_CHECKLIST.md`)

## 1. Code Quality & Verification Evidence
- [x] **JS Parsing & Bundle Syntax**: `npm run validate` passed clean with 16 root modules and vendor scripts verified.
- [x] **Unit & Regression Testing**: Vitest suite passing with 25/25 tests green across 6 test files (`flashcards.test.js`, `laser.test.js`, `launcher.test.js`, `db.test.js`, `ai-client-ext.test.js`, `offline-sync.test.js`).
- [x] **No Console Artifacts / Leftover TODOs**: Core production engines cleaned of debug logging.

## 2. Design System & Accessibility (WCAG 2.2 AA)
- [x] **Design Tokens (`DESIGN.md`)**: Full OKLCH palette, font scale, geometry tokens, and dark-mode glassmorphic styling established.
- [x] **Layered Shadows (`skills-beautiful-shadows`)**: Multi-layered neutral elevation system (`--shadow-sm`, `--shadow-md`, `--shadow-lg`) applied to buttons, popovers, and floating panels.
- [x] **Focus & Motion Safety**: Visible focus outlines (`outline: 2px solid var(--brand-primary)`), keyboard accessibility, and `@media (prefers-reduced-motion: reduce)` overrides implemented.

## 3. Desktop Application & Installer Packaging
- [x] **Tauri Desktop Configuration**: `far/src-tauri/tauri.conf.json` configured for NSIS Windows single-file installer target (`OpenCourseDeck_1.1.2_x64-setup.exe`).
- [x] **Root Launcher (`Run-OpenCourseDeck.cmd`)**: Canonical entry script created to auto-navigate to `far/` and spawn `npm run desktop`.
- [x] **Automated CI/CD Workflow**: `.github/workflows/desktop-release.yml` created for tag-triggered cross-platform compilation and release artifact uploads.

## 4. Rollback & Emergency Contingency Plan
- **Instant Feature Rollback**: Single-button toggle to disable WebGL background laser rendering if legacy low-spec GPUs experience WebGL context loss.
- **Data Safety**: IndexedDB fallback to `memoryStore` in case of browser quota or storage permission exceptions.
- **Rollback SLA**: Sub-minute desktop executable revert via GitHub Release tagged commits.
