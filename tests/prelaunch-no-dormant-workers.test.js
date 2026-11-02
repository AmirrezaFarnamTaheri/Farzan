import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('pre-release worker retirement', () => {
  const obsolete = [
    'src/core/lazyWorkerPool.js',
    'src/core/workerAssets.js',
    'src/lib/workerPool.js',
    'src/workers/search.worker.js',
    'src/workers/catalog.worker.js',
  ];

  it('contains no dormant public WorkerPool and no staged classic worker sources', () => {
    for (const file of obsolete) expect(fs.existsSync(file), file).toBe(false);
    const entry = fs.readFileSync('src/index.js', 'utf8');
    expect(entry).not.toMatch(/WorkerPool|workerAssets|pd\\.workers/);
    const build = fs.readFileSync('scripts/build.cjs', 'utf8');
    const workbox = fs.readFileSync('scripts/workbox-dist.config.cjs', 'utf8');
    expect(build).not.toContain("src', 'workers'");
    expect(build).not.toContain("src/workers");
    expect(workbox).not.toContain('src/workers/');
  });

  it('measures the shipped search implementation rather than a nonconsumed worker', () => {
    const report = fs.readFileSync('scripts/search-index-acceptance.cjs', 'utf8');
    expect(report).toContain('fuseBuildMedianMs');
    expect(report).toContain('lexicalQueryMedianMs');
    expect(report).not.toContain('search.worker.js');
    expect(report).not.toContain('workerQueryMedianMs');
    const script = fs.readFileSync('scripts/dist-browser-smoke.cjs', 'utf8');
    expect(script).not.toContain('new Worker(pd.workers');
    expect(script).toContain('window.DB');
  });
});
