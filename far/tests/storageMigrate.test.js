import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('storageMigrate (legacy UI keys)', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('copies plasma-theme to plasma_theme and removes legacy', async () => {
    localStorage.setItem('plasma-theme', 'forest');
    await import('../src/core/storageMigrate.js');
    expect(localStorage.getItem('plasma_theme')).toBe('forest');
    expect(localStorage.getItem('plasma-theme')).toBeNull();
  });

  it('does not overwrite existing plasma_theme', async () => {
    localStorage.setItem('plasma_theme', 'dark');
    localStorage.setItem('plasma-theme', 'light');
    await import('../src/core/storageMigrate.js');
    expect(localStorage.getItem('plasma_theme')).toBe('dark');
    expect(localStorage.getItem('plasma-theme')).toBeNull();
  });

  it('migrates sidebar collapsed flag', async () => {
    localStorage.setItem('plasma-sidebar-collapsed', 'true');
    await import('../src/core/storageMigrate.js');
    expect(localStorage.getItem('plasma_sidebar_collapsed')).toBe('true');
    expect(localStorage.getItem('plasma-sidebar-collapsed')).toBeNull();
  });
});
