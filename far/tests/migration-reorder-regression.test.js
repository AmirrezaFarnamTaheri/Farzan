import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';

function deleteDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`Deletion blocked for ${name}`));
  });
}

async function bootBridge() {
  vi.resetModules();
  delete window.DataStore;
  delete window.DB;
  window.OpenCourseDeck = window.OpenCourseDeck || {};
  if (!window.OpenCourseDeck.DB?.PlasmaDB) await import('../db.js');
  await import('../bridge.js');
}

describe('legacy migration reorder regression', () => {
  beforeEach(async () => {
    localStorage.clear();
    window.OpenCourseDeck = {};
    try { await deleteDatabase('opencoursedeck'); } catch {}
  });

  it('re-derives identical timestamp IDs after persisted state is cleared', async () => {
    localStorage.setItem('plasma_timestamps_v1', JSON.stringify([
      { topicId: 't1', time: 12 },
      { topicId: 't2', time: 34 },
    ]));
    await bootBridge();
    const first = await window.DB.getAllTimestamps();
    const firstIds = Object.fromEntries(first.map(record => [`${record.topicId}:${record.time}`, record.id]));

    await window.DB.clearUserData('media');
    const { PlasmaDB } = window.OpenCourseDeck.DB;
    const control = new PlasmaDB('opencoursedeck', 3, []);
    await control.delete('settings', 'migration:v3:timestamps');
    control.db?.close();
    localStorage.removeItem('plasma_migrated_v2');
    localStorage.removeItem('plasma_migrated_ids');
    localStorage.removeItem('plasma_migration_report_v3');
    localStorage.setItem('plasma_timestamps_v1', JSON.stringify([
      { topicId: 't2', time: 34 },
      { topicId: 't1', time: 12 },
    ]));

    await bootBridge();
    const second = await window.DB.getAllTimestamps();
    const secondIds = Object.fromEntries(second.map(record => [`${record.topicId}:${record.time}`, record.id]));

    expect(second).toHaveLength(2);
    expect(secondIds).toEqual(firstIds);
  });
});
