import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateSbom } from '../scripts/generate-sbom.cjs';
import { verifySbom } from '../scripts/verify-sbom.cjs';
import pkg from '../package.json';

function validSbom() {
  const names = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})];
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: 'urn:uuid:11111111-1111-4111-8111-111111111111',
    version: 1,
    metadata: { component: { type: 'application', name: pkg.name, version: pkg.version } },
    components: names.map((name) => ({ type: 'library', name, version: 'test' })),
  };
}

describe('release SBOM verification', () => {
  it('accepts a complete CycloneDX application document', () => {
    expect(verifySbom(validSbom(), pkg)).toEqual({
      componentCount: Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length,
      dependencyCount: Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length,
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
    const sbom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      serialNumber: 'urn:uuid:11111111-1111-4111-8111-111111111111',
      version: 1,
      metadata: { component: { type: 'application', name: 'fixture', version: '1.0.0' } },
      components: [{ type: 'library', name: 'shared', version: '1.0.0' }],
    };

    expect(() => verifySbom(sbom, scopedPackage)).toThrow('missing dependency component @example/shared');
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
