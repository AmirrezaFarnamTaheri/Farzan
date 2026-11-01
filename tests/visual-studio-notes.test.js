import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mountNotesView } from '../src/views/notesRoute.js';

const studio = fs.readFileSync('src/views/studioRoute.js', 'utf8');
const studioCss = fs.readFileSync('src/styles/farzan-redesign.css', 'utf8');
const notesCss = fs.readFileSync('src/styles/notes-enhancements.css', 'utf8');

describe('Studio and Notes authoring affordances', () => {
  it('reserves primary emphasis for Save and visibly distinguishes the active tool', () => {
    expect(studio).toMatch(/class="btn btn-ghost btn-sm" data-studio-add-text/);
    expect(studio).toMatch(/class="btn btn-primary btn-sm" data-studio-save/);
    expect(studioCss).toMatch(/\.view-studio \[data-studio-tool\]\[aria-pressed="true"\]\s*\{[^}]*background:/s);
    expect(studio).toContain("button.setAttribute('aria-pressed', active ? 'true' : 'false')");
  });

  it('opens the Studio menu on the opposite side of the inspector on desktop', () => {
    expect(studioCss).toMatch(/\.view-studio \.studio-more-tools-content\s*\{[^}]*inset-inline-end:\s*calc\(100% \+ 12px\)/s);
    expect(studioCss).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.view-studio \.studio-more-tools-content\s*\{[^}]*inset-inline-start:\s*0;/);
  });

  it('keeps collapsed Text styles in the main toolbar at desktop widths', () => {
    expect(notesCss).toMatch(/\.notes-toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s);
    expect(notesCss).toMatch(/\.notes-format-more\[open\]\s*\{[^}]*grid-column:\s*1 \/ -1;/s);
  });

  it('does not offer a second desktop New note button or enabled semantic search controls without a query', () => {
    document.body.innerHTML = '<main></main>';
    mountNotesView({ setView: html => { document.querySelector('main').innerHTML = html; } });
    expect(document.querySelector('[data-notes-semantic-search]').disabled).toBe(true);
    expect(document.querySelector('[data-notes-semantic-clear]').disabled).toBe(true);
    expect(notesCss).toMatch(/@media \(min-width: 901px\)\s*\{[\s\S]*?\.notes-quick-add\s*\{[^}]*display:\s*none;/);
  });
});
