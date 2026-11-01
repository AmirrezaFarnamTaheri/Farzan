import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = fs.readFileSync('index.html', 'utf8');
const finalCss = fs.readFileSync('src/styles/farzan-redesign.css', 'utf8');
const components = fs.readFileSync('src/styles/components.css', 'utf8');
const notes = fs.readFileSync('src/styles/notes-enhancements.css', 'utf8');

describe('visible shell navigation and notification controls', () => {
  it('pins Help and Settings above storage instead of leaving them below the rail scroll fold', () => {
    const nav = html.split('<nav class="sidebar-nav"')[1]?.split('</nav>')[0] ?? '';
    const footer = html.split('<div class="sidebar-footer">')[1]?.split('<!-- Storage Usage -->')[0] ?? '';
    expect(nav).not.toContain('data-route="/settings"');
    expect(nav).not.toContain('data-route="/help"');
    expect(footer).toContain('class="sidebar-system-nav"');
    expect(footer).toContain('data-route="/settings"');
    expect(footer).toContain('data-route="/help"');
    expect(finalCss).toMatch(/\.sidebar-system-nav\s*\{[^}]*display:\s*grid;/s);
    expect(finalCss).toMatch(/\.sidebar-footer\s*\{[^}]*flex:\s*0 0 auto;/s);
  });

  it('offsets the notification badge beyond the bell stroke using logical inline edges', () => {
    expect(components).toMatch(/\.topbar-notif-badge,[\s\S]*?inset-inline-end:\s*0;/);
    expect(components).toMatch(/\.topbar-notif-badge,[\s\S]*?transform:\s*translate\(/);
    expect(html).toContain('id="topbar-notif-dot"');
  });

  it('prevents action labels wrapping inside the compact notification drawer', () => {
    expect(components).toMatch(/\.notif-clear-btn\s*\{[^}]*white-space:\s*nowrap;/s);
    expect(components).toMatch(/\.notif-panel-header\s*\{[^}]*flex-wrap:\s*wrap;/s);
    expect(html).toContain('id="notif-mark-read"');
    expect(html).toContain('id="notif-clear-all"');
  });

  it('suppresses the native marker where custom disclosure arrows are drawn', () => {
    expect(finalCss).toContain('.studio-more-tools > summary::marker');
    expect(finalCss).toContain('content: none;');
    expect(notes).toContain('.notes-format-more > summary::marker');
    expect(notes).toContain('.notes-format-more > summary::-webkit-details-marker');
  });
});
