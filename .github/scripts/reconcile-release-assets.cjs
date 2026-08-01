'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REPLACEABLE_SUFFIXES = new Set([
  '-attestation.json',
  '-sbom.cdx.json',
]);
const CHECKSUM_ASSET = 'SHA256SUMS';

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

function readLocalAssets(directory, tag) {
  const result = new Map();
  for (const name of requiredAssetNames(tag)) {
    const file = path.join(directory, name);
    const data = fs.readFileSync(file);
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
      throw new Error(`Immutable release payload ${name} differs from the verified local artifact.`);
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

async function inspectRelease({ github, context, tag, directory = 'release-assets' }) {
  const localAssets = readLocalAssets(directory, tag);
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

async function reconcileRelease({ github, context, tag, directory = 'release-assets' }) {
  const inspected = await inspectRelease({ github, context, tag, directory });
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

  const after = await inspectRelease({ github, context, tag, directory });
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
  compareText,
  digestBuffer,
  inspectRelease,
  isReplaceableMetadata,
  normalizeDigest,
  orderedRepairOperations,
  planReleaseReconciliation,
  readLocalAssets,
  reconcileRelease,
  requiredAssetNames,
};
