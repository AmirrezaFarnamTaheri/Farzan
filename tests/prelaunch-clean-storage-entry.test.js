import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * Greenfield release contract: no prior public profile exists, so boot must
 * never rewrite old preference or Notes keys into a fresh profile. Existing
 * current-storage reads, offline fallbacks and user-initiated backup import
 * are separate features and are not removed by this constraint.
 */
describe('prelaunch storage entry', () => {
  it('boots without the one-time plasma preference/Notes migration side effect', () => {
    const index = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');
    const theme = fs.readFileSync(path.join(root, 'src/core/themeManager.js'), 'utf8');
    expect(index).not.toContain('storageMigrate.js');
    expect(theme).not.toContain('storageMigrate.js');
    expect(fs.existsSync(path.join(root, 'src/core/storageMigrate.js'))).toBe(false);
    expect(index).toContain("import '../db.js'");
    expect(index).toContain("import '../bridge.js'");
    expect(theme).toContain("STORAGE_KEY: 'ocd_theme'");
  });
});
