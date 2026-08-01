import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

describe('repository governance', () => {
  it('defines ownership, private vulnerability reporting, support, and license terms', () => {
    expect(read('SECURITY.md')).toContain('private');
    expect(read('SECURITY.md')).toContain('Security Advisory');
    expect(read('SUPPORT.md')).toContain('SECURITY.md');
    expect(read('LICENSE')).toContain('All rights reserved');
    expect(read('.github/CODEOWNERS')).toContain('@AmirrezaFarnamTaheri');
  });

  it('automates dependency review for npm and GitHub Actions', () => {
    const dependabot = read('.github/dependabot.yml');
    expect(dependabot).toContain('package-ecosystem: npm');
    expect(dependabot).toContain('package-ecosystem: github-actions');
    expect(dependabot).toContain('timezone: Asia/Baku');
  });

  it('documents immutable release recovery and forward rollback', () => {
    const runbook = fs.readFileSync(path.join(repoRoot, 'docs/release-and-rollback.md'), 'utf8');
    expect(runbook).toContain('Partial-publication recovery');
    expect(runbook).toContain('do not overwrite');
    expect(runbook).toContain('forward release');
    expect(runbook).toContain('CycloneDX SBOM');
  });
});
