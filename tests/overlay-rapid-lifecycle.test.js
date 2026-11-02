import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Modal, Drawer } from '../src/ui/overlays.js';

describe('shared overlay lifecycle before the first paint (#175)', () => {
  let raf;
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<button id="opener">Open</button>'
      + '<div id="ocd-app"></div>'
      + '<div id="dialog" class="modal-container" hidden>'
      + '<h2 class="modal-title">Study dialog</h2><button data-modal-close>Dismiss</button></div>'
      + '<div id="drawer" class="drawer" hidden><button>Dismiss drawer</button></div>';
    window.OpenCourseDeck = {
      config: { animationDuration: 20 }, state: { openModals: [] },
      bus: { emit: vi.fn() },
    };
    raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(fn => setTimeout(fn, 0));
    document.getElementById('opener').focus();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    Modal._cleanupFns?.get(document.getElementById('dialog'))?.();
    Drawer._cleanupFns?.get(document.getElementById('drawer'))?.();
    raf.mockRestore();
    vi.useRealTimers();
    document.body.innerHTML = '';
    delete window.OpenCourseDeck;
  });

  it('closes a modal immediately before its first animation without stranding inert background', () => {
    const modal = document.getElementById('dialog');
    Modal.open(modal);
    expect(window.OpenCourseDeck.state.openModals).toEqual([modal]);
    Modal.close(modal);
    vi.runAllTimers();
    expect(modal.hidden).toBe(true);
    expect(modal.classList.contains('open')).toBe(false);
    expect(document.querySelector('.modal-backdrop')).toBeNull();
    expect(window.OpenCourseDeck.state.openModals).toEqual([]);
    expect(document.getElementById('ocd-app').hasAttribute('inert')).toBe(false);
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(document.getElementById('opener'));
  });

  it('closes a drawer before first animation without reactivating its stale frame', () => {
    const drawer = document.getElementById('drawer');
    Drawer.open(drawer);
    Drawer.close(drawer);
    vi.runAllTimers();
    expect(drawer.hidden).toBe(true);
    expect(drawer.classList.contains('open')).toBe(false);
    expect(document.querySelector('.drawer-backdrop')).toBeNull();
    expect(document.getElementById('ocd-app').hasAttribute('inert')).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });

  it('does not let a previous modal opening frame modify a new open-close generation', () => {
    const modal = document.getElementById('dialog');
    Modal.open(modal);
    Modal.close(modal);
    Modal.open(modal);
    vi.advanceTimersByTime(0);
    expect(modal.classList.contains('open')).toBe(true);
    expect(window.OpenCourseDeck.state.openModals).toEqual([modal]);
    expect(document.querySelector('.modal-backdrop.open')).not.toBeNull();
    Modal.close(modal);
    vi.runAllTimers();
    expect(modal.hidden).toBe(true);
    expect(window.OpenCourseDeck.state.openModals).toEqual([]);
    expect(document.getElementById('ocd-app').hasAttribute('inert')).toBe(false);
  });

  it('lets Escape closeAll dismiss a drawer that has not painted its first frame', () => {
    const drawer = document.getElementById('drawer');
    Drawer.open(drawer);
    // Drawer.init delegates Escape to closeAll(). The pending opening frame
    // must count as an open drawer even before its CSS .open class exists.
    Drawer.closeAll();
    vi.runAllTimers();
    expect(drawer.hidden).toBe(true);
    expect(drawer.classList.contains('open')).toBe(false);
    expect(document.querySelector('.drawer-backdrop')).toBeNull();
    expect(document.getElementById('ocd-app').hasAttribute('inert')).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });

  it('keeps a second still-opening drawer modal when a previous drawer closes before paint', () => {
    // Simulate a browser that defers animation frames while timeouts still run.
    // A pending second drawer owns its backdrop, scroll lock and focus trap.
    const frames = [];
    raf.mockImplementation(callback => { frames.push(callback); return frames.length; });
    const first = document.getElementById('drawer');
    const second = document.createElement('div');
    second.id = 'drawer-secondary';
    second.className = 'drawer';
    second.hidden = true;
    second.innerHTML = '<button id="drawer-secondary-action">Keep editing</button>';
    document.body.appendChild(second);
    Drawer.open(first);
    Drawer.open(second);
    const action = document.getElementById('drawer-secondary-action');
    expect(document.activeElement).toBe(action);
    expect(document.getElementById('ocd-app').hasAttribute('inert')).toBe(true);

    Drawer.close(first);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement).toBe(action);
    vi.advanceTimersByTime(20);
    expect(document.querySelector('.drawer-backdrop')).not.toBeNull();
    expect(second.hidden).toBe(false);
    frames.forEach(frame => frame());
    expect(second.classList.contains('open')).toBe(true);
    expect(document.querySelector('.drawer-backdrop.open')).not.toBeNull();
    expect(document.getElementById('ocd-app').hasAttribute('inert')).toBe(true);

    Drawer.close(second);
    vi.runAllTimers();
    expect(document.body.style.overflow).toBe('');
    expect(document.getElementById('ocd-app').hasAttribute('inert')).toBe(false);
    expect(document.querySelector('.drawer-backdrop')).toBeNull();
  });

  it('keeps background scroll locked when the top modal closes over a painted drawer', () => {
    const modal = document.getElementById('dialog');
    const drawer = document.getElementById('drawer');
    Drawer.open(drawer);
    Modal.open(modal);
    vi.advanceTimersByTime(0);
    expect(document.body.style.overflow).toBe('hidden');
    try {
      Modal.close(modal);
      expect(window.OpenCourseDeck.state.openModals).toEqual([]);
      expect(drawer.classList.contains('open')).toBe(true);
      // The drawer still owns the scroll lock even though no modal remains.
      expect(document.body.style.overflow).toBe('hidden');
      expect(document.getElementById('ocd-app').hasAttribute('inert')).toBe(true);
    } finally {
      Modal.close(modal);
      Drawer.close(drawer);
      vi.runAllTimers();
    }
    expect(document.body.style.overflow).toBe('');
    expect(document.getElementById('ocd-app').hasAttribute('inert')).toBe(false);
  });

  it('retains drawer scroll ownership before its first animation frame when a modal closes', () => {
    const frames = [];
    raf.mockImplementation(callback => { frames.push(callback); return frames.length; });
    const modal = document.getElementById('dialog');
    const drawer = document.getElementById('drawer');
    Modal.open(modal);
    Drawer.open(drawer);
    try {
      Modal.close(modal);
      expect(drawer.hidden).toBe(false);
      expect(drawer.classList.contains('open')).toBe(false);
      expect(document.body.style.overflow).toBe('hidden');
      expect(document.getElementById('ocd-app').hasAttribute('inert')).toBe(true);
      frames.forEach(callback => callback());
      expect(drawer.classList.contains('open')).toBe(true);
      expect(document.body.style.overflow).toBe('hidden');
    } finally {
      Modal.close(modal);
      Drawer.close(drawer);
      vi.runAllTimers();
    }
    expect(document.body.style.overflow).toBe('');
    expect(document.getElementById('ocd-app').hasAttribute('inert')).toBe(false);
  });

  it('does not let a prior drawer opening frame resurrect a closed replacement', () => {
    const drawer = document.getElementById('drawer');
    Drawer.open(drawer);
    Drawer.close(drawer);
    Drawer.open(drawer);
    vi.advanceTimersByTime(0);
    expect(drawer.classList.contains('open')).toBe(true);
    Drawer.close(drawer);
    vi.runAllTimers();
    expect(drawer.hidden).toBe(true);
    expect(drawer.classList.contains('open')).toBe(false);
    expect(document.getElementById('ocd-app').hasAttribute('inert')).toBe(false);
  });
});
