import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initCommandPalette } from '../src/features/commandPalette.js';

describe('command palette', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main id="plasma-app"></main>
      <button id="opener">Open palette</button>
      <div id="command-palette-overlay" aria-hidden="true">
        <div id="command-palette">
          <input id="cp-input" />
          <div id="cp-categories">
            <button class="cp-cat active" data-cat="all"></button>
            <button class="cp-cat" data-cat="theme"></button>
          </div>
          <ul id="cp-results"></ul>
        </div>
      </div>
    `;
    window.PlasmaDeck = {
      Router: { navigate: vi.fn() },
      ThemeManager: { apply: vi.fn(), set: vi.fn() },
      Prefs: { KEYS: { density: 'density' }, set: vi.fn(), applyAll: vi.fn() },
      FontScale: { inc: vi.fn(), dec: vi.fn(), reset: vi.fn() },
      bus: { emit: vi.fn() },
    };
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('navigates and applies themes through current app APIs', () => {
    initCommandPalette();
    window.PlasmaDeck.CommandPalette.open();

    const input = document.getElementById('cp-input');
    input.value = 'Courses';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(window.PlasmaDeck.Router.navigate).toHaveBeenCalledWith('#/courses');

    window.PlasmaDeck.CommandPalette.open();
    input.value = 'Theme: Light';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(window.PlasmaDeck.ThemeManager.apply).toHaveBeenCalledWith('light');
    expect(window.PlasmaDeck.ThemeManager.set).not.toHaveBeenCalled();
  });

  it('late-binds optional app globals and tolerates missing services', () => {
    window.PlasmaDeck = { bus: { emit: vi.fn() } };
    expect(() => initCommandPalette()).not.toThrow();
    expect(() => window.PlasmaDeck.CommandPalette.open()).not.toThrow();

    const input = document.getElementById('cp-input');
    input.value = 'Theme: Light';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }).not.toThrow();

    window.PlasmaDeck.Router = { navigate: vi.fn() };
    window.PlasmaDeck.CommandPalette.open();
    input.value = 'Courses';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(window.PlasmaDeck.Router.navigate).toHaveBeenCalledWith('#/courses');
  });

  it('traps focus, inert background, and restores opener on close', () => {
    initCommandPalette();
    const opener = document.getElementById('opener');
    const app = document.getElementById('plasma-app');
    const input = document.getElementById('cp-input');
    opener.focus();

    window.PlasmaDeck.CommandPalette.open();

    expect(document.activeElement).toBe(input);
    expect(app.hasAttribute('inert')).toBe(true);
    opener.focus();
    expect(document.activeElement).toBe(input);

    window.PlasmaDeck.CommandPalette.close();

    expect(app.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('keeps command palette close idempotent for inert bookkeeping', () => {
    initCommandPalette();
    const app = document.getElementById('plasma-app');

    window.PlasmaDeck.CommandPalette.open();
    window.PlasmaDeck.CommandPalette.close();
    window.PlasmaDeck.CommandPalette.close();

    expect(app.hasAttribute('inert')).toBe(false);
    window.PlasmaDeck.CommandPalette.open();
    expect(app.hasAttribute('inert')).toBe(true);
  });
});
