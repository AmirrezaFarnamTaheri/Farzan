import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { KeyboardShortcuts } from '../src/core/keyboardShortcuts.js';
import { Modal } from '../src/ui/overlays.js';

describe('canonical keyboard shortcut help ownership (#175)', () => {
  it('has one public shortcut help API and no unshipped alias consumers', () => {
    expect(typeof KeyboardShortcuts.showHelp).toBe('function');
    expect(KeyboardShortcuts).not.toHaveProperty('_showHelp');
    const owner = fs.readFileSync('src/core/keyboardShortcuts.js', 'utf8');
    const help = fs.readFileSync('src/views/helpRoute.js', 'utf8');
    const palette = fs.readFileSync('src/features/commandPalette.js', 'utf8');
    expect([owner, help, palette].join('\n')).not.toContain('_showHelp');
    expect(help).toContain('KeyboardShortcuts?.showHelp?.()');
    expect(palette).toContain('KeyboardShortcuts?.showHelp?.()');
  });

  it('retains accessible shortcut modal from the canonical method', () => {
    const list = [...KeyboardShortcuts._shortcuts];
    try {
      KeyboardShortcuts._shortcuts = [];
      KeyboardShortcuts.register('ctrl+/', vi.fn(), 'Show keyboard shortcuts');
      const create = vi.spyOn(Modal, 'create').mockImplementation(() => null);
      try {
        KeyboardShortcuts.showHelp();
        expect(create).toHaveBeenCalledOnce();
        const opts = create.mock.calls[0][0];
        expect(opts.title).toBe('Keyboard Shortcuts');
        expect(opts.body.textContent).toContain('Show keyboard shortcuts');
      } finally { create.mockRestore(); }
    } finally {
      KeyboardShortcuts._shortcuts = list;
    }
  });
});
