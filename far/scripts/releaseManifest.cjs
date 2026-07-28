'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function createArtifactRecord(file) {
  const stat = fs.statSync(file);
  return {
    path: file,
    size: stat.size,
    sha256: hashFile(file),
  };
}

function createManifest({ version, commit, artifacts = [] }) {
  return {
    version,
    commit,
    generatedAt: new Date().toISOString(),
    artifacts: artifacts.map(createArtifactRecord),
  };
}

module.exports = {
  createArtifactRecord,
  createManifest,
};
