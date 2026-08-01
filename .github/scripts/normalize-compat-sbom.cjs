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

function stableIdentity(value) {
  if (!value || typeof value !== 'object') return '';
  return String(value['bom-ref'] || value.ref || value.purl || `${value.name || ''}@${value.version || ''}`);
}

function normalizeCompatibilitySbom(document, pkg) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('CycloneDX SBOM document must be an object.');
  }
  if (document.bomFormat !== 'CycloneDX') {
    throw new Error(`Compatibility SBOM format ${document.bomFormat || 'missing'} is not CycloneDX.`);
  }
  if (!Array.isArray(document.components) || document.components.length === 0) {
    throw new Error('Compatibility SBOM must contain dependency components.');
  }
  if (!Array.isArray(document.dependencies)) {
    throw new Error('Compatibility SBOM must contain a dependency graph.');
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

  delete document.serialNumber;
  delete document.metadata.timestamp;

  const rootChildren = new Set();
  const retained = [];

  for (const dependency of document.dependencies) {
    if (!dependency || typeof dependency !== 'object') continue;
    if (legacyRefs.has(dependency.ref)) {
      for (const child of Array.isArray(dependency.dependsOn) ? dependency.dependsOn : []) {
        if (typeof child === 'string' && child && !legacyRefs.has(child)) rootChildren.add(child);
      }
      continue;
    }

    const dependsOn = [...new Set((Array.isArray(dependency.dependsOn) ? dependency.dependsOn : [])
      .map((child) => legacyRefs.has(child) ? rootRef : child)
      .filter((child) => typeof child === 'string' && child && child !== dependency.ref))]
      .sort();
    retained.push({ ...dependency, dependsOn });
  }

  document.components = [...document.components].sort((left, right) => stableIdentity(left).localeCompare(stableIdentity(right)));
  retained.sort((left, right) => stableIdentity(left).localeCompare(stableIdentity(right)));
  document.dependencies = [
    { ref: rootRef, dependsOn: [...rootChildren].sort() },
    ...retained,
  ];
  return document;
}

function normalizeCompatibilityAttestation(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('Release attestation document must be an object.');
  }
  if (document.verified !== true) {
    throw new Error('Compatibility release attestation must already be verified.');
  }
  delete document.verifiedAt;
  delete document.runtime;
  return document;
}

function normalizeAttestationFile(attestationFile) {
  const attestation = JSON.parse(fs.readFileSync(attestationFile, 'utf8'));
  fs.writeFileSync(
    attestationFile,
    `${JSON.stringify(normalizeCompatibilityAttestation(attestation), null, 2)}\n`,
    'utf8',
  );
}

function normalizeFile(sbomFile, packageFile, attestationFile) {
  const document = JSON.parse(fs.readFileSync(sbomFile, 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  const originalName = document?.metadata?.component?.name || 'missing';
  const normalized = normalizeCompatibilitySbom(document, pkg);
  fs.writeFileSync(sbomFile, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');

  if (attestationFile) normalizeAttestationFile(attestationFile);

  return {
    originalName,
    normalizedName: normalized.metadata.component.name,
    relativePath: path.relative(process.cwd(), sbomFile) || sbomFile,
  };
}

function main() {
  const sbomFile = path.resolve(process.argv[2] || 'reports/release/sbom.cdx.json');
  const packageFile = path.resolve(process.argv[3] || 'package.json');
  const explicitAttestation = process.argv[4] ? path.resolve(process.argv[4]) : null;
  const result = normalizeFile(sbomFile, packageFile, explicitAttestation);
  const candidates = explicitAttestation ? [] : [
    path.resolve('reports/release/release-attestation.json'),
    process.env.RELEASE_TAG
      ? path.resolve(`release-assets/opencoursedeck-${process.env.RELEASE_TAG}-attestation.json`)
      : null,
  ].filter((file) => file && fs.existsSync(file));
  for (const file of candidates) normalizeAttestationFile(file);
  console.log(`[compat-sbom] normalized ${result.relativePath} root ${result.originalName} -> ${result.normalizedName}`);
  if (explicitAttestation || candidates.length) console.log('[compat-sbom] removed run-specific compatibility attestation metadata');
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
  normalizeAttestationFile,
  normalizeCompatibilityAttestation,
  normalizeCompatibilitySbom,
  normalizeFile,
  packageIdentity,
};
