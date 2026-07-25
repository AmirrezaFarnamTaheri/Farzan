import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('browser smoke script wiring', () => {
  it('keeps browser smoke wired into package scripts', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.scripts['smoke:browser']).toBe('node scripts/browser-smoke.cjs');
    expect(packageJson.scripts.ci).toContain('npm run smoke:browser');
  });
});
