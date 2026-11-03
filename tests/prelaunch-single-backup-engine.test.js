import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('pre-release canonical backup engine ownership', () => {
  it('removes the overwritten v1 best-effort backup implementation from the bridge', () => {
    const bridge = fs.readFileSync('bridge.js', 'utf8');
    const storageSafety = fs.readFileSync('src/core/storageSafety.js', 'utf8');
    const canonicalEngine = fs.readFileSync('src/core/backupEngine.js', 'utf8');
    expect(bridge).not.toMatch(/async function exportBackup\s*\(/);
    expect(bridge).not.toMatch(/async function importBackup\s*\(/);
    expect(bridge).not.toContain('exportBackup,');
    expect(bridge).not.toContain('importBackup,');
    expect(storageSafety).toContain('installBackupEngine(root)');
    expect(canonicalEngine).toContain('facade.exportBackup = async () =>');
    expect(canonicalEngine).toContain('facade.importBackup = async (input,');
  });
});
