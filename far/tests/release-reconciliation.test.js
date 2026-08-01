import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  orderedRepairOperations,
  planReleaseReconciliation,
  requiredAssetNames,
} = require('../../.github/scripts/reconcile-release-assets.cjs');

const tag = 'v1.1.2';
let nextAssetId = 100;

function localAssets() {
  return new Map(requiredAssetNames(tag).map((name, index) => [name, {
    name,
    size: 100 + index,
    digest: `sha256:${String(index + 1).padStart(64, '0')}`,
    replaceable: name === 'SHA256SUMS' || name.endsWith('-attestation.json') || name.endsWith('-sbom.cdx.json'),
  }]));
}

function remoteAsset(local, overrides = {}) {
  nextAssetId += 1;
  return {
    id: nextAssetId,
    name: local.name,
    size: local.size,
    digest: local.digest,
    state: 'uploaded',
    ...overrides,
  };
}

describe('partial release reconciliation planning', () => {
  it('treats an exact published release as an idempotent no-op', () => {
    const local = localAssets();
    const release = {
      id: 1,
      tag_name: tag,
      draft: false,
      immutable: false,
      assets: [...local.values()].map((asset) => remoteAsset(asset)),
    };

    expect(planReleaseReconciliation(release, local)).toMatchObject({
      state: 'complete',
      upload: [],
      replace: [],
      publishDraft: false,
    });
  });

  it('repairs the observed state in a missing-first, one-at-a-time order with checksums last', () => {
    const local = localAssets();
    const archive = local.get(`opencoursedeck-${tag}.tar.gz`);
    const manifest = local.get(`opencoursedeck-${tag}-manifest.json`);
    const attestation = local.get(`opencoursedeck-${tag}-attestation.json`);
    const checksums = local.get('SHA256SUMS');
    const release = {
      id: 2,
      tag_name: tag,
      draft: false,
      immutable: false,
      assets: [
        remoteAsset(archive),
        remoteAsset(manifest),
        remoteAsset(attestation, { id: 31, digest: `sha256:${'a'.repeat(64)}` }),
        remoteAsset(checksums, { id: 32, size: 302, digest: `sha256:${'b'.repeat(64)}` }),
      ],
    };

    const plan = planReleaseReconciliation(release, local);
    expect(plan.state).toBe('repair');
    expect(plan.upload).toEqual([`opencoursedeck-${tag}-sbom.cdx.json`]);
    expect(plan.replace).toEqual([
      { name: `opencoursedeck-${tag}-attestation.json`, assetId: 31 },
      { name: 'SHA256SUMS', assetId: 32 },
    ]);
    expect(plan.keep).toEqual(expect.arrayContaining([
      `opencoursedeck-${tag}.tar.gz`,
      `opencoursedeck-${tag}-manifest.json`,
    ]));
    expect(orderedRepairOperations(plan)).toEqual([
      { type: 'upload', name: `opencoursedeck-${tag}-sbom.cdx.json` },
      { type: 'replace', name: `opencoursedeck-${tag}-attestation.json`, assetId: 31 },
      { type: 'replace', name: 'SHA256SUMS', assetId: 32 },
    ]);
  });

  it('rejects any mismatch in the archive or manifest', () => {
    const local = localAssets();
    const assets = [...local.values()].map((asset) => remoteAsset(asset));
    assets.find((asset) => asset.name.endsWith('.tar.gz')).digest = `sha256:${'f'.repeat(64)}`;
    const release = { id: 3, tag_name: tag, draft: false, immutable: false, assets };

    expect(() => planReleaseReconciliation(release, local)).toThrow(/Immutable release payload/);
  });

  it('fails closed on unexpected or duplicate assets, missing digests, or immutable partial releases', () => {
    const local = localAssets();
    const first = [...local.values()][0];
    expect(() => planReleaseReconciliation({
      id: 4,
      tag_name: tag,
      draft: false,
      immutable: false,
      assets: [
        ...[...local.values()].map((asset) => remoteAsset(asset)),
        { id: 999, name: 'unexpected-debug.zip', size: 10, digest: `sha256:${'9'.repeat(64)}`, state: 'uploaded' },
      ],
    }, local)).toThrow(/unexpected asset\(s\): unexpected-debug\.zip/);

    expect(() => planReleaseReconciliation({
      id: 5,
      tag_name: tag,
      draft: false,
      immutable: false,
      assets: [remoteAsset(first), remoteAsset(first)],
    }, local)).toThrow(/duplicate asset name/);

    expect(() => planReleaseReconciliation({
      id: 6,
      tag_name: tag,
      draft: false,
      immutable: false,
      assets: [remoteAsset(first, { digest: null })],
    }, local)).toThrow(/missing a verifiable SHA-256 digest/);

    expect(() => planReleaseReconciliation({
      id: 7,
      tag_name: tag,
      draft: false,
      immutable: true,
      assets: [],
    }, local)).toThrow(/is immutable but requires repair/);
  });

  it('publishes a draft only after exact assets are present', () => {
    const local = localAssets();
    const release = {
      id: 8,
      tag_name: tag,
      draft: true,
      immutable: false,
      assets: [...local.values()].map((asset) => remoteAsset(asset)),
    };

    expect(planReleaseReconciliation(release, local)).toMatchObject({
      state: 'repair',
      upload: [],
      replace: [],
      publishDraft: true,
    });
  });
});
