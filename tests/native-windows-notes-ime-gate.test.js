import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Windows Notes composition acceptance workflow (#173)', () => {
  it('runs existing durable Squire and classic RTL composition journeys in Windows Chromium before native packaging', () => {
    const workflow = fs.readFileSync('.github/workflows/native-windows.yml', 'utf8');
    expect(workflow).toContain('name: Validate Notes composition in Windows Chromium');
    expect(workflow).toContain('npm run test:e2e -- tests/e2e/workspace-redesign.spec.js');
    expect(workflow).toContain('keeps default Squire composing text');
    expect(workflow).toContain('preserves an IME Notes draft');
    expect(workflow.indexOf('Validate Notes composition in Windows Chromium'))
      .toBeLessThan(workflow.indexOf('Validate Cargo graph with lockfile'));
    expect(workflow).toContain('npm run tauri:build:locked');
  });
});
