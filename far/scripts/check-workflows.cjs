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
  const usesPattern = /^\s*uses:\s*([^\s#]+)(?:\s+#\s*(\S+))?\s*$/gm;

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

function validateCiWorkflow(workflow) {
  const errors = [];
  const checkout = extractNamedStep(workflow, 'Check out repository');
  if (!checkout) {
    errors.push('ci.yml: checkout step is missing');
  } else if (!checkout.includes('persist-credentials: false')) {
    errors.push('ci.yml: checkout must disable persisted credentials');
  }

  if (!workflow.includes('- name: Check workflow invariants')) {
    errors.push('ci.yml: workflow invariant check step is missing');
  }

  return errors;
}

function validateReleaseWorkflow(workflow) {
  const errors = [];
  const guardIndex = workflow.indexOf('      - name: Require an authoritative trigger');
  const checkoutIndex = workflow.indexOf('      - name: Check out the exact release tag');

  if (guardIndex < 0) errors.push('release.yml: authoritative trigger guard is missing');
  if (checkoutIndex < 0) errors.push('release.yml: exact-tag checkout step is missing');
  if (guardIndex >= 0 && checkoutIndex >= 0 && guardIndex >= checkoutIndex) {
    errors.push('release.yml: authoritative trigger guard must execute before checkout');
  }

  const guard = extractNamedStep(workflow, 'Require an authoritative trigger');
  if (guard && !guard.includes('working-directory: .')) {
    errors.push('release.yml: pre-checkout trigger guard must run from the workspace root');
  }

  const defaultsStart = workflow.indexOf('    defaults:');
  const stepsStart = workflow.indexOf('    steps:', defaultsStart);
  if (defaultsStart >= 0 && stepsStart > defaultsStart) {
    const defaults = workflow.slice(defaultsStart, stepsStart);
    if (defaults.includes('working-directory:')) {
      errors.push('release.yml: build job must not set a job-wide working-directory before checkout');
    }
  }

  const tagCheckoutCount = (workflow.match(/ref: refs\/tags\/\$\{\{ env\.RELEASE_TAG \}\}/g) || []).length;
  if (tagCheckoutCount !== 2) {
    errors.push(`release.yml: expected two explicit tag-namespace checkouts, found ${tagCheckoutCount}`);
  }

  if (!workflow.includes('- name: Check workflow invariants')) {
    errors.push('release.yml: workflow invariant check step is missing');
  }
  if (!workflow.includes('overwrite_files: false')) {
    errors.push('release.yml: published release assets must not overwrite existing assets');
  }

  return errors;
}

function validateMaintenanceWorkflow(workflow) {
  const errors = [];
  const cleanup = extractNamedStep(workflow, 'Cleanup old workflow artifacts');
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
  console.log('[workflow-check] OK - workflow bootstrap, credentials, action pins, and release immutability are enforced.');
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
