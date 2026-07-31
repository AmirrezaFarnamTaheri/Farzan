const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const defaultFile = path.join(root, 'reports', 'release', 'sbom.cdx.json');

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

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
  if (!Array.isArray(document?.dependencies)) errors.push('dependencies must be an array');

  const components = Array.isArray(document?.components) ? document.components : [];
  const graph = Array.isArray(document?.dependencies) ? document.dependencies : [];
  const required = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]);
  const componentsByName = new Map();
  const refs = new Map();

  const rootRef = nonEmptyString(document?.metadata?.component?.['bom-ref']);
  if (!rootRef) errors.push('metadata component bom-ref is missing');
  else refs.set(rootRef, { kind: 'metadata', component: document.metadata.component });

  for (const [index, component] of components.entries()) {
    const name = nonEmptyString(component?.name);
    const ref = nonEmptyString(component?.['bom-ref']);
    if (!name) errors.push(`component ${index} name is missing`);
    else {
      const group = componentsByName.get(name) || [];
      group.push(component);
      componentsByName.set(name, group);
    }
    if (!ref) {
      errors.push(`component ${name || index} bom-ref is missing`);
      continue;
    }
    if (refs.has(ref)) errors.push(`duplicate bom-ref ${ref}`);
    else refs.set(ref, { kind: 'component', component });
  }

  const requiredRefs = new Set();
  for (const name of required) {
    const matches = componentsByName.get(name) || [];
    if (!matches.length) {
      errors.push(`missing dependency component ${name}`);
      continue;
    }
    for (const component of matches) {
      const ref = nonEmptyString(component?.['bom-ref']);
      if (ref) requiredRefs.add(ref);
    }
  }

  const graphByRef = new Map();
  for (const [index, dependency] of graph.entries()) {
    const ref = nonEmptyString(dependency?.ref);
    if (!ref) {
      errors.push(`dependency graph entry ${index} ref is missing`);
      continue;
    }
    if (!refs.has(ref)) errors.push(`dependency graph references unknown component ${ref}`);
    if (graphByRef.has(ref)) errors.push(`duplicate dependency graph entry ${ref}`);
    else graphByRef.set(ref, dependency);

    if (!Array.isArray(dependency.dependsOn)) {
      errors.push(`dependency graph entry ${ref} dependsOn must be an array`);
      continue;
    }
    const seenChildren = new Set();
    for (const childRef of dependency.dependsOn) {
      if (!nonEmptyString(childRef)) {
        errors.push(`dependency graph entry ${ref} contains an empty dependency reference`);
        continue;
      }
      if (seenChildren.has(childRef)) errors.push(`dependency graph entry ${ref} repeats dependency ${childRef}`);
      seenChildren.add(childRef);
      if (!refs.has(childRef)) errors.push(`dependency graph entry ${ref} depends on unknown component ${childRef}`);
      if (childRef === ref) errors.push(`dependency graph entry ${ref} depends on itself`);
    }
  }

  if (rootRef) {
    const rootDependency = graphByRef.get(rootRef);
    if (!rootDependency) errors.push(`dependency graph is missing the metadata component ${rootRef}`);
    else {
      const directRefs = new Set(rootDependency.dependsOn || []);
      for (const requiredRef of requiredRefs) {
        if (!directRefs.has(requiredRef)) errors.push(`metadata component does not reference direct dependency ${requiredRef}`);
      }
    }
  }

  for (const [ref, entry] of refs.entries()) {
    if (entry.kind === 'component' && !graphByRef.has(ref)) {
      errors.push(`dependency graph is missing component ${ref}`);
    }
  }

  const serialized = JSON.stringify(document);
  for (const marker of ['OPENAI_API_KEY', 'GITHUB_TOKEN', 'Authorization: Bearer']) {
    if (serialized.includes(marker)) errors.push(`forbidden secret marker ${marker}`);
  }
  if (errors.length) throw new Error(`Invalid release SBOM:\n- ${errors.join('\n- ')}`);
  return {
    componentCount: components.length,
    dependencyCount: required.size,
    graphNodeCount: graphByRef.size,
  };
}

function main(file = process.argv[2] || defaultFile) {
  const document = JSON.parse(fs.readFileSync(file, 'utf8'));
  const result = verifySbom(document);
  console.log(`[release-sbom] verified ${path.relative(root, file)} (${result.componentCount} components, ${result.graphNodeCount} graph nodes)`);
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error('[release-sbom] verification failed', error);
    process.exit(1);
  }
}

module.exports = { defaultFile, main, verifySbom };
