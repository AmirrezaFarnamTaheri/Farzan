
import { createElement, eventTargetEl } from '../lib/dom.js';
import { Modal } from '../ui/overlays.js';

export const KeyboardShortcuts = {
  _shortcuts: [],

  register(combo, handler, description = '') {
    this._shortcuts.push({ combo: combo.toLowerCase(), handler, description });
    return this;
  },

  init() {
    // Idempotent: repeated init() calls previously stacked anonymous,
    // unremovable document listeners.
    if (this._bound) return this;
    // `[contenteditable]` alone also matches contenteditable="false" (a common
    // read-only island inside an editor), which suppressed every shortcut —
    // the exact inverse of the intent.
    const EDITABLE = 'input,textarea,select,[contenteditable]:not([contenteditable="false"])';
    this._bound = (e) => {
      const target = eventTargetEl(e);
      if (target?.matches?.(EDITABLE)) return;
      if (target?.closest?.('[contenteditable]:not([contenteditable="false"])')) return;

      const combo = [
        e.ctrlKey  ? 'ctrl'  : '',
        // Include meta: without it, held Cmd did not disqualify a match, so
        // Cmd+Ctrl+K fired the 'ctrl+k' shortcut and hijacked the browser's
        // own Cmd shortcuts via preventDefault().
        e.metaKey  ? 'meta'  : '',
        e.altKey   ? 'alt'   : '',
        e.shiftKey ? 'shift' : '',
        e.key.toLowerCase(),
      ].filter(Boolean).join('+');

      for (const { combo: c, handler } of this._shortcuts) {
        if (c === combo) {
          e.preventDefault();
          handler(e);
          return;
        }
      }
    };
    document.addEventListener('keydown', this._bound);
    return this;
  },

  destroy() {
    if (this._bound) document.removeEventListener('keydown', this._bound);
    this._bound = null;
    return this;
  },

  showHelp() {
    const table = createElement('table', { class: 'shortcuts-table' });
    const tbody = document.createElement('tbody');
    this._shortcuts.forEach((shortcut) => {
      const tr = document.createElement('tr');
      tr.append(
        createElement('td', {}, createElement('kbd', {}, shortcut.combo)),
        createElement('td', {}, shortcut.description)
      );
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    Modal.create({
      title: 'Keyboard Shortcuts',
      body:  table,
      size:  'sm',
    });
  },
};

// Alias: the live consumers (src/views/helpRoute.js and
// src/features/commandPalette.js) call `_showHelp()`, matching the inline
// implementation in app.js. Without this, swapping in this module would make
// both call sites silent no-ops (they use optional chaining).
KeyboardShortcuts._showHelp = KeyboardShortcuts.showHelp;

