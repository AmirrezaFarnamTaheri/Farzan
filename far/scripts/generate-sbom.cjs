const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const output = path.join(root, 'reports', 'release', 'sbom.cdx.json');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function normalizeRootDependency(document, rootRef, legacyRefs) {
  const dependencies = Array.isArray(document.dependencies) ? document.dependencies : [];
  const candidates = new Set([rootRef, ...legacyRefs].filter(Boolean));
  const rootEntries = dependencies.filter(entry => candidates.has(entry?.ref));
  const rootDependsOn = [...new Set(rootEntries.flatMap(entry => (
    Array.isArray(entry?.dependsOn) ? entry.dependsOn : []
  )))];
  const remaining = dependencies.filter(entry => !candidates.has(entry?.ref));
  document.dependencies = [{ ref: rootRef, dependsOn: rootDependsOn }, ...remaining];
}

function generateSbom({ cwd = root, destination = output, spawn = childProcess.spawnSync } = {}) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawn(npm, [
    'sbom',
    '--sbom-format', 'cyclonedx',
    '--sbom-type', 'application',
  ], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`npm sbom failed (${result.status}): ${result.error?.message || result.stderr || result.stdout}`);
  }
  const document = JSON.parse(result.stdout);
  document.metadata = document.metadata || {};
  const originalComponent = document.metadata.component || {};
  const rootRef = `pkg:npm/${pkg.name}@${pkg.version}`;
  document.metadata.component = {
    ...originalComponent,
    type: 'application',
    name: pkg.name,
    version: pkg.version,
    purl: rootRef,
    'bom-ref': rootRef,
  };
  normalizeRootDependency(document, rootRef, [
    originalComponent['bom-ref'],
    originalComponent.purl,
    `${pkg.name}@${pkg.version}`,
  ]);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  return document;
}

if (require.main === module) {
  try {
    const document = generateSbom();
    console.log(`[release-sbom] wrote ${path.relative(root, output)} with ${document.components?.length || 0} components`);
  } catch (error) {
    console.error('[release-sbom] failed', error);
    process.exit(1);
  }
}

module.exports = { generateSbom, normalizeRootDependency, output };
