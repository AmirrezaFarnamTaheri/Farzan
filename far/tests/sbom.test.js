import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateSbom } from '../scripts/generate-sbom.cjs';
import { verifySbom } from '../scripts/verify-sbom.cjs';
import pkg from '../package.json';

function validSbom(packageDefinition = pkg) {
  const names = [...Object.keys(packageDefinition.dependencies || {}), ...Object.keys(packageDefinition.devDependencies || {})];
  const rootRef = `application:${packageDefinition.name}@${packageDefinition.version}`;
  const components = names.map((name, index) => ({
    type: 'library',
    name,
    version: 'test',
    'bom-ref': `component:${index}:${name}`,
  }));
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: 'urn:uuid:11111111-1111-4111-8111-111111111111',
    version: 1,
    metadata: {
      component: {
        type: 'application',
        name: packageDefinition.name,
        version: packageDefinition.version,
        'bom-ref': rootRef,
      },
    },
    components,
    dependencies: [
      { ref: rootRef, dependsOn: components.map(component => component['bom-ref']) },
      ...components.map(component => ({ ref: component['bom-ref'], dependsOn: [] })),
    ],
  };
}

describe('release SBOM verification', () => {
  it('accepts a complete CycloneDX application document', () => {
    const dependencyCount = Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length;
    expect(verifySbom(validSbom(), pkg)).toEqual({
      componentCount: dependencyCount,
      dependencyCount,
      graphNodeCount: dependencyCount + 1,
    });
  });

  it('rejects identity drift, missing dependencies, and secret markers', () => {
    const sbom = validSbom();
    sbom.metadata.component.version = '0.0.0';
    sbom.components.pop();
    sbom.properties = [{ name: 'leak', value: 'OPENAI_API_KEY' }];
    expect(() => verifySbom(sbom, pkg)).toThrow(/metadata component version/);
    expect(() => verifySbom(sbom, pkg)).toThrow(/missing dependency component/);
    expect(() => verifySbom(sbom, pkg)).toThrow(/forbidden secret marker/);
  });

  it('does not accept an unscoped package as evidence for a scoped dependency', () => {
    const scopedPackage = {
      name: 'fixture',
      version: '1.0.0',
      dependencies: { '@example/shared': '1.0.0' },
    };
    const sbom = validSbom(scopedPackage);
    sbom.components[0].name = 'shared';

    expect(() => verifySbom(sbom, scopedPackage)).toThrow('missing dependency component @example/shared');
  });

  it('rejects duplicate component identities and dangling dependency references', () => {
    const duplicate = validSbom();
    duplicate.components[1]['bom-ref'] = duplicate.components[0]['bom-ref'];
    expect(() => verifySbom(duplicate, pkg)).toThrow(/duplicate bom-ref/);

    const dangling = validSbom();
    dangling.dependencies[0].dependsOn.push('component:missing');
    expect(() => verifySbom(dangling, pkg)).toThrow(/depends on unknown component component:missing/);
  });

  it('requires every direct package dependency to be linked from the application root', () => {
    const sbom = validSbom();
    const removedRef = sbom.dependencies[0].dependsOn.pop();

    expect(() => verifySbom(sbom, pkg)).toThrow(`metadata component does not reference direct dependency ${removedRef}`);
  });

  it('requires a graph entry for every component and rejects self-cycles', () => {
    const missingNode = validSbom();
    const removed = missingNode.dependencies.pop();
    expect(() => verifySbom(missingNode, pkg)).toThrow(`dependency graph is missing component ${removed.ref}`);

    const selfCycle = validSbom();
    selfCycle.dependencies[1].dependsOn.push(selfCycle.dependencies[1].ref);
    expect(() => verifySbom(selfCycle, pkg)).toThrow(/depends on itself/);
  });

  it('normalizes npm root graph identity to the metadata bom-ref', () => {
    const destination = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sbom-normalize-')), 'sbom.json');
    const legacyRoot = `${pkg.name}@${pkg.version}`;
    const source = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      serialNumber: 'urn:uuid:11111111-1111-4111-8111-111111111111',
      version: 1,
      metadata: { component: { name: pkg.name, version: pkg.version, 'bom-ref': legacyRoot } },
      components: [{ type: 'library', name: 'dep', version: '1.0.0', 'bom-ref': 'dep@1.0.0' }],
      dependencies: [
        { ref: legacyRoot, dependsOn: ['dep@1.0.0'] },
        { ref: 'dep@1.0.0', dependsOn: [] },
      ],
    };

    const generated = generateSbom({
      destination,
      spawn: () => ({ status: 0, stdout: JSON.stringify(source), stderr: '', error: null }),
    });
    const rootRef = `pkg:npm/${pkg.name}@${pkg.version}`;

    expect(generated.metadata.component['bom-ref']).toBe(rootRef);
    expect(generated.metadata.component.purl).toBe(rootRef);
    expect(generated.dependencies).toEqual([
      { ref: rootRef, dependsOn: ['dep@1.0.0'] },
      { ref: 'dep@1.0.0', dependsOn: [] },
    ]);
    expect(JSON.parse(fs.readFileSync(destination, 'utf8')).dependencies[0].ref).toBe(rootRef);
  });

  it('includes spawn errors when npm cannot be launched', () => {
    const destination = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sbom-test-')), 'sbom.json');
    const spawnError = Object.assign(new Error('spawn npm ENOENT'), { code: 'ENOENT' });

    expect(() => generateSbom({
      destination,
      spawn: () => ({ status: null, stdout: '', stderr: '', error: spawnError }),
    })).toThrow(/spawn npm ENOENT/);
  });
});
