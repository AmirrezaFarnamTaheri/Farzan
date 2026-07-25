# OpenCourseDeck Project Instructions

## Tech Stack
- **Languages**: JavaScript (ES Modules), HTML5, CSS3, Rust (Tauri)
- **Database**: IndexedDB (`PlasmaDB`) + Web Crypto API (AES-256-GCM)
- **Testing**: Vitest (`node node_modules/vitest/vitest.mjs run`)
- **Validation**: Node validation script (`node scripts/validate.cjs` / `npm run validate`)

## Code Style & Conventions
- Use vanilla ES Modules with explicit relative path imports.
- Maintain OKLCH color palettes and multi-layered neutral elevation depth tokens defined in `far/DESIGN.md`.
- Never use masking fallbacks or swallow exceptions silently.
- All core features must work 100% offline without external network connectivity.

## Testing & Quality Assurance
- Run full unit test suite: `node node_modules/vitest/vitest.mjs run`
- Validate module syntax: `npm run validate`
- Run desktop build test: `node tests/desktop-shell.test.js`
