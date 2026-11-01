import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('greenfield IndexedDB cursor options contract', () => {
  it('uses a single explicit options object rather than a retired positional overload', () => {
    const db = fs.readFileSync('db.js', 'utf8');
    const bridge = fs.readFileSync('bridge.js', 'utf8');
    expect(db).toMatch(/async queryIndex\(store, indexName, range, \{ limit, direction = 'next' \} = \{\}\)/);
    expect(db).not.toMatch(/legacyOptions|limitOrOptions/);
    expect(bridge).toContain("idb.queryIndex('notes', 'updatedAt', null, { limit, direction: 'prev' })");
    expect(bridge).toContain("idb.queryIndex(store, indexName, range, { limit })");
  });
});
