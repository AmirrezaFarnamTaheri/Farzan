const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const defaultFile = path.join(root, 'reports', 'release', 'sbom.cdx.json');

function verifySbom(document, pkg = require('../package.json')) {
  const errors = [];
  if (!document || typeof document !== 'object') errors.push('document must be an object');
  if (document?.bomFormat !== 'CycloneDX') errors.push('bomFormat must be CycloneDX');
  if (typeof document?.specVersion !== 'string' || !document.specVersion) errors.push('specVersion is missing');
  if (!document?.serialNumber?.startsWith('urn:uuid:')) errors.push('serialNumber must be a CycloneDX UUID URN');
  if (!Number.isInteger(document?.version) || document.version < 1) errors.push('document version must be a positive integer');
  if (document?.metadata?.component?.name !== pkg.name) errors.push(`metadata component name must be ${pkg.name}`);
  if (document?.metadata?.component?.version !== pkg.version) errors.push(`metadata component version must be ${pkg.version}`);
  if (!Array.isArray(document?.components)) errors.push('components must be an array');
  const components = Array.isArray(document?.components) ? document.components : [];
  const required = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]);
  const present = new Set(components.map((component) => component?.name).filter(Boolean));
  for (const name of required) {
    if (!present.has(name) && !present.has(name.split('/').pop())) errors.push(`missing dependency component ${name}`);
  }
  const serialized = JSON.stringify(document);
  for (const marker of ['OPENAI_API_KEY', 'GITHUB_TOKEN', 'Authorization: Bearer']) {
    if (serialized.includes(marker)) errors.push(`forbidden secret marker ${marker}`);
  }
  if (errors.length) throw new Error(`Invalid release SBOM:\n- ${errors.join('\n- ')}`);
  return { componentCount: components.length, dependencyCount: required.size };
}

function main(file = process.argv[2] || defaultFile) {
  const document = JSON.parse(fs.readFileSync(file, 'utf8'));
  const result = verifySbom(document);
  console.log(`[release-sbom] verified ${path.relative(root, file)} (${result.componentCount} components)`);
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error('[release-sbom] verification failed', error);
    process.exit(1);
  }
}

module.exports = { defaultFile, main, verifySbom };
