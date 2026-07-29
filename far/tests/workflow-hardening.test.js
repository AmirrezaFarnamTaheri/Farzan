import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  validateActionPins,
  validateCiWorkflow,
  validateMaintenanceWorkflow,
  validateReleaseWorkflow,
  validateWorkflowSet,
} = require('../scripts/check-workflows.cjs');

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const repositoryRoot = path.resolve(projectRoot, '..');

function readWorkflow(filename) {
  return fs.readFileSync(path.join(repositoryRoot, '.github', 'workflows', filename), 'utf8');
}

const workflows = {
  'ci.yml': readWorkflow('ci.yml'),
  'release.yml': readWorkflow('release.yml'),
  'actions-maintenance.yml': readWorkflow('actions-maintenance.yml'),
};

const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const eslintConfig = fs.readFileSync(path.join(projectRoot, 'eslint.config.js'), 'utf8');

describe('module and command contract', () => {
  it('uses explicit ESM without leaving the ESLint configuration in CommonJS', () => {
    expect(packageJson.type).toBe('module');
    expect(eslintConfig).toContain("import js from '@eslint/js';");
    expect(eslintConfig).toContain('export default [');
    expect(eslintConfig).not.toMatch(/\brequire\s*\(/);
    expect(eslintConfig).not.toContain('module.exports');
  });

  it('keeps executable Node tooling on explicit CommonJS file extensions', () => {
    const referencedTools = Object.values(packageJson.scripts).flatMap((command) => (
      [...command.matchAll(/\bnode\s+((?:scripts|desktop)\/[^\s&|]+\.cjs)\b/g)].map((match) => match[1])
    ));

    expect(referencedTools.length).toBeGreaterThan(0);
    for (const relativePath of referencedTools) {
      expect(fs.existsSync(path.join(projectRoot, relativePath)), relativePath).toBe(true);
    }
  });

  it('runs the committed Workbox cleanup implementation directly', () => {
    expect(packageJson.scripts['build:sw']).toContain('node scripts/clean-workbox.cjs &&');
    expect(fs.existsSync(path.join(projectRoot, 'scripts', 'clean-workbox.cjs'))).toBe(true);
  });
});

describe('GitHub Actions hardening', () => {
  it('accepts the committed workflow set', () => {
    expect(validateWorkflowSet(workflows)).toEqual([]);
  });

  it('rejects a release guard that inherits the application working directory', () => {
    const broken = workflows['release.yml']
      .replace('        shell: bash --noprofile --norc -eo pipefail {0}', '        working-directory: far\n        shell: bash --noprofile --norc -eo pipefail {0}')
      .replace('        working-directory: .\n        env:', '        env:');

    expect(validateReleaseWorkflow(broken)).toEqual(expect.arrayContaining([
      expect.stringContaining('job-wide working-directory'),
      expect.stringContaining('workspace root'),
    ]));
  });

  it('rejects release checkout outside the explicit tag namespace', () => {
    const broken = workflows['release.yml'].replaceAll(
      'ref: refs/tags/${{ env.RELEASE_TAG }}',
      'ref: ${{ env.RELEASE_TAG }}',
    );

    expect(validateReleaseWorkflow(broken)).toEqual(expect.arrayContaining([
      expect.stringContaining('explicit tag-namespace checkouts'),
    ]));
  });

  it('rejects mutable or unreviewed action references', () => {
    const mutable = workflows['ci.yml'].replace(
      /actions\/checkout@[0-9a-f]{40}/,
      'actions/checkout@v6',
    );
    expect(validateActionPins('ci.yml', mutable)).toEqual(expect.arrayContaining([
      expect.stringContaining('40-character commit SHA'),
    ]));

    const unknown = `${workflows['ci.yml']}\n      - uses: example/unreviewed@0123456789abcdef0123456789abcdef01234567\n`;
    expect(validateActionPins('ci.yml', unknown)).toEqual(expect.arrayContaining([
      expect.stringContaining('audited action allowlist'),
    ]));
  });

  it('requires CI checkout credentials to be ephemeral', () => {
    const broken = workflows['ci.yml'].replace('          persist-credentials: false\n', '');
    expect(validateCiWorkflow(broken)).toEqual(expect.arrayContaining([
      expect.stringContaining('disable persisted credentials'),
    ]));
  });

  it('requires validated retention and transient retry handling', () => {
    const broken = workflows['actions-maintenance.yml']
      .replace('          retries: 3\n', '')
      .replace(/\s+if \(!Number\.isInteger\(retentionDays\)[\s\S]*?\n\s+}\n/, '\n');

    expect(validateMaintenanceWorkflow(broken)).toEqual(expect.arrayContaining([
      expect.stringContaining('retry transient failures'),
      expect.stringContaining('retention configuration'),
    ]));
  });
});
