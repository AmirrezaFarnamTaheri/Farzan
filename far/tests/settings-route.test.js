import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountSettingsView } from '../src/views/settingsRoute.js';

function mountSettings(saved = null) {
  document.body.innerHTML = '<main id="main-content"></main>';
  sessionStorage.clear();
  const saveSetting = vi.fn(async () => true);
  const Toast = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  };
  window.DB = {
    getSetting: vi.fn(async () => saved),
    saveSetting,
    clearUserData: vi.fn(async () => true),
  };
  window.ProgressStats = {
    exportJSON: vi.fn(),
    importJSON: vi.fn(),
  };
  window.OpenCourseDeck = {
    AI: {
      gemmaModelOptions: [
        { id: 'gemma-4-local', label: 'Gemma 4', url: 'https://ai.google.dev/gemma' },
      ],
      limits: { maxModelBytes: 1024 * 1024 },
      importLocalModelFile: vi.fn(),
      downloadLocalModel: vi.fn(),
      clearLocalModelFile: vi.fn(),
    },
    UI: { confirm: vi.fn(async () => true) },
    bus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  };

  const controller = mountSettingsView({
    setView: html => { document.getElementById('main-content').innerHTML = html; },
    ThemeManager: { toggle: vi.fn() },
    FontScale: { get: () => 1, inc: vi.fn(), dec: vi.fn(), reset: vi.fn() },
    Prefs: { KEYS: { density: 'density' }, get: () => 'comfortable', set: vi.fn() },
    Toast,
    formatBytes: value => `${value} B`,
    localStorageFootprint: () => 0,
  });

  return { controller, saveSetting, Toast };
}

describe('settings route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves appearance, storage, portability, data, and AI controls', () => {
    const { controller } = mountSettings();
    const required = [
      '#btn-font-dec',
      '#btn-font-inc',
      '#btn-font-reset',
      '#select-density',
      '#btn-theme-toggle',
      '#btn-export-json-2',
      '#btn-import-json-2',
      '#select-clear-scope',
      '#btn-clear-scope',
      '[data-ai-mode]',
      '[data-ai-model]',
      '[data-ai-endpoint]',
      '[data-ai-key]',
      '[data-ai-key-storage]',
      '[data-ai-approve-endpoint]',
      '[data-ai-save]',
      '[data-storage-health]',
    ];

    required.forEach(selector => expect(document.querySelector(selector), selector).not.toBeNull());
    expect(document.querySelector('[data-ai-key-storage]')?.disabled).toBe(true);
    expect(document.querySelector('[data-ai-key-storage]')?.value).toBe('session');
    expect(document.body.textContent).toContain('Keys are never written to IndexedDB or localStorage.');
    controller.unmount();
  });

  it('migrates a persisted key out of storage and approves only the exact endpoint origin', async () => {
    const { controller, saveSetting, Toast } = mountSettings({
      mode: 'custom-api',
      model: 'private-model',
      endpoint: 'https://api.example.test/v1/chat/completions',
      keyStorage: 'local',
      apiKey: 'persisted-secret',
      hasKey: true,
    });

    await vi.waitFor(() => expect(saveSetting).toHaveBeenCalled());
    const migration = saveSetting.mock.calls[0][1];
    expect(migration.keyStorage).toBe('session');
    expect(migration).not.toHaveProperty('apiKey');
    expect(Toast.info).toHaveBeenCalledWith(expect.stringContaining('session-only'));

    const endpoint = document.querySelector('[data-ai-endpoint]');
    const key = document.querySelector('[data-ai-key]');
    const approval = document.querySelector('[data-ai-approve-endpoint]');
    endpoint.value = 'https://api.example.test/v1/chat/completions';
    endpoint.dispatchEvent(new Event('input', { bubbles: true }));
    key.value = 'sk-session';
    approval.checked = true;
    approval.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('[data-ai-save]').click();

    await vi.waitFor(() => expect(saveSetting).toHaveBeenCalledTimes(2));
    const saved = saveSetting.mock.calls[1][1];
    expect(saved).toMatchObject({
      mode: 'custom-api',
      keyStorage: 'session',
      approvedEndpointOrigin: 'https://api.example.test',
      hasKey: true,
    });
    expect(saved).not.toHaveProperty('apiKey');
    expect(sessionStorage.getItem('plasma-ai-api-key-session')).toBe('sk-session');
    controller.unmount();
  });

  it('blocks insecure remote endpoints before saving credentials', async () => {
    const { controller, saveSetting, Toast } = mountSettings({ mode: 'custom-api' });
    await vi.waitFor(() => expect(window.DB.getSetting).toHaveBeenCalled());

    const endpoint = document.querySelector('[data-ai-endpoint]');
    const key = document.querySelector('[data-ai-key]');
    const approval = document.querySelector('[data-ai-approve-endpoint]');
    endpoint.value = 'http://api.example.test/v1/chat/completions';
    endpoint.dispatchEvent(new Event('input', { bubbles: true }));
    key.value = 'should-not-save';
    expect(approval.disabled).toBe(true);

    document.querySelector('[data-ai-save]').click();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(expect.stringContaining('HTTPS')));
    expect(sessionStorage.getItem('plasma-ai-api-key-session')).toBeNull();
    expect(saveSetting).not.toHaveBeenCalled();
    controller.unmount();
  });
});
