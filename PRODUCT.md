# OpenCourseDeck

## Purpose

OpenCourseDeck is a study app for courses, videos, PDFs, notes, and progress. It runs in a local browser origin or a Tauri desktop window. The bundled interface does not require an account.

The app saves notes, bookmarks, progress, settings, and other supported records locally. Imported media files use a separate IndexedDB database. A linked video or remote PDF may still require internet or LAN access.

## What the current app provides

| Area | Available actions |
| --- | --- |
| Courses and My Courses | Browse the supplied catalog, create course outlines, and open lessons |
| Video player | Adjust playback speed, use chapters, save timestamps, and manage a playing queue |
| PDF | Open documents, search pages, and save annotations and page bookmarks |
| Notes | Write and organize notes with folders, tags, and links to course materials |
| Studio | Draw on a canvas, use study templates, and explore concept graphs |
| Review | Use flashcards, activity history, completed topics, and achievements |
| Search | Search saved material and navigate routes using the command palette |
| Settings | Adjust theme, accent, density, text size, local storage, and optional AI connections |
| Help | Find shortcuts, backup instructions, and troubleshooting steps |

## Limits and optional features

- **Backups:** JSON exports cover supported application records, not imported video or PDF file blobs. Keep the original media files before changing devices or browsers.
- **Offline use:** The app bundles its frontend dependencies and can cache local assets. External media links and configured API services need their own connection.
- **AI:** Basic extractive processing is available locally. Model-generated answers require an explicitly configured endpoint or functioning local model runtime. Bundled/downloaded model weights alone are not an inference service.
- **Plugins and synchronization:** Some source modules contain prototypes or internal helpers. They should not be presented as shipped UI, cloud sync, automatic collaboration, or encrypted backup features.
- **Desktop builds:** Tauri packaging is supported. The Electron development path is not part of the default dependency install.
- **Accessibility:** Keyboard and screen-reader support is implemented in several components; a manual audit of supported platforms and languages remains required. No WCAG certification is claimed.

## Architecture

- Vanilla JavaScript and ES modules, built with esbuild.
- A hash-based router in `src/router/router.js`.
- IndexedDB storage through `bridge.js`, with compatibility data in `localStorage`.
- Native CSS custom properties and layers in `src/styles/`, with reusable UI helpers in `ui.js`.
- Vitest unit tests, browser smoke tests, and GitHub Actions verification.
- Workbox service worker and vendored runtime libraries.
- Tauri native shell under `src-tauri/`.

For an implementation map, see [docs/architecture.md](docs/architecture.md). For file-level design decisions, see [DESIGN.md](DESIGN.md). For data transfer and recovery, see [docs/backup-restore.md](docs/backup-restore.md).

## Version

The package version is defined in `package.json`. Check the release manifest and current commit before reporting a deployed version.
