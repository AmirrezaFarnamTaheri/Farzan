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

export function migrateLegacyUiKeys() {
  try {
    for (const { from, via, to } of KEY_MIGRATIONS) {
      const sources = [from, via].filter(Boolean);
      const current = localStorage.getItem(to);
      if (current == null) {
        for (const source of sources) {
          const legacy = localStorage.getItem(source);
          if (legacy != null) {
            localStorage.setItem(to, legacy);
            break;
          }
        }
      }
      for (const source of sources) {
        // Only remove once the value is safe under a newer name.
        if (localStorage.getItem(to) != null || !sources.includes(source)) {
          localStorage.removeItem(source);
        }
      }
    }

    for (const { key, from, to } of VALUE_MIGRATIONS) {
      if (localStorage.getItem(key) === from) localStorage.setItem(key, to);
    }
  } catch {
    /* storage blocked or unavailable */
  }
}

migrateLegacyUiKeys();
