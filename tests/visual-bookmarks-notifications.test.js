import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const ui = fs.readFileSync('app.js', 'utf8');
const components = fs.readFileSync('src/styles/components.css', 'utf8');
const finalCss = fs.readFileSync('src/styles/farzan-redesign.css', 'utf8');

describe('saved bookmarks and notification affordances', () => {
  it('gives each notification a specific, keyboard-operable dismiss action', () => {
    expect(ui).toContain("data-notif-dismiss");
    expect(ui).toContain("Dismiss notification");
    expect(ui).toContain("this.setCount(this._count - 1)");
    expect(components).toMatch(/\.notif-dismiss-btn\s*\{[^}]*min-width:\s*32px;/s);
  });
  it('removes double-boxed outer bookmark frames when source filters are not useful', () => {
    expect(finalCss).toMatch(/\.view-bookmarks \.bookmarks-section-card:has\(\[data-bookmark-filters\]\[hidden\]\)\s*\{[^}]*border:\s*0;/s);
    expect(finalCss).toMatch(/\.view-bookmarks \.bookmarks-section-card:has\(\[data-bookmark-filters\]\[hidden\]\) > \.card-body\s*\{[^}]*padding:\s*0;/s);
  });
  it('does not display a second outer panel around an empty My Courses card', () => {
    expect(finalCss).toMatch(/\.view-my-courses\[data-empty="true"\] \.my-courses-list-card\s*\{[^}]*border:\s*0;/s);
    expect(finalCss).toMatch(/\.view-my-courses\[data-empty="true"\] \.my-courses-list-card > \.card-body\s*\{[^}]*padding:\s*0;/s);
  });

  it('preserves the data-backed filter UI and does not hide empty-state recovery actions', () => {
    const route = fs.readFileSync('src/views/bookmarksRoute.js', 'utf8');
    expect(route).toContain('hasMultipleSources');
    expect(route).toContain("notesLink.href = '#/notes'");
    expect(route).toContain("coursesLink.href = '#/courses'");
  });
});
