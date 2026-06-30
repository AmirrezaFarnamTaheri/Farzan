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

  setView(`
    <section class="view view-settings">
      <div class="page-header">
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">Personalization and data tools.</p>
      </div>

      <div class="card card-filled">
        <div class="card-body">
          <div class="dashboard-grid" style="margin-bottom:12px">
            <div class="card card-gradient col-12 col-lg-6">
              <div class="card-body">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
                  <div>
                    <div style="font-weight:800">UI font size</div>
                    <div class="text-sm" style="opacity:.7">Affects the whole app (Ctrl + / Ctrl - / Ctrl 0)</div>
                  </div>
                  <div style="display:flex;align-items:center;gap:8px">
                    <button class="btn btn-ghost btn-sm" id="btn-font-dec" aria-label="Decrease font size">A-</button>
                    <span class="badge" id="font-scale-label">100%</span>
                    <button class="btn btn-ghost btn-sm" id="btn-font-inc" aria-label="Increase font size">A+</button>
                    <button class="btn btn-ghost btn-sm" id="btn-font-reset" aria-label="Reset font size">Reset</button>
                  </div>
                </div>
              </div>
            </div>

            <div class="card card-gradient col-12 col-lg-6">
              <div class="card-body">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
                  <div>
                    <div style="font-weight:800">Density</div>
                    <div class="text-sm" style="opacity:.7">Compact / Comfortable / Spacious</div>
                  </div>
                  <select class="select input-sm" id="select-density" aria-label="UI density">
                    <option value="compact">Compact</option>
                    <option value="comfortable">Comfortable</option>
                    <option value="spacious">Spacious</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
            <button class="btn btn-ghost" id="btn-theme-toggle">Toggle theme</button>
            <button class="btn btn-primary" id="btn-export-json-2">Export backup JSON</button>
            <button class="btn btn-ghost" id="btn-import-json-2">Import backup JSON</button>
          </div>
          <p style="margin-top:10px;opacity:.75">
            Data is stored locally (IndexedDB). Use export/import to move it between devices.
          </p>
        </div>
      </div>

      <div class="card card-filled">
        <div class="card-body">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div>
              <h2 class="h3">AI options</h2>
              <p class="text-sm" style="opacity:.75">Hide AI, use local mode, or connect your own API.</p>
            </div>
            <span class="badge badge-info" data-ai-status>Loading</span>
          </div>
          <div class="dashboard-grid" style="margin-top:12px">
            <label class="col-12 col-lg-4" style="display:grid;gap:6px">
              <span class="text-sm">AI mode</span>
              <select class="select input-sm" data-ai-mode>
                <option value="hidden">Hidden</option>
                <option value="disabled">Visible but off</option>
                <option value="local-gemma">Local Gemma</option>
                <option value="custom-api">Own API endpoint</option>
              </select>
            </label>
            <label class="col-12 col-lg-4" style="display:grid;gap:6px">
              <span class="text-sm">Model</span>
              <input class="input input-sm" data-ai-model placeholder="Model name or local model id" />
            </label>
            <label class="col-12 col-lg-4" style="display:grid;gap:6px">
              <span class="text-sm">API key storage</span>
              <select class="select input-sm" data-ai-key-storage>
                <option value="session">Session</option>
                <option value="local">Local device</option>
              </select>
            </label>
            <label class="col-12 col-lg-6" style="display:grid;gap:6px">
              <span class="text-sm">API endpoint</span>
              <input class="input input-sm" data-ai-endpoint placeholder="https://api.example.com/v1/chat/completions" />
            </label>
            <label class="col-12 col-lg-6" style="display:grid;gap:6px">
              <span class="text-sm">API key</span>
              <input class="input input-sm" data-ai-key type="password" autocomplete="off" placeholder="Stored only if you choose local storage" />
            </label>
            <label class="col-12 col-lg-6" style="display:grid;gap:6px">
              <span class="text-sm">Local package</span>
              <select class="select input-sm" data-ai-local-package>
                <option value="gemma-4-local">Gemma 4</option>
                <option value="gemma-3n-local">Gemma 3n</option>
              </select>
            </label>
            <label class="col-12 col-lg-6" style="display:grid;gap:6px">
              <span class="text-sm">Model source</span>
              <input class="input input-sm" data-ai-local-source placeholder="https://ai.google.dev/gemma" />
            </label>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px">
            <input type="file" data-ai-local-file hidden />
            <button class="btn btn-primary" type="button" data-ai-save>Save AI Options</button>
            <button class="btn btn-ghost" type="button" data-ai-open-local-source>Open model page</button>
            <button class="btn btn-ghost" type="button" data-ai-import-local-file>Import model file</button>
            <button class="btn btn-ghost" type="button" data-ai-download-local-file>Download to cache</button>
            <button class="btn btn-ghost" type="button" data-ai-mark-local-installed>Mark installed</button>
            <button class="btn btn-ghost" type="button" data-ai-clear-local-model>Clear model</button>
            <button class="btn btn-ghost" type="button" data-ai-clear-key>Clear API Key</button>
          </div>
          <dl class="help-facts" data-ai-summary style="margin-top:12px">
            <div><dt>Status</dt><dd>Loading...</dd></div>
          </dl>
        </div>
      </div>

      <div class="card card-filled">
        <div class="card-body">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div>
              <h2 class="h3">Storage health</h2>
              <p class="text-sm" style="opacity:.75">Current browser quota, local fallback footprint, and last save issue.</p>
            </div>
            <span class="badge badge-info" data-storage-status>Checking</span>
          </div>
          <div role="progressbar" aria-label="Storage usage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" style="height:10px;border-radius:999px;background:rgba(255,255,255,.12);overflow:hidden;margin:14px 0 8px">
            <div id="storage-bar" data-storage-bar style="height:100%;width:0%;background:var(--accent);transition:width .2s ease"></div>
          </div>
          <p id="storage-label" data-storage-summary class="text-sm" style="opacity:.75">Calculating storage usage...</p>
          <dl class="help-facts" data-storage-health>
            <div><dt>Status</dt><dd>Loading...</dd></div>
          </dl>
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px">
            <select class="select input-sm" id="select-clear-scope" aria-label="Data to wipe">
              <option value="progress">Progress only</option>
              <option value="notes">Notes and folders</option>
              <option value="media">Timestamps and PDF annotations</option>
              <option value="playlists">Saved playlists</option>
              <option value="studio">Studio boards</option>
              <option value="preferences">Preferences only</option>
              <option value="all">Everything local</option>
            </select>
            <button class="btn btn-danger" id="btn-clear-scope">Wipe selected data</button>
          </div>
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
  on(themeBtn, 'click', () => ThemeManager.toggle?.());

  const updateFontLabel = () => {
    const el = document.getElementById('font-scale-label');
    if (!el) return;
    el.textContent = `${Math.round(FontScale.get() * 100)}%`;
  };
  updateFontLabel();
  on(document.getElementById('btn-font-inc'), 'click', () => { FontScale.inc(); updateFontLabel(); });
  on(document.getElementById('btn-font-dec'), 'click', () => { FontScale.dec(); updateFontLabel(); });
  on(document.getElementById('btn-font-reset'), 'click', () => { FontScale.reset(); updateFontLabel(); });
  window.OpenCourseDeck?.bus?.on?.('fontScale:change', updateFontLabel);

  const densitySel = document.getElementById('select-density');
  if (densitySel) {
    densitySel.value = document.documentElement.getAttribute('data-density') || Prefs.get(Prefs.KEYS.density, 'comfortable') || 'comfortable';
    on(densitySel, 'change', () => {
      const v = densitySel.value;
      document.documentElement.setAttribute('data-density', v);
      Prefs.set(Prefs.KEYS.density, v);
      window.OpenCourseDeck?.bus?.emit?.('density:change', { density: v });
    });
  }

  const wipeBtn = document.getElementById('btn-clear-scope');
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
  on(wipeBtn, 'click', async () => {
    const scope = wipeScope?.value || 'all';
    const label = scopeLabels[scope] || scopeLabels.all;
    const ok = await window.OpenCourseDeck?.UI?.confirm?.(`This will delete ${label}. Continue?`);
    if (!ok) return;
    try {
      if (window.DB?.clearUserData) await window.DB.clearUserData(scope);
      else if (scope === 'all') await window.DB?.clearAll?.();
      if (scope === 'all' || scope === 'media') {
        sessionStorage.removeItem('plasma_pending_topic');
        sessionStorage.removeItem('plasma_pending_position');
        sessionStorage.removeItem('plasma_pending_course_session');
      }
      Toast.success(`Cleared ${label}`);
      storageController?.update?.();
    } catch {
      Toast.error('Clear failed');
    }
  });

  on(document.getElementById('btn-export-json-2'), 'click', () => {
    try { window.ProgressStats?.exportJSON?.(); } catch { Toast.error('Export failed'); }
  });
  on(document.getElementById('btn-import-json-2'), 'click', () => {
    try { window.ProgressStats?.importJSON?.(); } catch { Toast.error('Import failed'); }
  });
  renderAISettings();
  const storageController = renderStorageHealth();
  return {
    unmount() {
      routeListeners.forEach(({ target, type, handler, options }) => {
        try { target.removeEventListener(type, handler, options); } catch {}
      });
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
    const localPackage = document.querySelector('[data-ai-local-package]');
    const localSource = document.querySelector('[data-ai-local-source]');
    const localFileInput = document.querySelector('[data-ai-local-file]');
    const status = document.querySelector('[data-ai-status]');
    const summary = document.querySelector('[data-ai-summary]');
    if (!mode || !model || !endpoint || !apiKey || !keyStorage || !localPackage || !localSource || !localFileInput || !status || !summary) return null;

    const keyName = 'plasma-ai-api-key-session';
    const gemmaOptions = window.OpenCourseDeck?.AI?.gemmaModelOptions || [
      { id: 'gemma-4-local', label: 'Gemma 4', url: 'https://ai.google.dev/gemma' },
      { id: 'gemma-3n-local', label: 'Gemma 3n', url: 'https://ai.google.dev/gemma' },
    ];
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
      localModelStatus: 'not-installed',
      localModelSource: gemmaOptions[0]?.url || 'https://ai.google.dev/gemma',
      localModelFile: null,
    };
    const selectedModelOption = () => gemmaOptions.find(option => option.id === localPackage.value) || gemmaOptions[0];
    const setStatus = () => {
      const labels = {
        hidden: 'Hidden',
        disabled: 'Off',
        'local-gemma': 'Local model',
        'custom-api': 'Own API',
      };
      status.textContent = labels[current.mode] || 'Hidden';
      status.className = `badge ${current.mode === 'hidden' || current.mode === 'disabled' ? 'badge-info' : 'badge-success'}`;
      summary.replaceChildren();
      [
        ['Mode', labels[current.mode] || 'Hidden'],
        ['Model', current.model || 'Not selected'],
        ['Local package', selectedModelOption()?.label || current.model || 'Not selected'],
        ['Local files', current.localModelFile?.name || (current.localModelStatus === 'installed' ? 'Marked installed' : 'Not installed')],
        ['Local file size', current.localModelFile?.size ? formatBytes(current.localModelFile.size) : 'None'],
        ['Model source', current.localModelSource || 'Not configured'],
        ['Endpoint', current.endpoint || 'Not configured'],
        ['API key', current.hasKey ? `${current.keyStorage === 'local' ? 'Stored locally' : 'Stored for this session'}` : 'Not stored'],
        ['Visibility', current.mode === 'hidden' ? 'AI controls stay hidden outside Settings' : 'AI controls may be shown when a feature uses them'],
      ].forEach(([label, value]) => {
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
      Object.assign(current, next);
      mode.value = current.mode;
      model.value = current.model;
      if ([...localPackage.options].some(option => option.value === current.model)) localPackage.value = current.model;
      localSource.value = current.localModelSource;
      endpoint.value = current.endpoint;
      keyStorage.value = current.keyStorage;
      apiKey.value = '';
      window.OpenCourseDeck.AISettings = { ...current };
      setStatus();
    };

    Promise.resolve(window.DB?.getSetting?.('plasma-ai-settings')).then((saved) => {
      const sessionKey = sessionStorage.getItem(keyName);
      apply({
        mode: saved?.mode || 'hidden',
        model: saved?.model || 'gemma-local',
        endpoint: saved?.endpoint || '',
        keyStorage: saved?.keyStorage || 'session',
        hasKey: Boolean(sessionKey || saved?.apiKey),
        localModelStatus: ['installed', 'imported'].includes(saved?.localModelStatus) ? saved.localModelStatus : 'not-installed',
        localModelSource: saved?.localModelSource || gemmaOptions[0]?.url || 'https://ai.google.dev/gemma',
        localModelFile: saved?.localModelFile && typeof saved.localModelFile === 'object' ? saved.localModelFile : null,
      });
    }).catch(() => apply());

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
        keyStorage: keyStorage.value,
        hasKey: Boolean(rawKey || (keyStorage.value === 'session' ? sessionStorage.getItem(keyName) : current.hasKey)),
        localModelStatus: current.localModelStatus,
        localModelSource: localSource.value.trim() || selectedModelOption()?.url || 'https://ai.google.dev/gemma',
        localModelFile: current.localModelFile,
      };
      if (next.mode === 'hidden' || next.mode === 'disabled') {
        next.hasKey = false;
        sessionStorage.removeItem(keyName);
      } else if (rawKey && next.keyStorage === 'session') {
        sessionStorage.setItem(keyName, rawKey);
      }
      const stored = { ...next };
      if (rawKey && next.keyStorage === 'local' && next.mode !== 'hidden' && next.mode !== 'disabled') {
        stored.apiKey = rawKey;
        stored.hasKey = true;
      }
      if (next.keyStorage === 'session') delete stored.apiKey;
      await Promise.resolve(window.DB?.saveSetting?.('plasma-ai-settings', stored));
      apply(stored);
      Toast.success('AI options saved');
    });

    on(document.querySelector('[data-ai-open-local-source]'), 'click', () => {
      const url = localSource.value.trim() || selectedModelOption()?.url;
      if (!/^https?:\/\//i.test(url)) {
        Toast.error('Local model source must be an HTTP or HTTPS URL');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    });

    on(document.querySelector('[data-ai-import-local-file]'), 'click', () => {
      localFileInput.click();
    });

    on(localFileInput, 'change', async () => {
      const file = localFileInput.files?.[0];
      if (!file) return;
      const imported = await window.OpenCourseDeck?.AI?.importLocalModelFile?.(file);
      const stored = {
        ...current,
        mode: mode.value,
        model: model.value.trim() || selectedModelOption()?.id || current.model,
        endpoint: endpoint.value.trim(),
        keyStorage: keyStorage.value,
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
      localFileInput.value = '';
      apply(stored);
      Toast.success('Local model file registered');
    });

    on(document.querySelector('[data-ai-download-local-file]'), 'click', async (event) => {
      const button = event.currentTarget;
      const url = localSource.value.trim() || selectedModelOption()?.url;
      if (!/^https?:\/\//i.test(url)) {
        Toast.error('Model source must be an HTTP or HTTPS URL');
        return;
      }
      const previous = button.textContent;
      button.disabled = true;
      button.textContent = 'Downloading...';
      try {
        const downloaded = await window.OpenCourseDeck?.AI?.downloadLocalModel?.(url, {
          onProgress(progress) {
            if (progress.percent) button.textContent = `Downloading ${progress.percent}%`;
          },
        });
        const stored = {
          ...current,
          mode: mode.value,
          model: model.value.trim() || selectedModelOption()?.id || current.model,
          endpoint: endpoint.value.trim(),
          keyStorage: keyStorage.value,
          localModelStatus: 'imported',
          localModelSource: url,
          localModelFile: downloaded,
        };
        await Promise.resolve(window.DB?.saveSetting?.('plasma-ai-settings', stored));
        apply(stored);
        Toast.success('Local model downloaded');
      } catch {
        Toast.error('Local model download failed');
      } finally {
        button.disabled = false;
        button.textContent = previous;
      }
    });

    on(document.querySelector('[data-ai-mark-local-installed]'), 'click', async () => {
      const stored = {
        ...current,
        mode: mode.value,
        model: model.value.trim() || selectedModelOption()?.id || current.model,
        endpoint: endpoint.value.trim(),
        keyStorage: keyStorage.value,
        localModelStatus: 'installed',
        localModelSource: localSource.value.trim() || selectedModelOption()?.url || current.localModelSource,
        localModelFile: current.localModelFile,
      };
      await Promise.resolve(window.DB?.saveSetting?.('plasma-ai-settings', stored));
      apply(stored);
      Toast.success('Local model marked installed');
    });

    on(document.querySelector('[data-ai-clear-local-model]'), 'click', async () => {
      await window.OpenCourseDeck?.AI?.clearLocalModelFile?.();
      const stored = { ...current, localModelStatus: 'not-installed', localModelFile: null };
      await Promise.resolve(window.DB?.saveSetting?.('plasma-ai-settings', stored));
      apply(stored);
      Toast.info('Local model marker cleared');
    });

    on(document.querySelector('[data-ai-clear-key]'), 'click', async () => {
      sessionStorage.removeItem(keyName);
      const stored = { ...current, apiKey: undefined, hasKey: false };
      await Promise.resolve(window.DB?.saveSetting?.('plasma-ai-settings', stored));
      apply(stored);
      Toast.info('AI key cleared');
    });
    return { apply };
  }

  function renderStorageHealth() {
    const root = document.querySelector('[data-storage-health]');
    const bar = document.querySelector('[data-storage-bar]');
    const summary = document.querySelector('[data-storage-summary]');
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
      const pct = hasQuota ? Math.min(100, Math.round((usage / quota) * 100)) : 0;
      const available = hasQuota ? Math.max(0, quota - usage) : null;
      const localBytes = localStorageFootprint();
      const issue = window.OpenCourseDeck?.lastStorageIssue;
      const statusText = !hasQuota ? 'Unavailable' : pct >= 90 || issue?.error?.quota ? 'Critical' : pct >= 75 ? 'Watch' : 'Healthy';

      status.textContent = statusText;
      status.className = `badge ${statusText === 'Critical' ? 'badge-danger' : statusText === 'Healthy' ? 'badge-success' : 'badge-info'}`;
      bar.style.width = `${pct}%`;
      const progress = bar.closest('[role="progressbar"]');
      progress?.setAttribute?.('aria-valuenow', String(pct));
      summary.textContent = hasQuota
        ? `${formatBytes(usage)} used of ${formatBytes(quota)} (${pct}%), ${formatBytes(available)} available`
        : 'Browser storage estimate is unavailable in this environment.';

      root.replaceChildren();
      [
        ['Storage status', statusText],
        ['Estimated usage', hasQuota ? formatBytes(usage) : 'Unavailable'],
        ['Estimated quota', hasQuota ? formatBytes(quota) : 'Unavailable'],
        ['Available space', hasQuota ? formatBytes(available) : 'Unavailable'],
        ['localStorage footprint', formatBytes(localBytes)],
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
