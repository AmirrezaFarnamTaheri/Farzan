import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  normalizeCompatibilityAttestation,
  normalizeCompatibilitySbom,
  packageIdentity,
} = require('../../.github/scripts/normalize-compat-sbom.cjs');

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const packageMetadata = {
  name: 'opencoursedeck',
  version: '1.1.2',
};

describe('legacy release compatibility SBOM normalization', () => {
  it('replaces directory-derived identity, removes volatile metadata, and merges root graph entries', () => {
    const document = {
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      serialNumber: 'urn:uuid:volatile',
      metadata: {
        timestamp: '2026-08-01T00:00:00.000Z',
        component: {
          type: 'application',
          name: 'far',
          version: '1.1.2',
          purl: 'pkg:npm/far@1.1.2',
          'bom-ref': 'far@1.1.2',
        },
      },
      components: [
        { name: 'beta', version: '2.0.0', 'bom-ref': 'beta@2.0.0' },
        { name: 'alpha', version: '1.0.0', 'bom-ref': 'alpha@1.0.0' },
      ],
      dependencies: [
        { ref: 'pkg:npm/far@1.1.2', dependsOn: ['beta@2.0.0'] },
        { ref: 'far@1.1.2', dependsOn: ['alpha@1.0.0'] },
        { ref: 'beta@2.0.0', dependsOn: ['far@1.1.2'] },
        { ref: 'alpha@1.0.0', dependsOn: [] },
      ],
    };

    const normalized = normalizeCompatibilitySbom(document, packageMetadata);

    expect(normalized.serialNumber).toBeUndefined();
    expect(normalized.metadata.timestamp).toBeUndefined();
    expect(normalized.metadata.component).toMatchObject({
      type: 'application',
      name: 'opencoursedeck',
      version: '1.1.2',
      purl: 'pkg:npm/opencoursedeck@1.1.2',
      'bom-ref': 'pkg:npm/opencoursedeck@1.1.2',
    });
    expect(normalized.components.map((component) => component['bom-ref'])).toEqual([
      'alpha@1.0.0',
      'beta@2.0.0',
    ]);
    expect(normalized.dependencies[0]).toEqual({
      ref: 'pkg:npm/opencoursedeck@1.1.2',
      dependsOn: ['alpha@1.0.0', 'beta@2.0.0'],
    });
    expect(normalized.dependencies).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ ref: 'far@1.1.2' }),
      expect.objectContaining({ ref: 'pkg:npm/far@1.1.2' }),
    ]));
    expect(normalized.dependencies.find((entry) => entry.ref === 'beta@2.0.0')).toEqual({
      ref: 'beta@2.0.0',
      dependsOn: ['pkg:npm/opencoursedeck@1.1.2'],
    });
  });

  it('is idempotent for already normalized reproducible metadata', () => {
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

    const first = normalizeCompatibilitySbom(structuredClone(document), packageMetadata);
    const second = normalizeCompatibilitySbom(structuredClone(first), packageMetadata);

    expect(second).toEqual(first);
  });

  it('removes run-specific attestation metadata without weakening verified identity', () => {
    const attestation = normalizeCompatibilityAttestation({
      version: '1.1.2',
      commit: 'a'.repeat(40),
      verified: true,
      verifiedAt: '2026-08-01T00:00:00.000Z',
      runtime: { node: 'v22.23.1', platform: 'linux', arch: 'x64', ci: true },
    });

    expect(attestation).toEqual({
      version: '1.1.2',
      commit: 'a'.repeat(40),
      verified: true,
    });
  });

  it('fails closed for invalid identity, format, graph, or unverified attestation', () => {
    expect(() => packageIdentity({ name: '', version: '1.1.2' })).toThrow(/name and version/);
    expect(() => normalizeCompatibilitySbom({}, packageMetadata)).toThrow(/not CycloneDX/);
    expect(() => normalizeCompatibilitySbom({
      bomFormat: 'CycloneDX',
      components: [],
      dependencies: [],
    }, packageMetadata)).toThrow(/dependency components/);
    expect(() => normalizeCompatibilitySbom({
      bomFormat: 'CycloneDX',
      components: [{ name: 'alpha', version: '1.0.0', 'bom-ref': 'alpha@1.0.0' }],
    }, packageMetadata)).toThrow(/dependency graph/);
    expect(() => normalizeCompatibilityAttestation({ verified: false })).toThrow(/already be verified/);
  });

  it('pins compatibility normalization to the workflow commit before strict validation', () => {
    const workflow = fs.readFileSync(
      path.join(repositoryRoot, '.github', 'workflows', 'verify.yml'),
      'utf8',
    );

    expect(workflow).toContain('WORKFLOW_SHA: ${{ github.workflow_sha }}');
    expect(workflow).toContain('git show "${WORKFLOW_SHA}:.github/scripts/normalize-compat-sbom.cjs"');
    expect(workflow).toContain('node "$normalizer" reports/release/sbom.cdx.json package.json reports/release/release-attestation.json');
    expect(workflow).toContain("if (sbom.metadata?.component?.name !== packageJson.name)");
    expect(workflow).toContain("if (sbom.metadata?.component?.version !== expectedVersion)");
  });
});
