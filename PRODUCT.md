# OpenCourseDeck — Learning Studio

## What it is

OpenCourseDeck is a self-contained, browser-based learning studio for studying video courses, PDFs, and notes. It runs entirely locally — no server uploads, no CDN dependencies, no accounts. Data stays in the browser (IndexedDB + localStorage).

## Who it's for

Private learners and study groups who collect video/PDF course materials from any source and want a local, offline-friendly environment to watch, annotate, track progress, and review.

## Core capabilities

### Content consumption
- **Video player** with chapter markers, playback speed, mini-player, queue
- **PDF viewer** (pdfjs-dist) with annotations, page navigation, bookmarks
- **Canvas whiteboard** for freehand notes and diagrams
- **Markdown notes** editor with DOMPurify sanitization

### Organization
- **Courses** — browse catalog, install custom courses, manage topics
- **Notes** — rich editor linked to courses/topics/timestamps
- **Bookmarks** — save and revisit moments across videos/PDFs
- **Tags** — cross-cutting labels for topics and notes
- **Playlists** — ordered collections of content
- **Materials** — file-based assets (images, downloads)

### Intelligence
- **AI assistance** — local extractive summaries without generative inference by default; an explicitly configured API or registered local runtime is required for model-generated responses. Downloaded model files alone do not provide executable Gemma inference. Semantic search and quiz generation remain planned.
- **Fuzzy search** (Fuse.js) across courses, topics, notes, timestamps, annotations
- **Command palette** (Ctrl+K) — keyboard-driven navigation and actions

### Progress & motivation
- **Progress tracking** — per-topic completion, time spent, streak tracking
- **Heatmap calendar** — GitHub-style activity visualization
- **Achievements** — milestone badges
- **Study queue** *(planned)* — daily plan generation, focus sprints. Today Playlists provides manual study queues.

### System
- **Plugin host** *(not shipped)* — `src/features/pluginHost.js` validates manifests but is not wired into the application.
- **Manual sync-package helpers** *(not shipped)* — `src/features/offlineSync.js` can merge locally exchanged cards and notes, but packages are plaintext JSON, not encrypted or automatically synchronized. Requests for encryption are rejected.
- **Theme system** — 8 themes (dark, light, midnight, forest, ocean, sunset, rose, paper), 6 accents, 3 density modes, font scaling
- **Keyboard shortcuts** — full keyboard navigation, shortcuts cheatsheet
- **Backup/restore** — JSON snapshots of supported main IndexedDB stores; local library media blobs live in a separate database and are **not** embedded in these exports. See `docs/backup-restore.md` before migrating devices.
- **Help route** — first-run checklist, storage diagnostics, runtime parity panel
- **PWA** — installable, service worker for offline caching
- **Desktop app** — Tauri native shell (primary), Electron fallback

## Design principles

1. **Self-contained** — no CDN, no external fetches at runtime (vendored libs)
2. **Restricted CSP** — no `unsafe-eval` or remote scripts; the development server permits inline styles, so do not describe its CSP as banning all `unsafe-inline`.
3. **Offline-first** — works without network after initial load
4. **Local-only data** — IndexedDB primary, localStorage for preferences, JSON backups
5. **Accessible** — native landmarks, skip links, focus traps, ARIA live regions, screen reader announcements
6. **Keyboard-driven** — command palette, shortcuts, arrow key navigation in all interactive components
7. **Performance** — lazy-loaded routes, intersection observer images, service worker caching

## Tech stack

| Layer | Technology |
|-------|-----------|
| Language | Vanilla JavaScript (ES modules + legacy IIFEs) |
| Bundler | esbuild |
| Router | Custom hash SPA router |
| Storage | IndexedDB (via `bridge.js` facade) + localStorage |
| Styling | CSS custom properties, CSS layers, vanilla CSS |
| Testing | Vitest + jsdom + fake-indexeddb |
| Linting | ESLint |
| Service Worker | Workbox |
| PDF | pdfjs-dist (vendored) |
| Search | Fuse.js |
| Sanitization | DOMPurify |
| Charts | Chart.js |
| Icons | Local SVG sprite, with legacy vendored icons where needed |
| Fonts | Inter, JetBrains Mono, Playfair Display (vendored) |
| Desktop | Tauri (Rust), Electron (fallback) |
| Package | npm, Node.js |

## Key files

| File | Purpose |
|------|---------|
| `index.html` | App shell, landmarks, overlays, vendor scripts |
| `app.js` | UI kit, routes, modals, toasts, search, shortcuts (~3800 lines) |
| `src/index.js` | ES module entrypoint, lazy loaders, service worker |
| `bridge.js` | IndexedDB + localStorage storage facade |
| `src/lib/dom.js` | Shared DOM helpers (focus trap, createElement, debounce, throttle) |
| `src/core/themeManager.js` | Theme + accent system |
| `src/core/prefs.js` | User preferences (density, font scale, dir) |
| `src/styles/tokens.css` | Design tokens |
| `src/styles/themes.css` | Theme overrides |
| `src/views/*.js` | Route view modules (15 routes) |
| `data/catalog.json` | Active catalog pointer |
| `vendor/` | Vendored browser libraries |

## Version

1.1.2 — kept aligned between `package.json` and `app.js`.
