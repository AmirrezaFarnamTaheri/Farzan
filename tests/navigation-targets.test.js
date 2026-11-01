import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const finalCss = fs.readFileSync('src/styles/farzan-redesign.css', 'utf8');
const layoutCss = fs.readFileSync('src/styles/layout.css', 'utf8');
const shell = fs.readFileSync('index.html', 'utf8');

function lastDeclaration(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped + '\\s*\\{([^}]+)\\}', 'g');
  return [...finalCss.matchAll(re)].at(-1)?.[1] || '';
}

describe('usable navigation at laptop zoom and phone widths', () => {
  it('keeps the winning sidebar navigation target at least 44 CSS pixels tall', () => {
    expect(lastDeclaration('.sidebar .nav-item')).toMatch(/min-height:\s*44px/);
    expect(finalCss).toContain('.sidebar-nav');
    expect(shell).toContain('class="nav-item"');
  });

  it('keeps topbar actions comfortably reachable with mouse, touch and keyboard', () => {
    const rule = lastDeclaration('.topbar-action-btn');
    expect(rule).toMatch(/min-width:\s*44px/);
    expect(rule).toMatch(/min-height:\s*44px/);
    expect(rule).toMatch(/width:\s*44px/);
    expect(rule).toMatch(/height:\s*44px/);
    expect(finalCss).toContain(':focus-visible');
  });

  it('does not shrink the mobile menu hit area or break its accessible state', () => {
    const mobile = layoutCss.slice(layoutCss.indexOf('@media (max-width: 460px)'));
    expect(mobile).toMatch(/\.topbar-action-btn,\s*\.topbar-menu-btn\s*\{\s*width:\s*44px;\s*height:\s*44px;/);
    expect(shell).toContain('id="mobile-menu-btn"');
    expect(shell).toContain('aria-expanded="false" aria-controls="sidebar"');
    expect(finalCss).toContain('[dir="rtl"] .sidebar');
  });
});
