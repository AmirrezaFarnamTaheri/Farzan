import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initCommandPalette } from '../src/features/commandPalette.js';
import Fuse from 'fuse.js';

describe('command palette uses vendored Fuse.js matching', () => {
  afterEach(() => { delete window.Fuse; });
  beforeEach(() => {
    document.body.innerHTML = `
      <main id="ocd-app"></main>
      <button id="opener">Search</button>
      <div id="command-palette-overlay" aria-hidden="true">
        <div id="command-palette">
          <input id="cp-input" />
          <div id="cp-categories">
            <button class="cp-cat active" data-cat="all"></button>
            <button class="cp-cat" data-cat="theme"></button>
          </div>
          <ul id="cp-results"></ul>
        </div>
      </div>`;
    window.Fuse = Fuse;
    window.OpenCourseDeck = {
      Router: { navigate: vi.fn() },
      ThemeManager: { apply: vi.fn(), set: vi.fn() },
      bus: { emit: vi.fn() },
    };
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('finds a misspelled navigation command and executes it by keyboard', () => {
    initCommandPalette();
    window.OpenCourseDeck.CommandPalette.open();
    const input = document.getElementById('cp-input');
    input.value = 'Couses';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const options = [...document.querySelectorAll('#cp-results .cp-item-label')]
      .map(el => el.textContent);
    expect(options[0]).toBe('Courses');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(window.OpenCourseDeck.Router.navigate).toHaveBeenCalledWith('#/courses');
  });

  it('ranks exact matches ahead of partial ones and respects category boundaries', () => {
    initCommandPalette();
    window.OpenCourseDeck.CommandPalette.open();
    const input = document.getElementById('cp-input');
    input.value = 'Courses';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelector('#cp-results .cp-item-label')?.textContent).toBe('Courses');
    document.querySelector('[data-cat="theme"]').click();
    input.value = 'Couses';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelector('#cp-results .cp-item[aria-disabled="true"]')?.textContent).toBe('No results');
    input.value = 'Theme: Light';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(window.OpenCourseDeck.ThemeManager.apply).toHaveBeenCalledWith('light');
  });
});
