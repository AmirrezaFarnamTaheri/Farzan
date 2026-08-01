import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  canonicalizeLocalReleaseAssets,
  manifestDigest,
  requiredAssetNames,
} = require('../../.github/scripts/reconcile-release-assets.cjs');

const tag = 'v1.1.2';
const commit = 'a'.repeat(40);
const temporaryDirectories = [];

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function writeFixture({ manifestCommit = commit, attestationDigest } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'release-metadata-'));
  temporaryDirectories.push(directory);
  const [archiveName, manifestName, attestationName, sbomName] = requiredAssetNames(tag);
  const manifest = {
    schemaVersion: 1,
    product: 'OpenCourseDeck',
    version: '1.1.2',
    commit: manifestCommit,
    artifactRoot: 'dist',
    generatedAt: '2026-08-01T12:00:00.000Z',
    artifactCount: 1,
    artifacts: [{
      path: 'index.html',
      size: 12,
      mode: 0o644,
      sha256: 'b'.repeat(64),
    }],
  };
  const attestation = {
    schemaVersion: 1,
    kind: 'opencoursedeck-release-verification',
    version: '1.1.2',
    commit: manifestCommit,
    artifactRoot: 'dist',
    artifactCount: 1,
    manifest: 'reports/release/release-manifest.json',
    manifestSha256: attestationDigest || manifestDigest(manifest),
    verified: true,
    verifiedAt: '2026-08-01T12:01:00.000Z',
    runtime: { node: 'v22.0.0', platform: 'linux', arch: 'x64', ci: true },
  };
  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: 'urn:uuid:volatile',
    metadata: {
      timestamp: '2026-08-01T12:02:00.000Z',
      component: {
        type: 'application',
        name: 'opencoursedeck',
        version: '1.1.2',
        'bom-ref': 'pkg:npm/opencoursedeck@1.1.2',
      },
    },
    components: [
      { name: 'beta', version: '2.0.0', 'bom-ref': 'beta@2.0.0' },
      { name: 'alpha', version: '1.0.0', 'bom-ref': 'alpha@1.0.0' },
    ],
    dependencies: [
      { ref: 'beta@2.0.0', dependsOn: ['z@1', 'a@1', 'a@1'] },
      { ref: 'alpha@1.0.0', dependsOn: [] },
    ],
  };

  fs.writeFileSync(path.join(directory, archiveName), Buffer.from('verified archive'));
  fs.writeFileSync(path.join(directory, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(directory, attestationName), `${JSON.stringify(attestation, null, 2)}\n`);
  fs.writeFileSync(path.join(directory, sbomName), `${JSON.stringify(sbom, null, 2)}\n`);
  fs.writeFileSync(path.join(directory, 'SHA256SUMS'), 'stale checksums\n');
  return { directory, archiveName, manifestName, attestationName, sbomName };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('release metadata canonicalization', () => {
  it('removes volatile fields, regenerates checksums, and is byte-idempotent', () => {
    const fixture = writeFixture();
    canonicalizeLocalReleaseAssets(fixture.directory, tag, commit);

    const manifest = JSON.parse(fs.readFileSync(path.join(fixture.directory, fixture.manifestName), 'utf8'));
    const attestation = JSON.parse(fs.readFileSync(path.join(fixture.directory, fixture.attestationName), 'utf8'));
    const sbom = JSON.parse(fs.readFileSync(path.join(fixture.directory, fixture.sbomName), 'utf8'));
    expect(manifest.generatedAt).toBeUndefined();
    expect(attestation.verifiedAt).toBeUndefined();
    expect(attestation.runtime).toBeUndefined();
    expect(attestation.manifestSha256).toBe(manifestDigest(manifest));
    expect(sbom.serialNumber).toBeUndefined();
    expect(sbom.metadata.timestamp).toBeUndefined();
    expect(sbom.components.map((component) => component['bom-ref'])).toEqual(['alpha@1.0.0', 'beta@2.0.0']);
    expect(sbom.dependencies.map((dependency) => dependency.ref)).toEqual(['alpha@1.0.0', 'beta@2.0.0']);
    expect(sbom.dependencies[1].dependsOn).toEqual(['a@1', 'z@1']);

    const checksumLines = fs.readFileSync(path.join(fixture.directory, 'SHA256SUMS'), 'utf8').trim().split('\n');
    expect(checksumLines).toHaveLength(4);
    for (const line of checksumLines) {
      const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
      expect(match).not.toBeNull();
      const [, digest, name] = match;
      expect(digest).toBe(sha256(fs.readFileSync(path.join(fixture.directory, name))));
    }

    const firstPass = new Map(requiredAssetNames(tag).map((name) => [
      name,
      fs.readFileSync(path.join(fixture.directory, name)),
    ]));
    canonicalizeLocalReleaseAssets(fixture.directory, tag, commit);
    for (const [name, bytes] of firstPass) {
      expect(fs.readFileSync(path.join(fixture.directory, name))).toEqual(bytes);
    }
  });

  it('fails before mutation when release identity or provenance does not match', () => {
    const commitMismatch = writeFixture();
    expect(() => canonicalizeLocalReleaseAssets(commitMismatch.directory, tag, 'c'.repeat(40)))
      .toThrow(/manifest commit .* does not match/);
    expect(JSON.parse(fs.readFileSync(path.join(commitMismatch.directory, commitMismatch.manifestName), 'utf8')).generatedAt)
      .toBe('2026-08-01T12:00:00.000Z');
    expect(fs.readFileSync(path.join(commitMismatch.directory, 'SHA256SUMS'), 'utf8')).toBe('stale checksums\n');

    const digestMismatch = writeFixture({ attestationDigest: 'd'.repeat(64) });
    expect(() => canonicalizeLocalReleaseAssets(digestMismatch.directory, tag, commit))
      .toThrow(/attestation manifest digest/);
    expect(fs.readFileSync(path.join(digestMismatch.directory, 'SHA256SUMS'), 'utf8')).toBe('stale checksums\n');
  });
});
