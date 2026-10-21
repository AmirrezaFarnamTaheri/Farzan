import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prefs } from '../src/core/prefs.js';

/**
 * Regression cover for the accent preference.
 *
 * The delegated click handler used to resolve swatches with a bare
 * `[data-accent]` selector. The root <html> element carries
 * data-accent="lapis" itself, so `target.closest('[data-accent]')` matched
 * the document element for EVERY click in the app: any click rewrote
 * ocd_accent, re-applied every unrelated preference, and emitted
 * accent:change. Swatches now opt in with [data-accent-option].
 */
describe('prefs accent handling', () => {
  let dispose = null;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.setAttribute('data-accent', 'lapis');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    if (dispose) dispose();
    dispose = null;
  });

  it('exposes exactly the accents that have a palette', () => {
    const ids = Prefs.ACCENTS.map((accent) => accent.id);
    expect(ids).toEqual(['lapis', 'violet', 'cyan', 'amber', 'rose', 'emerald', 'sakura']);
    for (const accent of Prefs.ACCENTS) {
      expect(accent.label).toBeTruthy();
      expect(accent.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('resolves unknown or legacy accent ids to the default', () => {
    expect(Prefs.resolveAccent('violet')).toBe('violet');
    expect(Prefs.resolveAccent('VIOLET')).toBe('violet');
    expect(Prefs.resolveAccent('ocean')).toBe(Prefs.DEFAULT_ACCENT);
    expect(Prefs.resolveAccent('')).toBe(Prefs.DEFAULT_ACCENT);
    expect(Prefs.resolveAccent(null)).toBe(Prefs.DEFAULT_ACCENT);
  });

  it('does not rewrite the accent when an unrelated element is clicked', () => {
    const bus = { emit: vi.fn() };
    const applyAll = vi.spyOn(Prefs, 'applyAll');

    dispose = Prefs.init({ bus });
    // init() itself calls applyAll() once to re-assert persisted settings.
    applyAll.mockClear();

    // A plain element far away from any accent swatch.
    const unrelated = document.createElement('button');
    unrelated.textContent = 'unrelated';
    document.body.appendChild(unrelated);
    unrelated.click();

    expect(localStorage.getItem(Prefs.KEYS.accent)).toBeNull();
    expect(document.documentElement.getAttribute('data-accent')).toBe('lapis');
    expect(bus.emit).not.toHaveBeenCalledWith('accent:change', expect.anything());
    expect(applyAll).not.toHaveBeenCalled();
  });

  it('does not rewrite the accent when the root element itself is clicked', () => {
    const bus = { emit: vi.fn() };
    const applyAll = vi.spyOn(Prefs, 'applyAll');
    dispose = Prefs.init({ bus });
    // init() itself calls applyAll() once to re-assert persisted settings.
    applyAll.mockClear();

    document.documentElement.click();

    expect(localStorage.getItem(Prefs.KEYS.accent)).toBeNull();
    expect(document.documentElement.getAttribute('data-accent')).toBe('lapis');
    expect(bus.emit).not.toHaveBeenCalledWith('accent:change', expect.anything());
  });

  it('applies an accent only for an explicit swatch and emits once', () => {
    const bus = { emit: vi.fn() };
    const applyAll = vi.spyOn(Prefs, 'applyAll');
    dispose = Prefs.init({ bus });
    // init() itself calls applyAll() once to re-assert persisted settings.
    applyAll.mockClear();

    const swatch = document.createElement('button');
    swatch.dataset.accentOption = 'violet';
    document.body.appendChild(swatch);

    swatch.click();

    expect(document.documentElement.getAttribute('data-accent')).toBe('violet');
    expect(localStorage.getItem(Prefs.KEYS.accent)).toBe('violet');
    expect(bus.emit).toHaveBeenCalledTimes(1);
    expect(bus.emit).toHaveBeenCalledWith('accent:change', { accent: 'violet' });
    // An accent change must not re-apply density, direction, language or font scale.
    expect(applyAll).not.toHaveBeenCalled();
  });

  it('ignores an unsupported accent id', () => {
    const bus = { emit: vi.fn() };
    const applyAll = vi.spyOn(Prefs, 'applyAll');
    dispose = Prefs.init({ bus });
    // init() itself calls applyAll() once to re-assert persisted settings.
    applyAll.mockClear();

    const swatch = document.createElement('button');
    swatch.dataset.accentOption = 'not-a-real-accent';
    document.body.appendChild(swatch);

    swatch.click();

    expect(localStorage.getItem(Prefs.KEYS.accent)).toBeNull();
    expect(document.documentElement.getAttribute('data-accent')).toBe('lapis');
    expect(bus.emit).not.toHaveBeenCalled();
  });

  it('setAccent persists, applies and reports whether it changed anything', () => {
    const bus = { emit: vi.fn() };

    expect(Prefs.setAccent('cyan', bus)).toBe(true);
    expect(document.documentElement.getAttribute('data-accent')).toBe('cyan');
    expect(localStorage.getItem(Prefs.KEYS.accent)).toBe('cyan');
    expect(bus.emit).toHaveBeenCalledWith('accent:change', { accent: 'cyan' });

    bus.emit.mockClear();
    // Re-applying the same accent is a no-op and must not re-emit.
    expect(Prefs.setAccent('cyan', bus)).toBe(true);
    expect(bus.emit).not.toHaveBeenCalled();

    expect(Prefs.setAccent('nope', bus)).toBe(false);
  });
});
