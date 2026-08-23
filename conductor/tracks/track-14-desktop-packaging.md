> **Status note (2026-08):** Track 14 is COMPLETE: Tauri v2 native packaging shipped (src-tauri/, native:* scripts, desktop-release + native-windows workflows). Retained as process record.

# Track 14 Specification & Implementation Plan — Native Tauri Desktop Packaging

## Overview
Package OpenCourseDeck into a standalone, browserless native desktop executable and NSIS installer target using Tauri v2 (Rust + WebView2).

## Key Objectives
1. Verify preflight readiness using `npm run native:preflight`.
2. Build frontend production assets with `npm run build`.
3. Package desktop executable into `desktop-dist/OpenCourseDeck-Native/OpenCourseDeck.exe`.
4. Validate desktop launch, IPC capability security isolation, and offline storage persistence.

## Task Breakdown
- [x] **Task 1**: Run native preflight checks (`npm run native:preflight`).
- [x] **Task 2**: Build frontend bundle (`npm run build`).
- [x] **Task 3**: Stage standalone browserless desktop executable (`npm run native:exe`).
- [x] **Task 4**: Execute Vitest test suite (`npm test`) to ensure zero regressions across desktop tests.
