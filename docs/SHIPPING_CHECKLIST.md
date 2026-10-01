# OpenCourseDeck Shipping & Production Launch Verification (`SHIPPING_CHECKLIST.md`)

## 1. Code Quality & Verification Evidence
- [x] **JS Parsing & Bundle Syntax**: `npm run validate` passes with 15 root JavaScript files and the vendored browser libraries verified.
- [x] **Unit & Regression Testing**: The full Vitest suite is green across the current 76 test files.
- [x] **No Console Artifacts / Leftover TODOs**: Core production engines cleaned of debug logging.

## 2. Design System & Accessibility (WCAG 2.2 AA)
- [x] **Design Tokens (`DESIGN.md`)**: Full OKLCH palette, font scale, geometry tokens, and dark-mode glassmorphic styling established.
- [x] **Layered Shadows (`skills-beautiful-shadows`)**: Multi-layered neutral elevation system (`--shadow-sm`, `--shadow-md`, `--shadow-lg`) applied to buttons, popovers, and floating panels.
- [x] **Focus & Motion Safety**: Visible focus outlines (`outline: 2px solid var(--brand-primary)`), keyboard accessibility, and `@media (prefers-reduced-motion: reduce)` overrides implemented.

## 3. Desktop Application & Installer Packaging
- [x] **Tauri Desktop Configuration**: `src-tauri/tauri.conf.json` configured for NSIS Windows single-file installer target (`OpenCourseDeck_1.1.2_x64-setup.exe`).
- [x] **Root Launcher (`Run-OpenCourseDeck.cmd`)**: Canonical entry script created to auto-navigate to the repository root and run `npm run build` then `npm start`.
- [x] **Automated native assurance**: `.github/workflows/desktop-release.yml` runs shared repository verification before a Windows-only, lockfile-enforced Tauri build and uploads the unsigned result as a workflow artifact.
- [ ] **Canonical desktop publication**: GitHub Release publication does not yet include the desktop installer; signing and canonical release integration remain release blockers.

## 4. Rollback & Emergency Contingency Plan
- **Instant Feature Rollback**: Single-button toggle to disable WebGL background laser rendering if legacy low-spec GPUs experience WebGL context loss.
- **Data Safety**: IndexedDB fallback to `memoryStore` in case of browser quota or storage permission exceptions.
- **Rollback SLA**: Sub-minute desktop executable revert via GitHub Release tagged commits.
