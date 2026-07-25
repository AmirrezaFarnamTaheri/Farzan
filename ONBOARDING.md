# Onboarding Guide: OpenCourseDeck (Farzan Studio)

## Overview
OpenCourseDeck is an offline-first learning studio and PDF/video course reader built with vanilla ES modules, IndexedDB, WebGL canvas shaders, and SuperMemo SM-2 flashcard review routines. It compiles to static web bundles and packages into a native Rust desktop app via Tauri.

## Tech Stack
| Layer | Technology | Details |
|---|---|---|
| **Core Runtime** | HTML5 / ES Modules | Vanilla JS module system (`far/src/index.js`, `far/boot.js`) |
| **Storage & Security** | IndexedDB + Web Crypto API | `PlasmaDB` (`far/db.js`), PBKDF2 key derivation, AES-256-GCM encryption |
| **Spaced Repetition** | SuperMemo SM-2 Algorithm | `FlashcardDeckManager` (`far/flashcards.js`), Anki `.apkg` JSON import/export |
| **Graphics Engine** | WebGL / Canvas 2D | Atmospheric shader background (`far/laser.js`), adaptive FPS auto-degrader |
| **Offline AI** | Web Workers & Local Extractive Model | Extractive summarizer & auto-flashcard generator (`far/src/features/aiClient.js`) |
| **Desktop Packaging** | Tauri (Rust) / NSIS | Desktop application bundle (`far/src-tauri/`, `Run-OpenCourseDeck.cmd`) |

## Key Entry Points
- **Browser Entrypoint**: `far/index.html` → `far/boot.js` → `far/src/index.js`
- **Database Engine**: `far/db.js` (`PlasmaDB`, `DBQuery`)
- **Flashcard Studio**: `far/flashcards.js` (`calculateSM2`, `importAnkiDeck`)
- **WebGL Atmospheric Background**: `far/laser.js` (`LaserCanvas`)
- **Desktop Launcher**: `Run-OpenCourseDeck.cmd`

## Common Developer Commands
- **Run Bundle Validation**: `npm run validate`
- **Run Unit Test Suite**: `node node_modules/vitest/vitest.mjs run`
- **Run Desktop App**: `npm run desktop`
- **Build Release Bundle**: `npm run build:release`

## Code Conventions
- Single source of truth for design tokens in `far/DESIGN.md` and `far/style.css` (`--shadow-sm`, `--shadow-md`, `--shadow-lg`, OKLCH colors).
- Explicit error handling without silent swallowing or empty fallbacks.
- 100% offline functionality — zero required external server endpoints.
