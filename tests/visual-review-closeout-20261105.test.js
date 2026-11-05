import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { mountHelpView } from '../src/views/helpRoute.js';

const read = path => fs.readFileSync(path, 'utf8');

describe('November visual review closeout: explicit affordances and semantic states', () => {
  it('presents the untracked Help steps as getting-started guidance, not a completion checklist', () => {
    document.body.innerHTML = '<main></main>';
    window.DataStore = {
      init: vi.fn(async () => true),
      allTopics: vi.fn(() => []),
      allCourses: vi.fn(() => []),
    };
    mountHelpView({ setView: html => { document.querySelector('main').innerHTML = html; } });
    expect(document.querySelector('.help-card-primary h2')?.textContent).toBe('Getting started');
    expect(document.querySelectorAll('.help-checklist li')).toHaveLength(4);
  });

  it('exposes keyboard-accessible sidebar scroll controls rather than silently hiding library routes', () => {
    const html = read('index.html');
    const css = read('src/styles/farzan-redesign.css');
    expect(html).toContain('data-sidebar-scroll-up');
    expect(html).toContain('data-sidebar-scroll-more');
    expect(html).toMatch(/aria-controls="sidebar-sections"/);
    expect(css).toContain('.sidebar-nav-scroll-controls');
  });

  it('uses an opaque theme surface for the Add Content overlay', () => {
    const css = read('src/styles/components.css');
    expect(css).toMatch(/#add-content-menu\.add-content-menu\s*\{[^}]*background:\s*var\(--surface\);/s);
  });

  it('reserves space for Notes empty tags instead of crushing the label', () => {
    const css = read('src/styles/notes-enhancements.css');
    expect(css).toMatch(/\.notes-footer\s*\{[^}]*flex-wrap:\s*wrap;/s);
    expect(css).toMatch(/\.notes-tags\[data-empty="true"\]\s*\{[^}]*white-space:\s*nowrap;/s);
  });

  it('contains notification empty-state guidance and readable panel actions', () => {
    const html = read('index.html');
    const css = read('src/styles/components.css');
    expect(html).toContain('data-notifications-empty');
    expect(css).toMatch(/\.notif-clear-btn\s*\{[^}]*min-height:\s*36px;/s);
    expect(css).toContain('.notif-empty');
  });

  it('groups Materials text and action controls in a bounded compact row', () => {
    const css = read('src/styles/farzan-redesign.css');
    expect(css).toMatch(/\.view-materials \.topic-row\s*\{[^}]*display:\s*flex;/s);
    expect(css).toMatch(/\.view-materials \.topic-row > :first-child\s*\{[^}]*flex:/s);
  });

  it('separates the achievement progress track and value with explicit colors', () => {
    const css = read('src/styles/views.css');
    expect(css).toContain('.achievement-next-card progress::-webkit-progress-bar');
    expect(css).toContain('.achievement-next-card progress::-webkit-progress-value');
    expect(css).toContain('.achievement-next-card progress::-moz-progress-bar');
  });
});
