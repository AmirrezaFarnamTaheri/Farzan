'use strict';

/**
 * Filesystem mutation boundary for build and release tooling.
 *
 * Invariants:
 * - every destructive target is contained by a caller-supplied trusted root;
 * - existing symlink ancestors are resolved before mutation;
 * - files are written/copies are promoted by same-directory rename;
 * - directory promotion preserves the previous output until the new tree is ready.
 */

const fs = require('node:fs');
const path = require('node:path');

function canonical(value) {
  return fs.realpathSync.native(path.resolve(value));
}

function nearestExisting(value) {
  let current = path.resolve(value);
  for (;;) {
    if (fs.existsSync(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`No existing ancestor for path: ${value}`);
    current = parent;
  }
}

function isInside(target, root, allowRoot = true) {
  const relative = path.relative(root, target);
  return (allowRoot && relative === '')
    || (relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function assertContained(target, root, { allowRoot = true, mustExist = false } = {}) {
  const resolvedTarget = path.resolve(target);
  const resolvedRoot = canonical(root);
  if (mustExist && !fs.existsSync(resolvedTarget)) throw new Error(`Filesystem target does not exist: ${resolvedTarget}`);

  if (!isInside(resolvedTarget, path.resolve(root), allowRoot)) {
    throw new Error(`Unsafe filesystem target outside root: ${resolvedTarget}`);
  }

  const existingAncestor = nearestExisting(resolvedTarget);
  const canonicalAncestor = canonical(existingAncestor);
  if (!isInside(canonicalAncestor, resolvedRoot, allowRoot)) {
    throw new Error(`Unsafe filesystem target traverses outside root through a symlink: ${resolvedTarget}`);
  }

  if (fs.existsSync(resolvedTarget)) {
    const canonicalTarget = canonical(resolvedTarget);
    if (!isInside(canonicalTarget, resolvedRoot, allowRoot)) {
      throw new Error(`Unsafe canonical filesystem target outside root: ${canonicalTarget}`);
    }
  }
  return resolvedTarget;
}

function ensureDirectory(directory, { root = path.dirname(directory), mode = 0o755 } = {}) {
  const safeDirectory = assertContained(directory, root);
  fs.mkdirSync(safeDirectory, { recursive: true, mode });
  assertContained(safeDirectory, root, { mustExist: true });
  return safeDirectory;
}

function syncDirectory(directory) {
  let descriptor;
  try {
    descriptor = fs.openSync(directory, 'r');
    fs.fsyncSync(descriptor);
  } catch {
    // Directory fsync is not supported by every platform/filesystem.
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function atomicWrite(file, content, {
  root = path.dirname(file),
  encoding = typeof content === 'string' ? 'utf8' : undefined,
  mode = 0o644,
} = {}) {
  const safeFile = assertContained(file, root);
  const parent = ensureDirectory(path.dirname(safeFile), { root });
  const temp = path.join(parent, `.${path.basename(safeFile)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  assertContained(temp, root);
  let descriptor;
  try {
    descriptor = fs.openSync(temp, 'wx', mode);
    fs.writeFileSync(descriptor, content, encoding ? { encoding } : undefined);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temp, safeFile);
    syncDirectory(parent);
    return safeFile;
  } catch (error) {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch {}
    }
    try { fs.rmSync(temp, { force: true }); } catch {}
    throw error;
  }
}

function atomicCopy(source, destination, { root = path.dirname(destination), mode } = {}) {
  const safeSource = path.resolve(source);
  const sourceStat = fs.lstatSync(safeSource);
  if (sourceStat.isSymbolicLink() || !sourceStat.isFile()) {
    throw new Error(`Copy source is not a regular file: ${safeSource}`);
  }
  return atomicWrite(destination, fs.readFileSync(safeSource), {
    root,
    mode: mode ?? (sourceStat.mode & 0o777),
  });
}

function copyTree(source, destination, { root } = {}) {
  if (!root) throw new TypeError('copyTree requires a trusted destination root');
  const sourceRoot = path.resolve(source);
  const sourceStat = fs.lstatSync(sourceRoot);
  if (sourceStat.isSymbolicLink() || !sourceStat.isDirectory()) {
    throw new Error(`Copy source is not a regular directory: ${sourceRoot}`);
  }
  const safeDestination = ensureDirectory(destination, { root });
  const visit = (from, to) => {
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      const sourcePath = path.join(from, entry.name);
      const destinationPath = path.join(to, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Copy source tree contains a symlink: ${sourcePath}`);
      if (entry.isDirectory()) {
        ensureDirectory(destinationPath, { root });
        visit(sourcePath, destinationPath);
      } else if (entry.isFile()) {
        atomicCopy(sourcePath, destinationPath, { root });
      } else {
        throw new Error(`Copy source tree contains an unsupported entry: ${sourcePath}`);
      }
    }
  };
  visit(sourceRoot, safeDestination);
  return safeDestination;
}

function removeTree(target, { root, allowRoot = false } = {}) {
  if (!root) throw new TypeError('removeTree requires a trusted root');
  const safeTarget = assertContained(target, root, { allowRoot });
  fs.rmSync(safeTarget, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}

function atomicReplaceDirectory(stagedDirectory, targetDirectory, { root } = {}) {
  if (!root) throw new TypeError('atomicReplaceDirectory requires a trusted root');
  const staged = assertContained(stagedDirectory, root, { allowRoot: false, mustExist: true });
  const target = assertContained(targetDirectory, root, { allowRoot: false });
  const stagedStat = fs.lstatSync(staged);
  if (stagedStat.isSymbolicLink() || !stagedStat.isDirectory()) {
    throw new Error(`Staged output is not a regular directory: ${staged}`);
  }
  if (fs.existsSync(target)) {
    const targetStat = fs.lstatSync(target);
    if (targetStat.isSymbolicLink() || !targetStat.isDirectory()) {
      throw new Error(`Replacement target is not a regular directory: ${target}`);
    }
  }

  ensureDirectory(path.dirname(target), { root });
  const backup = `${target}.previous-${process.pid}-${Date.now()}`;
  assertContained(backup, root, { allowRoot: false });
  let movedPrevious = false;
  try {
    if (fs.existsSync(target)) {
      fs.renameSync(target, backup);
      movedPrevious = true;
    }
    fs.renameSync(staged, target);
    syncDirectory(path.dirname(target));
    if (movedPrevious) removeTree(backup, { root });
    return target;
  } catch (error) {
    try {
      if (!fs.existsSync(target) && movedPrevious && fs.existsSync(backup)) fs.renameSync(backup, target);
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }
    throw error;
  }
}

module.exports = {
  assertContained,
  atomicCopy,
  atomicReplaceDirectory,
  atomicWrite,
  canonical,
  copyTree,
  ensureDirectory,
  removeTree,
};
