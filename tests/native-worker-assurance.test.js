import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('native release assurance for shipped search workers', () => {
  it('checks embedded worker changes on both main pushes and PRs', () => {
    const yaml = fs.readFileSync('.github/workflows/native-windows.yml', 'utf8');
    const [push, pullTail] = yaml.split('\n  pull_request:\n');
    expect(pullTail).toBeDefined();
    const [pull] = pullTail.split('\n  workflow_dispatch:');
    expect(push).toContain("      - 'src/workers/**'");
    expect(pull).toContain("      - 'src/workers/**'");
    // Protect the already shipped Rust/native and frontend paths too.
    for (const original of ["      - 'src-tauri/**'", "      - 'src/features/**'"]) {
      expect(push).toContain(original);
      expect(pull).toContain(original);
    }
  });
});
