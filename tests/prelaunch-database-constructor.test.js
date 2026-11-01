import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('unreleased canonical database constructor', () => {
  it('has no obsolete PlasmaDB named export or in-product alias', async () => {
    for (const path of [
      'db.js', 'bridge.js', 'tests/db.test.js',
      'tests/bridge.test.js', 'tests/annotation-persistence.test.js',
      'tests/prelaunch-canonical-db.test.js',
    ]) expect(fs.readFileSync(path, 'utf8'), path).not.toContain('PlasmaDB');
    const db = await import('../db.js');
    expect(typeof db.OpenCourseDB).toBe('function');
    expect(db.PlasmaDB).toBeUndefined();
    expect(db.default.OpenCourseDB).toBe(db.OpenCourseDB);
    expect(db.default).not.toHaveProperty('PlasmaDB');
  });
});
