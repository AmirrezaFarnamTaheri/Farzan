/**
 * Legacy storage-key migration.
 *
 * Era 1: kebab-case plasma-* keys.
 * Era 2: snake_case plasma_* keys.
 * Era 3 (current): neutral ocd_* keys.
 *
 * Copies each legacy value forward (oldest era first) without overwriting a
 * value that already exists under a newer name, then removes the old key.
 * Safe to call multiple times (idempotent).
 */
const KEY_MIGRATIONS = [
  { from: 'plasma-theme', via: 'plasma_theme', to: 'ocd_theme' },
  { from: 'plasma-sidebar-collapsed', via: 'plasma_sidebar_collapsed', to: 'ocd_sidebar_collapsed' },
  { from: null, via: 'plasma_accent', to: 'ocd_accent' },
  { from: null, via: 'plasma_density', to: 'ocd_density' },
  { from: null, via: 'plasma_font_scale', to: 'ocd_font_scale' },
  { from: null, via: 'plasma_dir', to: 'ocd_dir' },
  { from: 'plasma-notes', via: null, to: 'ocd_notes' },
  { from: 'plasma-folders', via: null, to: 'ocd_folders' },
  { from: 'plasma-notes-settings', via: null, to: 'ocd_notes_settings' },
];

/** Accent ids were rebranded alongside the keys ('plasma' accent is now 'violet'). */
const VALUE_MIGRATIONS = [
  { key: 'ocd_accent', from: 'plasma', to: 'violet' },
];

// Notes and folders are user documents, not replaceable UI preferences. The
// old raw values may be the only recoverable copy even after a newer key has
// been written; the canonical IndexedDB migration is asynchronous and cannot
// be verified in this startup-only localStorage module.
const SAVED_RECORD_KEYS = new Set(['ocd_notes', 'ocd_folders']);

function parseSavedRecords(raw, { requireIds = false } = {}) {
  try {
    const records = JSON.parse(raw);
    if (!Array.isArray(records)) return null;
    const ids = new Set();
    for (const record of records) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
      if (!requireIds) continue;
      const id = record.id;
      if ((typeof id !== 'string' && typeof id !== 'number') || !String(id).trim()) return null;
      const identity = String(id);
      if (ids.has(identity)) return null;
      ids.add(identity);
    }
    return records;
  } catch {
    return null;
  }
}

function mergeSavedRecords(current, historical) {
  // Missing IDs, invalid JSON and collisions with changed content require
  // explicit recovery. They must never be silently replaced or re-IDed.
  const recent = parseSavedRecords(current, { requireIds: true });
  const legacy = parseSavedRecords(historical, { requireIds: true });
  if (!recent || !legacy) return null;
  const byId = new Map(recent.map(record => [String(record.id), record]));
  const result = [...recent];
  for (const record of legacy) {
    const key = String(record.id);
    if (byId.has(key)) {
      if (JSON.stringify(byId.get(key)) !== JSON.stringify(record)) return null;
      continue;
    }
    result.push(record);
    byId.set(key, record);
  }
  return result.length === recent.length ? current : JSON.stringify(result);
}

function reconcileSavedRecordKey(sources, destination) {
  // A completed IndexedDB migration is authoritative. Do not reconstruct a
  // stale localStorage mirror on the next boot; keep historical sources for
  // explicit repair/recovery until the cross-store archive is verified.
  if (localStorage.getItem('plasma_migrated_v2') === 'true') return;
  for (const source of sources) {
    const legacy = localStorage.getItem(source);
    if (legacy == null) continue;
    const current = localStorage.getItem(destination);
    const next = current == null
      ? (parseSavedRecords(legacy) ? legacy : null)
      : mergeSavedRecords(current, legacy);
    if (next == null || next === current) continue;
    localStorage.setItem(destination, next);
    if (localStorage.getItem(destination) !== next) {
      // A writer that returned without committing is not a migration receipt.
      throw new Error('Unacknowledged localStorage migration for ' + destination);
    }
  }
  // Deliberately keep original plasma-notes/plasma-folders bytes. This code
  // cannot prove that IndexedDB has safely imported every historical row.
}

export function migrateLegacyUiKeys() {
  try {
    for (const { from, via, to } of KEY_MIGRATIONS) {
      const sources = [from, via].filter(Boolean);
      if (SAVED_RECORD_KEYS.has(to)) {
        reconcileSavedRecordKey(sources, to);
        continue;
      }
      const current = localStorage.getItem(to);
      if (current == null) {
        for (const source of sources) {
          const legacy = localStorage.getItem(source);
          if (legacy != null) {
            localStorage.setItem(to, legacy);
            if (localStorage.getItem(to) !== legacy) {
              throw new Error('Unacknowledged preference migration for ' + to);
            }
            break;
          }
        }
      }
      for (const source of sources) {
        // UI preferences can choose an existing newer value; only clear old
        // aliases after confirming a newer key is readable.
        if (localStorage.getItem(to) != null) localStorage.removeItem(source);
      }
    }

    for (const { key, from, to } of VALUE_MIGRATIONS) {
      if (localStorage.getItem(key) === from) localStorage.setItem(key, to);
    }
  } catch {
    /* Storage unavailable, migration incomplete: leave legacy data in place. */
  }
}

migrateLegacyUiKeys();
