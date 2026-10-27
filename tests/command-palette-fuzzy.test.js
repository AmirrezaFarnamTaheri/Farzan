import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initCommandPalette } from '../src/features/commandPalette.js';
import Fuse from 'fuse.js';
import { loadVendorScript } from '../src/core/vendorLoader.js';

vi.mock('../src/core/vendorLoader.js', () => ({ loadVendorScript: vi.fn() }));

describe('command palette uses vendored Fuse.js matching', () => {
  afterEach(() => { delete window.Fuse; vi.mocked(loadVendorScript).mockReset(); });
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


  it('does not discard single-character substring results when Fuse loads', async () => {
    let resolveVendor;
    vi.mocked(loadVendorScript).mockImplementationOnce(() => new Promise(resolve => { resolveVendor = resolve; }));
    delete window.Fuse;
    initCommandPalette();
    window.OpenCourseDeck.CommandPalette.open();
    const input = document.getElementById('cp-input');
    input.value = 'c';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const labels = () => [...document.querySelectorAll('#cp-results .cp-item-label')].map(el => el.textContent);
    const before = labels();
    expect(before).toContain('Courses');
    resolveVendor(Fuse);
    await vi.waitFor(() => expect(labels()).toEqual(before));
    expect(labels()).toContain('Courses');
  });

  it('preserves the selected command when Fuse reorders results while loading', async () => {
    let resolveVendor;
    vi.mocked(loadVendorScript).mockImplementationOnce(() => new Promise(resolve => { resolveVendor = resolve; }));
    delete window.Fuse;
    const addPdf = vi.fn();
    const addLink = vi.fn();
    window.OpenCourseDeck.AddContent = { addPdf, addLink, addVideo: vi.fn() };
    initCommandPalette();
    window.OpenCourseDeck.CommandPalette.open();
    const input = document.getElementById('cp-input');
    input.value = 'add';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect([...document.querySelectorAll('#cp-results .cp-item-label')].map(x => x.textContent))
      .toContain('Add PDF');
    // Move from the default first result to Add PDF.
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.querySelector('.cp-item[aria-selected="true"] .cp-item-label')?.textContent).toBe('Add PDF');

    const FuseReordered = class {
      constructor(items) { this.items = items; }
      search() {
        const picks = this.items.filter(item => item.label.toLowerCase().includes('add'));
        const rank = { 'Add URL': 0, 'Add video': 1, 'Add PDF': 2 };
        return picks.sort((a, b) => (rank[a.label] ?? 9) - (rank[b.label] ?? 9)).map(item => ({ item }));
      }
    };
    resolveVendor(FuseReordered);
    await vi.waitFor(() => {
      expect(document.querySelector('.cp-item[aria-selected="true"] .cp-item-label')?.textContent).toBe('Add PDF');
    });
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(addPdf).toHaveBeenCalledOnce();
    expect(addLink).not.toHaveBeenCalled();
  });

  it('does not activate a different command when Fuse removes a selected result', async () => {
    let resolveVendor;
    vi.mocked(loadVendorScript).mockImplementationOnce(() => new Promise(resolve => { resolveVendor = resolve; }));
    delete window.Fuse;
    const addPdf = vi.fn();
    const addLink = vi.fn();
    window.OpenCourseDeck.AddContent = { addPdf, addLink };
    initCommandPalette();
    window.OpenCourseDeck.CommandPalette.open();
    const input = document.getElementById('cp-input');
    input.value = 'add';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const FuseOnlyUrl = class {
      constructor(items) { this.items = items; }
      search() { return this.items.filter(item => item.label === 'Add URL').map(item => ({ item })); }
    };
    resolveVendor(FuseOnlyUrl);
    await vi.waitFor(() => expect(document.querySelector('.cp-item[aria-selected="true"]')).toBeNull());
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(addPdf).not.toHaveBeenCalled();
    expect(addLink).not.toHaveBeenCalled();
  });

});
