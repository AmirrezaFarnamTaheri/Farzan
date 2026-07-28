'use strict';

/**
 * Narrow filesystem boundary helpers for build/release tooling.
 *
 * Policy: validate containment before mutation and promote through atomic rename.
 */

const fs = require('node:fs');
const path = require('node:path');

function canonical(value) {
  return fs.realpathSync.native(path.resolve(value));
}

function assertContained(target, root) {
  const resolvedTarget = path.resolve(target);
  const resolvedRoot = path.resolve(root);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Unsafe filesystem target outside root: ${resolvedTarget}`);
  }
}

function atomicWrite(file, content) {
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, content);
  fs.renameSync(temp, file);
}

module.exports = {
  canonical,
  assertContained,
  atomicWrite,
};
