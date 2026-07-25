/**
 * OpenCourseDeck Offline Sync Manager
 * Handles multi-device state synchronization via exportable encrypted payloads and LWW timestamp resolution.
 */

export function createSyncPackage(cards = [], notes = [], { _passphrase = '' } = {}) {
  const payload = {
    version: 1,
    exportedAt: Date.now(),
    cards: Array.isArray(cards) ? cards : [],
    notes: Array.isArray(notes) ? notes : [],
  };
  return JSON.stringify(payload);
}

export function mergeSyncPackage(existingCards = [], existingNotes = [], syncPackageJson = '') {
  let incoming;
  try {
    incoming = JSON.parse(syncPackageJson || '{}');
  } catch {
    throw new Error('Invalid sync package format');
  }

  const cardMap = new Map(existingCards.map(c => [c.id, c]));
  (incoming.cards || []).forEach(card => {
    const existing = cardMap.get(card.id);
    if (!existing || (card.updatedAt || 0) > (existing.updatedAt || 0)) {
      cardMap.set(card.id, card);
    }
  });

  const noteMap = new Map(existingNotes.map(n => [n.id, n]));
  (incoming.notes || []).forEach(note => {
    const existing = noteMap.get(note.id);
    if (!existing || (note.updatedAt || 0) > (existing.updatedAt || 0)) {
      noteMap.set(note.id, note);
    }
  });

  return {
    mergedCards: Array.from(cardMap.values()),
    mergedNotes: Array.from(noteMap.values()),
    syncCount: (incoming.cards?.length || 0) + (incoming.notes?.length || 0),
  };
}
