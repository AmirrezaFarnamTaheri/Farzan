import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountTagsView } from '../src/views/tagsRoute.js';
import { mountNotFoundView } from '../src/views/notFoundRoute.js';

const css = fs.readFileSync('src/styles/views.css', 'utf8');
const pdfCss = fs.readFileSync('src/styles/components.css', 'utf8');
const pdfRoute = fs.readFileSync('src/views/pdfRoute.js', 'utf8');

beforeEach(() => {
  document.body.innerHTML = '<main id="visual-first-use-host"></main>';
  window.OpenCourseDeck = {};
  window.DB = {
    getAllNotes: vi.fn(async () => []),
    getSetting: vi.fn(async () => null),
    saveSetting: vi.fn(async () => true),
  };
  window.DataStore = { init: vi.fn(async () => {}), allTopics: () => [] };
});

describe('first-run pages are not overwhelmed by inactive tools or duplicated chrome', () => {
  it('discloses merge/unmerge only with relevant taxonomy while keeping Create visible', async () => {
    const mount = () => mountTagsView({ setView: html => {
      document.querySelector('main').innerHTML = html;
    }});
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-tag-first-use]')).not.toBeNull());
    const advanced = document.querySelector('[data-tag-advanced]');
    expect(advanced).not.toBeNull();
    expect(advanced.hidden).toBe(true);
    expect(document.querySelector('[data-tag-create-form]').hidden).toBe(false);
    expect(advanced.querySelector('[data-tag-merge-form]')).not.toBeNull();
    expect(advanced.querySelector('[data-tag-unmerge-form]')).not.toBeNull();
    window.DB.getAllNotes.mockResolvedValue([{ id: 'one', tags: ['Cardiology', 'Renal'] }]);
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-tag-name="cardiology"]')).not.toBeNull());
    expect(document.querySelector('[data-tag-advanced]').hidden).toBe(false);
    expect(document.querySelector('[data-tag-advanced]').open).toBe(false);
  });

  it('limits tag authoring inputs and gives advanced forms a native disclosure', () => {
    const code = fs.readFileSync('src/views/tagsRoute.js', 'utf8');
    expect(code).toContain('<details class="tags-taxonomy-advanced" data-tag-advanced hidden>');
    expect(code).toContain('Manage labels');
    expect(css).toMatch(/\.tags-taxonomy-controls\s+\.input\s*\{[^}]*max-width:\s*360px;/s);
  });

  it('does not display a second, functionally identical file picker above the PDF empty state', () => {
    expect(pdfCss).toMatch(/\.view-pdf \.pdf-shell\[data-document-state="empty"\] \.pdf-toolbar\s*\{[^}]*display:\s*none;/s);
    expect(pdfRoute).toContain('data-pdf-empty-open');
    expect(pdfRoute).toContain('data-pdf-action="open"');
    expect(pdfRoute).toMatch(/<div class="page-header">\s*<div>\s*<h1 class="page-title">PDF Annotator<\/h1>/);
  });

  it('explains JSON-only restoration without implying the backup includes local media', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const option = html.match(/<button[^>]+data-action="import-backup"[\s\S]*?<\/button>/)?.[0];
    expect(option).toMatch(/restore app data/i);
    expect(option).toMatch(/JSON backup.*media files separate/i);
    const guide = fs.readFileSync('docs/getting-started.md', 'utf8');
    expect(guide).toContain('format 1.7');
    expect(guide).not.toContain('format 1.5');
  });

  it('centers missing-route recovery without repeating the same error sentence', () => {
    mountNotFoundView({
      hash: '#/missing',
      setView: html => { document.querySelector('main').innerHTML = html; },
    });
    expect(document.querySelector('.notfound-requested').textContent).toContain('#/missing');
    expect(document.querySelector('.view-notfound .page-subtitle')).toBeNull();
    expect(document.querySelector('.view-notfound .notfound-message')).not.toBeNull();
    expect(css).toMatch(/\.notfound-header\s*\{[^}]*text-align:\s*center;/s);
  });
});
