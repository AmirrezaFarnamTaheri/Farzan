'use strict';

const path = require('node:path');
const packageJson = require('../package.json');
const { writeReleaseManifest } = require('./releaseAttestation.cjs');

const repositoryRoot = path.join(__dirname, '..');
const artifactRoot = path.join(repositoryRoot, 'dist');
const outputFile = path.join(repositoryRoot, 'reports', 'release', 'release-manifest.json');

try {
  const result = writeReleaseManifest({
    repositoryRoot,
    artifactRoot,
    outputFile,
    version: packageJson.version,
    artifactLabel: 'dist',
  });
  console.log(`[release:manifest] wrote ${path.relative(repositoryRoot, outputFile)} (${result.manifest.artifactCount} artifacts, ${result.manifestSha256})`);
} catch (error) {
  console.error('[release:manifest] failed', error);
  process.exitCode = 1;
}
