# Conductor Product Definition — OpenCourseDeck

## Product Vision
OpenCourseDeck is an interactive, offline-first personal learning studio that integrates video playback, PDF document annotation, markdown note-taking, rich canvas sketching, and automated progress telemetry into a unified local workspace.

## Core Target Audience
Self-directed learners, computer science students, researchers, and developers who require low-latency, privacy-focused offline study environments across Desktop (Tauri) and Browser platforms.

## Key Features & Capabilities
1. **Interactive Video & PDF Studio**: Synchronized timestamped notes and document highlights.
2. **Infinite Canvas & Notes**: Markdown note editor paired with interactive canvas sketching (`canvas.js`, `notes.js`).
3. **Offline-First Persistence**: Zero-dependency IndexedDB storage engine (`PlasmaDB` / `db.js`).
4. **Native Desktop Integration**: Cross-platform desktop distribution powered by Rust & Tauri (`src-tauri`).
5. **Telemetry & Analytics**: Local progress tracking and exportable JSON study statistics (`progress.js`).
