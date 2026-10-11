# OpenCourseDeck contributor notes

## Project structure

- JavaScript ES modules, HTML, CSS layers, and Rust for the Tauri desktop wrapper.
- IndexedDB for main records; localStorage for preferences and compatibility data.
- The backup engine lives in `src/core/backupEngine.js`. A separate IndexedDB database holds imported video/PDF files.
- Interface and writing conventions are in [DESIGN.md](DESIGN.md). Use source CSS layers instead of adding one-off inline styles.

## Working rules

- Make storage errors visible. A failed canonical read must never be treated as an empty collection.
- Preserve migrations, existing saved data, keyboard navigation, and all supported themes.
- Treat user-controlled HTML, media URLs, and configured AI endpoints as untrusted.
- Do not claim full offline availability of external media or optional AI providers.
- Do not introduce decorative status badges, unsupported product promises, or jargon in UI copy.
- Add regression tests for both success and failure paths.

## Commands

```bash
npm ci --ignore-scripts --legacy-peer-deps
npm run validate
npm run lint
npm test
npm run build:release
npm run ci
```

See [ONBOARDING.md](ONBOARDING.md) for setup and the current [release checklist](docs/SHIPPING_CHECKLIST.md) for verification requirements.
