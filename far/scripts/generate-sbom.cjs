const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const output = path.join(root, 'reports', 'release', 'sbom.cdx.json');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const PACKAGE_PATH_PROPERTY = 'cdx:npm:package:path';
const MERGED_PATHS_PROPERTY = 'opencoursedeck:npm:package:paths';

function packagePaths(component) {
  const paths = [];
  for (const property of Array.isArray(component?.properties) ? component.properties : []) {
    if (property?.name === PACKAGE_PATH_PROPERTY && typeof property.value === 'string') paths.push(property.value);
    if (property?.name === MERGED_PATHS_PROPERTY && typeof property.value === 'string') {
      try {
        const parsed = JSON.parse(property.value);
        if (Array.isArray(parsed)) paths.push(...parsed.filter(value => typeof value === 'string'));
      } catch {}
    }
  }
  return [...new Set(paths)].sort((a, b) => a.length - b.length || a.localeCompare(b));
}

function mergeProperties(components) {
  const paths = [...new Set(components.flatMap(packagePaths))]
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
  const properties = [];
  const seen = new Set();
  for (const component of components) {
    for (const property of Array.isArray(component?.properties) ? component.properties : []) {
      if (property?.name === PACKAGE_PATH_PROPERTY || property?.name === MERGED_PATHS_PROPERTY) continue;
      const identity = JSON.stringify(property);
      if (seen.has(identity)) continue;
      seen.add(identity);
      properties.push(property);
    }
  }
  if (paths.length) properties.push({ name: PACKAGE_PATH_PROPERTY, value: paths[0] });
  if (paths.length > 1) properties.push({ name: MERGED_PATHS_PROPERTY, value: JSON.stringify(paths) });
  return properties;
}

function deduplicateLogicalComponents(document) {
  const components = Array.isArray(document.components) ? document.components : [];
  const componentGroups = new Map();
  for (const component of components) {
    const ref = component?.['bom-ref'];
    if (typeof ref !== 'string' || !ref) continue;
    const group = componentGroups.get(ref) || [];
    group.push(component);
    componentGroups.set(ref, group);
  }

  document.components = [...componentGroups.entries()].map(([ref, group]) => {
    const first = group[0];
    for (const component of group.slice(1)) {
      for (const field of ['name', 'version', 'purl', 'type']) {
        if ((component?.[field] ?? null) !== (first?.[field] ?? null)) {
          throw new Error(`npm sbom reused bom-ref ${ref} for incompatible ${field} values`);
        }
      }
    }
    const properties = mergeProperties(group);
    return {
      ...first,
      ...(properties.length ? { properties } : { properties: undefined }),
    };
  });

  const dependencyGroups = new Map();
  for (const dependency of Array.isArray(document.dependencies) ? document.dependencies : []) {
    const ref = dependency?.ref;
    if (typeof ref !== 'string' || !ref) continue;
    const dependsOn = dependencyGroups.get(ref) || new Set();
    for (const child of Array.isArray(dependency.dependsOn) ? dependency.dependsOn : []) dependsOn.add(child);
    dependencyGroups.set(ref, dependsOn);
  }
  document.dependencies = [...dependencyGroups.entries()].map(([ref, dependsOn]) => ({
    ref,
    dependsOn: [...dependsOn].sort(),
  }));
  return document;
}

function normalizeRootDependency(document, rootRef, legacyRefs) {
  const dependencies = Array.isArray(document.dependencies) ? document.dependencies : [];
  const candidates = new Set([rootRef, ...legacyRefs].filter(Boolean));
  const rootEntries = dependencies.filter(entry => candidates.has(entry?.ref));
  const rootDependsOn = [...new Set(rootEntries.flatMap(entry => (
    Array.isArray(entry?.dependsOn) ? entry.dependsOn : []
  )))].sort();
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
  const document = deduplicateLogicalComponents(JSON.parse(result.stdout));
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
    console.log(`[release-sbom] wrote ${path.relative(root, output)} with ${document.components?.length || 0} logical components`);
  } catch (error) {
    console.error('[release-sbom] failed', error);
    process.exit(1);
  }
}

module.exports = {
  deduplicateLogicalComponents,
  generateSbom,
  normalizeRootDependency,
  output,
  packagePaths,
};
