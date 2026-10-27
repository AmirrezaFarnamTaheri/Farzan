import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fuse from 'fuse.js';
import { initCommandPalette } from '../src/features/commandPalette.js';
import { loadVendorScript } from '../src/core/vendorLoader.js';

vi.mock('../src/core/vendorLoader.js', () => ({ loadVendorScript: vi.fn() }));

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function input(value) {
  const field = document.querySelector('#cp-input');
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  return field;
}
function selectedLabel() {
  return document.querySelector('#cp-results .cp-item[aria-selected="true"] .cp-item-label')?.textContent;
}
function resultLabels() {
  return [...document.querySelectorAll('#cp-results .cp-item-label')].map(el => el.textContent);
}
function key(field, keyName) {
  field.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, bubbles: true }));
}

describe('command palette async Fuse.js selection consistency', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main id="ocd-app"></main>
      <div id="command-palette-overlay" aria-hidden="true">
        <div id="command-palette">
          <input id="cp-input"/>
          <div id="cp-categories"><button class="cp-cat active" data-cat="all"></button>
            <button class="cp-cat" data-cat="theme"></button></div>
          <ul id="cp-results"></ul>
        </div>
      </div>`;
    delete window.Fuse;
    window.OpenCourseDeck = {
      Router: { navigate: vi.fn() },
      ThemeManager: { apply: vi.fn() },
    };
    Element.prototype.scrollIntoView = vi.fn();
    vi.mocked(loadVendorScript).mockReset();
  });
  afterEach(() => { delete window.Fuse; vi.restoreAllMocks(); });

  it('keeps the intended keyboard-selected command when Fuse resolves and reorders results', async () => {
    let finishLoading;
    vi.mocked(loadVendorScript).mockReturnValue(new Promise(resolve => { finishLoading = resolve; }));
    initCommandPalette();
    window.OpenCourseDeck.CommandPalette.open();
    const field = input('co');
    const initial = resultLabels();
    const selectedIndex = initial.indexOf('My Courses');
    expect(selectedIndex).toBeGreaterThan(0);
    for (let i = 0; i < selectedIndex; i++) key(field, 'ArrowDown');
    expect(selectedLabel()).toBe('My Courses');
    finishLoading(Fuse);
    await flush();
    expect(selectedLabel()).toBe('My Courses');
    key(field, 'Enter');
    expect(window.OpenCourseDeck.Router.navigate).toHaveBeenCalledWith('#/my-courses');
  });

  it('ignores a late hover event from a detached result after Fuse reorder', async () => {
    let finishLoading;
    vi.mocked(loadVendorScript).mockReturnValue(new Promise(resolve => { finishLoading = resolve; }));
    initCommandPalette();
    window.OpenCourseDeck.CommandPalette.open();
    const field = input('co');
    expect(selectedLabel()).toBe('Courses');
    const previousRow = [...document.querySelectorAll('#cp-results .cp-item[data-idx]')]
      .find(el => el.querySelector('.cp-item-label')?.textContent === 'My Courses');
    expect(previousRow).toBeTruthy();
    previousRow.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    finishLoading(Fuse);
    await flush();
    await new Promise(resolve => setTimeout(resolve, 55));
    expect(selectedLabel()).toBe('Courses');
    key(field, 'Enter');
    expect(window.OpenCourseDeck.Router.navigate).toHaveBeenCalledWith('#/courses');
  });

  it('clears selection if the chosen command disappears on Fuse completion', async () => {
    let finishLoading;
    vi.mocked(loadVendorScript).mockReturnValue(new Promise(resolve => { finishLoading = resolve; }));
    const nav = window.OpenCourseDeck.Router.navigate;
    initCommandPalette();
    window.OpenCourseDeck.CommandPalette.open();
    const field = input('co');
    const previous = resultLabels().indexOf('My Courses');
    expect(previous).toBeGreaterThan(0);
    for (let i = 0; i < previous; i++) key(field, 'ArrowDown');
    expect(selectedLabel()).toBe('My Courses');
    const FilteredFuse = class {
      constructor(items) { this.items = items; }
      search() { return this.items.filter(item => item.label === 'Courses').map(item => ({ item })); }
    };
    finishLoading(FilteredFuse);
    await flush();
    expect(resultLabels()).toEqual(['Courses']);
    expect(selectedLabel()).toBeUndefined();
    key(field, 'Enter');
    expect(nav).not.toHaveBeenCalled();
  });

  it('keeps one-letter matches available after local Fuse.js loads', async () => {
    let finishLoading;
    vi.mocked(loadVendorScript).mockReturnValue(new Promise(resolve => { finishLoading = resolve; }));
    initCommandPalette();
    window.OpenCourseDeck.CommandPalette.open();
    input('c');
    expect(resultLabels()).toContain('Courses');
    finishLoading(Fuse);
    await flush();
    expect(resultLabels()).toContain('Courses');
  });

  it('retains substring commands if the lazy-loaded library fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(loadVendorScript).mockRejectedValue(new Error('offline asset unavailable'));
    initCommandPalette();
    window.OpenCourseDeck.CommandPalette.open();
    await flush();
    const field = input('Courses');
    expect(resultLabels()).toContain('Courses');
    key(field, 'Enter');
    expect(window.OpenCourseDeck.Router.navigate).toHaveBeenCalledWith('#/courses');
    expect(warn).toHaveBeenCalled();
  });

  it('does not retain a selection during normal query or category changes', async () => {
    window.Fuse = Fuse;
    initCommandPalette();
    window.OpenCourseDeck.CommandPalette.open();
    const field = input('co');
    key(field, 'ArrowDown');
    input('Notes');
    expect(selectedLabel()).toBe('Notes');
    document.querySelector('[data-cat="theme"]').click();
    expect(selectedLabel()).toBeUndefined();
  });
});
