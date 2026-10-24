import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { DESKTOP_ORIGIN, DESKTOP_PORT, browserProfileDirectory } = require('../desktop/storage-origin.cjs');

describe('optional desktop launcher persistence', () => {
  it('uses an invariant loopback origin across restarts', () => {
    expect(DESKTOP_PORT).toBeGreaterThan(1024);
    expect(DESKTOP_ORIGIN).toBe(`http://127.0.0.1:${DESKTOP_PORT}/`);
  });

  it('keeps browser app profile out of temporary directories', () => {
    expect(browserProfileDirectory('/home/student')).toBe('/home/student/.opencoursedeck/browser-app');
    expect(browserProfileDirectory('C:/Users/Student')).not.toContain('tmp');
  });
});
