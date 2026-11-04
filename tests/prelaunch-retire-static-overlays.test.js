import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('src/styles/components.css', 'utf8');
const overlay = fs.readFileSync('src/ui/overlays.js', 'utf8');

describe('static pre-release overlay shells no longer duplicate shared owners (#175)', () => {
  it('retires the unused static modal but retains live command palette and notification drawer', () => {
    for (const id of ['modal-overlay', 'modal-container', 'modal-title', 'modal-body', 'modal-footer']) {
      expect(html, 'unused modal shell: ' + id).not.toContain('id="' + id + '"');
    }
    expect(html).toContain('id="command-palette-overlay"');
    expect(html).toContain('id="notifications-panel"');
  });

  it('retires the unused static slide-over without losing the live notification drawer', () => {
    for (const id of ['slideover-overlay', 'slideover-panel', 'slideover-close', 'slideover-body']) {
      expect(html, 'unused slide-over shell: ' + id).not.toContain('id="' + id + '"');
    }
    expect(html).toContain('id="notifications-panel"');
  });

  it('removes now-orphaned static modal and slide-over selector styling', () => {
    expect(css).not.toContain('#modal-overlay');
    expect(css).not.toContain('#slideover-overlay');
    expect(css).not.toContain('.slideover-panel');
    expect(css).not.toContain('.slideover-header');
    expect(css).not.toContain('.slideover-body');
    // Dynamic Modal.create and the active notification drawer retain styling.
    expect(css).toContain('.modal-container {');
    expect(css).toContain('.modal-backdrop {');
    expect(css).toContain('.drawer.notif-panel {');
  });

  it('retains actual shared Modal.create and Drawer lifecycle owners', () => {
    expect(overlay).toContain("class: `modal-container");
    expect(overlay).toContain("class: `drawer");
    expect(overlay).toContain('create({');
  });
});
