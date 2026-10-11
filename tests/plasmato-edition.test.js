import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('Plasmato edition native catalog integration', () => {
  it('loads the complete offline archive into the normal DataStore without breaking baseline fallback or user overlays', () => {
    const output = execFileSync(process.execPath, [
      'editions/plasmato-emergency/verify-integrated.cjs',
    ], { cwd: process.cwd(), encoding: 'utf8', timeout: 20000 });
    expect(output).toContain('32 courses, 6421 topics');
    expect(output).toContain('baseline fallback and user overlays verified');
  }, 25000);
});
