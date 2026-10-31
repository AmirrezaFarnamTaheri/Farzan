import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../flashcards.js';

const flash = () => window.OpenCourseDeck.Flashcards;
let canonical;

describe('explicit and reversible SM-2 to FSRS scheduling migration', () => {
  beforeEach(() => {
    canonical = null;
    document.body.innerHTML = '<div id="aria-announcer"></div><main id="flash-root"></main>';
    localStorage.clear();
    window.DB = {
      getSetting: vi.fn(async key => key === 'ocd_flashcards' ? canonical : null),
      saveSetting: vi.fn(async (key, records) => {
        if (key !== 'ocd_flashcards') throw new Error('Unexpected key');
        canonical = structuredClone(records);
        return true;
      }),
    };
    flash().invalidateCache();
  });

  afterEach(() => {
    delete window.DB;
    delete window.OpenCourseDeck.UI;
    flash().manager.reset();
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  async function seed() {
    const card = await flash().addCard({ front: 'What is nephron?', back: 'Renal unit', deck: 'Physiology' });
    canonical[0] = {
      ...canonical[0], repetitions: 7, interval: 21, easeFactor: 2.13,
      nextReviewDate: '2027-03-09',
      lastReviewedAt: '2026-10-12T10:00:00.000Z',
      userMetadata: { course: 'renal', tags: ['renal', 'فا'] },
    };
    const legacy = structuredClone(canonical[0]);
    flash().invalidateCache();
    return { id: card.id, legacy };
  }

  it('previews old and new due dates without modifying persisted cards', async () => {
    const { id, legacy } = await seed();
    const writes = window.DB.saveSetting.mock.calls.length;
    const preview = await flash().previewCardFsrsMigration(id);
    expect(preview).toMatchObject({
      cardId: id, currentScheduler: 'sm2-v1', originalDue: '2027-03-09',
      proposedScheduler: 'fsrs-v5',
    });
    expect(Date.parse(preview.proposedDue)).toBeLessThanOrEqual(Date.now() + 1000);
    expect(preview.warning).toMatch(/start fresh|restart|reset/i);
    expect(canonical[0]).toEqual(legacy);
    expect(window.DB.saveSetting).toHaveBeenCalledTimes(writes);
  });

  it('rejects conversion without explicit, affirmative consent', async () => {
    const { id, legacy } = await seed();
    const writes = window.DB.saveSetting.mock.calls.length;
    await expect(flash().migrateCardToFsrs(id)).rejects.toThrow(/consent/i);
    await expect(flash().migrateCardToFsrs(id, { consent: false })).rejects.toThrow(/consent/i);
    expect(canonical[0]).toEqual(legacy);
    expect(window.DB.saveSetting).toHaveBeenCalledTimes(writes);
  });

  it('stores an exact archived SM-2 snapshot and fresh FSRS state without invented history', async () => {
    const { id, legacy } = await seed();
    const changed = await flash().migrateCardToFsrs(id, { consent: true });
    expect(changed.scheduler).toBe('fsrs-v5');
    expect(changed.fsrsState).toMatchObject({ version: 1, packageVersion: '5.4.2', model: 'fsrs-6' });
    expect(changed.fsrsState.reviewLog).toEqual([]);
    expect(changed.fsrsMigration).toMatchObject({ version: 1, legacyCard: legacy });
    expect(changed.fsrsMigration.consentedAt).toMatch(/Z$/);
    expect(changed.repetitions).toBeUndefined();
    expect(changed.interval).toBeUndefined();
    expect(changed.easeFactor).toBeUndefined();
    expect(changed.userMetadata).toEqual(legacy.userMetadata);
    expect(canonical[0]).toEqual(changed);
    expect((await flash().getDueCards()).map(c => c.id)).toContain(id);
  });

  it('restores exactly the original card after FSRS reviews, JSON backup and cache invalidation', async () => {
    const { id, legacy } = await seed();
    await flash().migrateCardToFsrs(id, { consent: true });
    await flash().reviewCard(id, 4);
    expect(canonical[0].fsrsState.reviewLog).toHaveLength(1);
    canonical = JSON.parse(JSON.stringify(canonical));
    flash().invalidateCache();
    const restored = await flash().rollbackCardToSm2(id, { consent: true });
    expect(restored).toEqual(legacy);
    expect(canonical[0]).toEqual(legacy);
    expect(canonical[0]).not.toHaveProperty('fsrsMigration');
    expect(canonical[0]).not.toHaveProperty('fsrsState');
    flash().invalidateCache();
    expect((await flash().getCards())[0]).toEqual(legacy);
  });

  it('rejects repeat conversion and rollback without consent or archived history', async () => {
    const { id } = await seed();
    await flash().migrateCardToFsrs(id, { consent: true });
    const snapshot = structuredClone(canonical);
    const writes = window.DB.saveSetting.mock.calls.length;
    await expect(flash().migrateCardToFsrs(id, { consent: true })).rejects.toThrow(/already/i);
    await expect(flash().rollbackCardToSm2(id)).rejects.toThrow(/consent/i);
    expect(canonical).toEqual(snapshot);
    expect(window.DB.saveSetting).toHaveBeenCalledTimes(writes);
    const nativeFsrs = await flash().addCard({ front: 'Original FSRS', back: 'No SM-2 history', scheduler: 'fsrs-v5' });
    await expect(flash().rollbackCardToSm2(nativeFsrs.id, { consent: true })).rejects.toThrow(/archive|history|snapshot/i);
  });

  it('does not change the cached or canonical card on a rejected IndexedDB write', async () => {
    const { id, legacy } = await seed();
    window.DB.saveSetting.mockRejectedValueOnce(new Error('IndexedDB full'));
    await expect(flash().migrateCardToFsrs(id, { consent: true })).rejects.toThrow(/IndexedDB full/);
    expect(canonical[0]).toEqual(legacy);
    expect((await flash().getCards())[0]).toEqual(legacy);
    const success = await flash().migrateCardToFsrs(id, { consent: true });
    expect(success.fsrsMigration.legacyCard).toEqual(legacy);
  });

  it('refuses corrupt archived identity before rollback writes', async () => {
    const { id } = await seed();
    await flash().migrateCardToFsrs(id, { consent: true });
    canonical[0].fsrsMigration.legacyCard.id = 'different';
    flash().invalidateCache();
    const snapshot = structuredClone(canonical);
    const writes = window.DB.saveSetting.mock.calls.length;
    await expect(flash().rollbackCardToSm2(id, { consent: true })).rejects.toThrow(/snapshot|archive/i);
    expect(canonical).toEqual(snapshot);
    expect(window.DB.saveSetting).toHaveBeenCalledTimes(writes);
  });

  it('offers only a consent-based migration or rollback action for a managed card', async () => {
    const { id } = await seed();
    const root = document.getElementById('flash-root');
    const confirm = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    window.OpenCourseDeck.UI = { confirm };
    await flash().renderStudio(root);
    const action = root.querySelector('[data-fc-migrate]');
    expect(action?.dataset.fcMigrate).toBe(id);
    action.click();
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(canonical[0].scheduler).toBeUndefined();
    action.click();
    await vi.waitFor(() => expect(canonical[0].scheduler).toBe('fsrs-v5'));
    expect(confirm.mock.calls[1][0].message).toContain('2027-03-09');
    const rollback = root.querySelector('[data-fc-rollback]');
    // The post-write re-render replaces all managed rows; refresh the query.
    const activeRollback = rollback || root.querySelector('[data-fc-rollback]');
    expect(activeRollback?.dataset.fcRollback).toBe(id);
    activeRollback.click();
    await vi.waitFor(() => expect(canonical[0].scheduler).toBeUndefined());
    expect(confirm).toHaveBeenCalledTimes(3);
  });
});
