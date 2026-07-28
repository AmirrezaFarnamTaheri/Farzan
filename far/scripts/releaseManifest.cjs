'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertContained } = require('./fsSafe.cjs');

const SCHEMA_VERSION = 1;

function hashBytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hashFile(file) {
  return hashBytes(fs.readFileSync(file));
}

function portablePath(value) {
  return value.split(path.sep).join('/');
}

function collectArtifactFiles(root) {
  const canonicalRoot = fs.realpathSync.native(path.resolve(root));
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = assertContained(path.join(directory, entry.name), canonicalRoot, { mustExist: true });
      if (entry.isSymbolicLink()) throw new Error(`Release artifacts must not contain symlinks: ${fullPath}`);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) files.push(fullPath);
      else throw new Error(`Unsupported release artifact type: ${fullPath}`);
    }
  };
  visit(canonicalRoot);
  return files;
}

function createArtifactRecord(file, { root = path.dirname(file) } = {}) {
  const artifactRoot = fs.realpathSync.native(path.resolve(root));
  const safeFile = assertContained(file, artifactRoot, { allowRoot: false, mustExist: true });
  const stat = fs.statSync(safeFile);
  if (!stat.isFile()) throw new Error(`Release artifact is not a regular file: ${safeFile}`);
  return {
    path: portablePath(path.relative(artifactRoot, safeFile)),
    size: stat.size,
    mode: stat.mode & 0o777,
    sha256: hashFile(safeFile),
  };
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
  return hashBytes(Buffer.from(`${JSON.stringify(stableManifestPayload(manifest))}\n`, 'utf8'));
}

function createManifest({
  root,
  version,
  commit,
  product = 'OpenCourseDeck',
  artifactRoot = 'dist',
  generatedAt = new Date().toISOString(),
  artifacts,
} = {}) {
  if (!root) throw new TypeError('createManifest requires an artifact root');
  const artifactFiles = artifacts || collectArtifactFiles(root);
  const records = artifactFiles
    .map(file => createArtifactRecord(file, { root }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const duplicate = records.find((record, index) => records[index - 1]?.path === record.path);
  if (duplicate) throw new Error(`Duplicate release artifact path: ${duplicate.path}`);
  return {
    schemaVersion: SCHEMA_VERSION,
    product,
    version: String(version || ''),
    commit: String(commit || ''),
    artifactRoot: portablePath(String(artifactRoot || 'dist')),
    generatedAt,
    artifactCount: records.length,
    artifacts: records,
  };
}

function verifyManifest(manifest, { root, exact = true } = {}) {
  if (!root) throw new TypeError('verifyManifest requires an artifact root');
  if (!manifest || manifest.schemaVersion !== SCHEMA_VERSION) throw new Error('Unsupported release manifest schema');
  if (!Array.isArray(manifest.artifacts)) throw new Error('Release manifest artifacts must be an array');
  if (manifest.artifactCount !== manifest.artifacts.length) throw new Error('Release manifest artifactCount is incorrect');

  const artifactRoot = fs.realpathSync.native(path.resolve(root));
  const seen = new Set();
  const verified = [];
  for (const expected of manifest.artifacts) {
    const relative = String(expected?.path || '');
    if (!relative || relative.includes('\\')) throw new Error(`Invalid release artifact path: ${relative || '(empty)'}`);
    if (seen.has(relative)) throw new Error(`Duplicate release artifact path: ${relative}`);
    seen.add(relative);
    const fullPath = assertContained(path.join(artifactRoot, ...relative.split('/')), artifactRoot, { allowRoot: false, mustExist: true });
    const stat = fs.lstatSync(fullPath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Release artifact is not a regular file: ${relative}`);
    const actual = createArtifactRecord(fullPath, { root: artifactRoot });
    if (actual.size !== expected.size) throw new Error(`Release artifact size mismatch: ${relative}`);
    if (actual.sha256 !== expected.sha256) throw new Error(`Release artifact hash mismatch: ${relative}`);
    if (actual.mode !== expected.mode) throw new Error(`Release artifact mode mismatch: ${relative}`);
    verified.push(relative);
  }

  if (exact) {
    const actualPaths = collectArtifactFiles(artifactRoot)
      .map(file => portablePath(path.relative(artifactRoot, file)))
      .sort();
    const expectedPaths = [...seen].sort();
    const extras = actualPaths.filter(file => !seen.has(file));
    const missing = expectedPaths.filter(file => !actualPaths.includes(file));
    if (extras.length || missing.length) {
      const details = [
        extras.length ? `extra: ${extras.join(', ')}` : '',
        missing.length ? `missing: ${missing.join(', ')}` : '',
      ].filter(Boolean).join('; ');
      throw new Error(`Release artifact coverage mismatch (${details})`);
    }
  }

  return {
    verified: true,
    artifactCount: verified.length,
    manifestSha256: manifestDigest(manifest),
  };
}

module.exports = {
  SCHEMA_VERSION,
  collectArtifactFiles,
  createArtifactRecord,
  createManifest,
  hashFile,
  manifestDigest,
  verifyManifest,
};
