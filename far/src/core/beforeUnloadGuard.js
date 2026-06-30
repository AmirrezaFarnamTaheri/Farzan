/**
 * Warn before closing the tab when there may be unsaved work.
 * Browsers only show a generic confirmation — we still set returnValue when blocking.
 * On page hide, best-effort flush of pending note saves (see notes.js).
 */

const REASONS = new Set();

function shouldBlock() {
  return REASONS.size > 0;
}

export function initBeforeUnloadGuard() {
  const w = window;
  w.OpenCourseDeck = w.OpenCourseDeck ?? {};
  w.OpenCourseDeck.beforeUnload = {
    /** @param {string} [key] */
    mark(key = 'generic') {
      REASONS.add(key);
    },
    /** @param {string} [key] */
    unmark(key = 'generic') {
      REASONS.delete(key);
    },
    clear() {
      REASONS.clear();
    },
    isBlocking: () => shouldBlock(),
  };

  w.addEventListener('beforeunload', (e) => {
    if (!shouldBlock()) return;
    e.preventDefault();
    e.returnValue = '';
  });

  w.addEventListener('pagehide', () => {
    try {
      // Flush debounced note save + title when possible (tab close / navigation)
      w.PlasmaNotesApp?.flushPendingSave?.();
    } catch {
      /* ignore */
    }
  });
}
