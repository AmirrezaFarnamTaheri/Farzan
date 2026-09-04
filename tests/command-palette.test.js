import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initCommandPalette } from '../src/features/commandPalette.js';

describe('command palette', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main id="ocd-app"></main>
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
    window.OpenCourseDeck = {
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
    window.OpenCourseDeck.CommandPalette.open();

    const input = document.getElementById('cp-input');
    input.value = 'Courses';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(window.OpenCourseDeck.Router.navigate).toHaveBeenCalledWith('#/courses');

    window.OpenCourseDeck.CommandPalette.open();
    input.value = 'Theme: Light';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(window.OpenCourseDeck.ThemeManager.apply).toHaveBeenCalledWith('light');
    expect(window.OpenCourseDeck.ThemeManager.set).not.toHaveBeenCalled();
  });

  it('runs library creation commands through AddContent', () => {
    window.OpenCourseDeck.AddContent = {
      addVideo: vi.fn(),
      addPdf: vi.fn(),
      createTopic: vi.fn(),
      createCourse: vi.fn(),
      addLink: vi.fn(),
    };
    initCommandPalette();
    window.OpenCourseDeck.CommandPalette.open();

    const input = document.getElementById('cp-input');
    input.value = 'Create course';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(window.OpenCourseDeck.AddContent.createCourse).toHaveBeenCalled();
  });

  it('late-binds optional app globals and tolerates missing services', () => {
    window.OpenCourseDeck = { bus: { emit: vi.fn() } };
    expect(() => initCommandPalette()).not.toThrow();
    expect(() => window.OpenCourseDeck.CommandPalette.open()).not.toThrow();

    const input = document.getElementById('cp-input');
    input.value = 'Theme: Light';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }).not.toThrow();

    window.OpenCourseDeck.Router = { navigate: vi.fn() };
    window.OpenCourseDeck.CommandPalette.open();
    input.value = 'Courses';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(window.OpenCourseDeck.Router.navigate).toHaveBeenCalledWith('#/courses');
  });

  it('traps focus, inert background, and restores opener on close', () => {
    initCommandPalette();
    const opener = document.getElementById('opener');
    const app = document.getElementById('ocd-app');
    const input = document.getElementById('cp-input');
    opener.focus();

    window.OpenCourseDeck.CommandPalette.open();

    expect(document.activeElement).toBe(input);
    expect(app.hasAttribute('inert')).toBe(true);
    opener.focus();
    expect(document.activeElement).toBe(input);

    window.OpenCourseDeck.CommandPalette.close();

    expect(app.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('keeps command palette close idempotent for inert bookkeeping', () => {
    initCommandPalette();
    const app = document.getElementById('ocd-app');

    window.OpenCourseDeck.CommandPalette.open();
    window.OpenCourseDeck.CommandPalette.close();
    window.OpenCourseDeck.CommandPalette.close();

    expect(app.hasAttribute('inert')).toBe(false);
    window.OpenCourseDeck.CommandPalette.open();
    expect(app.hasAttribute('inert')).toBe(true);
  });
});
