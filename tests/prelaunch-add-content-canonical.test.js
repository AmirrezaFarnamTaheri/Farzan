import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Add Content uses only canonical User Library ownership', () => {
  it('never performs redundant retired My Courses setting reads or writes', () => {
    const source = fs.readFileSync('src/features/addContent.js', 'utf8');
    expect(source).toContain('const result = await upsertCourse({ title, description });');
    expect(source).not.toContain("'ocd_my_courses'");
    expect(source).toContain('setImportCourse(result.id)');
    expect(source).toContain("route: '#/my-courses'");
  });
});
