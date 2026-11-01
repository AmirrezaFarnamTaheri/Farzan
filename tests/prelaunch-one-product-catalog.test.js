import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('one canonical pre-release product and offline catalog', () => {
  it('does not ship the standalone duplicate Plasmato web or release pipeline', () => {
    for (const old of [
      'editions/plasmato-emergency',
      '.github/workflows/plasmato-edition.yml',
      '.github/workflows/plasmato-evidence-archive.yml',
      '.github/workflows/plasmato-screenshot-sync.yml',
      'scripts/sync-plasmato-screenshots.cjs',
      'tests/plasmato-edition.test.js',
      'tests/plasmato-release-acceptance.test.js',
    ]) expect(fs.existsSync(old), old).toBe(false);
    for (const path of [
      'scripts/build.cjs',
      'scripts/check-generated.cjs',
      'scripts/native-preflight.cjs',
      'scripts/workbox-dist.config.cjs',
    ]) {
      const s = fs.readFileSync(path, 'utf8');
      expect(s, path).not.toContain('plasmato-emergency');
      expect(s, path).not.toContain('EDITION_RUNTIME_FILES');
      expect(s, path).not.toContain('isPlasmatoEdition');
    }
  });

  it('preserves the real offline curriculum and one native desktop identity', () => {
    const source = fs.statSync('data/plasmato-2026-04-11.json.gz');
    expect(source.size).toBeGreaterThan(100000);
    const tauri = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
    expect(tauri.productName).toBe('OpenCourseDeck');
    expect(tauri.identifier).toBe('app.opencoursedeck.desktop');
    expect(tauri.app.windows[0].title).toBe('OpenCourseDeck');
    const build = fs.readFileSync('scripts/build.cjs', 'utf8');
    expect(build).toContain("const staticDirs = ['assets', 'data', 'docs', 'vendor'];");
    const workbox = fs.readFileSync('scripts/workbox-dist.config.cjs', 'utf8');
    expect(workbox).toContain("'data/**'");
    expect(workbox).not.toContain("'editions/");
  });
});
