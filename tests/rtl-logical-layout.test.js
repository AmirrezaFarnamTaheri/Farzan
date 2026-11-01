import fs from 'node:fs';
import { describe, it, expect } from 'vitest';

const notes = fs.readFileSync('src/styles/notes-enhancements.css', 'utf8');
const views = fs.readFileSync('src/styles/views.css', 'utf8');
const studio = fs.readFileSync('src/styles/farzan-redesign.css', 'utf8');
const enhancements = fs.readFileSync('src/styles/enhancements.css', 'utf8');

function rule(source, selector) {
  const at = source.indexOf(selector + ' {');
  expect(at, 'Missing rule: ' + selector).toBeGreaterThanOrEqual(0);
  return source.slice(at, source.indexOf('}', at) + 1);
}
describe('RTL layout uses logical start/end in owning CSS rules', () => {
  it('mirrors Notes search, export menus, save status and folder counters', () => {
    expect(rule(notes, '.notes-search-field > .icon')).toMatch(/inset-inline-start:\s*var\(--space-3\)/);
    expect(rule(notes, '.notes-search-field .input')).toMatch(/padding-inline:\s*var\(--space-9\)/);
    expect(rule(notes, '.notes-export-popover')).toMatch(/inset-inline-end:\s*0/);
    expect(rule(notes, '.notes-export-popover button')).toMatch(/text-align:\s*start/);
    expect(rule(notes, '.notes-save')).toMatch(/text-align:\s*end/);
    expect(rule(notes, '.folder-item .folder-count')).toMatch(/margin-inline-start:\s*auto/);
    expect(rule(notes, '.folder-item')).toMatch(/text-align:\s*start/);
  });
  it('shows Note selection emphasis on the start edge in both LTR and RTL', () => {
    expect(rule(notes, '.note-item')).toMatch(/border-inline-start:\s*3px/);
    expect(rule(notes, '.note-item')).toMatch(/padding-inline-start:\s*calc/);
    expect(rule(notes, '.note-item.active')).toMatch(/border-inline-start-color:\s*var\(--accent\)/);
  });
  it('mirrors course filter search and avoids fixed left-aligned titles', () => {
    expect(rule(views, '.courses-search-field > .icon')).toMatch(/inset-inline-start:\s*var\(--space-3\)/);
    expect(rule(enhancements, '.view-courses #courses-search')).toMatch(/padding-inline:\s*calc\(/);
    expect(views).not.toContain('.courses-search-field .input {');
    expect(rule(views, '.courses-list')).toMatch(/padding-inline-end:/);
    expect(rule(views, '.course-item')).toMatch(/text-align:\s*start/);
    expect(rule(views, '.home-widget')).toMatch(/text-align:\s*start/);
  });
  it('mirrors Studio group separators and the tool popover anchoring', () => {
    expect(rule(views, '.studio-tool-group')).toMatch(/border-inline-end:\s*1px/);
    expect(rule(views, '.studio-tool-group')).toMatch(/padding-inline-end:/);
    expect(rule(studio, '.view-studio .studio-more-tools-content')).toMatch(/inset-inline-end:\s*calc\(100% \+ 12px\)/);
    expect(rule(studio, '.view-studio .studio-more-tools-content')).not.toMatch(/(?:^|;)\s*right:\s*0/);
  });
});
