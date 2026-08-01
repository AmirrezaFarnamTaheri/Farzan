'use strict';

const fs = require('node:fs');
const path = require('node:path');

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function packageIdentity(pkg) {
  const name = nonEmptyString(pkg?.name);
  const version = nonEmptyString(pkg?.version);
  if (!name || !version) {
    throw new Error('Package metadata must contain non-empty name and version fields.');
  }
  return { name, version, rootRef: `pkg:npm/${name}@${version}` };
}

function normalizeCompatibilitySbom(document, pkg) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('CycloneDX SBOM document must be an object.');
  }
  if (document.bomFormat !== 'CycloneDX') {
    throw new Error(`Compatibility SBOM format ${document.bomFormat || 'missing'} is not CycloneDX.`);
  }

  const { name, version, rootRef } = packageIdentity(pkg);
  document.metadata = document.metadata && typeof document.metadata === 'object'
    ? document.metadata
    : {};

  const originalComponent = document.metadata.component && typeof document.metadata.component === 'object'
    ? document.metadata.component
    : {};
  const legacyRefs = new Set([
    nonEmptyString(originalComponent['bom-ref']),
    nonEmptyString(originalComponent.purl),
    nonEmptyString(originalComponent.name) && nonEmptyString(originalComponent.version)
      ? `${originalComponent.name}@${originalComponent.version}`
      : null,
    rootRef,
  ].filter(Boolean));

  document.metadata.component = {
    ...originalComponent,
    type: 'application',
    name,
    version,
    purl: rootRef,
    'bom-ref': rootRef,
  };

  const dependencies = Array.isArray(document.dependencies) ? document.dependencies : [];
  const rootChildren = new Set();
  const retained = [];

  for (const dependency of dependencies) {
    if (!dependency || typeof dependency !== 'object') continue;
    if (legacyRefs.has(dependency.ref)) {
      for (const child of Array.isArray(dependency.dependsOn) ? dependency.dependsOn : []) {
        if (typeof child === 'string' && child && !legacyRefs.has(child)) rootChildren.add(child);
      }
      continue;
    }

    const dependsOn = [...new Set((Array.isArray(dependency.dependsOn) ? dependency.dependsOn : [])
      .map(child => legacyRefs.has(child) ? rootRef : child)
      .filter(child => typeof child === 'string' && child && child !== dependency.ref))]
      .sort();
    retained.push({ ...dependency, dependsOn });
  }

  document.dependencies = [
    { ref: rootRef, dependsOn: [...rootChildren].sort() },
    ...retained,
  ];
  return document;
}

function normalizeFile(sbomFile, packageFile) {
  const document = JSON.parse(fs.readFileSync(sbomFile, 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  const originalName = document?.metadata?.component?.name || 'missing';
  const normalized = normalizeCompatibilitySbom(document, pkg);
  fs.writeFileSync(sbomFile, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return {
    originalName,
    normalizedName: normalized.metadata.component.name,
    relativePath: path.relative(process.cwd(), sbomFile) || sbomFile,
  };
}

function main() {
  const sbomFile = path.resolve(process.argv[2] || 'reports/release/sbom.cdx.json');
  const packageFile = path.resolve(process.argv[3] || 'package.json');
  const result = normalizeFile(sbomFile, packageFile);
  console.log(`[compat-sbom] normalized ${result.relativePath} root ${result.originalName} -> ${result.normalizedName}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('[compat-sbom] failed', error);
    process.exit(1);
  }
}

module.exports = {
  normalizeCompatibilitySbom,
  normalizeFile,
  packageIdentity,
};
