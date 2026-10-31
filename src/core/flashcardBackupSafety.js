/**
 * Portable backup preflight for legacy SM-2 and explicitly migrated FSRS-v5.
 *
 * This validation is deliberately read-only: no inferred FSRS review history,
 * state normalization, or legacy field rewriting. Call before importing ANY
 * backup section so malformed cards cannot leave a partial restore.
 */
export async function assertFlashcardBackupImportable(records) {
  if (!Array.isArray(records)) {
    throw new TypeError('Flashcard backup must contain an array of cards');
  }
  const seen = new Set();
  let checkFsrs = null;
  for (const [index, card] of records.entries()) {
    if (!card || typeof card !== 'object' || Array.isArray(card)) {
      throw new TypeError(`Invalid flashcard backup record at index ${index}`);
    }
    const id = typeof card.id === 'string' ? card.id.trim() : '';
    if (!id) throw new TypeError(`Flashcard backup record ${index} has no stable ID`);
    if (seen.has(id)) throw new TypeError(`Duplicate flashcard ID in backup: ${id}`);
    seen.add(id);

    // Pre-versioned cards remain canonical SM-2 without constructing or
    // reconstructing any missing learning history.
    if (card.scheduler == null || card.scheduler === 'sm2-v1') {
      if (card.fsrsState != null || card.fsrsMigration != null) {
        throw new TypeError(`Legacy flashcard ${id} contains unexpected FSRS state`);
      }
      continue;
    }
    if (card.scheduler !== 'fsrs-v5') {
      throw new TypeError(`Unsupported flashcard scheduler: ${card.scheduler}`);
    }
    if (!card.fsrsState) throw new TypeError(`Missing FSRS state for flashcard ${id}`);

    // ts-fsrs remains lazy: normal Home and ordinary SM-2 imports must never
    // pull the scheduler library into the initial bundle.
    if (!checkFsrs) {
      ({ assertFsrsV5State: checkFsrs } =
        await import('../features/flashcardsFsrsAdapter.js'));
    }
    checkFsrs(card.fsrsState);

    // Consent archives are required to be self-consistent, but native
    // FSRS-created cards need no fictitious SM-2 archive.
    if (card.fsrsMigration != null) {
      const archive = card.fsrsMigration;
      const legacy = archive?.legacyCard;
      if (archive.version !== 1 || !legacy || typeof legacy !== 'object'
          || Array.isArray(legacy) || legacy.id !== card.id
          || (legacy.scheduler != null && legacy.scheduler !== 'sm2-v1')
          || legacy.fsrsState != null || legacy.fsrsMigration != null) {
        throw new TypeError(`Invalid FSRS migration archive for flashcard ${id}`);
      }
    }
  }
  return records;
}
