import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const reset = fs.readFileSync('src/styles/reset.css', 'utf8');

describe('app viewport scroll containment', () => {
  it('keeps the document scroll root fixed while the sidebar and views manage their own scroll', () => {
    expect(reset).toMatch(/html\\s*\\{[^}]*overflow-y:\\s*hidden;/s);
    expect(reset).toMatch(/body\\s*\\{[^}]*overflow:\\s*hidden;/s);
    expect(fs.readFileSync('src/styles/farzan-redesign.css', 'utf8')).toMatch(/\\.view-container\\s*\\{[^}]*overflow-y:\\s*auto;/s);
  });
});
