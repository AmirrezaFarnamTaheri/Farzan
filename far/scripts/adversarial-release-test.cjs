'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createManifest, verifyManifest } = require('./releaseManifest.cjs');
const { atomicReplaceDirectory, atomicWrite } = require('./fsSafe.cjs');

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

  const commit = '0123456789abcdef0123456789abcdef01234567';
  const manifest = createManifest({
    root: path.join(root, 'dist'),
    version: 'test',
    commit,
  });

  assert.equal(verifyManifest(manifest, { root: path.join(root, 'dist'), expectedCommit: commit }).verified, true);
  expectFailure(() => createManifest({ root: path.join(root, 'dist'), version: 'test', commit: 'deadbeef' }), 'short commit must fail');
  expectFailure(() => verifyManifest(manifest, { root: path.join(root, 'dist'), expectedCommit: 'deadbeef' }), 'short expected commit must fail');

  fs.writeFileSync(path.join(root, 'dist', 'app.js'), 'tampered');
  expectFailure(() => verifyManifest(manifest, { root: path.join(root, 'dist') }), 'tampered bytes must fail');

  atomicWrite(path.join(root, 'dist', 'app.js'), 'release-bytes', { root });
  fs.writeFileSync(path.join(root, 'dist', 'extra.js'), 'extra');
  expectFailure(() => verifyManifest(manifest, { root: path.join(root, 'dist') }), 'extra artifact must fail');

  fs.rmSync(path.join(root, 'dist', 'extra.js'));
  fs.mkdirSync(path.join(root, 'outside'));
  fs.symlinkSync(path.join(root, 'outside'), path.join(root, 'dist', 'escape'));
  expectFailure(() => createManifest({ root: path.join(root, 'dist'), version: 'test', commit }), 'symlink artifact must fail');
  fs.rmSync(path.join(root, 'dist', 'escape'));

  fs.symlinkSync(path.join(root, 'outside'), path.join(root, 'linked-dist'));
  expectFailure(() => createManifest({ root: path.join(root, 'linked-dist'), version: 'test', commit }), 'symlink root must fail');
  fs.rmSync(path.join(root, 'linked-dist'));

  const staged = path.join(root, 'staged');
  const target = path.join(root, 'target');
  fs.mkdirSync(staged);
  fs.mkdirSync(target);
  atomicWrite(path.join(staged, 'app.js'), 'new', { root });
  atomicWrite(path.join(target, 'app.js'), 'old', { root });
  const replacement = atomicReplaceDirectory(staged, target, { root });
  assert.equal(replacement, target);
  assert.equal(fs.readFileSync(path.join(target, 'app.js'), 'utf8'), 'new');

  console.log('[adversarial-release-test] all negative paths passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
