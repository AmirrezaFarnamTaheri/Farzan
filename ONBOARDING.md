# Onboarding Guide: OpenCourseDeck

## Overview
OpenCourseDeck is an offline-first learning studio and PDF/video course reader built with vanilla ES modules, IndexedDB, WebGL canvas shaders, and SuperMemo SM-2 flashcard review routines. It compiles to static web bundles and packages into a native Rust desktop app via Tauri.

## Tech Stack
| Layer | Technology | Details |
|---|---|---|
| **Core Runtime** | HTML5 / ES Modules | Vanilla JS module system (`src/index.js`, `boot.js`) |
| **Storage & Security** | IndexedDB + Web Crypto API | `OpenCourseDB` (`db.js`), PBKDF2 key derivation, AES-256-GCM encryption |
| **Spaced Repetition** | SuperMemo SM-2 Algorithm | `FlashcardDeckManager` (`flashcards.js`), Anki `.apkg` JSON import/export |
| **Graphics Engine** | WebGL / Canvas 2D | Atmospheric shader background (`laser.js`), adaptive FPS auto-degrader |
| **Offline AI** | Web Workers & Local Extractive Model | Extractive summarizer & auto-flashcard generator (`src/features/aiClient.js`) |
| **Desktop Packaging** | Tauri (Rust) / NSIS | Desktop application bundle (`src-tauri/`, `Run-OpenCourseDeck.cmd`) |

## Key Entry Points
- **Browser Entrypoint**: `index.html` → `boot.js` → `dist/opencoursedeck.js` (bundle of `src/index.js`)
- **Database Engine**: `db.js` (`OpenCourseDB`, `DBQuery`)
- **Flashcard Studio**: `flashcards.js` (`calculateSM2`, `importAnkiDeck`)
- **WebGL Atmospheric Background**: `laser.js` (`LaserCanvas`)
- **Desktop Launcher**: `Run-OpenCourseDeck.cmd`

## Common Developer Commands
- **Run Bundle Validation**: `npm run validate`
- **Run Unit Test Suite**: `node node_modules/vitest/vitest.mjs run`
- **Run Desktop App**: `npm run desktop`
- **Build Release Bundle**: `npm run build:release`

## Code Conventions
- Single source of truth for design tokens in `DESIGN.md` and `style.css` (`--shadow-sm`, `--shadow-md`, `--shadow-lg`, OKLCH colors).
- Explicit error handling without silent swallowing or empty fallbacks.
- 100% offline functionality — zero required external server endpoints.
