'use strict';

const path = require('node:path');
const packageJson = require('../package.json');
const { verifyReleaseManifestFile } = require('./releaseAttestation.cjs');

const repositoryRoot = path.join(__dirname, '..');
const artifactRoot = path.join(repositoryRoot, 'dist');
const manifestFile = path.join(repositoryRoot, 'reports', 'release', 'release-manifest.json');

try {
  const result = verifyReleaseManifestFile({
    repositoryRoot,
    artifactRoot,
    manifestFile,
    expectedVersion: packageJson.version,
  });
  console.log(`[release:verify] verified ${result.verification.artifactCount} artifacts (${result.verification.manifestSha256})`);
} catch (error) {
  console.error('[release:verify] failed', error);
  process.exitCode = 1;
}
