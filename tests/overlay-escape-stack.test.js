import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Drawer, Modal } from '../src/ui/overlays.js';

describe('Escape dismisses only the topmost overlay owner (#175)', () => {
  let raf;
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<button id="original">Return here</button>'
      + '<div id="ocd-app"></div>'
      + '<div id="background-drawer" class="drawer" hidden>'
      + '<button id="drawer-button">Keep this drawer</button></div>'
      + '<div id="top-modal" class="modal-container" hidden>'
      + '<input id="modal-input" aria-label="Topmost text editor"></div>';
    window.OpenCourseDeck = {
      config: { animationDuration: 0 },
      state: { openModals: [] },
      bus: { emit: vi.fn() },
    };
    raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(fn => setTimeout(fn, 0));
    document.getElementById('original').focus();
  });

  afterEach(() => {
    Modal.close(document.getElementById('top-modal'));
    Drawer.close(document.getElementById('background-drawer'));
    Drawer.destroy();
    Modal.destroy();
    vi.runOnlyPendingTimers();
    raf.mockRestore();
    vi.useRealTimers();
    delete window.OpenCourseDeck;
    document.body.innerHTML = '';
  });

  it('keeps the drawer open even when its Escape listener is registered after the modal listener', () => {
    // A route can create a modal before shared Drawer.init() is called.
    // The modal's handler then runs first and removes the active-modal stack.
    // The same Escape must not fall through into a background drawer.
    const drawer = document.getElementById('background-drawer');
    const modal = document.getElementById('top-modal');
    Drawer.open(drawer);
    Modal.open(modal);
    Drawer.init();
    vi.advanceTimersByTime(0);
    expect(window.OpenCourseDeck.state.openModals).toEqual([modal]);
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, cancelable: true,
    }));
    expect(window.OpenCourseDeck.state.openModals).toEqual([]);
    expect(drawer.hidden).toBe(false);
    expect(drawer.classList.contains('open')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.getElementById('ocd-app').hasAttribute('inert')).toBe(true);
  });

  it.each([
    ['before the opening animation', false],
    ['after the opening animation', true],
  ])('Escape leaves the underlying drawer open %s', (_label, painted) => {
    const drawer = document.getElementById('background-drawer');
    const modal = document.getElementById('top-modal');
    Drawer.init();
    Drawer.open(drawer);
    Modal.open(modal);
    if (painted) vi.advanceTimersByTime(0);

    expect(window.OpenCourseDeck.state.openModals).toEqual([modal]);
    expect(document.getElementById('ocd-app').hasAttribute('inert')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, cancelable: true,
    }));

    expect(window.OpenCourseDeck.state.openModals).toEqual([]);
    expect(drawer.hidden).toBe(false);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.getElementById('ocd-app').hasAttribute('inert')).toBe(true);
    vi.advanceTimersByTime(0);
    expect(drawer.classList.contains('open')).toBe(true);
    expect(drawer.contains(document.activeElement)).toBe(true);
  });
});
