import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('storageMigrate (legacy UI keys)', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('copies plasma-theme through to ocd_theme and removes both legacy keys', async () => {
    localStorage.setItem('plasma-theme', 'forest');
    await import('../src/core/storageMigrate.js');
    expect(localStorage.getItem('ocd_theme')).toBe('forest');
    expect(localStorage.getItem('plasma_theme')).toBeNull();
    expect(localStorage.getItem('plasma-theme')).toBeNull();
  });

  it('does not overwrite an existing canonical value', async () => {
    localStorage.setItem('ocd_theme', 'dark');
    localStorage.setItem('plasma_theme', 'light');
    localStorage.setItem('plasma-theme', 'forest');
    await import('../src/core/storageMigrate.js');
    expect(localStorage.getItem('ocd_theme')).toBe('dark');
    expect(localStorage.getItem('plasma_theme')).toBeNull();
    expect(localStorage.getItem('plasma-theme')).toBeNull();
  });

  it('migrates sidebar collapsed flag', async () => {
    localStorage.setItem('plasma-sidebar-collapsed', 'true');
    await import('../src/core/storageMigrate.js');
    expect(localStorage.getItem('ocd_sidebar_collapsed')).toBe('true');
    expect(localStorage.getItem('plasma_sidebar_collapsed')).toBeNull();
    expect(localStorage.getItem('plasma-sidebar-collapsed')).toBeNull();
  });

  it('migrates preferences, notes, folders, and notes settings', async () => {
    localStorage.setItem('plasma_accent', 'ocean');
    localStorage.setItem('plasma_density', 'compact');
    localStorage.setItem('plasma_font_scale', '1.2');
    localStorage.setItem('plasma_dir', 'rtl');
    localStorage.setItem('plasma-notes', '[]');
    localStorage.setItem('plasma-folders', '[]');
    localStorage.setItem('plasma-notes-settings', '{"view":"grid"}');
    await import('../src/core/storageMigrate.js');
    expect(localStorage.getItem('ocd_accent')).toBe('ocean');
    expect(localStorage.getItem('ocd_density')).toBe('compact');
    expect(localStorage.getItem('ocd_font_scale')).toBe('1.2');
    expect(localStorage.getItem('ocd_dir')).toBe('rtl');
    expect(localStorage.getItem('ocd_notes')).toBe('[]');
    expect(localStorage.getItem('ocd_folders')).toBe('[]');
    expect(localStorage.getItem('ocd_notes_settings')).toBe('{"view":"grid"}');
    expect(localStorage.getItem('plasma_accent')).toBeNull();
    expect(localStorage.getItem('plasma-notes-settings')).toBeNull();
  });

  it('rebrands the legacy plasma accent value to violet', async () => {
    localStorage.setItem('plasma_accent', 'plasma');
    await import('../src/core/storageMigrate.js');
    expect(localStorage.getItem('ocd_accent')).toBe('violet');
  });
});
