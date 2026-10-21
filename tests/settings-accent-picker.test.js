import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountSettingsView } from '../src/views/settingsRoute.js';
import { Prefs } from '../src/core/prefs.js';
import { EventEmitter } from '../src/lib/eventEmitter.js';

/**
 * The Settings route had no accent control at all: `src/styles/accents.css`
 * shipped seven palettes and the shell honoured `data-accent`, but nothing
 * in index.html, app.js or src rendered a swatch. `.accent-dot` existed in
 * src/styles/utilities.css with a comment claiming index.html rendered
 * `<button class="accent-dot" data-accent="...">` — it never did.
 *
 * These tests pin the picker to the same Prefs module the shell uses, so
 * the rendered control and the delegated handler cannot drift apart.
 */
function mountSettings(bus) {
  document.body.innerHTML = '<main id="main-content"></main>';
  // The route reads the bus from the namespace, not from its dependencies.
  window.OpenCourseDeck = { ...(window.OpenCourseDeck || {}), bus };
  // The AI panel reads its persisted options through window.DB. It is not
  // under test here, but the panel still mounts and must not throw.
  window.DB = { getSetting: vi.fn(async () => null), saveSetting: vi.fn(async () => true) };
  const controller = mountSettingsView({
    setView: (html) => { document.getElementById('main-content').innerHTML = html; },
    ThemeManager: { syncToggles: vi.fn() },
    FontScale: { get: () => 1, inc: vi.fn(), dec: vi.fn(), reset: vi.fn() },
    Prefs,
    Toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    formatBytes: (value) => `${value} B`,
    localStorageFootprint: () => 0,
  });
  return controller;
}

describe('settings accent picker', () => {
  let bus;
  let controller;
  let dispose;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.setAttribute('data-accent', 'lapis');
    bus = new EventEmitter();
    const emitted = [];
    bus.on('accent:change', (payload) => emitted.push(payload));
    bus.emitted = emitted;
    dispose = Prefs.init({ bus });
    controller = mountSettings(bus);
  });

  afterEach(() => {
    controller?.unmount();
    dispose?.();
    controller = null;
    dispose = null;
  });

  it('renders one radio swatch per supported accent', () => {
    const swatches = document.querySelectorAll('[data-accent-option]');
    expect(swatches.length).toBe(Prefs.ACCENTS.length);
    expect([...swatches].map((el) => el.dataset.accentOption))
      .toEqual(Prefs.ACCENTS.map((accent) => accent.id));
    for (const swatch of swatches) {
      expect(swatch.getAttribute('role')).toBe('radio');
      expect(swatch.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('exposes the group as a labelled radiogroup', () => {
    const group = document.querySelector('[data-accent-options]');
    expect(group).not.toBeNull();
    expect(group.getAttribute('role')).toBe('radiogroup');
    expect(group.getAttribute('aria-label')).toBeTruthy();
  });

  it('marks the applied accent as checked and keeps a single tab stop', () => {
    document.documentElement.setAttribute('data-accent', 'violet');
    const controller2 = mountSettings(bus);
    const swatches = [...document.querySelectorAll('[data-accent-option]')];
    const checked = swatches.filter((el) => el.getAttribute('aria-checked') === 'true');
    expect(checked.length).toBe(1);
    expect(checked[0].dataset.accentOption).toBe('violet');
    expect(swatches.filter((el) => el.tabIndex === 0).length).toBe(1);
    expect(checked[0].tabIndex).toBe(0);
    controller2.unmount();
  });

  it('applies and persists the accent when a swatch is clicked', () => {
    const swatch = document.querySelector('[data-accent-option="emerald"]');
    swatch.click();

    expect(document.documentElement.getAttribute('data-accent')).toBe('emerald');
    expect(localStorage.getItem(Prefs.KEYS.accent)).toBe('emerald');
    expect(bus.emitted).toEqual([{ accent: 'emerald' }]);
    expect(swatch.getAttribute('aria-checked')).toBe('true');
  });

  it('emits accent:change once even though the delegated handler also runs', () => {
    document.querySelector('[data-accent-option="rose"]').click();
    expect(bus.emitted).toHaveLength(1);
    expect(bus.emitted[0]).toEqual({ accent: 'rose' });
  });

  it('does not rewrite the accent when an unrelated control is clicked', () => {
    document.getElementById('btn-font-inc').click();
    expect(localStorage.getItem(Prefs.KEYS.accent)).toBeNull();
    expect(document.documentElement.getAttribute('data-accent')).toBe('lapis');
    expect(bus.emitted).toHaveLength(0);
  });

  it('moves between swatches with the arrow keys and applies the new accent', () => {
    const swatches = [...document.querySelectorAll('[data-accent-option]')];
    swatches[0].focus();

    swatches[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.documentElement.getAttribute('data-accent')).toBe(swatches[1].dataset.accentOption);
    expect(swatches[1].getAttribute('aria-checked')).toBe('true');

    swatches[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    const last = swatches[swatches.length - 1];
    expect(document.documentElement.getAttribute('data-accent')).toBe(last.dataset.accentOption);
  });

  it('wraps to the last swatch when arrowing backwards from the first', () => {
    const swatches = [...document.querySelectorAll('[data-accent-option]')];
    swatches[0].focus();
    swatches[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    const last = swatches[swatches.length - 1];
    expect(document.documentElement.getAttribute('data-accent')).toBe(last.dataset.accentOption);
  });
});
