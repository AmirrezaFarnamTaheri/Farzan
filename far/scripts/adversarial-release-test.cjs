'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createManifest, verifyManifest } = require('./releaseManifest.cjs');
const { atomicWrite } = require('./fsSafe.cjs');

function tempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opencoursedeck-release-test-'));
}

function expectFailure(fn, message) {
  assert.throws(fn, message);
}

const root = tempDirectory();
try {
  fs.mkdirSync(path.join(root, 'dist'));
  atomicWrite(path.join(root, 'dist', 'app.js'), 'release-bytes', { root });

  const manifest = createManifest({
    root: path.join(root, 'dist'),
    version: 'test',
    commit: 'deadbeef',
  });

  assert.equal(verifyManifest(manifest, { root: path.join(root, 'dist') }).verified, true);

  fs.writeFileSync(path.join(root, 'dist', 'app.js'), 'tampered');
  expectFailure(() => verifyManifest(manifest, { root: path.join(root, 'dist') }), 'tampered bytes must fail');

  atomicWrite(path.join(root, 'dist', 'app.js'), 'release-bytes', { root });
  fs.writeFileSync(path.join(root, 'dist', 'extra.js'), 'extra');
  expectFailure(() => verifyManifest(manifest, { root: path.join(root, 'dist') }), 'extra artifact must fail');

  fs.rmSync(path.join(root, 'dist', 'extra.js'));
  fs.symlinkSync(path.join(root, 'outside'), path.join(root, 'dist', 'escape'));
  expectFailure(() => createManifest({ root: path.join(root, 'dist'), version: 'test', commit: 'deadbeef' }), 'symlink artifact must fail');

  console.log('[adversarial-release-test] all negative paths passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
