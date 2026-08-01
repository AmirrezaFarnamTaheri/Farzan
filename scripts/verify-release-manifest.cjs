'use strict';

const path = require('node:path');
const packageJson = require('../package.json');
const {
  resolveSourceCommit,
  verifyReleaseManifestFile,
  writeVerificationAttestation,
} = require('./releaseAttestation.cjs');

const repositoryRoot = path.join(__dirname, '..');
const artifactRoot = path.join(repositoryRoot, 'dist');
const releaseDirectory = path.join(repositoryRoot, 'reports', 'release');
const manifestFile = path.join(releaseDirectory, 'release-manifest.json');
const attestationFile = path.join(releaseDirectory, 'release-attestation.json');

try {
  const expectedCommit = resolveSourceCommit(repositoryRoot);
  const result = verifyReleaseManifestFile({
    repositoryRoot,
    artifactRoot,
    manifestFile,
    expectedVersion: packageJson.version,
    expectedCommit,
  });
  const attestation = writeVerificationAttestation({
    repositoryRoot,
    outputFile: attestationFile,
    manifestFile,
    manifest: result.manifest,
    verification: result.verification,
  });
  console.log(`[release:verify] verified ${result.verification.artifactCount} artifacts (${result.verification.manifestSha256})`);
  console.log(`[release:verify] wrote ${path.relative(repositoryRoot, attestationFile)} for ${attestation.commit}`);
} catch (error) {
  console.error('[release:verify] failed', error);
  process.exitCode = 1;
}
