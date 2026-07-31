import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('desktop shell wiring', () => {
  it('keeps browser shells and the registry-backed Tauri wrapper explicit and verifiable', () => {
    const read = (filePath) => fs.readFileSync(path.join(process.cwd(), filePath), 'utf8');
    const packageJson = JSON.parse(read('package.json'));
    const rootLauncher = fs.readFileSync(path.join(process.cwd(), '..', 'OpenCourseDeck.bat'), 'utf8');
    const rootInstaller = fs.readFileSync(path.join(process.cwd(), '..', 'Install-OpenCourseDeck.cmd'), 'utf8');
    const main = read('desktop/main.cjs');
    const launch = read('desktop/launch.cjs');
    const appWindow = read('desktop/app-window.cjs');
    const pack = read('desktop/package-portable.cjs');
    const nativeCargo = read('scripts/native-cargo.cjs');
    const prepareNative = read('scripts/prepare-native-assets.cjs');
    const preflight = read('scripts/native-preflight.cjs');
    const stageNative = read('scripts/stage-native-exe.cjs');
    const tauriCargo = read('src-tauri/Cargo.toml');
    const tauriConfig = JSON.parse(read('src-tauri/tauri.conf.json'));
    const tauriCapability = JSON.parse(read('src-tauri/capabilities/default.json'));
    const tauriBuild = read('src-tauri/build.rs');
    const tauriMain = read('src-tauri/src/main.rs');
    const tauriLib = read('src-tauri/src/lib.rs');

    expect(packageJson.scripts.desktop).toBe('npm run build && node desktop/launch.cjs');
    expect(packageJson.scripts['desktop:app-window']).toBe('npm run build && node desktop/app-window.cjs');
    expect(packageJson.scripts['desktop:package']).toBe('npm run build && node desktop/package-portable.cjs');
    expect(packageJson.scripts['native:prepare']).toBe('node scripts/prepare-native-assets.cjs');
    expect(packageJson.scripts['native:preflight']).toBe('node scripts/native-preflight.cjs');
    expect(packageJson.scripts['native:preflight:strict']).toBe('node scripts/native-preflight.cjs --strict');
    expect(packageJson.scripts['tauri:check']).toBe('node scripts/native-cargo.cjs check --manifest-path src-tauri/Cargo.toml');
    expect(packageJson.scripts['tauri:build']).toBe('npm run native:prepare && node scripts/native-cargo.cjs build --manifest-path src-tauri/Cargo.toml --release');
    expect(packageJson.scripts['native:exe']).toBe('npm run build:release && npm run tauri:build && node scripts/stage-native-exe.cjs');
    expect(packageJson.scripts['tauri:bundle']).toBe('npm run native:prepare && tauri build --config src-tauri/tauri.conf.json');
    expect(packageJson.scripts['native:package']).toBe('npm run tauri:bundle && node scripts/stage-native-exe.cjs');

    expect(rootLauncher).toContain('desktop-dist\\OpenCourseDeck-Native\\OpenCourseDeck.exe');
    expect(rootInstaller).toContain('npm run native:package');
    expect(main).toContain('BrowserWindow');
    expect(main).toContain('nodeIntegration: false');
    expect(main).toContain('contextIsolation: true');
    expect(main).toContain('requestSingleInstanceLock');
    expect(main).toContain('setPermissionRequestHandler');
    expect(main).toContain('webSecurity: true');
    expect(launch).toContain('Electron is not installed');
    expect(appWindow).toContain('--app=');
    expect(pack).toContain("permissions: 'deny-by-default'");

    expect(nativeCargo).toContain("spawnSync('cargo'");
    expect(prepareNative).toContain("path.join(root, 'assets', 'icon-192.svg')");
    expect(prepareNative).toContain("path.join(targetDirectory, 'icon.png')");
    expect(preflight).toContain('Cargo dependencies resolve from the committed lockfile');
    expect(preflight).toContain('registry releases instead of missing local paths');
    expect(preflight).toContain('Tauri enforces a restrictive Content Security Policy');
    expect(stageNative).toContain("'open-course-deck.exe'");
    expect(stageNative).toContain('OpenCourseDeck-Native');

    expect(tauriCargo).toContain('tauri = { version = "=2.11.5"');
    expect(tauriCargo).toContain('tauri-build = { version = "=2.6.3"');
    expect(tauriCargo).toContain('custom-protocol = ["tauri/custom-protocol"]');
    expect(tauriCargo).not.toMatch(/\bpath\s*=/);
    expect(tauriBuild).toContain('tauri_build::build()');
    expect(tauriMain).toContain('open_course_deck_lib::run()');
    expect(tauriLib).toContain('tauri::Builder::default()');
    expect(tauriLib).toContain('tauri::generate_context!()');

    expect(tauriConfig.productName).toBe('OpenCourseDeck');
    expect(tauriConfig.version).toBe(packageJson.version);
    expect(tauriConfig.identifier).toBe('app.opencoursedeck.desktop');
    expect(tauriConfig.build.frontendDist).toBe('../dist');
    expect(tauriConfig.build.beforeBuildCommand).toBe('npm run build:release');
    expect(tauriConfig.build.removeUnusedCommands).toBe(true);
    expect(tauriConfig.bundle.targets).toContain('nsis');
    expect(tauriConfig.bundle.icon).toContain('icons/icon.png');
    expect(tauriConfig.app.windows[0].label).toBe('main');
    expect(tauriConfig.app.security.freezePrototype).toBe(true);
    expect(tauriConfig.app.security.csp).toContain("default-src 'self'");
    expect(tauriConfig.app.security.csp).toContain("object-src 'none'");
    expect(tauriCapability.windows).toContain('main');
    expect(tauriCapability.permissions).toEqual([]);
  });
});
