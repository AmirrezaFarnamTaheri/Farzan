import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('src/styles/components.css', 'utf8');
const shortcuts = fs.readFileSync('src/core/keyboardShortcuts.js', 'utf8');

describe('pre-release shortcut shell has one canonical modal owner (#175)', () => {
  it('removes the obsolete statically mounted keyboard shortcut dialog', () => {
    for (const id of ['shortcut-overlay', 'shortcut-close', 'shortcut-panel-body']) {
      expect(html, 'stale shortcut element: ' + id).not.toContain('id="' + id + '"');
    }
    expect(html).not.toContain('<!-- Keyboard Shortcut Cheatsheet -->');
  });

  it('removes orphaned shortcut-overlay chrome CSS without removing active modal tables', () => {
    expect(css).not.toContain('#shortcut-overlay');
    expect(css).not.toContain('.shortcut-panel');
    expect(css).toContain('table.shortcuts-table {');
    expect(css).toContain('table.shortcuts-table kbd {');
  });

  it('keeps shortcut help owned by the existing shared Modal.create lifecycle', () => {
    expect(shortcuts).toContain("import { Modal } from '../ui/overlays.js'");
    expect(shortcuts).toContain('showHelp() {');
    expect(shortcuts).toContain('Modal.create({');
  });
});
