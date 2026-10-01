# OpenCourseDeck Desktop Shell

This folder contains the desktop wrapper and fallback desktop launch paths for OpenCourseDeck.

The preferred native path is the standard Tauri v2 project in `src-tauri`, backed by pinned crates.io dependencies and the committed `Cargo.lock`. See `desktop/NATIVE_STRATEGY.md` for the native packaging order and release checklist.

The Electron shell is a fallback/developer path when the dependency is installed. At runtime it starts OpenCourseDeck's existing static server on a private localhost port, loads that URL in a locked-down `BrowserWindow`, blocks in-window navigation away from the app, and opens external HTTP/HTTPS links through the operating system.

## Fallback Run

```sh
npm run desktop
```

If Electron is not installed yet:

```sh
npm install --save-dev electron
npm run desktop
```

The existing browser/PWA flow remains available for development through `npm start`, `Run-OpenCourseDeck.cmd`, and `OpenCourseDeck-OneClick.bat`.

## Portable staging

```sh
npm run desktop:package
```

This writes `desktop-dist/OpenCourseDeck/opencoursedeck-desktop.json`, a small manifest that records the current desktop shell contract: Electron is preferred, Chromium app-window mode is the fallback, Node integration stays disabled, context isolation and sandboxing stay enabled, external HTTP/HTTPS navigation opens in the operating system, and permissions are denied by default. It is not a signed installer yet; it is the reproducible staging contract for producing one once the desktop runtime is available.

## Tauri path

The repository also contains a Tauri wrapper under `src-tauri/`. It points at the built `dist/` app, pins Tauri and tauri-build to crates.io releases, and uses the committed Cargo lockfile.

```sh
npm run native:preflight:strict
npm run tauri:check:locked
npm run native:package:locked
```

Native scripts prefer the repository-root `.cargo` cache when it is present, and `npm run native:preflight:strict` verifies offline dependency resolution before the locked Cargo check and NSIS package build.
