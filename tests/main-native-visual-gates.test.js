import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('exact-commit post-merge release acceptance', () => {
  for (const name of ['native-windows.yml', 'farzan-design-visual.yml']) {
    it(`runs ${name} on relevant pushes to main as well as PRs`, () => {
      const source = fs.readFileSync('.github/workflows/' + name, 'utf8');
      const header = source.slice(0, source.indexOf('concurrency:'));
      expect(header).toMatch(/on:\s*\n\s*push:\s*\n\s*branches:\s*\n\s*- main/);
      expect(header).toMatch(/\n\s*pull_request:\s*\n\s*branches:\s*\n\s*- main/);
      expect(header).toContain('workflow_dispatch:');
      expect(header).toContain('paths:');
    });
  }
});
