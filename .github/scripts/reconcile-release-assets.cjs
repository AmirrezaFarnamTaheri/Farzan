'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REPLACEABLE_SUFFIXES = new Set([
  '-manifest.json',
  '-attestation.json',
  '-sbom.cdx.json',
]);
const CHECKSUM_ASSET = 'SHA256SUMS';
const FULL_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PACKAGE_NAME = 'opencoursedeck';

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requiredAssetNames(tag) {
  return [
    `opencoursedeck-${tag}.tar.gz`,
    `opencoursedeck-${tag}-manifest.json`,
    `opencoursedeck-${tag}-attestation.json`,
    `opencoursedeck-${tag}-sbom.cdx.json`,
    CHECKSUM_ASSET,
  ];
}

function isReplaceableMetadata(name) {
  return name === CHECKSUM_ASSET || [...REPLACEABLE_SUFFIXES].some((suffix) => name.endsWith(suffix));
}

function digestBuffer(buffer) {
  return `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
}

function digestHex(buffer) {
  return digestBuffer(buffer).slice('sha256:'.length);
}

function canonicalJsonBuffer(document) {
  return Buffer.from(`${JSON.stringify(document, null, 2)}\n`, 'utf8');
}

function readJson(file, label) {
  let document;
  try {
    document = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read ${label} JSON from ${file}.`, { cause: error });
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return document;
}

function normalizeExpectedCommit(expectedCommit) {
  const normalized = String(expectedCommit || '').trim().toLowerCase();
  if (!normalized) return null;
  if (!FULL_COMMIT_PATTERN.test(normalized)) {
    throw new Error('Expected release commit must be a full 40-character lowercase SHA-1.');
  }
  return normalized;
}

function stableManifestPayload(manifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    product: manifest.product,
    version: manifest.version,
    commit: manifest.commit,
    artifactRoot: manifest.artifactRoot,
    artifactCount: manifest.artifactCount,
    artifacts: manifest.artifacts,
  };
}

function manifestDigest(manifest) {
  return crypto
    .createHash('sha256')
    .update(Buffer.from(`${JSON.stringify(stableManifestPayload(manifest))}\n`, 'utf8'))
    .digest('hex');
}

function canonicalizeManifest(document, { tag, expectedCommit } = {}) {
  if (document.schemaVersion !== 1) throw new Error('Release manifest schemaVersion must be 1.');
  const expectedVersion = String(tag || '').replace(/^v/, '');
  if (!expectedVersion || document.version !== expectedVersion) {
    throw new Error(`Release manifest version ${document.version || 'missing'} does not match ${expectedVersion || 'the release tag'}.`);
  }
  const commit = String(document.commit || '').trim().toLowerCase();
  if (!FULL_COMMIT_PATTERN.test(commit) || document.commit !== commit) {
    throw new Error('Release manifest commit must be a full 40-character lowercase SHA-1.');
  }
  const normalizedExpectedCommit = normalizeExpectedCommit(expectedCommit);
  if (normalizedExpectedCommit && commit !== normalizedExpectedCommit) {
    throw new Error(`Release manifest commit ${commit} does not match ${normalizedExpectedCommit}.`);
  }
  if (!Array.isArray(document.artifacts)) throw new Error('Release manifest artifacts must be an array.');
  if (!Number.isInteger(document.artifactCount) || document.artifactCount !== document.artifacts.length) {
    throw new Error('Release manifest artifactCount does not match its artifact records.');
  }
  const seen = new Set();
  for (const artifact of document.artifacts) {
    const artifactPath = typeof artifact?.path === 'string' ? artifact.path : '';
    if (!artifactPath || artifactPath.includes('\\') || seen.has(artifactPath)) {
      throw new Error(`Release manifest contains an invalid or duplicate artifact path: ${artifactPath || '<empty>'}.`);
    }
    seen.add(artifactPath);
    if (!Number.isInteger(artifact.size) || artifact.size < 0) {
      throw new Error(`Release manifest artifact ${artifactPath} has an invalid size.`);
    }
    if (!Number.isInteger(artifact.mode) || artifact.mode < 0 || artifact.mode > 0o777) {
      throw new Error(`Release manifest artifact ${artifactPath} has an invalid mode.`);
    }
    if (typeof artifact.sha256 !== 'string' || !SHA256_PATTERN.test(artifact.sha256)) {
      throw new Error(`Release manifest artifact ${artifactPath} has an invalid SHA-256 digest.`);
    }
  }
  delete document.generatedAt;
  return document;
}

function canonicalizeAttestation(document, manifest) {
  if (document.verified !== true) throw new Error('Release attestation must already be verified.');
  if (document.version !== manifest.version) {
    throw new Error(`Release attestation version ${document.version || 'missing'} does not match ${manifest.version}.`);
  }
  if (document.commit !== manifest.commit) {
    throw new Error(`Release attestation commit ${document.commit || 'missing'} does not match ${manifest.commit}.`);
  }
  const expectedManifestDigest = manifestDigest(manifest);
  if (document.manifestSha256 !== expectedManifestDigest) {
    throw new Error(`Release attestation manifest digest ${document.manifestSha256 || 'missing'} does not match ${expectedManifestDigest}.`);
  }
  delete document.verifiedAt;
  delete document.runtime;
  return document;
}

function stableIdentity(value) {
  if (!value || typeof value !== 'object') return '';
  return String(value['bom-ref'] || value.ref || value.purl || `${value.name || ''}@${value.version || ''}`);
}

function canonicalizeSbom(document, manifest) {
  if (document.bomFormat !== 'CycloneDX') {
    throw new Error(`Release SBOM format ${document.bomFormat || 'missing'} is not CycloneDX.`);
  }
  if (!document.specVersion) throw new Error('Release SBOM is missing its CycloneDX spec version.');
  const component = document.metadata?.component;
  if (!component || component.name !== PACKAGE_NAME) {
    throw new Error(`Release SBOM component ${component?.name || 'missing'} does not match ${PACKAGE_NAME}.`);
  }
  if (component.version !== manifest.version) {
    throw new Error(`Release SBOM version ${component.version || 'missing'} does not match ${manifest.version}.`);
  }
  if (!Array.isArray(document.components) || document.components.length === 0) {
    throw new Error('Release SBOM must contain dependency components.');
  }
  if (!Array.isArray(document.dependencies)) {
    throw new Error('Release SBOM must contain a dependency graph.');
  }
  delete document.serialNumber;
  if (document.metadata && typeof document.metadata === 'object') delete document.metadata.timestamp;
  document.components = [...document.components].sort((left, right) => compareText(stableIdentity(left), stableIdentity(right)));
  document.dependencies = document.dependencies
    .filter((dependency) => dependency && typeof dependency === 'object')
    .map((dependency) => ({
      ...dependency,
      dependsOn: [...new Set(Array.isArray(dependency.dependsOn) ? dependency.dependsOn : [])]
        .filter((entry) => typeof entry === 'string' && entry)
        .sort(compareText),
    }))
    .sort((left, right) => compareText(stableIdentity(left), stableIdentity(right)));
  return document;
}

function canonicalizeLocalReleaseAssets(directory, tag, expectedCommit) {
  if (!/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(tag)) {
    throw new Error(`Release tag ${tag || '<missing>'} is not a semantic-version tag.`);
  }
  const [archiveName, manifestName, attestationName, sbomName] = requiredAssetNames(tag);
  const archive = fs.readFileSync(path.join(directory, archiveName));
  const manifest = canonicalizeManifest(
    readJson(path.join(directory, manifestName), 'release manifest'),
    { tag, expectedCommit },
  );
  const attestation = canonicalizeAttestation(
    readJson(path.join(directory, attestationName), 'release attestation'),
    manifest,
  );
  const sbom = canonicalizeSbom(
    readJson(path.join(directory, sbomName), 'release SBOM'),
    manifest,
  );

  const canonical = new Map([
    [archiveName, archive],
    [manifestName, canonicalJsonBuffer(manifest)],
    [attestationName, canonicalJsonBuffer(attestation)],
    [sbomName, canonicalJsonBuffer(sbom)],
  ]);
  const checksum = Buffer.from(
    `${[archiveName, manifestName, attestationName, sbomName]
      .map((name) => `${digestHex(canonical.get(name))}  ${name}`)
      .join('\n')}\n`,
    'utf8',
  );
  canonical.set(CHECKSUM_ASSET, checksum);

  for (const [name, data] of canonical) {
    fs.writeFileSync(path.join(directory, name), data);
  }
  return canonical;
}

function readLocalAssets(directory, tag, { expectedCommit = process.env.EXPECTED_COMMIT } = {}) {
  const canonical = canonicalizeLocalReleaseAssets(directory, tag, expectedCommit);
  const result = new Map();
  for (const name of requiredAssetNames(tag)) {
    const file = path.join(directory, name);
    const data = canonical.get(name);
    result.set(name, {
      name,
      file,
      data,
      size: data.length,
      digest: digestBuffer(data),
      replaceable: isReplaceableMetadata(name),
    });
  }
  return result;
}

function normalizeDigest(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return /^sha256:[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

function planReleaseReconciliation(release, localAssets) {
  if (!release) {
    return {
      state: 'absent',
      upload: [...localAssets.keys()],
      replace: [],
      keep: [],
      publishDraft: false,
    };
  }

  const byName = new Map();
  for (const asset of Array.isArray(release.assets) ? release.assets : []) {
    const entries = byName.get(asset.name) || [];
    entries.push(asset);
    byName.set(asset.name, entries);
  }

  const unexpected = [...byName.keys()]
    .filter((name) => !localAssets.has(name))
    .sort(compareText);
  if (unexpected.length) {
    throw new Error(`Release contains unexpected asset(s): ${unexpected.join(', ')}.`);
  }

  const upload = [];
  const replace = [];
  const keep = [];
  for (const [name, local] of localAssets) {
    const matches = byName.get(name) || [];
    if (matches.length > 1) throw new Error(`Release contains duplicate asset name ${name}.`);
    if (matches.length === 0) {
      upload.push(name);
      continue;
    }

    const remote = matches[0];
    const remoteDigest = normalizeDigest(remote.digest);
    if (!remoteDigest) throw new Error(`Release asset ${name} is missing a verifiable SHA-256 digest.`);
    const same = remote.state === 'uploaded' && remote.size === local.size && remoteDigest === local.digest;
    if (same) {
      keep.push(name);
      continue;
    }
    if (!local.replaceable) {
      throw new Error(`Immutable release archive ${name} differs from the verified local artifact.`);
    }
    replace.push({ name, assetId: remote.id });
  }

  const needsRepair = upload.length > 0 || replace.length > 0 || release.draft === true;
  if (needsRepair && release.immutable === true) {
    throw new Error(`Release ${release.tag_name || '<unknown>'} is immutable but requires repair.`);
  }

  return {
    state: needsRepair ? 'repair' : 'complete',
    upload,
    replace,
    keep,
    publishDraft: release.draft === true,
    releaseId: release.id,
  };
}

function orderedRepairOperations(plan) {
  const missing = plan.upload
    .filter((name) => name !== CHECKSUM_ASSET)
    .sort(compareText)
    .map((name) => ({ type: 'upload', name }));
  const replacements = plan.replace
    .filter((item) => item.name !== CHECKSUM_ASSET)
    .sort((left, right) => compareText(left.name, right.name))
    .map((item) => ({ type: 'replace', name: item.name, assetId: item.assetId }));
  const checksum = [];
  if (plan.upload.includes(CHECKSUM_ASSET)) {
    checksum.push({ type: 'upload', name: CHECKSUM_ASSET });
  }
  const checksumReplacement = plan.replace.find((item) => item.name === CHECKSUM_ASSET);
  if (checksumReplacement) {
    checksum.push({ type: 'replace', name: CHECKSUM_ASSET, assetId: checksumReplacement.assetId });
  }
  return [...missing, ...replacements, ...checksum];
}

async function getReleaseByTag(github, context, tag) {
  try {
    const response = await github.rest.repos.getReleaseByTag({
      owner: context.repo.owner,
      repo: context.repo.repo,
      tag,
    });
    return response.data;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function inspectRelease({
  github,
  context,
  tag,
  directory = 'release-assets',
  expectedCommit = process.env.EXPECTED_COMMIT,
}) {
  const localAssets = readLocalAssets(directory, tag, { expectedCommit });
  const release = await getReleaseByTag(github, context, tag);
  return {
    release,
    localAssets,
    plan: planReleaseReconciliation(release, localAssets),
  };
}

function contentType(name) {
  if (name.endsWith('.tar.gz')) return 'application/gzip';
  if (name.endsWith('.json')) return 'application/json';
  return 'text/plain; charset=utf-8';
}

async function uploadAsset({ github, context, releaseId, local }) {
  const response = await github.rest.repos.uploadReleaseAsset({
    owner: context.repo.owner,
    repo: context.repo.repo,
    release_id: releaseId,
    name: local.name,
    data: local.data,
    headers: {
      'content-type': contentType(local.name),
      'content-length': local.size,
    },
  });
  const digest = normalizeDigest(response.data.digest);
  if (response.data.size !== local.size || digest !== local.digest) {
    throw new Error(`Uploaded release asset ${local.name} failed size or digest verification.`);
  }
}

async function reconcileRelease({
  github,
  context,
  tag,
  directory = 'release-assets',
  expectedCommit = process.env.EXPECTED_COMMIT,
}) {
  const inspected = await inspectRelease({ github, context, tag, directory, expectedCommit });
  const { release, localAssets, plan } = inspected;
  if (!release) throw new Error(`Release ${tag} does not exist; create it through the normal publication path.`);
  if (plan.state === 'complete') return { state: 'complete', uploaded: [], replaced: [], publishedDraft: false };

  const operations = orderedRepairOperations(plan);
  const uploaded = [];
  const replaced = [];
  for (const operation of operations) {
    if (operation.type === 'replace') {
      await github.rest.repos.deleteReleaseAsset({
        owner: context.repo.owner,
        repo: context.repo.repo,
        asset_id: operation.assetId,
      });
      replaced.push(operation.name);
    } else {
      uploaded.push(operation.name);
    }
    await uploadAsset({
      github,
      context,
      releaseId: release.id,
      local: localAssets.get(operation.name),
    });
  }

  if (plan.publishDraft) {
    await github.rest.repos.updateRelease({
      owner: context.repo.owner,
      repo: context.repo.repo,
      release_id: release.id,
      draft: false,
    });
  }

  const after = await inspectRelease({ github, context, tag, directory, expectedCommit });
  if (after.plan.state !== 'complete') {
    throw new Error(`Release ${tag} remained ${after.plan.state} after reconciliation.`);
  }
  return {
    state: 'complete',
    uploaded,
    replaced,
    publishedDraft: plan.publishDraft,
  };
}

module.exports = {
  canonicalizeAttestation,
  canonicalizeLocalReleaseAssets,
  canonicalizeManifest,
  canonicalizeSbom,
  compareText,
  digestBuffer,
  inspectRelease,
  isReplaceableMetadata,
  manifestDigest,
  normalizeDigest,
  orderedRepairOperations,
  planReleaseReconciliation,
  readLocalAssets,
  reconcileRelease,
  requiredAssetNames,
  stableManifestPayload,
};
