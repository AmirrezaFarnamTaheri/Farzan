'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { atomicWrite, ensureDirectory } = require('./fsSafe.cjs');
const { createManifest, manifestDigest, verifyManifest } = require('./releaseManifest.cjs');

function resolveSourceCommit(repositoryRoot) {
  const environmentCommit = String(process.env.GITHUB_SHA || process.env.SOURCE_VERSION || '').trim();
  if (/^[0-9a-f]{7,64}$/i.test(environmentCommit)) return environmentCommit.toLowerCase();

  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000,
  });
  const commit = String(result.stdout || '').trim();
  if (result.error || result.status !== 0 || !/^[0-9a-f]{40}$/i.test(commit)) {
    throw new Error('Unable to resolve the source commit for release attestation');
  }
  return commit.toLowerCase();
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read JSON from ${file}`, { cause: error });
  }
}

function writeReleaseManifest({
  repositoryRoot,
  artifactRoot,
  outputFile,
  version,
  product = 'OpenCourseDeck',
  commit = resolveSourceCommit(repositoryRoot),
  artifactLabel = path.relative(repositoryRoot, artifactRoot),
} = {}) {
  if (!repositoryRoot || !artifactRoot || !outputFile) {
    throw new TypeError('writeReleaseManifest requires repositoryRoot, artifactRoot, and outputFile');
  }
  if (!fs.existsSync(artifactRoot) || !fs.statSync(artifactRoot).isDirectory()) {
    throw new Error(`Release artifact root is missing: ${artifactRoot}`);
  }
  const manifest = createManifest({
    root: artifactRoot,
    version,
    commit,
    product,
    artifactRoot: artifactLabel,
  });
  ensureDirectory(path.dirname(outputFile), { root: repositoryRoot });
  atomicWrite(outputFile, `${JSON.stringify(manifest, null, 2)}\n`, { root: repositoryRoot });
  return {
    manifest,
    outputFile,
    manifestSha256: manifestDigest(manifest),
  };
}

function verifyReleaseManifestFile({
  repositoryRoot,
  artifactRoot,
  manifestFile,
  expectedVersion,
  expectedCommit,
  exact = true,
} = {}) {
  if (!repositoryRoot || !artifactRoot || !manifestFile) {
    throw new TypeError('verifyReleaseManifestFile requires repositoryRoot, artifactRoot, and manifestFile');
  }
  const manifest = readJson(manifestFile);
  if (expectedVersion !== undefined && manifest.version !== String(expectedVersion)) {
    throw new Error(`Release manifest version mismatch: expected ${expectedVersion}, got ${manifest.version}`);
  }
  if (expectedCommit !== undefined && manifest.commit !== String(expectedCommit).toLowerCase()) {
    throw new Error(`Release manifest commit mismatch: expected ${expectedCommit}, got ${manifest.commit}`);
  }
  const verification = verifyManifest(manifest, { root: artifactRoot, exact });
  return { manifest, verification };
}

function writeVerificationAttestation({
  repositoryRoot,
  outputFile,
  manifestFile,
  manifest,
  verification,
} = {}) {
  if (!repositoryRoot || !outputFile || !manifestFile || !manifest || !verification) {
    throw new TypeError('writeVerificationAttestation requires all release verification inputs');
  }
  const attestation = {
    schemaVersion: 1,
    kind: 'opencoursedeck-release-verification',
    product: manifest.product,
    version: manifest.version,
    commit: manifest.commit,
    artifactRoot: manifest.artifactRoot,
    artifactCount: verification.artifactCount,
    manifest: path.relative(repositoryRoot, manifestFile).split(path.sep).join('/'),
    manifestSha256: verification.manifestSha256,
    verified: verification.verified === true,
    verifiedAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      ci: process.env.CI === 'true',
    },
  };
  ensureDirectory(path.dirname(outputFile), { root: repositoryRoot });
  atomicWrite(outputFile, `${JSON.stringify(attestation, null, 2)}\n`, { root: repositoryRoot });
  return attestation;
}

module.exports = {
  readJson,
  resolveSourceCommit,
  verifyReleaseManifestFile,
  writeReleaseManifest,
  writeVerificationAttestation,
};
