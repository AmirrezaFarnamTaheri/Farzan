import { describe, expect, it } from 'vitest';
import { buildLegacyRecords } from '../src/core/migrationIdentity.js';

describe('migration identity', () => {
  it('assigns the same content identity regardless of source ordering', async () => {
    const first = { topicId: 'a', seconds: 12, updatedAt: 10 };
    const second = { topicId: 'b', seconds: 30, updatedAt: 20 };

    const forward = await buildLegacyRecords('timestamp', [first, second], 3, null);
    const reversed = await buildLegacyRecords('timestamp', [second, first], 3, null);

    expect(Object.fromEntries(forward.map(([record, id]) => [record.topicId, id]))).toEqual(
      Object.fromEntries(reversed.map(([record, id]) => [record.topicId, id])),
    );
  });

  it('uses a wide deterministic fallback identity without Web Crypto', async () => {
    const records = await buildLegacyRecords('note', [
      { title: 'First', body: 'alpha' },
      { title: 'Second', body: 'beta' },
    ], 3, null);
    const ids = records.map(([, id]) => id);

    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      const suffix = id.split('-migrated-v3-')[1];
      expect(suffix).toHaveLength(24);
      expect(suffix).toMatch(/^fnv1a-[0-9a-f]{18}$/);
    }
  });

  it('rejects hash collisions with different canonical content', async () => {
    const cryptoRoot = {
      subtle: {
        digest: async () => new Uint8Array(32).buffer,
      },
    };
    await expect(buildLegacyRecords('note', [
      { title: 'First' },
      { title: 'Second' },
    ], 3, cryptoRoot)).rejects.toMatchObject({ code: 'MIGRATION_IDENTITY_COLLISION' });
  });

  it('rejects a generated identity that collides with an explicit ID regardless of ordering', async () => {
    const record = { title: 'Collision source' };
    const [[, generatedId]] = await buildLegacyRecords('note', [record], 3, null);
    const explicit = { id: generatedId, title: 'Explicit source' };

    await expect(buildLegacyRecords('note', [record, explicit], 3, null)).rejects.toMatchObject({
      code: 'MIGRATION_IDENTITY_COLLISION',
    });
    await expect(buildLegacyRecords('note', [explicit, record], 3, null)).rejects.toMatchObject({
      code: 'MIGRATION_IDENTITY_COLLISION',
    });
  });

  it('rejects duplicate explicit migration IDs', async () => {
    await expect(buildLegacyRecords('note', [
      { id: 'legacy-note', title: 'First' },
      { id: 'legacy-note', title: 'Second' },
    ], 3, null)).rejects.toMatchObject({ code: 'MIGRATION_IDENTITY_COLLISION' });
  });
});
