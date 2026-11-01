import { beforeEach, describe, expect, it } from 'vitest';
import { nextSearchSelectionIndex, reflectSearchSelection } from '../src/core/searchSelection.js';

describe('shared keyboard search selection contract', () => {
  it('clamps arrows to the visible result set and never selects an unrendered result', () => {
    expect(nextSearchSelectionIndex(-1, 0, 'ArrowDown')).toBe(-1);
    expect(nextSearchSelectionIndex(-1, 3, 'ArrowDown')).toBe(0);
    expect(nextSearchSelectionIndex(-1, 3, 'ArrowUp')).toBe(0);
    expect(nextSearchSelectionIndex(0, 3, 'ArrowDown')).toBe(1);
    expect(nextSearchSelectionIndex(2, 3, 'ArrowDown')).toBe(2);
    expect(nextSearchSelectionIndex(2, 3, 'ArrowUp')).toBe(1);
    expect(nextSearchSelectionIndex(0, 3, 'ArrowUp')).toBe(0);
    expect(nextSearchSelectionIndex(6, 2, 'ArrowDown')).toBe(1);
  });

  it('offers consistent Home/End edges on both search surfaces without wrapping beyond rendered rows', () => {
    expect(nextSearchSelectionIndex(2, 4, 'Home')).toBe(0);
    expect(nextSearchSelectionIndex(0, 4, 'End')).toBe(3);
    expect(nextSearchSelectionIndex(-1, 4, 'End')).toBe(3);
    expect(nextSearchSelectionIndex(9, 4, 'Home')).toBe(0);
    expect(nextSearchSelectionIndex(1, 0, 'End')).toBe(-1);
  });

  beforeEach(() => {
    document.body.innerHTML = `
      <input id="search" role="combobox" aria-controls="results" />
      <div id="results" role="listbox">
        <div id="item-a" role="option" aria-selected="false"></div>
        <div id="item-b" role="option" aria-selected="false"></div>
      </div>`;
  });

  it('reflects exactly one active option into its combobox without focusing a result row', () => {
    const input = document.querySelector('#search');
    const options = [...document.querySelectorAll('#results [role="option"]')];
    reflectSearchSelection(input, options, 1);
    expect(document.activeElement).not.toBe(options[1]);
    expect(input.getAttribute('aria-activedescendant')).toBe('item-b');
    expect(options.map(row => row.getAttribute('aria-selected'))).toEqual(['false', 'true']);
    reflectSearchSelection(input, options, 0);
    expect(input.getAttribute('aria-activedescendant')).toBe('item-a');
    expect(options.map(row => row.getAttribute('aria-selected'))).toEqual(['true', 'false']);
  });

  it('clears stale screen-reader state when results are empty or not selected', () => {
    const input = document.querySelector('#search');
    const options = [...document.querySelectorAll('#results [role="option"]')];
    reflectSearchSelection(input, options, 0);
    options.forEach(row => row.remove());
    expect(reflectSearchSelection(input, [], -1)).toBe(-1);
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    expect(reflectSearchSelection(input, options, -1)).toBe(-1);
    expect(options.every(row => row.getAttribute('aria-selected') === 'false')).toBe(true);
  });
});
