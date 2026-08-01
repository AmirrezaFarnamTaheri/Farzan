import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  normalizeCompatibilitySbom,
  packageIdentity,
} = require('../../.github/scripts/normalize-compat-sbom.cjs');

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');

describe('legacy release compatibility SBOM normalization', () => {
  it('replaces npm directory-derived identity and merges legacy root graph entries', () => {
    const document = {
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      metadata: {
        component: {
          type: 'application',
          name: 'far',
          version: '1.1.2',
          purl: 'pkg:npm/far@1.1.2',
          'bom-ref': 'far@1.1.2',
        },
      },
      components: [
        { name: 'alpha', version: '1.0.0', 'bom-ref': 'alpha@1.0.0' },
        { name: 'beta', version: '2.0.0', 'bom-ref': 'beta@2.0.0' },
      ],
      dependencies: [
        { ref: 'far@1.1.2', dependsOn: ['alpha@1.0.0'] },
        { ref: 'pkg:npm/far@1.1.2', dependsOn: ['beta@2.0.0'] },
        { ref: 'alpha@1.0.0', dependsOn: [] },
        { ref: 'beta@2.0.0', dependsOn: ['far@1.1.2'] },
      ],
    };

    const normalized = normalizeCompatibilitySbom(document, {
      name: 'opencoursedeck',
      version: '1.1.2',
    });

    expect(normalized.metadata.component).toMatchObject({
      type: 'application',
      name: 'opencoursedeck',
      version: '1.1.2',
      purl: 'pkg:npm/opencoursedeck@1.1.2',
      'bom-ref': 'pkg:npm/opencoursedeck@1.1.2',
    });
    expect(normalized.dependencies[0]).toEqual({
      ref: 'pkg:npm/opencoursedeck@1.1.2',
      dependsOn: ['alpha@1.0.0', 'beta@2.0.0'],
    });
    expect(normalized.dependencies).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ ref: 'far@1.1.2' }),
      expect.objectContaining({ ref: 'pkg:npm/far@1.1.2' }),
    ]));
    expect(normalized.dependencies.find(entry => entry.ref === 'beta@2.0.0')).toEqual({
      ref: 'beta@2.0.0',
      dependsOn: ['pkg:npm/opencoursedeck@1.1.2'],
    });
  });

  it('is idempotent for an already normalized root component', () => {
    const document = {
      bomFormat: 'CycloneDX',
      metadata: {
        component: {
          type: 'application',
          name: 'opencoursedeck',
          version: '1.1.2',
          purl: 'pkg:npm/opencoursedeck@1.1.2',
          'bom-ref': 'pkg:npm/opencoursedeck@1.1.2',
        },
      },
      components: [{ name: 'alpha', version: '1.0.0', 'bom-ref': 'alpha@1.0.0' }],
      dependencies: [
        { ref: 'pkg:npm/opencoursedeck@1.1.2', dependsOn: ['alpha@1.0.0'] },
        { ref: 'alpha@1.0.0', dependsOn: [] },
      ],
    };

    const first = normalizeCompatibilitySbom(structuredClone(document), {
      name: 'opencoursedeck',
      version: '1.1.2',
    });
    const second = normalizeCompatibilitySbom(structuredClone(first), {
      name: 'opencoursedeck',
      version: '1.1.2',
    });

    expect(second).toEqual(first);
  });

  it('fails closed for invalid package identity or non-CycloneDX input', () => {
    expect(() => packageIdentity({ name: '', version: '1.1.2' })).toThrow(/name and version/);
    expect(() => normalizeCompatibilitySbom({}, {
      name: 'opencoursedeck',
      version: '1.1.2',
    })).toThrow(/not CycloneDX/);
  });

  it('pins compatibility normalization to the workflow commit before strict validation', () => {
    const workflow = fs.readFileSync(
      path.join(repositoryRoot, '.github', 'workflows', 'verify.yml'),
      'utf8',
    );

    expect(workflow).toContain('WORKFLOW_SHA: ${{ github.workflow_sha }}');
    expect(workflow).toContain('git show "${WORKFLOW_SHA}:.github/scripts/normalize-compat-sbom.cjs"');
    expect(workflow).toContain('node "$normalizer" reports/release/sbom.cdx.json package.json');
    expect(workflow).toContain("if (sbom.metadata?.component?.name !== packageJson.name)");
    expect(workflow).toContain("if (sbom.metadata?.component?.version !== expectedVersion)");
  });
});
