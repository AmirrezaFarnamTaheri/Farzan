import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Launcher Integration', () => {
  it('should verify root launcher script exists', () => {
    const launcherPath = path.resolve(__dirname, '../Run-OpenCourseDeck.cmd');
    expect(fs.existsSync(launcherPath)).toBe(true);
  });
});
