/**
 * Validate a portable FSRS-only flashcard deck before importing any section.
 * Never silently reinterpret unsupported scheduler states or reconstruct logs.
 */
export async function assertFlashcardBackupImportable(records) {
  if (!Array.isArray(records)) {
    throw new TypeError('Flashcard backup must contain an array of cards');
  }
  const seen = new Set();
  let checkState = null;
  for (const [index, card] of records.entries()) {
    if (!card || typeof card !== 'object' || Array.isArray(card)) {
      throw new TypeError(`Invalid flashcard backup record at index ${index}`);
    }
    const id = typeof card.id === 'string' ? card.id.trim() : '';
    if (!id) throw new TypeError(`Flashcard backup record ${index} has no stable ID`);
    if (seen.has(id)) throw new TypeError(`Duplicate flashcard ID in backup: ${id}`);
    seen.add(id);
    if (card.scheduler !== 'fsrs-v5' || !card.fsrsState) {
      throw new TypeError(`Unsupported flashcard scheduler for record ${id}: FSRS-v5 required`);
    }
    if (card.fsrsMigration != null || 'repetitions' in card || 'interval' in card
      || 'easeFactor' in card) {
      throw new TypeError(`Unsupported prelaunch flashcard scheduling fields for ${id}`);
    }
    if (!checkState) {
      ({ assertFsrsV5State: checkState } =
        await import('../features/flashcardsFsrsAdapter.js'));
    }
    checkState(card.fsrsState);
  }
  return records;
}
