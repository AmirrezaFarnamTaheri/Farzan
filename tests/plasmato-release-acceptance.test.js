import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const edition = JSON.parse(readFileSync('editions/plasmato-emergency/edition.json', 'utf8'));
const workflow = readFileSync('.github/workflows/plasmato-edition.yml', 'utf8');

describe('immutable Plasmato edition release v1.0.6', () => {
  it('uses a fresh edition version and consistent immutable Windows/web artifact names', () => {
    expect(edition.editionVersion).toBe('1.0.6');
    expect(workflow).toContain('plasmato-edition-v1.0.6');
    expect(workflow).toContain('farzan-plasmato-edition-v1.0.6-windows-setup.exe');
    expect(workflow).toContain('farzan-plasmato-edition-v1.0.6-web.zip');
    expect(workflow).not.toContain('plasmato-edition-v1.0.5');
  });

  it('only publishes reviewed main candidates, not PRs or historical edition builds', () => {
    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('- main');
    expect(workflow).toContain("github.ref == 'refs/heads/main' && github.event_name != 'pull_request'");
    expect(workflow).toContain('editions/plasmato-emergency/edition.json');
    expect(workflow).toContain('needs: [build-and-verify, build-windows]');
  });

  it('verifies the downloaded published assets and their checksums', () => {
    expect(workflow).toContain('gh release download');
    expect(workflow).toContain('sha256sum -c SHA256SUMS.windows');
    expect(workflow).toContain('sha256sum -c SHA256SUMS.visual');
    expect(workflow).toContain('sha256sum -c SHA256SUMS');
    expect(workflow).toContain('expected release asset');
  });

  it('builds and smoke-installs a real NSIS artifact instead of relabeling a native exe', () => {
    expect(workflow).toContain('npm run native:package:locked');
    expect(workflow).toContain('NSIS installer');
    expect(workflow).toContain('Start-Process');
    expect(workflow).toContain('install');
  });
});
