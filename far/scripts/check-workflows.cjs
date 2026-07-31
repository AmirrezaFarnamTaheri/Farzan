'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const REPOSITORY_ROOT = path.resolve(PROJECT_ROOT, '..');

const EXPECTED_ACTION_PINS = new Map([
  ['actions/checkout', { sha: 'df4cb1c069e1874edd31b4311f1884172cec0e10', version: 'v6.0.3' }],
  ['actions/setup-node', { sha: '249970729cb0ef3589644e2896645e5dc5ba9c38', version: 'v6.5.0' }],
  ['actions/upload-artifact', { sha: 'b7c566a772e6b6bfb58ed0dc250532a479d7789f', version: 'v6.0.0' }],
  ['actions/download-artifact', { sha: '018cc2cf5baa6db3ef3c5f8a56943fffe632ef53', version: 'v6.0.0' }],
  ['actions/github-script', { sha: 'ed597411d8f924073f98dfc5c65a23a2325f34cd', version: 'v8.0.0' }],
  ['actions/attest', { sha: 'c32b4b8b198b65d0bd9d63490e847ff7b53989d4', version: 'v4.0.0' }],
  ['softprops/action-gh-release', { sha: '3d0d9888cb7fd7b750713d6e236d1fcb99157228', version: 'v3.0.2' }],
]);

function extractNamedStep(workflow, name) {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);
  if (start < 0) return '';
  const next = workflow.indexOf('\n      - name:', start + marker.length);
  return workflow.slice(start, next < 0 ? workflow.length : next);
}

function extractWorkflowDispatchTagInput(workflow) {
  const dispatchStart = workflow.indexOf('  workflow_dispatch:');
  if (dispatchStart < 0) return '';
  const dispatchEndMarker = workflow.indexOf('\n\npermissions:', dispatchStart);
  const dispatchEnd = dispatchEndMarker < 0 ? workflow.length : dispatchEndMarker;
  const tagMarker = '      tag:';
  const tagStart = workflow.indexOf(tagMarker, dispatchStart);
  if (tagStart < 0 || tagStart >= dispatchEnd) return '';
  const contentStart = tagStart + tagMarker.length;
  const remainder = workflow.slice(contentStart, dispatchEnd);
  const nextSiblingOffset = remainder.search(/\n {6}\S/);
  const tagEnd = nextSiblingOffset < 0 ? dispatchEnd : contentStart + nextSiblingOffset;
  return workflow.slice(tagStart, tagEnd);
}

function validateActionPins(filename, workflow) {
  const errors = [];
  const usesPattern = /^[ \t]*(?:-[ \t]+)?uses:[ \t]*([^\s#]+)(?:[ \t]+#[ \t]*(\S+))?[ \t]*$/gm;
  for (const match of workflow.matchAll(usesPattern)) {
    const reference = match[1];
    const versionComment = match[2] || '';
    if (reference.startsWith('./')) continue;
    const at = reference.lastIndexOf('@');
    if (at <= 0) {
      errors.push(`${filename}: malformed action reference ${reference}`);
      continue;
    }
    const action = reference.slice(0, at);
    const revision = reference.slice(at + 1);
    if (!/^[0-9a-f]{40}$/.test(revision)) {
      errors.push(`${filename}: ${action} must be pinned to a lowercase 40-character commit SHA`);
      continue;
    }
    const expected = EXPECTED_ACTION_PINS.get(action);
    if (!expected) {
      errors.push(`${filename}: ${action} is not in the audited action allowlist`);
      continue;
    }
    if (revision !== expected.sha) errors.push(`${filename}: ${action} is pinned to ${revision}; expected ${expected.sha} (${expected.version})`);
    if (versionComment !== expected.version) errors.push(`${filename}: ${action}@${revision} must carry the version comment # ${expected.version}`);
  }
  return errors;
}

function requireText(errors, text, expected, message) {
  if (!text.includes(expected)) errors.push(message);
}

function validateCiWorkflow(workflow) {
  const errors = [];
  requireText(errors, workflow, 'uses: ./.github/workflows/verify.yml', 'ci.yml: CI must call the shared verification workflow');
  requireText(errors, workflow, 'source_ref: ${{ github.sha }}', 'ci.yml: CI must verify the exact trigger commit');
  requireText(errors, workflow, 'release_mode: false', 'ci.yml: CI must call shared verification in non-release mode');
  if (workflow.includes('npm run ') || workflow.includes('npm ci ')) {
    errors.push('ci.yml: verification commands must remain centralized in verify.yml');
  }
  return errors;
}

function validateVerificationWorkflow(workflow) {
  const errors = [];
  requireText(errors, workflow, 'workflow_call:', 'verify.yml: reusable workflow_call trigger is missing');
  requireText(errors, workflow, 'source_ref:', 'verify.yml: exact source_ref input is missing');
  requireText(errors, workflow, 'release_mode:', 'verify.yml: release_mode input is missing');

  const checkout = extractNamedStep(workflow, 'Check out verification source');
  if (!checkout) {
    errors.push('verify.yml: checkout step is missing');
  } else {
    requireText(errors, checkout, 'ref: ${{ inputs.source_ref }}', 'verify.yml: checkout must use the exact source_ref input');
    requireText(errors, checkout, 'persist-credentials: false', 'verify.yml: checkout must disable persisted credentials');
  }

  requireText(errors, workflow, 'for attempt in 1 2 3', 'verify.yml: bounded dependency-install retry is missing');
  requireText(errors, workflow, 'for attempt in 1 2', 'verify.yml: bounded browser-smoke retry is missing');
  requireText(errors, workflow, 'continue-on-error: true', 'verify.yml: independent checks must continue so all failures are reported');
  requireText(errors, workflow, 'GIT_REF: ${{ github.ref }}', 'verify.yml: context values must pass through env instead of shell template expansion');
  requireText(errors, workflow, 'path.relative(root, report.filePath)', 'verify.yml: ESLint annotations must use repository-relative paths');
  requireText(errors, workflow, '- name: Summarize verification results', 'verify.yml: consolidated verification summary is missing');
  requireText(errors, workflow, '- name: Upload verification diagnostics', 'verify.yml: unconditional diagnostics upload is missing');
  requireText(errors, workflow, '- name: Enforce verification result', 'verify.yml: aggregate result gate is missing');
  requireText(errors, workflow, '- name: Verify release identity', 'verify.yml: release identity check is missing');
  requireText(errors, workflow, '- name: Reverify final release contents', 'verify.yml: final release verification is missing');
  requireText(errors, workflow, '- name: Package immutable release assets', 'verify.yml: immutable release packaging is missing');
  requireText(errors, workflow, '- name: Upload verified release assets', 'verify.yml: verified release asset upload is missing');
  requireText(errors, workflow, 'reports/release/sbom.cdx.json', 'verify.yml: CycloneDX SBOM must be packaged with immutable release assets');
  requireText(errors, workflow, '"$sbom" > SHA256SUMS', 'verify.yml: SBOM must be covered by release checksums');
  requireText(errors, workflow, 'Browser smoke recovered on retry', 'verify.yml: recovered browser-smoke retries must be visible');
  requireText(errors, workflow, 'Download release diagnostics', 'verify.yml: integrity failures must include actionable diagnostics guidance');

  const diagnostics = extractNamedStep(workflow, 'Upload verification diagnostics');
  if (!diagnostics.includes('if: always()')) errors.push('verify.yml: diagnostics must upload even when verification fails');
  return errors;
}

function validateBrowserAssuranceWorkflow(workflow) {
  const errors = [];
  requireText(errors, workflow, 'pull_request:', 'browser-assurance.yml: pull-request trigger is missing');
  requireText(errors, workflow, '- name: Check out browser-assurance source', 'browser-assurance.yml: checkout step is missing');
  requireText(errors, workflow, 'persist-credentials: false', 'browser-assurance.yml: checkout must disable persisted credentials');
  requireText(errors, workflow, '- name: Run production browser smoke tests', 'browser-assurance.yml: real production-browser smoke gate is missing');
  requireText(errors, workflow, 'CHROME_BIN: /usr/bin/google-chrome', 'browser-assurance.yml: deterministic Chrome executable is missing');
  requireText(errors, workflow, 'npm run smoke:dist-browser', 'browser-assurance.yml: production distribution smoke command is missing');
  return errors;
}

function validateReleaseWorkflow(workflow) {
  const errors = [];
  const guardIndex = workflow.indexOf('      - name: Require an authoritative trigger');
  const sourceCheckoutIndex = workflow.indexOf('      - name: Check out release source');
  if (guardIndex < 0) errors.push('release.yml: authoritative trigger guard is missing');
  if (sourceCheckoutIndex < 0) errors.push('release.yml: release-source checkout step is missing');
  if (guardIndex >= 0 && sourceCheckoutIndex >= 0 && guardIndex >= sourceCheckoutIndex) errors.push('release.yml: authoritative trigger guard must execute before checkout');

  const tagInput = extractWorkflowDispatchTagInput(workflow);
  if (!tagInput) {
    errors.push('release.yml: workflow_dispatch tag input is missing');
  } else {
    requireText(errors, tagInput, 'required: false', 'release.yml: workflow_dispatch tag input must be optional');
    requireText(errors, tagInput, 'type: string', 'release.yml: workflow_dispatch tag input must remain a string');
  }

  const resolver = extractNamedStep(workflow, 'Resolve package, tag, and commit');
  if (!resolver) {
    errors.push('release.yml: release identity resolver is missing');
  } else {
    requireText(errors, resolver, 'main_expected_tag="v${main_package_version}"', 'release.yml: resolver must derive the default release tag from main package version');
    requireText(errors, resolver, 'git ls-remote --tags --refs', 'release.yml: resolver must check tag existence before exact checkout');
    requireText(errors, resolver, 'git show "${release_commit}:far/package.json"', 'release.yml: existing-tag retries must read the tagged commit package version');
    requireText(errors, resolver, 'if [[ -n "$REQUESTED_TAG" ]]', 'release.yml: resolver must distinguish provided-tag retries from blank-tag bootstrap');
    requireText(errors, resolver, 'Requested retry tag is missing', 'release.yml: missing explicit retry tags need actionable failure guidance');
  }

  requireText(errors, workflow, 'group: release-${{ github.repository }}', 'release.yml: all release triggers must share one serialized concurrency group');
  requireText(errors, workflow, 'uses: ./.github/workflows/verify.yml', 'release.yml: release must call the shared verification workflow');
  requireText(errors, workflow, 'source_ref: ${{ needs.resolve.outputs.checkout_ref }}', 'release.yml: shared verification must use the resolved immutable ref');
  requireText(errors, workflow, 'release_mode: true', 'release.yml: shared verification must run in release mode');
  requireText(errors, workflow, 'release_tag: ${{ needs.resolve.outputs.release_tag }}', 'release.yml: shared verification must receive the resolved tag');
  requireText(errors, workflow, 'source_version: ${{ needs.resolve.outputs.release_commit }}', 'release.yml: shared verification must receive the resolved commit');
  if (workflow.includes('npm run ') || workflow.includes('npm ci ')) errors.push('release.yml: verification commands must remain centralized in verify.yml');

  requireText(errors, workflow, '- name: Ensure immutable release tag', 'release.yml: verified tag bootstrap step is missing');
  requireText(errors, workflow, 'github.rest.git.createRef', 'release.yml: missing tags must be created only after verification');
  requireText(errors, workflow, 'Refusing to move an immutable release tag', 'release.yml: tag movement protection is missing');
  requireText(errors, workflow, '- name: Detect an already-complete release', 'release.yml: idempotent release retry detection is missing');
  requireText(errors, workflow, 'fs.statSync', 'release.yml: idempotent retry must compare local and remote asset sizes');
  requireText(errors, workflow, '- name: Reverify immutable tag before publication', 'release.yml: tag identity must be rechecked immediately before publication');
  requireText(errors, workflow, '- name: Verify published release identity', 'release.yml: publication must be verified after mutation');
  requireText(errors, workflow, 'overwrite_files: false', 'release.yml: published release assets must not overwrite existing assets');
  requireText(errors, workflow, 'id-token: write', 'release.yml: signed provenance requires OIDC permission');
  requireText(errors, workflow, 'attestations: write', 'release.yml: signed provenance requires attestation permission');
  requireText(errors, workflow, 'artifact-metadata: write', 'release.yml: signed provenance requires artifact metadata permission');
  requireText(errors, workflow, '- name: Attest immutable release artifacts', 'release.yml: signed artifact provenance step is missing');
  requireText(errors, workflow, '- name: Attest release SBOM', 'release.yml: signed SBOM attestation step is missing');
  requireText(errors, workflow, 'sbom-path: release-assets/opencoursedeck-${{ env.RELEASE_TAG }}-sbom.cdx.json', 'release.yml: SBOM attestation must bind the published archive to its SBOM');
  requireText(errors, workflow, '`opencoursedeck-${tag}-sbom.cdx.json`', 'release.yml: idempotency checks must include the SBOM asset');
  return errors;
}

function validateMaintenanceWorkflow(workflow) {
  const errors = [];
  const cleanup = extractNamedStep(workflow, 'Inspect and clean workflow artifacts');
  if (!cleanup) {
    errors.push('actions-maintenance.yml: cleanup step is missing');
    return errors;
  }
  if (!cleanup.includes('retries: 3')) errors.push('actions-maintenance.yml: GitHub API cleanup should retry transient failures');
  if (!cleanup.includes('Number.isInteger(retentionDays)')) errors.push('actions-maintenance.yml: retention configuration must be validated before deletion');
  if (!workflow.includes('dry_run:')) errors.push('actions-maintenance.yml: manual dry-run control is missing');
  if (!cleanup.includes('cleanup will continue')) errors.push('actions-maintenance.yml: one artifact failure must not stop remaining cleanup');
  if (!cleanup.includes('error.status === 404')) errors.push('actions-maintenance.yml: already-removed artifacts must be treated as an idempotent no-op');
  if (!cleanup.includes('core.summary')) errors.push('actions-maintenance.yml: maintenance summary is missing');
  return errors;
}

function validateWorkflowSet(files) {
  const errors = [];
  for (const [filename, workflow] of Object.entries(files)) errors.push(...validateActionPins(filename, workflow));
  errors.push(...validateCiWorkflow(files['ci.yml'] || ''));
  errors.push(...validateVerificationWorkflow(files['verify.yml'] || ''));
  errors.push(...validateBrowserAssuranceWorkflow(files['browser-assurance.yml'] || ''));
  errors.push(...validateReleaseWorkflow(files['release.yml'] || ''));
  errors.push(...validateMaintenanceWorkflow(files['actions-maintenance.yml'] || ''));
  return errors;
}

function readWorkflow(filename) {
  return fs.readFileSync(path.join(REPOSITORY_ROOT, '.github', 'workflows', filename), 'utf8');
}

function main() {
  const files = {
    'ci.yml': readWorkflow('ci.yml'),
    'verify.yml': readWorkflow('verify.yml'),
    'browser-assurance.yml': readWorkflow('browser-assurance.yml'),
    'release.yml': readWorkflow('release.yml'),
    'actions-maintenance.yml': readWorkflow('actions-maintenance.yml'),
  };
  const errors = validateWorkflowSet(files);
  if (errors.length) {
    for (const error of errors) console.error(`[workflow-check] ${error}`);
    console.error(`[workflow-check] Failed with ${errors.length} issue(s).`);
    process.exit(1);
  }
  console.log('[workflow-check] OK - callers share one pinned, resilient verification pipeline with scoped inputs, immutable release publication, diagnostics, and aggregate gates.');
}

if (require.main === module) main();

module.exports = {
  EXPECTED_ACTION_PINS,
  extractNamedStep,
  extractWorkflowDispatchTagInput,
  validateActionPins,
  validateBrowserAssuranceWorkflow,
  validateCiWorkflow,
  validateMaintenanceWorkflow,
  validateReleaseWorkflow,
  validateVerificationWorkflow,
  validateWorkflowSet,
};
