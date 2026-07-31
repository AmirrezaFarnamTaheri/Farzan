# OpenCourseDeck Native Packaging Strategy

OpenCourseDeck has one production native path and two development fallbacks.

## 1. Tauri native app

The production wrapper is the standard Tauri v2 project in `src-tauri/`. It uses pinned crates.io releases, a committed `Cargo.lock`, and the official npm Tauri CLI. The web release is rebuilt before native compilation and embedded through Tauri's custom protocol. The Windows bundle icon is generated reproducibly as a verified 256×256 RGBA PNG from `assets/icon-192.svg` before compilation.

Verification sequence:

```sh
npm ci --ignore-scripts --legacy-peer-deps
npm run vendor
npm run native:prepare
npm run build:release
npm run native:preflight:strict
npm run tauri:check:locked
npm run tauri:build:locked
```

Stage the verified executable:

```sh
npm run native:exe
```

Build and stage an NSIS package:

```sh
npm run native:package
```

Security and packaging shape:

- Frontend output: `dist`
- App id: `app.opencoursedeck.desktop`
- Bundle target: Windows NSIS
- Capability permissions: empty by default and scoped to the `main` window
- Content Security Policy: explicitly configured and enforced by native preflight
- Prototype freezing: enabled
- Unused commands: removed from production builds
- Rust dependencies: pinned registry releases with a committed lockfile
- Native icon: deterministic RGBA `src-tauri/icons/icon.png` generated and validated from the committed SVG source
- Native executable staging: `desktop-dist/OpenCourseDeck-Native/OpenCourseDeck.exe`

The permanent Windows workflow performs deterministic asset preparation, strict preflight, explicit locked Cargo check/build commands, executable size and SHA-256 verification, and artifact upload. A green workflow proves reproducible compilation; publisher signing and installer launch smoke remain release-operator requirements.

## 2. Electron app shell

Fallback path when Electron is installed:

```sh
npm run desktop
```

The shell uses context isolation, disables Node integration, denies permission prompts by default, and opens external links in the operating system.

## 3. Chromium app-window fallback

Dependency-light fallback:

```sh
npm run desktop:app-window
```

This uses an installed Edge or Chrome app window. It is a development convenience, not the production native distribution.

## Final Release Checklist

- Run the complete web CI gate.
- Run the permanent Native Windows Assurance workflow against the release commit.
- Build the NSIS installer with `npm run native:package`.
- Add and verify publisher/signing metadata.
- Smoke-test installer install, launch, upgrade, uninstall, and rollback.
- Verify local data, PDF, media, backup import/export, and destructive-wipe behavior in the signed build.
- Record executable and installer SHA-256 values in the release evidence.
