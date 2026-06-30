# OpenCourseDeck Native Packaging Strategy

OpenCourseDeck now has three desktop paths, in priority order.

## 1. Tauri native app

Preferred path for a proper single app:

```sh
npm run native:package
```

This uses the local Tauri source tree already provided in `tauri-dev/tauri-dev` and the app wrapper in `src-tauri`.
When a repo-root `.cargo` directory exists beside `far/`, the native scripts automatically use it as `CARGO_HOME` so the wrapper can consume an offline registry/cache supplied with the project.
Run the full web gate before producing release artifacts:

```sh
npm run ci
```

Native readiness check:

```sh
npm run native:preflight
```

Strict readiness check, including offline Cargo dependency resolution:

```sh
npm run native:preflight:strict
```

Fast Rust wrapper check:

```sh
npm run tauri:check
```

Release binary build without installer bundling:

```sh
npm run tauri:build
```

Stage the browserless native executable into `desktop-dist/OpenCourseDeck-Native`:

```sh
npm run native:exe
```

Security and packaging shape:

- Frontend output: `dist`
- Build command: `npm run build`, followed by `npm run build:sw` for the canonical service worker
- App id: `app.opencoursedeck.desktop`
- Bundle target: Windows NSIS
- Capability permissions: empty by default
- Prototype freezing: enabled
- Icons: provided in `src-tauri/icons`
- Tauri crates: local path dependencies, not registry-only dependencies
- Native preflight: static wrapper checks plus optional offline Cargo dependency resolution
- Cargo cache: native scripts prefer the repo-root `.cargo` cache when present
- Native executable staging: `desktop-dist/OpenCourseDeck-Native/OpenCourseDeck.exe`

## 2. Electron app shell

Fallback path when Electron is installed:

```sh
npm run desktop
```

This starts the local static server on a private localhost port and opens a locked-down `BrowserWindow`.

Security shape:

- Node integration disabled
- Context isolation enabled
- Sandbox enabled
- Web security enabled
- Permission prompts denied by default
- Single-instance lock enabled
- External HTTP/HTTPS links open in the operating system

## 3. Chromium app-window fallback

Dependency-light fallback:

```sh
npm run desktop:app-window
```

This uses installed Edge/Chrome app mode. It is more user-friendly than a normal browser tab, but it is not the final native packaging target.

## Final Release Checklist

- Make sure crates.io dependencies for the local Tauri source tree are available through the normal Cargo cache, the repo-root `.cargo` cache, or a vendored Cargo source directory.
- Run `npm run ci`.
- Run `npm run native:preflight:strict`.
- Run `npm run native:package` on the release machine.
- If NSIS is not available yet, run `npm run native:exe` to stage the browserless Tauri executable. The executable build is independent of the NSIS installer toolchain.
- Smoke-test the produced NSIS installer.
- Verify app launch, local model cache, File System Access fallback behavior, PDF viewing, video playback, and backup export/import.
- Decide whether Electron remains as a fallback developer shell or is removed from user-facing docs.
- Add publisher/signing metadata before public distribution.
