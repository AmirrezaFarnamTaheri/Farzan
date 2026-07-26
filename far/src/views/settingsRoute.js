export function mountSettingsView(deps = {}) {
  const {
    setView,
    ThemeManager,
    FontScale,
    Prefs,
    Toast = window.OpenCourseDeck?.Toast,
    formatBytes,
    localStorageFootprint,
  } = deps;

  const safeFormatBytes = (value) => {
    if (typeof formatBytes === 'function') return formatBytes(Number(value) || 0);
    return `${Math.max(0, Number(value) || 0)} bytes`;
  };

  setView(`
    <section class="view view-settings">
      <div class="page-header settings-page-header">
        <div>
          <span class="eyebrow">Control center</span>
          <h1 class="page-title">Settings</h1>
          <p class="page-subtitle">Personalize the workspace, manage local data, and configure optional AI features with explicit privacy boundaries.</p>
        </div>
        <div class="settings-header-actions">
          <button class="btn btn-primary" id="btn-export-json-2" type="button">
            <i class="fa-solid fa-download" aria-hidden="true"></i>
            Export backup
          </button>
          <button class="btn btn-ghost" id="btn-import-json-2" type="button">
            <i class="fa-solid fa-upload" aria-hidden="true"></i>
            Import backup
          </button>
        </div>
      </div>

      <div class="settings-layout">
        <nav class="settings-nav" aria-label="Settings sections">
          <a href="#settings-appearance"><i class="fa-solid fa-palette" aria-hidden="true"></i><span>Appearance</span></a>
          <a href="#settings-ai"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i><span>AI & privacy</span></a>
          <a href="#settings-storage"><i class="fa-solid fa-hard-drive" aria-hidden="true"></i><span>Storage</span></a>
          <a href="#settings-data"><i class="fa-solid fa-box-archive" aria-hidden="true"></i><span>Data controls</span></a>
        </nav>

        <div class="settings-content">
          <section class="card card-filled settings-section" id="settings-appearance" aria-labelledby="settings-appearance-title">
            <div class="card-body">
              <div class="settings-section-heading">
                <div class="settings-section-icon"><i class="fa-solid fa-palette" aria-hidden="true"></i></div>
                <div>
                  <span class="eyebrow">Workspace comfort</span>
                  <h2 id="settings-appearance-title">Appearance</h2>
                  <p>Adjust readability and information density without changing your learning data.</p>
                </div>
              </div>

              <div class="settings-control-grid">
                <article class="settings-control-card">
                  <div>
                    <strong>UI font size</strong>
                    <span>Keyboard shortcuts: Ctrl +, Ctrl −, Ctrl 0</span>
                  </div>
                  <div class="settings-inline-controls">
                    <button class="btn btn-ghost btn-sm" id="btn-font-dec" type="button" aria-label="Decrease font size">A−</button>
                    <output class="badge" id="font-scale-label">100%</output>
                    <button class="btn btn-ghost btn-sm" id="btn-font-inc" type="button" aria-label="Increase font size">A+</button>
                    <button class="btn btn-ghost btn-sm" id="btn-font-reset" type="button" aria-label="Reset font size">Reset</button>
                  </div>
                </article>

                <label class="settings-control-card settings-control-label" for="select-density">
                  <span>
                    <strong>Interface density</strong>
                    <small>Choose compact, comfortable, or spacious layouts.</small>
                  </span>
                  <select class="select input-sm" id="select-density" aria-label="UI density">
                    <option value="compact">Compact</option>
                    <option value="comfortable">Comfortable</option>
                    <option value="spacious">Spacious</option>
                  </select>
                </label>

                <article class="settings-control-card">
                  <div>
                    <strong>Color theme</strong>
                    <span>Switch between the available light and dark presentation.</span>
                  </div>
                  <button class="btn btn-ghost" id="btn-theme-toggle" type="button">
                    <i class="fa-solid fa-circle-half-stroke" aria-hidden="true"></i>
                    Toggle theme
                  </button>
                </article>
              </div>
            </div>
          </section>

          <section class="card card-filled settings-section settings-ai-section" id="settings-ai" aria-labelledby="settings-ai-title">
            <div class="card-body">
              <div class="settings-section-heading settings-section-heading-status">
                <div class="settings-section-icon"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i></div>
                <div>
                  <span class="eyebrow">Optional and private by default</span>
                  <h2 id="settings-ai-title">AI & privacy</h2>
                  <p>Use the built-in local summary mode or explicitly approve a private API destination. API keys remain in this browser session only.</p>
                </div>
                <span class="badge badge-info" data-ai-status aria-live="polite">Loading</span>
              </div>

              <div class="settings-ai-mode-grid">
                <label class="settings-field">
                  <span>AI mode</span>
                  <select class="select" data-ai-mode>
                    <option value="hidden">Hidden</option>
                    <option value="disabled">Visible but off</option>
                    <option value="local-gemma">Local private mode</option>
                    <option value="custom-api">Approved API endpoint</option>
                  </select>
                </label>
                <label class="settings-field">
                  <span>Model</span>
                  <input class="input" data-ai-model placeholder="Model name or local model ID" autocomplete="off" />
                </label>
                <label class="settings-field">
                  <span>API key lifetime</span>
                  <select class="select" data-ai-key-storage disabled aria-describedby="ai-key-storage-help">
                    <option value="session">Current browser session only</option>
                  </select>
                  <small id="ai-key-storage-help">Keys are never written to IndexedDB or localStorage.</small>
                </label>
              </div>

              <div class="settings-ai-panel" data-ai-custom-fields hidden>
                <div class="settings-ai-panel-heading">
                  <div>
                    <strong>Remote endpoint boundary</strong>
                    <span>Your prompt and bearer key are sent only after this exact origin is approved.</span>
                  </div>
                  <span class="settings-origin-badge" data-ai-endpoint-origin>Not configured</span>
                </div>
                <div class="settings-ai-two-column">
                  <label class="settings-field">
                    <span>OpenAI-compatible endpoint</span>
                    <input class="input" data-ai-endpoint inputmode="url" autocomplete="off" placeholder="https://api.example.com/v1/chat/completions" />
                  </label>
                  <label class="settings-field">
                    <span>Session API key</span>
                    <input class="input" data-ai-key type="password" autocomplete="new-password" placeholder="Cleared when this tab session ends" />
                  </label>
                </div>
                <label class="settings-approval-row">
                  <input type="checkbox" data-ai-approve-endpoint />
                  <span>I approve sending prompts and the session key to <strong data-ai-approved-origin>this endpoint origin</strong>.</span>
                </label>
                <div class="settings-security-message" data-ai-endpoint-warning aria-live="polite">
                  Enter an HTTPS endpoint. Plain HTTP is allowed only for localhost development.
                </div>
              </div>

              <div class="settings-ai-panel" data-ai-local-fields hidden>
                <div class="settings-ai-panel-heading">
                  <div>
                    <strong>Local model cache</strong>
                    <span>Model bytes stay in this browser profile. Large imports are bounded to protect memory and storage.</span>
                  </div>
                  <span class="settings-origin-badge" data-ai-model-limit>Checking limit</span>
                </div>
                <div class="settings-ai-two-column">
                  <label class="settings-field">
                    <span>Local package</span>
                    <select class="select" data-ai-local-package>
                      <option value="gemma-4-local">Gemma 4</option>
                      <option value="gemma-3n-local">Gemma 3n</option>
                    </select>
                  </label>
                  <label class="settings-field">
                    <span>Model source</span>
                    <input class="input" data-ai-local-source inputmode="url" autocomplete="off" placeholder="https://ai.google.dev/gemma" />
                  </label>
                </div>
                <input type="file" data-ai-local-file hidden />
                <div class="settings-download-progress" data-ai-download-progress hidden>
                  <div class="settings-download-progress-head">
                    <span data-ai-download-label>Preparing download…</span>
                    <button class="btn btn-ghost btn-sm" type="button" data-ai-cancel-download>Cancel</button>
                  </div>
                  <div role="progressbar" aria-label="Local model download" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                    <span data-ai-download-bar></span>
                  </div>
                </div>
              </div>

              <div class="settings-action-row">
                <button class="btn btn-primary" type="button" data-ai-save>
                  <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>
                  Save AI options
                </button>
                <button class="btn btn-ghost" type="button" data-ai-open-local-source>Open model page</button>
                <button class="btn btn-ghost" type="button" data-ai-import-local-file>Import model file</button>
                <button class="btn btn-ghost" type="button" data-ai-download-local-file>Download to cache</button>
                <button class="btn btn-ghost" type="button" data-ai-mark-local-installed>Mark installed</button>
                <button class="btn btn-ghost" type="button" data-ai-clear-local-model>Clear model</button>
                <button class="btn btn-ghost" type="button" data-ai-clear-key>Clear session key</button>
              </div>

              <dl class="help-facts settings-facts" data-ai-summary>
                <div><dt>Status</dt><dd>Loading…</dd></div>
              </dl>
            </div>
          </section>

          <section class="card card-filled settings-section" id="settings-storage" aria-labelledby="settings-storage-title">
            <div class="card-body">
              <div class="settings-section-heading settings-section-heading-status">
                <div class="settings-section-icon"><i class="fa-solid fa-hard-drive" aria-hidden="true"></i></div>
                <div>
                  <span class="eyebrow">Local-first health</span>
                  <h2 id="settings-storage-title">Storage</h2>
                  <p>Review browser quota, local fallback usage, and recent persistence warnings.</p>
                </div>
                <span class="badge badge-info" data-storage-status>Checking</span>
              </div>

              <div class="settings-storage-meter">
                <div class="settings-storage-meter-head">
                  <span data-storage-summary>Calculating storage usage…</span>
                  <span data-storage-percent>0%</span>
                </div>
                <div role="progressbar" aria-label="Storage usage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                  <span id="storage-bar" data-storage-bar></span>
                </div>
              </div>
              <dl class="help-facts settings-facts" data-storage-health>
                <div><dt>Status</dt><dd>Loading…</dd></div>
              </dl>
            </div>
          </section>

          <section class="card card-filled settings-section" id="settings-data" aria-labelledby="settings-data-title">
            <div class="card-body">
              <div class="settings-section-heading">
                <div class="settings-section-icon settings-section-icon-danger"><i class="fa-solid fa-box-archive" aria-hidden="true"></i></div>
                <div>
                  <span class="eyebrow">Selective cleanup</span>
                  <h2 id="settings-data-title">Data controls</h2>
                  <p>Export a backup first, then remove only the local category you no longer need.</p>
                </div>
              </div>
              <div class="settings-danger-zone">
                <label class="settings-field" for="select-clear-scope">
                  <span>Data to remove</span>
                  <select class="select" id="select-clear-scope" aria-label="Data to wipe">
                    <option value="progress">Progress only</option>
                    <option value="notes">Notes and folders</option>
                    <option value="media">Timestamps and PDF annotations</option>
                    <option value="playlists">Saved playlists</option>
                    <option value="studio">Studio boards</option>
                    <option value="preferences">Preferences only</option>
                    <option value="all">Everything local</option>
                  </select>
                </label>
                <button class="btn btn-danger" id="btn-clear-scope" type="button">
                  <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
                  Wipe selected data
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
  `);

  const routeListeners = [];
  const on = (target, type, handler, options) => {
    if (!target) return;
    target.addEventListener(type, handler, options);
    routeListeners.push({ target, type, handler, options });
  };

  const themeBtn = document.getElementById('btn-theme-toggle');
  on(themeBtn, 'click', () => ThemeManager?.toggle?.());

  const updateFontLabel = () => {
    const element = document.getElementById('font-scale-label');
    if (element) element.textContent = `${Math.round((FontScale?.get?.() || 1) * 100)}%`;
  };
  updateFontLabel();
  on(document.getElementById('btn-font-inc'), 'click', () => { FontScale?.inc?.(); updateFontLabel(); });
  on(document.getElementById('btn-font-dec'), 'click', () => { FontScale?.dec?.(); updateFontLabel(); });
  on(document.getElementById('btn-font-reset'), 'click', () => { FontScale?.reset?.(); updateFontLabel(); });
  window.OpenCourseDeck?.bus?.on?.('fontScale:change', updateFontLabel);

  const densitySelect = document.getElementById('select-density');
  if (densitySelect) {
    densitySelect.value = document.documentElement.getAttribute('data-density')
      || Prefs?.get?.(Prefs?.KEYS?.density, 'comfortable')
      || 'comfortable';
    on(densitySelect, 'change', () => {
      const density = densitySelect.value;
      document.documentElement.setAttribute('data-density', density);
      Prefs?.set?.(Prefs?.KEYS?.density, density);
      window.OpenCourseDeck?.bus?.emit?.('density:change', { density });
    });
  }

  on(document.getElementById('btn-export-json-2'), 'click', () => {
    try { window.ProgressStats?.exportJSON?.(); } catch { Toast?.error?.('Export failed'); }
  });
  on(document.getElementById('btn-import-json-2'), 'click', () => {
    try { window.ProgressStats?.importJSON?.(); } catch { Toast?.error?.('Import failed'); }
  });

  const storageController = renderStorageHealth();
  const aiController = renderAISettings();

  const wipeButton = document.getElementById('btn-clear-scope');
  const wipeScope = document.getElementById('select-clear-scope');
  const scopeLabels = {
    progress: 'progress records',
    notes: 'notes, folders, and note settings',
    media: 'timestamps and PDF annotations',
    playlists: 'saved playlists',
    studio: 'Studio boards',
    preferences: 'preferences',
    all: 'all local OpenCourseDeck data',
  };
  on(wipeButton, 'click', async () => {
    const scope = wipeScope?.value || 'all';
    const label = scopeLabels[scope] || scopeLabels.all;
    const confirmed = await window.OpenCourseDeck?.UI?.confirm?.(`This will permanently delete ${label} from this browser. Continue?`);
    if (!confirmed) return;
    try {
      if (window.DB?.clearUserData) await window.DB.clearUserData(scope);
      else if (scope === 'all') await window.DB?.clearAll?.();
      if (scope === 'all' || scope === 'media') {
        sessionStorage.removeItem('plasma_pending_topic');
        sessionStorage.removeItem('plasma_pending_position');
        sessionStorage.removeItem('plasma_pending_course_session');
      }
      Toast?.success?.(`Cleared ${label}`);
      storageController?.update?.();
    } catch {
      Toast?.error?.('Clear failed');
    }
  });

  return {
    unmount() {
      routeListeners.forEach(({ target, type, handler, options }) => {
        try { target.removeEventListener(type, handler, options); } catch {}
      });
      aiController?.cancelDownload?.();
      if (storageController?.timer) clearInterval(storageController.timer);
      window.OpenCourseDeck?.bus?.off?.('fontScale:change', updateFontLabel);
    },
  };

  function renderAISettings() {
    const mode = document.querySelector('[data-ai-mode]');
    const model = document.querySelector('[data-ai-model]');
    const endpoint = document.querySelector('[data-ai-endpoint]');
    const apiKey = document.querySelector('[data-ai-key]');
    const keyStorage = document.querySelector('[data-ai-key-storage]');
    const approval = document.querySelector('[data-ai-approve-endpoint]');
    const approvedOrigin = document.querySelector('[data-ai-approved-origin]');
    const endpointOrigin = document.querySelector('[data-ai-endpoint-origin]');
    const endpointWarning = document.querySelector('[data-ai-endpoint-warning]');
    const customFields = document.querySelector('[data-ai-custom-fields]');
    const localFields = document.querySelector('[data-ai-local-fields]');
    const localPackage = document.querySelector('[data-ai-local-package]');
    const localSource = document.querySelector('[data-ai-local-source]');
    const localFileInput = document.querySelector('[data-ai-local-file]');
    const status = document.querySelector('[data-ai-status]');
    const summary = document.querySelector('[data-ai-summary]');
    const downloadProgress = document.querySelector('[data-ai-download-progress]');
    const downloadLabel = document.querySelector('[data-ai-download-label]');
    const downloadBar = document.querySelector('[data-ai-download-bar]');
    const cancelDownloadButton = document.querySelector('[data-ai-cancel-download]');
    const modelLimit = document.querySelector('[data-ai-model-limit]');
    if (!mode || !model || !endpoint || !apiKey || !keyStorage || !approval || !approvedOrigin
      || !endpointOrigin || !endpointWarning || !customFields || !localFields || !localPackage
      || !localSource || !localFileInput || !status || !summary) return null;

    const keyName = 'plasma-ai-api-key-session';
    const ai = window.OpenCourseDeck?.AI;
    const gemmaOptions = ai?.gemmaModelOptions || [
      { id: 'gemma-4-local', label: 'Gemma 4', url: 'https://ai.google.dev/gemma' },
      { id: 'gemma-3n-local', label: 'Gemma 3n', url: 'https://ai.google.dev/gemma' },
    ];
    const maxModelBytes = Number(ai?.limits?.maxModelBytes) || 2 * 1024 * 1024 * 1024;
    if (modelLimit) modelLimit.textContent = `${safeFormatBytes(maxModelBytes)} maximum`;
    keyStorage.value = 'session';

    localPackage.replaceChildren(...gemmaOptions.map((option) => {
      const item = document.createElement('option');
      item.value = option.id;
      item.textContent = option.label;
      return item;
    }));

    const current = {
      mode: 'hidden',
      model: 'gemma-4-local',
      endpoint: '',
      keyStorage: 'session',
      hasKey: false,
      approvedEndpointOrigin: '',
      localModelStatus: 'not-installed',
      localModelSource: gemmaOptions[0]?.url || 'https://ai.google.dev/gemma',
      localModelFile: null,
    };
    let activeDownloadController = null;

    const selectedModelOption = () => gemmaOptions.find(option => option.id === localPackage.value) || gemmaOptions[0];
    const isLoopback = (hostname) => {
      const value = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
      return value === 'localhost' || value === '::1' || value === '127.0.0.1' || value.startsWith('127.');
    };
    const parseEndpoint = (value) => {
      const source = String(value || '').trim();
      if (!source) return { valid: false, reason: 'Enter an endpoint URL.' };
      if (!/^https?:\/\//i.test(source)) return { valid: false, reason: 'Use an absolute HTTP or HTTPS URL.' };
      try {
        const parsed = new URL(source);
        if (parsed.username || parsed.password) return { valid: false, reason: 'Remove embedded credentials from the URL.' };
        if (parsed.protocol === 'http:' && !isLoopback(parsed.hostname)) {
          return { valid: false, reason: 'Remote endpoints must use HTTPS. HTTP is allowed only for localhost.' };
        }
        return { valid: true, origin: parsed.origin, href: parsed.href };
      } catch {
        return { valid: false, reason: 'The endpoint URL is invalid.' };
      }
    };

    const renderEndpointApproval = () => {
      const parsed = parseEndpoint(endpoint.value);
      if (!parsed.valid) {
        endpointOrigin.textContent = 'Not approved';
        approvedOrigin.textContent = 'this endpoint origin';
        endpointWarning.textContent = parsed.reason;
        endpointWarning.dataset.tone = 'warning';
        approval.checked = false;
        approval.disabled = true;
        return parsed;
      }
      endpointOrigin.textContent = parsed.origin;
      approvedOrigin.textContent = parsed.origin;
      approval.disabled = false;
      const matches = current.approvedEndpointOrigin === parsed.origin;
      if (!matches) approval.checked = false;
      endpointWarning.textContent = matches
        ? `Approved origin: ${parsed.origin}. Changing the origin requires new approval.`
        : `Review and approve ${parsed.origin} before saving a session key.`;
      endpointWarning.dataset.tone = matches ? 'success' : 'info';
      return parsed;
    };

    const setModeVisibility = () => {
      customFields.hidden = mode.value !== 'custom-api';
      localFields.hidden = mode.value !== 'local-gemma';
      document.querySelector('[data-ai-open-local-source]')?.toggleAttribute('hidden', mode.value !== 'local-gemma');
      document.querySelector('[data-ai-import-local-file]')?.toggleAttribute('hidden', mode.value !== 'local-gemma');
      document.querySelector('[data-ai-download-local-file]')?.toggleAttribute('hidden', mode.value !== 'local-gemma');
      document.querySelector('[data-ai-mark-local-installed]')?.toggleAttribute('hidden', mode.value !== 'local-gemma');
      document.querySelector('[data-ai-clear-local-model]')?.toggleAttribute('hidden', mode.value !== 'local-gemma');
      document.querySelector('[data-ai-clear-key]')?.toggleAttribute('hidden', mode.value !== 'custom-api');
    };

    const setStatus = () => {
      const labels = {
        hidden: 'Hidden',
        disabled: 'Off',
        'local-gemma': 'Local private mode',
        'custom-api': 'Approved API',
      };
      const modeLabel = labels[current.mode] || 'Hidden';
      status.textContent = modeLabel;
      status.className = `badge ${current.mode === 'hidden' || current.mode === 'disabled' ? 'badge-info' : 'badge-success'}`;
      summary.replaceChildren();
      const facts = [
        ['Mode', modeLabel],
        ['Model', current.model || 'Not selected'],
        ['Credential storage', 'Session memory only'],
        ['Approved API origin', current.approvedEndpointOrigin || 'None'],
        ['API key', current.hasKey ? 'Available for this session' : 'Not present'],
        ['Local package', selectedModelOption()?.label || current.model || 'Not selected'],
        ['Local model', current.localModelFile?.name || (current.localModelStatus === 'installed' ? 'Marked installed' : 'Not installed')],
        ['Local file size', current.localModelFile?.size ? safeFormatBytes(current.localModelFile.size) : 'None'],
        ['Model source', current.localModelSource || 'Not configured'],
      ];
      facts.forEach(([label, value]) => {
        const row = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = label;
        dd.textContent = value;
        row.append(dt, dd);
        summary.appendChild(row);
      });
    };

    const apply = (next = {}) => {
      Object.assign(current, next, {
        keyStorage: 'session',
        hasKey: Boolean(sessionStorage.getItem(keyName)),
      });
      mode.value = current.mode;
      model.value = current.model;
      if ([...localPackage.options].some(option => option.value === current.model)) localPackage.value = current.model;
      localSource.value = current.localModelSource;
      endpoint.value = current.endpoint;
      keyStorage.value = 'session';
      apiKey.value = '';
      approval.checked = Boolean(current.approvedEndpointOrigin && parseEndpoint(current.endpoint).origin === current.approvedEndpointOrigin);
      window.OpenCourseDeck.AISettings = { ...current };
      setModeVisibility();
      renderEndpointApproval();
      setStatus();
    };

    Promise.resolve(window.DB?.getSetting?.('plasma-ai-settings')).then(async (saved) => {
      const sanitized = {
        mode: saved?.mode || 'hidden',
        model: saved?.model || 'gemma-local',
        endpoint: saved?.endpoint || '',
        keyStorage: 'session',
        hasKey: Boolean(sessionStorage.getItem(keyName)),
        approvedEndpointOrigin: saved?.approvedEndpointOrigin || '',
        localModelStatus: ['installed', 'imported'].includes(saved?.localModelStatus) ? saved.localModelStatus : 'not-installed',
        localModelSource: saved?.localModelSource || gemmaOptions[0]?.url || 'https://ai.google.dev/gemma',
        localModelFile: saved?.localModelFile && typeof saved.localModelFile === 'object' ? saved.localModelFile : null,
      };
      if (saved?.apiKey || saved?.keyStorage === 'local') {
        await Promise.resolve(window.DB?.saveSetting?.('plasma-ai-settings', sanitized));
        Toast?.info?.('A previously stored AI key was removed. API keys are now session-only.');
      }
      apply(sanitized);
    }).catch(() => apply());

    on(mode, 'change', () => {
      setModeVisibility();
      current.mode = mode.value;
      setStatus();
    });
    on(endpoint, 'input', renderEndpointApproval);
    on(approval, 'change', () => {
      const parsed = renderEndpointApproval();
      if (parsed.valid && approval.checked) {
        endpointWarning.textContent = `${parsed.origin} will be approved when you save.`;
        endpointWarning.dataset.tone = 'success';
      }
    });
    on(localPackage, 'change', () => {
      const option = selectedModelOption();
      model.value = option?.id || localPackage.value;
      if (option?.url && (!localSource.value || localSource.value === current.localModelSource)) localSource.value = option.url;
    });

    on(document.querySelector('[data-ai-save]'), 'click', async () => {
      const rawKey = apiKey.value.trim();
      const next = {
        mode: mode.value,
        model: model.value.trim() || 'gemma-local',
        endpoint: endpoint.value.trim(),
        keyStorage: 'session',
        hasKey: false,
        approvedEndpointOrigin: '',
        localModelStatus: current.localModelStatus,
        localModelSource: localSource.value.trim() || selectedModelOption()?.url || 'https://ai.google.dev/gemma',
        localModelFile: current.localModelFile,
      };

      if (next.mode === 'custom-api') {
        const parsed = parseEndpoint(next.endpoint);
        if (!parsed.valid) {
          Toast?.error?.(parsed.reason);
          endpoint.focus();
          return;
        }
        if (!approval.checked) {
          Toast?.error?.(`Approve ${parsed.origin} before saving.`);
          approval.focus();
          return;
        }
        next.endpoint = parsed.href;
        next.approvedEndpointOrigin = parsed.origin;
        if (rawKey) sessionStorage.setItem(keyName, rawKey);
        next.hasKey = Boolean(sessionStorage.getItem(keyName));
      } else {
        sessionStorage.removeItem(keyName);
        next.hasKey = false;
      }

      await Promise.resolve(window.DB?.saveSetting?.('plasma-ai-settings', next));
      apply(next);
      Toast?.success?.('AI options saved');
    });

    on(document.querySelector('[data-ai-open-local-source]'), 'click', () => {
      const source = localSource.value.trim() || selectedModelOption()?.url;
      try {
        const parsed = new URL(source);
        if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback(parsed.hostname))) throw new Error();
        window.open(parsed.href, '_blank', 'noopener,noreferrer');
      } catch {
        Toast?.error?.('Model source must be a secure HTTP(S) URL.');
      }
    });

    on(document.querySelector('[data-ai-import-local-file]'), 'click', () => localFileInput.click());
    on(localFileInput, 'change', async () => {
      const file = localFileInput.files?.[0];
      if (!file) return;
      try {
        const imported = await ai?.importLocalModelFile?.(file);
        const stored = {
          ...current,
          mode: mode.value,
          model: model.value.trim() || selectedModelOption()?.id || current.model,
          keyStorage: 'session',
          hasKey: Boolean(sessionStorage.getItem(keyName)),
          localModelStatus: 'imported',
          localModelSource: localSource.value.trim() || selectedModelOption()?.url || current.localModelSource,
          localModelFile: {
            name: imported?.name || file.name,
            size: imported?.size ?? file.size,
            type: imported?.type || file.type || 'application/octet-stream',
            lastModified: imported?.lastModified ?? file.lastModified ?? 0,
            importedAt: imported?.importedAt || Date.now(),
          },
        };
        await Promise.resolve(window.DB?.saveSetting?.('plasma-ai-settings', stored));
        apply(stored);
        Toast?.success?.('Local model file imported');
      } catch (error) {
        Toast?.error?.(error?.message || 'Local model import failed');
      } finally {
        localFileInput.value = '';
      }
    });

    const cancelDownload = () => {
      activeDownloadController?.abort?.();
      activeDownloadController = null;
    };
    on(cancelDownloadButton, 'click', cancelDownload);
    on(document.querySelector('[data-ai-download-local-file]'), 'click', async (event) => {
      const button = event.currentTarget;
      const source = localSource.value.trim() || selectedModelOption()?.url;
      cancelDownload();
      activeDownloadController = new AbortController();
      button.disabled = true;
      if (downloadProgress) downloadProgress.hidden = false;
      if (downloadLabel) downloadLabel.textContent = 'Starting secure download…';
      if (downloadBar) downloadBar.style.width = '0%';
      try {
        const downloaded = await ai?.downloadLocalModel?.(source, {
          signal: activeDownloadController.signal,
          onProgress(progress) {
            const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
            if (downloadLabel) {
              downloadLabel.textContent = progress.total
                ? `${safeFormatBytes(progress.loaded)} of ${safeFormatBytes(progress.total)} (${percent}%)`
                : `${safeFormatBytes(progress.loaded)} downloaded`;
            }
            if (downloadBar) downloadBar.style.width = `${percent}%`;
            downloadBar?.parentElement?.setAttribute?.('aria-valuenow', String(percent));
          },
        });
        const stored = {
          ...current,
          mode: mode.value,
          model: model.value.trim() || selectedModelOption()?.id || current.model,
          keyStorage: 'session',
          hasKey: Boolean(sessionStorage.getItem(keyName)),
          localModelStatus: 'imported',
          localModelSource: source,
          localModelFile: downloaded,
        };
        await Promise.resolve(window.DB?.saveSetting?.('plasma-ai-settings', stored));
        apply(stored);
        Toast?.success?.('Local model downloaded');
      } catch (error) {
        Toast?.error?.(error?.message || 'Local model download failed');
      } finally {
        activeDownloadController = null;
        button.disabled = false;
        if (downloadProgress) downloadProgress.hidden = true;
      }
    });

    on(document.querySelector('[data-ai-mark-local-installed]'), 'click', async () => {
      const stored = {
        ...current,
        // `mode` is deliberately NOT read from the live select here. Only the
        // Save handler may commit it, because only Save runs the endpoint
        // approval gate that must accompany a switch to custom-api. Marking a
        // local model installed is an unrelated action, and picking up the
        // live value made it silently persist whatever mode the user had
        // changed the select to without saving.
        model: model.value.trim() || selectedModelOption()?.id || current.model,
        keyStorage: 'session',
        hasKey: Boolean(sessionStorage.getItem(keyName)),
        localModelStatus: 'installed',
        localModelSource: localSource.value.trim() || selectedModelOption()?.url || current.localModelSource,
        localModelFile: current.localModelFile,
      };
      await Promise.resolve(window.DB?.saveSetting?.('plasma-ai-settings', stored));
      apply(stored);
      Toast?.success?.('Local model marked installed');
    });

    on(document.querySelector('[data-ai-clear-local-model]'), 'click', async () => {
      await ai?.clearLocalModelFile?.();
      const stored = { ...current, localModelStatus: 'not-installed', localModelFile: null, keyStorage: 'session' };
      await Promise.resolve(window.DB?.saveSetting?.('plasma-ai-settings', stored));
      apply(stored);
      Toast?.info?.('Local model cache cleared');
    });

    on(document.querySelector('[data-ai-clear-key]'), 'click', async () => {
      sessionStorage.removeItem(keyName);
      const stored = { ...current, keyStorage: 'session', hasKey: false };
      await Promise.resolve(window.DB?.saveSetting?.('plasma-ai-settings', stored));
      apply(stored);
      Toast?.info?.('Session AI key cleared');
    });

    return { apply, cancelDownload };
  }

  function renderStorageHealth() {
    const root = document.querySelector('[data-storage-health]');
    const bar = document.querySelector('[data-storage-bar]');
    const summary = document.querySelector('[data-storage-summary]');
    const percentLabel = document.querySelector('[data-storage-percent]');
    const status = document.querySelector('[data-storage-status]');
    if (!root || !bar || !summary || !status) return null;

    const update = async () => {
      let estimate;
      try {
        estimate = await navigator.storage?.estimate?.() ?? null;
      } catch {
        estimate = null;
      }
      if (!document.body.contains(root)) return;
      const usage = Number(estimate?.usage);
      const quota = Number(estimate?.quota);
      const hasQuota = Number.isFinite(usage) && Number.isFinite(quota) && quota > 0;
      const percent = hasQuota ? Math.min(100, Math.round((usage / quota) * 100)) : 0;
      const available = hasQuota ? Math.max(0, quota - usage) : null;
      const localBytes = typeof localStorageFootprint === 'function' ? localStorageFootprint() : 0;
      const issue = window.OpenCourseDeck?.lastStorageIssue;
      const statusText = !hasQuota
        ? 'Unavailable'
        : percent >= 90 || issue?.error?.quota
          ? 'Critical'
          : percent >= 75
            ? 'Watch'
            : 'Healthy';

      status.textContent = statusText;
      status.className = `badge ${statusText === 'Critical' ? 'badge-danger' : statusText === 'Healthy' ? 'badge-success' : 'badge-info'}`;
      bar.style.width = `${percent}%`;
      bar.closest('[role="progressbar"]')?.setAttribute?.('aria-valuenow', String(percent));
      if (percentLabel) percentLabel.textContent = `${percent}%`;
      summary.textContent = hasQuota
        ? `${safeFormatBytes(usage)} used of ${safeFormatBytes(quota)} · ${safeFormatBytes(available)} available`
        : 'Browser storage estimate is unavailable in this environment.';

      root.replaceChildren();
      [
        ['Storage status', statusText],
        ['Estimated usage', hasQuota ? safeFormatBytes(usage) : 'Unavailable'],
        ['Estimated quota', hasQuota ? safeFormatBytes(quota) : 'Unavailable'],
        ['Available space', hasQuota ? safeFormatBytes(available) : 'Unavailable'],
        ['localStorage footprint', safeFormatBytes(localBytes)],
        ['Last save issue', issue ? (issue.error?.quota ? 'Quota error' : issue.kind || 'Storage warning') : 'None recorded'],
      ].forEach(([label, value]) => {
        const row = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = label;
        dd.textContent = value;
        row.append(dt, dd);
        root.appendChild(row);
      });
    };

    update();
    return { update, timer: setInterval(update, 30_000) };
  }
}
