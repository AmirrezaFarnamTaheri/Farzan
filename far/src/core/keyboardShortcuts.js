
import { createElement, eventTargetEl } from '../lib/dom.js';
import { Modal } from '../ui/overlays.js';

export const KeyboardShortcuts = {
  _shortcuts: [],

  register(combo, handler, description = '') {
    this._shortcuts.push({ combo: combo.toLowerCase(), handler, description });
    return this;
  },

  init() {
    document.addEventListener('keydown', e => {
      const target = eventTargetEl(e);
      if (target?.matches?.('input,textarea,select,[contenteditable],[contenteditable="true"]')) return;
      if (target?.closest?.('[contenteditable],[contenteditable="true"]')) return;
      
      const combo = [
        e.ctrlKey  ? 'ctrl'  : '',
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
    });
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
      title: '?? Keyboard Shortcuts',
      body:  table,
      size:  'sm',
    });
  },
};

