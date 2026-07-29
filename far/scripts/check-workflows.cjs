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
  ['softprops/action-gh-release', { sha: '3d0d9888cb7fd7b750713d6e236d1fcb99157228', version: 'v3.0.2' }],
]);

function extractNamedStep(workflow, name) {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);
  if (start < 0) return '';
  const next = workflow.indexOf('\n      - name:', start + marker.length);
  return workflow.slice(start, next < 0 ? workflow.length : next);
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
    if (revision !== expected.sha) {
      errors.push(`${filename}: ${action} is pinned to ${revision}; expected ${expected.sha} (${expected.version})`);
    }
    if (versionComment !== expected.version) {
      errors.push(`${filename}: ${action}@${revision} must carry the version comment # ${expected.version}`);
    }
  }

  return errors;
}

function requireText(errors, workflow, text, message) {
  if (!workflow.includes(text)) errors.push(message);
}

function validateCiWorkflow(workflow) {
  const errors = [];
  const checkout = extractNamedStep(workflow, 'Check out repository');
  if (!checkout) {
    errors.push('ci.yml: checkout step is missing');
  } else if (!checkout.includes('persist-credentials: false')) {
    errors.push('ci.yml: checkout must disable persisted credentials');
  }

  requireText(errors, workflow, '- name: Check workflow invariants', 'ci.yml: workflow invariant check step is missing');
  requireText(errors, workflow, '- name: Summarize CI results', 'ci.yml: consolidated CI summary is missing');
  requireText(errors, workflow, '- name: Enforce CI result', 'ci.yml: final aggregate failure gate is missing');
  requireText(errors, workflow, 'for attempt in 1 2 3', 'ci.yml: bounded dependency-install retry is missing');
  requireText(errors, workflow, 'for attempt in 1 2', 'ci.yml: bounded browser-smoke retry is missing');
  requireText(errors, workflow, 'continue-on-error: true', 'ci.yml: independent checks must continue so all failures are reported');
  requireText(errors, workflow, 'if: always()', 'ci.yml: diagnostics and summaries must run after failures');

  const upload = extractNamedStep(workflow, 'Upload CI diagnostics');
  const gate = extractNamedStep(workflow, 'Enforce CI result');
  if (!upload.includes('if: always()')) errors.push('ci.yml: diagnostics upload must run unconditionally');
  if (!gate.includes('if: always()')) errors.push('ci.yml: aggregate failure gate must run unconditionally');

  return errors;
}

function validateReleaseWorkflow(workflow) {
  const errors = [];
  const guardIndex = workflow.indexOf('      - name: Require an authoritative trigger');
  const sourceCheckoutIndex = workflow.indexOf('      - name: Check out release source');

  if (guardIndex < 0) errors.push('release.yml: authoritative trigger guard is missing');
  if (sourceCheckoutIndex < 0) errors.push('release.yml: release-source checkout step is missing');
  if (guardIndex >= 0 && sourceCheckoutIndex >= 0 && guardIndex >= sourceCheckoutIndex) {
    errors.push('release.yml: authoritative trigger guard must execute before checkout');
  }

  requireText(errors, workflow, 'required: false', 'release.yml: manual tag input must be optional');
  requireText(errors, workflow, 'expected_tag="v${package_version}"', 'release.yml: release tag must derive from package version');
  requireText(errors, workflow, 'git ls-remote --tags --refs', 'release.yml: tag existence must be resolved before exact checkout');
  requireText(errors, workflow, 'checkout_ref: ${{ steps.resolve.outputs.checkout_ref }}', 'release.yml: resolver must publish the exact checkout ref');
  requireText(errors, workflow, 'ref: ${{ needs.resolve.outputs.checkout_ref }}', 'release.yml: build must check out the resolved immutable source');
  requireText(errors, workflow, '- name: Ensure immutable release tag', 'release.yml: verified tag bootstrap step is missing');
  requireText(errors, workflow, 'github.rest.git.createRef', 'release.yml: missing tags must be created only after verification');
  requireText(errors, workflow, 'Refusing to move an immutable release tag', 'release.yml: tag movement protection is missing');
  requireText(errors, workflow, '- name: Detect an already-complete release', 'release.yml: idempotent release retry detection is missing');
  requireText(errors, workflow, 'overwrite_files: false', 'release.yml: published release assets must not overwrite existing assets');
  requireText(errors, workflow, '- name: Summarize release verification', 'release.yml: consolidated release verification summary is missing');
  requireText(errors, workflow, '- name: Enforce release verification result', 'release.yml: aggregate release verification gate is missing');
  requireText(errors, workflow, '- name: Upload release diagnostics', 'release.yml: release diagnostics upload is missing');

  const releaseUpload = extractNamedStep(workflow, 'Upload release diagnostics');
  if (!releaseUpload.includes('if: always()')) {
    errors.push('release.yml: release diagnostics must upload even when verification fails');
  }

  return errors;
}

function validateMaintenanceWorkflow(workflow) {
  const errors = [];
  const cleanup = extractNamedStep(workflow, 'Inspect and clean workflow artifacts');
  if (!cleanup) {
    errors.push('actions-maintenance.yml: cleanup step is missing');
    return errors;
  }
  if (!cleanup.includes('retries: 3')) {
    errors.push('actions-maintenance.yml: GitHub API cleanup should retry transient failures');
  }
  if (!cleanup.includes('Number.isInteger(retentionDays)')) {
    errors.push('actions-maintenance.yml: retention configuration must be validated before deletion');
  }
  if (!workflow.includes('dry_run:')) {
    errors.push('actions-maintenance.yml: manual dry-run control is missing');
  }
  if (!cleanup.includes('cleanup will continue')) {
    errors.push('actions-maintenance.yml: one artifact failure must not stop remaining cleanup');
  }
  if (!cleanup.includes('core.summary')) {
    errors.push('actions-maintenance.yml: maintenance summary is missing');
  }
  return errors;
}

function validateWorkflowSet(files) {
  const errors = [];
  for (const [filename, workflow] of Object.entries(files)) {
    errors.push(...validateActionPins(filename, workflow));
  }
  errors.push(...validateCiWorkflow(files['ci.yml'] || ''));
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
    'release.yml': readWorkflow('release.yml'),
    'actions-maintenance.yml': readWorkflow('actions-maintenance.yml'),
  };
  const errors = validateWorkflowSet(files);
  if (errors.length) {
    for (const error of errors) console.error(`[workflow-check] ${error}`);
    console.error(`[workflow-check] Failed with ${errors.length} issue(s).`);
    process.exit(1);
  }
  console.log('[workflow-check] OK - workflows enforce pinned actions, resilient execution, immutable releases, diagnostics, and aggregate result gates.');
}

if (require.main === module) main();

module.exports = {
  EXPECTED_ACTION_PINS,
  extractNamedStep,
  validateActionPins,
  validateCiWorkflow,
  validateMaintenanceWorkflow,
  validateReleaseWorkflow,
  validateWorkflowSet,
};
