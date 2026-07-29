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

  it('rejects release authorization that happens after checkout', () => {
    const workflow = workflows['release.yml'];
    const guard = workflow.indexOf('      - name: Require an authoritative trigger');
    const checkout = workflow.indexOf('      - name: Check out release source');
    const guardBlock = workflow.slice(guard, checkout);
    const broken = workflow.slice(0, guard) + workflow.slice(checkout, checkout + guardBlock.length) + guardBlock + workflow.slice(checkout + guardBlock.length);

    expect(validateReleaseWorkflow(broken)).toEqual(expect.arrayContaining([
      expect.stringContaining('must execute before checkout'),
    ]));
  });

  it('rejects a release workflow that cannot derive or bootstrap the package tag', () => {
    const broken = workflows['release.yml']
      .replace('expected_tag="v${package_version}"', 'expected_tag="$REQUESTED_TAG"')
      .replace('github.rest.git.createRef', 'github.rest.git.getRef');

    expect(validateReleaseWorkflow(broken)).toEqual(expect.arrayContaining([
      expect.stringContaining('derive the release tag from package version'),
      expect.stringContaining('created only after verification'),
    ]));
  });

  it('rejects a release workflow without idempotent retry protection', () => {
    const broken = workflows['release.yml'].replace(
      '      - name: Detect an already-complete release',
      '      - name: Inspect existing release',
    );

    expect(validateReleaseWorkflow(broken)).toEqual(expect.arrayContaining([
      expect.stringContaining('idempotent release retry detection'),
    ]));
  });

  it('rejects CI that stops at the first independent failure', () => {
    const broken = workflows['ci.yml']
      .replaceAll('continue-on-error: true\n', '')
      .replace('      - name: Enforce CI result', '      - name: Report CI result');

    expect(validateCiWorkflow(broken)).toEqual(expect.arrayContaining([
      expect.stringContaining('independent checks must continue'),
      expect.stringContaining('final aggregate failure gate'),
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

    const unknownSha = 'a'.repeat(40);
    const unknown = `${workflows['ci.yml']}\n      - uses: example/unreviewed@${unknownSha}\n`;
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

  it('requires maintenance dry-run, retries, summary, and failure isolation', () => {
    const broken = workflows['actions-maintenance.yml']
      .replace('          retries: 3\n', '')
      .replace('      dry_run:\n', '      preview:\n')
      .replace('cleanup will continue', 'cleanup stopped')
      .replace('core.summary', 'core.notice');

    expect(validateMaintenanceWorkflow(broken)).toEqual(expect.arrayContaining([
      expect.stringContaining('retry transient failures'),
      expect.stringContaining('dry-run control'),
      expect.stringContaining('must not stop remaining cleanup'),
      expect.stringContaining('summary is missing'),
    ]));
  });
});
