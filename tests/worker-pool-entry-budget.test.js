import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const indexSource = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');
const poolSource = fs.readFileSync(path.join(root, 'src/lib/workerPool.js'), 'utf8');

describe('worker pool runtime cost and durable offline assets', () => {
  it('does not import the unused pool into the eager application startup', () => {
    expect(indexSource).not.toContain("from './lib/workerPool.js'");
    expect(indexSource).toContain('pd.WorkerPool = lazyWorkerPool;');
    expect(indexSource).toContain("import('./lib/workerPool.js')");
    expect(indexSource).toContain("import { createLazyWorkerPool } from './core/lazyWorkerPool.js'");
  });

  it('keeps stable worker asset URLs for actual production offline and browser smoke', () => {
    expect(indexSource).toContain("import { workerAssets } from './core/workerAssets.js'");
    expect(indexSource).toContain('pd.workers = workerAssets;');
    expect(poolSource).toContain("import { workerAssets } from '../core/workerAssets.js'");
    const smoke = fs.readFileSync(path.join(root, 'scripts/dist-browser-smoke.cjs'), 'utf8');
    expect(smoke).toContain('new Worker(pd.workers.catalog');
  });

  it('keeps direct WorkerPool exports for explicit consumers', async () => {
    const mod = await import('../src/lib/workerPool.js');
    for (const method of ['runInWorker', 'terminateAll', 'getWorkerStatus']) {
      expect(typeof mod[method]).toBe('function');
    }
    mod.terminateAll();
  });
});
