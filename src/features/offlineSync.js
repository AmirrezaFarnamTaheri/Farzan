/**
 * Manual, *unencrypted* local transfer of flashcards and notes.
 * There is no network transport, automatic syncing, or encrypted package format.
 * A passphrase must not be silently ignored: reject the request instead.
 */
const MAX_PACKAGE_CHARS = 10 * 1024 * 1024;
const MAX_RECORDS = 50000;

function assertRecords(value, label) {
  if (!Array.isArray(value) || value.length > MAX_RECORDS) {
    throw new TypeError(`${label} must be a list with at most ${MAX_RECORDS} entries`);
  }
  for (const [index, record] of value.entries()) {
    if (!record || typeof record !== 'object' || Array.isArray(record)
      || (typeof record.id !== 'string' && typeof record.id !== 'number')
      || (typeof record.id === 'number' && !Number.isFinite(record.id))
      || String(record.id).length === 0
      || (record.updatedAt != null && (!Number.isFinite(record.updatedAt) || record.updatedAt < 0))) {
      throw new TypeError(`${label}[${index}] has an invalid id or timestamp`);
    }
  }
  return value;
}

export function createSyncPackage(cards = [], notes = [], options = {}) {
  if (options?.passphrase || options?._passphrase) {
    throw new Error('Encrypted sync packages are not supported. Export without a passphrase or use an encrypted container.');
  }
  const payload = {
    version: 1,
    exportedAt: Date.now(),
    cards: assertRecords(cards, 'Cards'),
    notes: assertRecords(notes, 'Notes'),
  };
  const json = JSON.stringify(payload);
  if (json.length > MAX_PACKAGE_CHARS) throw new Error('Sync package is too large');
  return json;
}

export function mergeSyncPackage(existingCards = [], existingNotes = [], syncPackageJson = '') {
  assertRecords(existingCards, 'Existing cards');
  assertRecords(existingNotes, 'Existing notes');
  if (typeof syncPackageJson !== 'string' || syncPackageJson.length > MAX_PACKAGE_CHARS) {
    throw new TypeError('Invalid sync package size or format');
  }
  let incoming;
  try { incoming = JSON.parse(syncPackageJson); }
  catch { throw new Error('Invalid sync package JSON'); }
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)
    || incoming.version !== 1) {
    throw new Error('Unsupported sync package version');
  }
  const cards = assertRecords(incoming.cards, 'Incoming cards');
  const notes = assertRecords(incoming.notes, 'Incoming notes');
  const merge = (existing, additions) => {
    const out = new Map(existing.map(item => [item.id, item]));
    for (const record of additions) {
      const previous = out.get(record.id);
      if (!previous || (record.updatedAt ?? 0) > (previous.updatedAt ?? 0)) {
        out.set(record.id, record);
      }
    }
    return [...out.values()];
  };
  return {
    mergedCards: merge(existingCards, cards),
    mergedNotes: merge(existingNotes, notes),
    syncCount: cards.length + notes.length,
  };
}
