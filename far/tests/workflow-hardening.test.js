import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  extractWorkflowDispatchTagInput,
  validateActionPins,
  validateBrowserAssuranceWorkflow,
  validateCiWorkflow,
  validateMaintenanceWorkflow,
  validateReleaseWorkflow,
  validateVerificationWorkflow,
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
  'verify.yml': readWorkflow('verify.yml'),
  'browser-assurance.yml': readWorkflow('browser-assurance.yml'),
  'release.yml': readWorkflow('release.yml'),
  'actions-maintenance.yml': readWorkflow('actions-maintenance.yml'),
};

const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const eslintConfig = fs.readFileSync(path.join(projectRoot, 'eslint.config.js'), 'utf8');
const workboxBuildScript = fs.readFileSync(path.join(projectRoot, 'scripts/build-sw-dist.cjs'), 'utf8');

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

  it('runs the committed Workbox build implementation directly', () => {
    expect(packageJson.scripts['build:sw']).toBe('node scripts/build-sw-dist.cjs');
    expect(workboxBuildScript).toContain("require('workbox-build')");
    expect(workboxBuildScript).toContain('generateSW(config)');
    expect(workboxBuildScript).not.toContain('workbox-cli');
  });
});

describe('GitHub Actions hardening', () => {
  it('accepts the committed workflow set', () => {
    expect(validateWorkflowSet(workflows)).toEqual([]);
  });

  it('requires CI and release to share one verification implementation', () => {
    const brokenCi = workflows['ci.yml']
      .replace('uses: ./.github/workflows/verify.yml', 'runs-on: ubuntu-latest')
      .replace('source_ref: ${{ github.sha }}', 'source_ref: main');
    const brokenRelease = workflows['release.yml']
      .replace('uses: ./.github/workflows/verify.yml', 'runs-on: ubuntu-latest')
      .replace('release_mode: true', 'release_mode: false');

    expect(validateCiWorkflow(brokenCi)).toEqual(expect.arrayContaining([
      expect.stringContaining('shared verification workflow'),
      expect.stringContaining('exact trigger commit'),
    ]));
    expect(validateReleaseWorkflow(brokenRelease)).toEqual(expect.arrayContaining([
      expect.stringContaining('shared verification workflow'),
      expect.stringContaining('release mode'),
    ]));
  });

  it('scopes the optional-tag assertion to workflow_dispatch.inputs.tag', () => {
    const tagInput = extractWorkflowDispatchTagInput(workflows['release.yml']);
    expect(tagInput).toContain('required: false');
    const broken = workflows['release.yml']
      .replace(tagInput, tagInput.replace('required: false', 'required: true'))
      .replace('permissions:\n', 'permissions:\n  required: false\n');
    expect(validateReleaseWorkflow(broken)).toEqual(expect.arrayContaining([
      expect.stringContaining('workflow_dispatch tag input must be optional'),
    ]));
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
      .replaceAll('main_expected_tag="v${main_package_version}"', 'main_expected_tag="$REQUESTED_TAG"')
      .replace('github.rest.git.createRef', 'github.rest.git.getRef');
    expect(validateReleaseWorkflow(broken)).toEqual(expect.arrayContaining([
      expect.stringContaining('derive the default release tag'),
      expect.stringContaining('created only after verification'),
    ]));
  });

  it('requires provided-tag retries to validate the tagged commit version', () => {
    const broken = workflows['release.yml']
      .replace('git show "${release_commit}:far/package.json"', 'cat far/package.json')
      .replaceAll('[[ -n "$REQUESTED_TAG" ]]', '[[ -z "$REQUESTED_TAG" ]]')
      .replace('Requested retry tag is missing', 'Tag missing');
    expect(validateReleaseWorkflow(broken)).toEqual(expect.arrayContaining([
      expect.stringContaining('tagged commit package version'),
      expect.stringContaining('distinguish provided-tag retries'),
      expect.stringContaining('actionable failure guidance'),
    ]));
  });

  it('requires serialized publication and tag checks around the mutation', () => {
    const broken = workflows['release.yml']
      .replace('group: release-${{ github.repository }}', 'group: release-${{ github.event_name }}-${{ github.ref_name }}')
      .replace('      - name: Reverify immutable tag before publication', '      - name: Prepare publication')
      .replace('      - name: Verify published release identity', '      - name: Report publication');
    expect(validateReleaseWorkflow(broken)).toEqual(expect.arrayContaining([
      expect.stringContaining('serialized concurrency group'),
      expect.stringContaining('immediately before publication'),
      expect.stringContaining('verified after mutation'),
    ]));
  });

  it('requires signed provenance and an SBOM bound to the immutable release archive', () => {
    const brokenRelease = workflows['release.yml']
      .replace('      id-token: write\n', '')
      .replace('      attestations: write\n', '')
      .replace('      artifact-metadata: write\n', '')
      .replace('      - name: Attest immutable release artifacts', '      - name: Skip artifact attestation')
      .replace('      - name: Attest release SBOM', '      - name: Skip SBOM attestation')
      .replace('sbom-path: release-assets/opencoursedeck-${{ env.RELEASE_TAG }}-sbom.cdx.json', 'sbom-path: missing.json')
      .replace('`opencoursedeck-${tag}-sbom.cdx.json`,', '');
    const brokenVerify = workflows['verify.yml']
      .replace('          cp reports/release/sbom.cdx.json "release-assets/$sbom"\n', '')
      .replace(' "$sbom" > SHA256SUMS', ' > SHA256SUMS');

    expect(validateReleaseWorkflow(brokenRelease)).toEqual(expect.arrayContaining([
      expect.stringContaining('OIDC permission'),
      expect.stringContaining('attestation permission'),
      expect.stringContaining('artifact metadata permission'),
      expect.stringContaining('signed artifact provenance'),
      expect.stringContaining('signed SBOM attestation'),
      expect.stringContaining('bind the published archive'),
      expect.stringContaining('idempotency checks must include the SBOM'),
    ]));
    expect(validateVerificationWorkflow(brokenVerify)).toEqual(expect.arrayContaining([
      expect.stringContaining('CycloneDX SBOM'),
      expect.stringContaining('covered by release checksums'),
    ]));
  });

  it('requires idempotent retries to validate release assets, not only names', () => {
    const broken = workflows['release.yml']
      .replace('      - name: Detect an already-complete release', '      - name: Inspect existing release')
      .replace('fs.statSync', 'fs.existsSync');
    expect(validateReleaseWorkflow(broken)).toEqual(expect.arrayContaining([
      expect.stringContaining('idempotent release retry detection'),
      expect.stringContaining('compare local and remote asset sizes'),
    ]));
  });

  it('requires the shared pipeline to remain tolerant, observable, and strict at the final gate', () => {
    const broken = workflows['verify.yml']
      .replaceAll('continue-on-error: true\n', '')
      .replace('for attempt in 1 2 3', 'for attempt in 1')
      .replace('      - name: Enforce verification result', '      - name: Report verification result')
      .replace('GIT_REF: ${{ github.ref }}', 'GIT_REF: unsafe')
      .replace('path.relative(root, report.filePath)', 'report.filePath');
    expect(validateVerificationWorkflow(broken)).toEqual(expect.arrayContaining([
      expect.stringContaining('independent checks must continue'),
      expect.stringContaining('dependency-install retry'),
      expect.stringContaining('aggregate result gate'),
      expect.stringContaining('context values must pass through env'),
      expect.stringContaining('repository-relative paths'),
    ]));
  });

  it('requires a real production-browser gate with pinned, credential-safe setup', () => {
    const broken = workflows['browser-assurance.yml']
      .replace('persist-credentials: false', 'persist-credentials: true')
      .replace('      - name: Run production browser smoke tests', '      - name: Skip production browser smoke tests')
      .replace('CHROME_BIN: /usr/bin/google-chrome', 'CHROME_BIN: auto')
      .replace('npm run smoke:dist-browser', 'npm run smoke:browser');
    expect(validateBrowserAssuranceWorkflow(broken)).toEqual(expect.arrayContaining([
      expect.stringContaining('disable persisted credentials'),
      expect.stringContaining('production-browser smoke gate'),
      expect.stringContaining('deterministic Chrome executable'),
      expect.stringContaining('production distribution smoke command'),
    ]));
  });

  it('rejects mutable or unreviewed action references across the shared workflow', () => {
    const mutable = workflows['verify.yml'].replace(/actions\/checkout@[0-9a-f]{40}/, 'actions/checkout@v6');
    expect(validateActionPins('verify.yml', mutable)).toEqual(expect.arrayContaining([
      expect.stringContaining('40-character commit SHA'),
    ]));
    const unknownSha = 'a'.repeat(40);
    const unknown = `${workflows['verify.yml']}\n      - uses: example/unreviewed@${unknownSha}\n`;
    expect(validateActionPins('verify.yml', unknown)).toEqual(expect.arrayContaining([
      expect.stringContaining('audited action allowlist'),
    ]));
  });

  it('requires shared checkout credentials to be ephemeral', () => {
    const broken = workflows['verify.yml'].replace('          persist-credentials: false\n', '');
    expect(validateVerificationWorkflow(broken)).toEqual(expect.arrayContaining([
      expect.stringContaining('disable persisted credentials'),
    ]));
  });

  it('requires maintenance dry-run, retries, summary, failure isolation, and 404 tolerance', () => {
    const broken = workflows['actions-maintenance.yml']
      .replace('          retries: 3\n', '')
      .replace('      dry_run:\n', '      preview:\n')
      .replace('cleanup will continue', 'cleanup stopped')
      .replace('error.status === 404', 'error.status === 410')
      .replace('core.summary', 'core.notice');
    expect(validateMaintenanceWorkflow(broken)).toEqual(expect.arrayContaining([
      expect.stringContaining('retry transient failures'),
      expect.stringContaining('dry-run control'),
      expect.stringContaining('must not stop remaining cleanup'),
      expect.stringContaining('idempotent no-op'),
      expect.stringContaining('summary is missing'),
    ]));
  });
});
