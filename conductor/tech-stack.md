# Technology Stack — OpenCourseDeck

## Core Languages & Runtimes
- **Frontend / Core Logic**: JavaScript (ES6+), HTML5, CSS3
- **Native Desktop Shell**: Rust (`src-tauri/Cargo.toml`, Tauri v1/v2)
- **Node.js**: v18+ (Build scripts & local dev server)

## Build & Test Tooling
- **Bundler & Minifier**: `esbuild` (`scripts/build.cjs`), `workbox-cli` (PWA SW generation)
- **Test Runner**: `vitest` (`vitest.config.js`)
- **Linter & Code Quality**: `eslint` (`eslint.config.js`), custom validation scripts (`scripts/validate.cjs`, `scripts/smoke-test.cjs`)

## Storage & Vendored Libraries
- **Database**: IndexedDB (`db.js` / `PlasmaDB`)
- **PDF Renderer**: PDF.js (`pdfjs-dist` 4.10)
- **Charts & Data**: Chart.js 4.5, Marked 9.1, Fuse.js 7.0, DOMPurify 3.4
