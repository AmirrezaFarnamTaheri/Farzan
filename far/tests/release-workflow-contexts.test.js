import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const workflow = fs.readFileSync(
  path.join(repositoryRoot, '.github', 'workflows', 'release.yml'),
  'utf8',
);

describe('release workflow expression contexts', () => {
  it('does not use runner context in job-level environment declarations', () => {
    const publishStart = workflow.indexOf('  publish:');
    const stepsStart = workflow.indexOf('\n    steps:', publishStart);
    const publishJobHeader = workflow.slice(publishStart, stepsStart);

    expect(publishJobHeader).not.toContain('${{ runner.');
    expect(publishJobHeader).not.toContain('RECONCILE_SCRIPT:');
  });

  it('materializes the reconciliation helper through a step output', () => {
    expect(workflow).toContain('- name: Materialize release reconciliation helper\n        id: helper');
    expect(workflow).toContain('reconcile_script="$RUNNER_TEMP/reconcile-release-assets.cjs"');
    expect(workflow).toContain("printf 'path=%s\\n' \"$reconcile_script\" >> \"$GITHUB_OUTPUT\"");

    const consumers = workflow.match(/RECONCILE_SCRIPT: \$\{\{ steps\.helper\.outputs\.path \}\}/g) || [];
    expect(consumers).toHaveLength(3);
  });
});
