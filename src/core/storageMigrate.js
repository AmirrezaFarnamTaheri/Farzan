/**
 * Historically used kebab-case keys; canonical keys are snake_case only.
 * Safe to call multiple times (idempotent).
 */
export function migrateLegacyUiKeys() {
  try {
    const legacyTheme = localStorage.getItem('plasma-theme');
    if (legacyTheme != null) {
      if (localStorage.getItem('plasma_theme') == null) {
        localStorage.setItem('plasma_theme', legacyTheme);
      }
      localStorage.removeItem('plasma-theme');
    }

    const legacySb = localStorage.getItem('plasma-sidebar-collapsed');
    if (legacySb != null) {
      if (localStorage.getItem('plasma_sidebar_collapsed') == null) {
        localStorage.setItem('plasma_sidebar_collapsed', legacySb);
      }
      localStorage.removeItem('plasma-sidebar-collapsed');
    }
  } catch {
    /* storage blocked or unavailable */
  }
}

migrateLegacyUiKeys();
