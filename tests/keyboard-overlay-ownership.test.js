import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardShortcuts } from '../src/core/keyboardShortcuts.js';

describe('canonical shared shortcuts respect overlay and IME focus (#175)', () => {
  let originals, handler;
  beforeEach(() => {
    originals = KeyboardShortcuts._shortcuts;
    KeyboardShortcuts.destroy();
    KeyboardShortcuts._shortcuts = [];
    document.body.innerHTML = '<button id="background">Background action</button>';
    handler = vi.fn();
    KeyboardShortcuts.register('ctrl+k', handler, 'Search page');
    KeyboardShortcuts.init();
  });
  afterEach(() => {
    KeyboardShortcuts.destroy();
    KeyboardShortcuts._shortcuts = originals;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });
  const trigger = (target = document.getElementById('background'), extras = {}) => {
    const event = new KeyboardEvent('keydown', {
      key: 'k', ctrlKey: true, bubbles: true, cancelable: true, ...extras,
    });
    target.dispatchEvent(event);
    return event;
  };

  it('runs shortcuts on the ordinary page but not behind open or first-paint overlays', () => {
    const first = trigger();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(first.defaultPrevented).toBe(true);

    const modal = document.createElement('div');
    modal.className = 'modal-container';
    modal.setAttribute('role', 'dialog');
    modal.hidden = false; // open() has begun, first paint has not occurred
    document.body.append(modal);
    expect(trigger().defaultPrevented).toBe(false);
    modal.classList.add('open');
    expect(trigger().defaultPrevented).toBe(false);
    modal.hidden = true;
    modal.classList.remove('open');
    expect(trigger().defaultPrevented).toBe(true);

    const drawer = document.createElement('div');
    drawer.className = 'drawer';
    document.body.append(drawer);
    drawer.hidden = false;
    expect(trigger().defaultPrevented).toBe(false);
    drawer.hidden = true;

    const native = document.createElement('dialog');
    document.body.append(native);
    native.setAttribute('open', '');
    expect(trigger().defaultPrevented).toBe(false);
    native.removeAttribute('open');
    expect(trigger().defaultPrevented).toBe(true);
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('never dispatches app shortcuts from a composing Persian/Chinese IME session', () => {
    const input = document.getElementById('background');
    const composition = trigger(input, { isComposing: true });
    expect(composition.defaultPrevented).toBe(false);
    const processKey = new KeyboardEvent('keydown', {
      key: 'Process', ctrlKey: true, bubbles: true, cancelable: true,
    });
    input.dispatchEvent(processKey);
    expect(processKey.defaultPrevented).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(trigger().defaultPrevented).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
