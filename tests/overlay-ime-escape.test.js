import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal, Drawer } from '../src/ui/overlays.js';

describe('overlay Escape preserves active multilingual IME composition (#175)', () => {
  let raf;
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<button id="opener">Open</button>'
      + '<div id="ocd-app"></div>'
      + '<div id="note-modal" class="modal-container" hidden>'
      + '<input id="modal-edit" aria-label="Persian text"></div>'
      + '<div id="note-drawer" class="drawer" hidden>'
      + '<input id="drawer-edit" aria-label="Chinese text"></div>';
    window.OpenCourseDeck = {
      config: { animationDuration: 0 },
      state: { openModals: [] },
      bus: { emit: vi.fn() },
    };
    raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(fn => setTimeout(fn, 0));
    document.getElementById('opener').focus();
  });

  afterEach(() => {
    Modal.close(document.getElementById('note-modal'));
    Drawer.close(document.getElementById('note-drawer'));
    Modal.destroy();
    Drawer.destroy();
    vi.runOnlyPendingTimers();
    raf.mockRestore();
    vi.useRealTimers();
    delete window.OpenCourseDeck;
    document.body.innerHTML = '';
  });

  const escape = (target, extras = {}) => {
    const event = new KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, cancelable: true, ...extras,
    });
    target.dispatchEvent(event);
    return event;
  };

  it('does not dismiss the current modal on Escape while Persian input composition is active', () => {
    const modal = document.getElementById('note-modal');
    Modal.open(modal);
    const field = document.getElementById('modal-edit');
    expect(window.OpenCourseDeck.state.openModals).toEqual([modal]);
    escape(field, { isComposing: true });
    expect(window.OpenCourseDeck.state.openModals).toEqual([modal]);
    expect(modal.hidden).toBe(false);
    escape(field);
    expect(window.OpenCourseDeck.state.openModals).toEqual([]);
  });

  it('does not dismiss a drawer on Escape during Chinese IME or keyCode 229', () => {
    const drawer = document.getElementById('note-drawer');
    Drawer.init();
    Drawer.open(drawer);
    const field = document.getElementById('drawer-edit');
    escape(field, { isComposing: true });
    expect(drawer.hidden).toBe(false);
    expect(document.getElementById('ocd-app').hasAttribute('inert')).toBe(true);
    const processingEscape = escape(field);
    Object.defineProperty(processingEscape, 'keyCode', { value: 229 });
    // Construct and dispatch an explicitly 229-marked event: the already
    // dispatched event above is just a normal Escape and must close.
    Drawer.open(drawer);
    const composing = new KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, cancelable: true,
    });
    Object.defineProperty(composing, 'keyCode', { value: 229 });
    field.dispatchEvent(composing);
    expect(drawer.hidden).toBe(false);
    expect(document.getElementById('ocd-app').hasAttribute('inert')).toBe(true);
    escape(field);
    vi.runOnlyPendingTimers();
    expect(drawer.hidden).toBe(true);
  });
});
