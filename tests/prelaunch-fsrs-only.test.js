import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertFlashcardBackupImportable } from '../src/core/flashcardBackupSafety.js';
import '../flashcards.js';

describe('unreleased Farzan uses one FSRS scheduler', () => {
  beforeEach(() => {
    localStorage.clear();
    window.DB = {
      getSetting: vi.fn(async () => null),
      saveSetting: vi.fn(async (_key, records) => structuredClone(records)),
    };
    window.OpenCourseDeck.Flashcards.invalidateCache();
  });

  it('creates ordinary and imported cards as FSRS with no SM-2 engine or migration API', async () => {
    const api = window.OpenCourseDeck.Flashcards;
    expect(api).not.toHaveProperty('calculateSM2');
    expect(api).not.toHaveProperty('migrateCardToFsrs');
    expect(api).not.toHaveProperty('rollbackCardToSm2');
    expect(api).not.toHaveProperty('previewCardFsrsMigration');
    const card = await api.addCard({ front: 'Question', back: 'Answer' });
    expect(card.scheduler).toBe('fsrs-v5');
    expect(card.fsrsState).toMatchObject({ model: 'fsrs-6', packageVersion: '5.4.2' });
    expect(card).not.toHaveProperty('repetitions');
    expect(card).not.toHaveProperty('easeFactor');
    await expect(api.addCard({ front: 'Old', back: 'SM2', scheduler: 'sm2-v1' })).rejects.toThrow();
  });

  it('never renders a scheduler choice or legacy conversion controls', async () => {
    const host = document.createElement('div');
    await window.OpenCourseDeck.Flashcards.renderStudio(host);
    expect(host.querySelector('#fc-new-scheduler')).toBeNull();
    expect(host.querySelector('[data-fc-migrate]')).toBeNull();
    expect(host.querySelector('[data-fc-rollback]')).toBeNull();
    expect(host.textContent).toMatch(/FSRS/);
  });

  it('rejects pre-release legacy snapshots at the backup boundary', async () => {
    await expect(assertFlashcardBackupImportable([{
      id: 'legacy-id', front: 'Old', back: 'Card',
      repetitions: 3, interval: 20, easeFactor: 2.5,
    }])).rejects.toThrow(/scheduler|FSRS|legacy/i);
  });
});
