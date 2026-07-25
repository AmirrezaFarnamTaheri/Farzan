import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPluginHost, initPluginHost, validatePluginManifest } from '../src/features/pluginHost.js';

const manifest = {
  id: 'deck.example.notes',
  name: 'Notes Helper',
  version: '1.0.0',
  description: 'Adds note commands.',
  author: 'OpenCourseDeck',
  entry: 'plugins/notes-helper/main.js',
  type: 'worker',
  permissions: ['notes', 'commands'],
  extensionPoints: ['command', 'noteAction'],
};

function rootWithRegistry(initial = null) {
  let registry = initial;
  return {
    OpenCourseDeck: { bus: { emit: vi.fn() } },
    DB: {
      getSetting: vi.fn(async () => registry),
      saveSetting: vi.fn(async (_key, value) => { registry = value; }),
    },
  };
}

describe('plugin host', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('validates and normalizes safe plugin manifests', () => {
    expect(validatePluginManifest({
      ...manifest,
      id: 'Deck.Example.Notes',
      permissions: ['notes', 'notes', 'commands'],
      network: { allowedOrigins: [] },
    })).toMatchObject({
      id: 'deck.example.notes',
      entry: 'plugins/notes-helper/main.js',
      permissions: ['notes', 'commands'],
      extensionPoints: ['command', 'noteAction'],
      network: { allowedOrigins: [] },
    });
  });

  it('rejects unsafe entries, unknown permissions, and unapproved network origins', () => {
    expect(() => validatePluginManifest({ ...manifest, entry: '../main.js' })).toThrow(/safe relative/);
    expect(() => validatePluginManifest({ ...manifest, permissions: ['notes', 'dom'] })).toThrow(/permission/);
    expect(() => validatePluginManifest({
      ...manifest,
      permissions: ['notes'],
      network: { allowedOrigins: ['https://api.example.test/path'] },
    })).toThrow(/network permission/);
  });

  it('persists install, replace, enable, disable, and uninstall operations', async () => {
    const root = rootWithRegistry();
    const host = createPluginHost(root);

    await host.installManifest(manifest, { packageHash: 'sha256-test' });
    expect(await host.list()).toHaveLength(1);
    expect(root.DB.saveSetting).toHaveBeenCalledWith('plasma-plugins-registry', expect.objectContaining({
      plugins: [expect.objectContaining({ id: 'deck.example.notes', enabled: false })],
    }));

    await host.installManifest({ ...manifest, version: '1.1.0' }, { enabled: true });
    expect(await host.list()).toMatchObject([{ id: 'deck.example.notes', version: '1.1.0', enabled: true }]);

    await host.disable('deck.example.notes');
    expect(await host.list()).toMatchObject([{ enabled: false }]);

    await host.enable('deck.example.notes');
    expect(await host.extensions('command')).toMatchObject([{ id: 'deck.example.notes' }]);
    expect(await host.extensions('aiProvider')).toEqual([]);

    await expect(host.uninstall('deck.example.notes')).resolves.toBe(true);
    expect(await host.list()).toEqual([]);
    expect(root.OpenCourseDeck.bus.emit).toHaveBeenCalledWith('plugins:registry-changed', expect.any(Object));
  });

  it('installs the host on OpenCourseDeck once', () => {
    const root = { OpenCourseDeck: {}, DB: {} };
    const first = initPluginHost(root);
    const second = initPluginHost(root);

    expect(first).toBe(second);
    expect(root.OpenCourseDeck.PluginHost).toBe(first);
  });
});
