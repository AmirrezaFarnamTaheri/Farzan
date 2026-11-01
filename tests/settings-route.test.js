import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initEndpointApprovalGuard } from '../src/core/endpointApprovalGuard.js';
import { mountSettingsView } from '../src/views/settingsRoute.js';

initEndpointApprovalGuard(document);

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
        { id: 'gemma-4-local', label: 'On-device extractive summary', url: 'https://ai.google.dev/gemma' },
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

  it('uses one meaningful Appearance and AI heading without duplicate eyebrow text', () => {
    const { controller } = mountSettings();
    expect(document.querySelector('#settings-appearance .settings-section-heading h2')?.textContent)
      .toBe('Appearance');
    expect(document.querySelector('#settings-appearance .settings-section-heading .eyebrow')).toBeNull();
    expect(document.querySelector('#settings-ai .settings-section-heading h2')?.textContent)
      .toBe('AI & privacy');
    expect(document.querySelector('#settings-ai .settings-section-heading .eyebrow')).toBeNull();
    expect(document.querySelectorAll('#settings-appearance .settings-control-card')).toHaveLength(5);
    controller.unmount();
  });

  it('labels the built-in local summary as extractive and hides non-executable model installers', async () => {
    const { controller } = mountSettings({ mode: 'local-gemma', model: 'gemma-4-local' });
    await vi.waitFor(() => expect(window.DB.getSetting).toHaveBeenCalled());
    expect(document.querySelector('[data-ai-mode]').selectedOptions[0].textContent).toMatch(/extractive/i);
    for (const selector of [
      '[data-ai-import-local-file]', '[data-ai-download-local-file]',
      '[data-ai-mark-local-installed]', '[data-ai-open-local-source]',
    ]) {
      expect(document.querySelector(selector).hidden).toBe(true);
    }
    expect(document.body.textContent).toMatch(/model files cannot run/i);
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
    expect(sessionStorage.getItem('ocd_ai_api_key_session')).toBe('sk-session');
    controller.unmount();
  });

  it('allows a newly entered HTTPS API origin to be explicitly approved and saved', async () => {
    const { controller, saveSetting, Toast } = mountSettings({
      mode: 'custom-api',
      model: 'baseline-model',
      endpoint: 'https://old.example.test/v1/chat/completions',
      approvedEndpointOrigin: 'https://old.example.test',
    });
    await vi.waitFor(() => expect(document.querySelector('[data-ai-model]').value).toBe('baseline-model'));
    const endpoint = document.querySelector('[data-ai-endpoint]');
    const checkbox = document.querySelector('[data-ai-approve-endpoint]');
    endpoint.value = 'https://new.example.test/v1/chat/completions';
    endpoint.dispatchEvent(new Event('input', { bubbles: true }));
    expect(checkbox.disabled).toBe(false);
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(checkbox.checked).toBe(true);
    document.querySelector('[data-ai-save]').click();
    await vi.waitFor(() => expect(saveSetting).toHaveBeenCalledTimes(1));
    expect(saveSetting.mock.calls[0][1]).toMatchObject({
      endpoint: 'https://new.example.test/v1/chat/completions',
      approvedEndpointOrigin: 'https://new.example.test',
    });
    await vi.waitFor(() => expect(Toast.success).toHaveBeenCalledWith('AI options saved'));
    controller.unmount();
  });

  it('restores the prior session credential and draft after an AI settings write rejects', async () => {
    const { controller, saveSetting, Toast } = mountSettings({
      mode: 'custom-api',
      model: 'original-model',
      endpoint: 'https://api.example.test/v1/chat/completions',
      approvedEndpointOrigin: 'https://api.example.test',
      hasKey: true,
    });
    await vi.waitFor(() => expect(document.querySelector('[data-ai-model]').value).toBe('original-model'));
    sessionStorage.setItem('ocd_ai_api_key_session', 'previous-session-key');
    saveSetting.mockRejectedValueOnce(new Error('IndexedDB transaction rejected'));
    document.querySelector('[data-ai-model]').value = 'new-model';
    document.querySelector('[data-ai-key]').value = 'replacement-session-key';
    const checkbox = document.querySelector('[data-ai-approve-endpoint]');
    checkbox.checked = true;
    document.querySelector('[data-ai-save]').click();

    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(expect.stringContaining('not saved')));
    expect(sessionStorage.getItem('ocd_ai_api_key_session')).toBe('previous-session-key');
    expect(document.querySelector('[data-ai-model]').value).toBe('new-model');
    expect(window.OpenCourseDeck.AISettings.model).toBe('original-model');
    expect(Toast.success).not.toHaveBeenCalled();
    controller.unmount();
  });

  it('restores a previously committed session key if disabling AI fails to persist', async () => {
    const { controller, saveSetting, Toast } = mountSettings({
      mode: 'custom-api',
      model: 'original-model',
      endpoint: 'https://api.example.test/v1/chat/completions',
      approvedEndpointOrigin: 'https://api.example.test',
    });
    await vi.waitFor(() => expect(document.querySelector('[data-ai-mode]').value).toBe('custom-api'));
    sessionStorage.setItem('ocd_ai_api_key_session', 'previous-session-key');
    saveSetting.mockRejectedValueOnce(new Error('Settings database unavailable'));
    document.querySelector('[data-ai-mode]').value = 'disabled';
    document.querySelector('[data-ai-save]').click();

    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(expect.stringContaining('not saved')));
    expect(sessionStorage.getItem('ocd_ai_api_key_session')).toBe('previous-session-key');
    expect(Toast.success).not.toHaveBeenCalled();
    controller.unmount();
  });

  it('keeps a valid unchanged credential bound across a save by retaining authority revision metadata', async () => {
    const { controller, saveSetting } = mountSettings({
      mode: 'custom-api',
      model: 'existing-model',
      endpoint: 'https://api.example.test/v1/chat/completions',
      approvedEndpointOrigin: 'https://api.example.test',
      hasKey: true,
      authorityRevision: 23,
      authorityTransactionId: 'ai-auth-23',
    });
    sessionStorage.setItem('ocd_ai_api_key_session', 'bound-session-key');
    window.OpenCourseDeck.AIAuthority = {
      getCredential: vi.fn(settings => (
        settings.authorityRevision === 23
        && settings.authorityTransactionId === 'ai-auth-23'
          ? 'bound-session-key' : ''
      )),
    };
    await vi.waitFor(() => expect(window.OpenCourseDeck?.AISettings?.model).toBe('existing-model'));
    expect(document.querySelector('[data-ai-approve-endpoint]').checked).toBe(true);
    document.querySelector('[data-ai-save]').click();
    await vi.waitFor(() => expect(saveSetting).toHaveBeenCalledTimes(1));
    expect(saveSetting.mock.calls[0][1].hasKey).toBe(true);
    expect(sessionStorage.getItem('ocd_ai_api_key_session')).toBe('bound-session-key');
    controller.unmount();
  });

  it('does not silently reuse an old API key when its selected model changes', async () => {
    const { controller, saveSetting } = mountSettings({
      mode: 'custom-api',
      model: 'original-model',
      endpoint: 'https://api.example.test/v1/chat/completions',
      approvedEndpointOrigin: 'https://api.example.test',
      hasKey: true,
    });
    await vi.waitFor(() => expect(document.querySelector('[data-ai-model]').value).toBe('original-model'));
    sessionStorage.setItem('ocd_ai_api_key_session', 'old-key-for-original-model');
    document.querySelector('[data-ai-model]').value = 'different-provider-model';
    document.querySelector('[data-ai-approve-endpoint]').checked = true;
    document.querySelector('[data-ai-save]').click();
    await vi.waitFor(() => expect(saveSetting).toHaveBeenCalledTimes(1));
    expect(saveSetting.mock.calls[0][1].hasKey).toBe(false);
    expect(sessionStorage.getItem('ocd_ai_api_key_session')).toBeNull();
    controller.unmount();
  });

  it('serializes UI saves so a second click cannot replace an in-flight key transaction', async () => {
    const { controller, saveSetting } = mountSettings();
    let finishCommit;
    saveSetting.mockImplementationOnce(() => new Promise(resolve => { finishCommit = resolve; }));
    const button = document.querySelector('[data-ai-save]');
    document.querySelector('[data-ai-mode]').value = 'disabled';
    button.click();
    button.click();
    expect(saveSetting).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    finishCommit(true);
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    controller.unmount();
  });

  it('uses authority binding verification rather than only the presence of session key bytes', async () => {
    const { controller } = mountSettings({
      mode: 'custom-api',
      model: 'existing-model',
      endpoint: 'https://api.example.test/v1/chat/completions',
      approvedEndpointOrigin: 'https://api.example.test',
      hasKey: true,
      authorityRevision: 24,
      authorityTransactionId: 'ai-auth-24',
    });
    sessionStorage.setItem('ocd_ai_api_key_session', 'unbound-credential-bytes');
    window.OpenCourseDeck.AIAuthority = { getCredential: vi.fn(() => '') };
    await vi.waitFor(() => expect(window.OpenCourseDeck?.AISettings?.model).toBe('existing-model'));
    expect(window.OpenCourseDeck.AISettings.hasKey).toBe(false);
    expect(document.querySelector('[data-ai-summary]').textContent).toContain('Not present');
    controller.unmount();
  });

  it('does not advertise an unbound session key as an available credential', async () => {
    const { controller } = mountSettings({
      mode: 'custom-api',
      model: 'private-model',
      endpoint: 'https://api.example.test/v1/chat/completions',
      approvedEndpointOrigin: 'https://api.example.test',
      hasKey: false,
    });
    sessionStorage.setItem('ocd_ai_api_key_session', 'stale-key-from-another-provider');
    await vi.waitFor(() => expect(window.OpenCourseDeck?.AISettings?.model).toBe('private-model'));
    expect(window.OpenCourseDeck.AISettings.hasKey).toBe(false);
    expect(document.querySelector('[data-ai-summary]').textContent).toContain('Not present');
    controller.unmount();
  });

  it('refuses a full reset before deleting anything when media storage cannot be reached', async () => {
    const { controller, Toast } = mountSettings();
    document.getElementById('select-clear-scope').value = 'all';
    document.getElementById('btn-clear-scope').click();

    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Nothing was cleared'),
    ));
    expect(window.DB.clearUserData).not.toHaveBeenCalled();
    expect(Toast.success).not.toHaveBeenCalled();
    controller.unmount();
  });

  it('reports a partial reset when the auxiliary file database fails after main deletion', async () => {
    const { controller, Toast } = mountSettings();
    window.OpenCourseDeck.UserLibrary = {
      clearLibraryFiles: vi.fn(async () => { throw new Error('Library storage quota error'); }),
    };
    document.getElementById('select-clear-scope').value = 'all';
    document.getElementById('btn-clear-scope').click();

    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Some study records were deleted'),
    ));
    expect(window.DB.clearUserData).toHaveBeenCalledWith('all');
    expect(window.OpenCourseDeck.UserLibrary.clearLibraryFiles).toHaveBeenCalledOnce();
    expect(Toast.success).not.toHaveBeenCalled();
    controller.unmount();
  });

  it('confirms a full reset only when both storage layers report completion', async () => {
    const { controller, Toast } = mountSettings();
    window.OpenCourseDeck.UserLibrary = { clearLibraryFiles: vi.fn(async () => true) };
    document.getElementById('select-clear-scope').value = 'all';
    document.getElementById('btn-clear-scope').click();
    await vi.waitFor(() => expect(Toast.success).toHaveBeenCalledWith('Cleared all local OpenCourseDeck data'));
    expect(window.DB.clearUserData).toHaveBeenCalledWith('all');
    expect(window.OpenCourseDeck.UserLibrary.clearLibraryFiles).toHaveBeenCalledOnce();
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
    expect(sessionStorage.getItem('ocd_ai_api_key_session')).toBeNull();
    expect(saveSetting).not.toHaveBeenCalled();
    controller.unmount();
  });
  it('keeps Appearance selected and navigates within Settings without changing the SPA route', () => {
    const { controller } = mountSettings();
    const links = [...document.querySelectorAll('.settings-nav a')];
    expect(links[0].getAttribute('aria-current')).toBe('location');
    const before = window.location.hash;
    const section = document.getElementById('settings-storage');
    const scroll = vi.fn();
    section.scrollIntoView = scroll;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    links[2].dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(window.location.hash).toBe(before);
    expect(scroll).toHaveBeenCalled();
    expect(links[2].getAttribute('aria-current')).toBe('location');
    expect(links[0].hasAttribute('aria-current')).toBe(false);
    controller.unmount();
  });

});
