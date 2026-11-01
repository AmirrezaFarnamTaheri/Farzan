import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('greenfield canonical board and course storage', () => {
  it('does not read retired Studio/autosave or My Courses settings', () => {
    const canvas = fs.readFileSync('canvas.js', 'utf8');
    const route = fs.readFileSync('src/views/myCoursesRoute.js', 'utf8');
    const library = fs.readFileSync('src/features/userLibrary.js', 'utf8');
    const safety = fs.readFileSync('src/core/storageSafety.js', 'utf8');
    expect(canvas).not.toMatch(/ocd_canvas_board|_legacyAutosaveKey|adoptLegacy/);
    expect(route).not.toMatch(/ocd_my_courses|migrateLegacyCourses|LEGACY_COURSES_KEY/);
    expect(library).not.toMatch(/migrateLegacyCourses|migratedLegacyCourses/);
    expect(safety).not.toContain("'ocd_canvas_board'");
    expect(canvas).toContain("ocd_studio_board");
    expect(route).toContain("api.load()");
  });
});
