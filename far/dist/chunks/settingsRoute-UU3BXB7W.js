// src/views/settingsRoute.js
function mountSettingsView(deps = {}) {
  const {
    setView,
    ThemeManager,
    FontScale,
    Prefs,
    Toast = window.PlasmaDeck?.Toast,
    formatBytes,
    localStorageFootprint
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
  const themeBtn = document.getElementById("btn-theme-toggle");
  on(themeBtn, "click", () => ThemeManager.toggle?.());
  const updateFontLabel = () => {
    const el = document.getElementById("font-scale-label");
    if (!el) return;
    el.textContent = `${Math.round(FontScale.get() * 100)}%`;
  };
  updateFontLabel();
  on(document.getElementById("btn-font-inc"), "click", () => {
    FontScale.inc();
    updateFontLabel();
  });
  on(document.getElementById("btn-font-dec"), "click", () => {
    FontScale.dec();
    updateFontLabel();
  });
  on(document.getElementById("btn-font-reset"), "click", () => {
    FontScale.reset();
    updateFontLabel();
  });
  window.PlasmaDeck?.bus?.on?.("fontScale:change", updateFontLabel);
  const densitySel = document.getElementById("select-density");
  if (densitySel) {
    densitySel.value = document.documentElement.getAttribute("data-density") || Prefs.get(Prefs.KEYS.density, "comfortable") || "comfortable";
    on(densitySel, "change", () => {
      const v = densitySel.value;
      document.documentElement.setAttribute("data-density", v);
      Prefs.set(Prefs.KEYS.density, v);
      window.PlasmaDeck?.bus?.emit?.("density:change", { density: v });
    });
  }
  const wipeBtn = document.getElementById("btn-clear-scope");
  const wipeScope = document.getElementById("select-clear-scope");
  const scopeLabels = {
    progress: "progress records",
    notes: "notes, folders, and note settings",
    media: "timestamps and PDF annotations",
    playlists: "saved playlists",
    studio: "Studio boards",
    preferences: "preferences",
    all: "all local PlasmaDeck data"
  };
  on(wipeBtn, "click", async () => {
    const scope = wipeScope?.value || "all";
    const label = scopeLabels[scope] || scopeLabels.all;
    const ok = await window.PlasmaDeck?.UI?.confirm?.(`This will delete ${label}. Continue?`);
    if (!ok) return;
    try {
      if (window.DB?.clearUserData) await window.DB.clearUserData(scope);
      else if (scope === "all") await window.DB?.clearAll?.();
      if (scope === "all" || scope === "media") {
        sessionStorage.removeItem("plasma_pending_topic");
        sessionStorage.removeItem("plasma_pending_position");
        sessionStorage.removeItem("plasma_pending_course_session");
      }
      Toast.success(`Cleared ${label}`);
      storageController?.update?.();
    } catch {
      Toast.error("Clear failed");
    }
  });
  on(document.getElementById("btn-export-json-2"), "click", () => {
    try {
      window.ProgressStats?.exportJSON?.();
    } catch {
      Toast.error("Export failed");
    }
  });
  on(document.getElementById("btn-import-json-2"), "click", () => {
    try {
      window.ProgressStats?.importJSON?.();
    } catch {
      Toast.error("Import failed");
    }
  });
  renderAISettings();
  const storageController = renderStorageHealth();
  return {
    unmount() {
      routeListeners.forEach(({ target, type, handler, options }) => {
        try {
          target.removeEventListener(type, handler, options);
        } catch {
        }
      });
      if (storageController?.timer) clearInterval(storageController.timer);
      window.PlasmaDeck?.bus?.off?.("fontScale:change", updateFontLabel);
    }
  };
  function renderAISettings() {
    const mode = document.querySelector("[data-ai-mode]");
    const model = document.querySelector("[data-ai-model]");
    const endpoint = document.querySelector("[data-ai-endpoint]");
    const apiKey = document.querySelector("[data-ai-key]");
    const keyStorage = document.querySelector("[data-ai-key-storage]");
    const localPackage = document.querySelector("[data-ai-local-package]");
    const localSource = document.querySelector("[data-ai-local-source]");
    const localFileInput = document.querySelector("[data-ai-local-file]");
    const status = document.querySelector("[data-ai-status]");
    const summary = document.querySelector("[data-ai-summary]");
    if (!mode || !model || !endpoint || !apiKey || !keyStorage || !localPackage || !localSource || !localFileInput || !status || !summary) return null;
    const keyName = "plasma-ai-api-key-session";
    const gemmaOptions = window.PlasmaDeck?.AI?.gemmaModelOptions || [
      { id: "gemma-4-local", label: "Gemma 4", url: "https://ai.google.dev/gemma" },
      { id: "gemma-3n-local", label: "Gemma 3n", url: "https://ai.google.dev/gemma" }
    ];
    localPackage.replaceChildren(...gemmaOptions.map((option) => {
      const item = document.createElement("option");
      item.value = option.id;
      item.textContent = option.label;
      return item;
    }));
    const current = {
      mode: "hidden",
      model: "gemma-4-local",
      endpoint: "",
      keyStorage: "session",
      hasKey: false,
      localModelStatus: "not-installed",
      localModelSource: gemmaOptions[0]?.url || "https://ai.google.dev/gemma",
      localModelFile: null
    };
    const selectedModelOption = () => gemmaOptions.find((option) => option.id === localPackage.value) || gemmaOptions[0];
    const setStatus = () => {
      const labels = {
        hidden: "Hidden",
        disabled: "Off",
        "local-gemma": "Local model",
        "custom-api": "Own API"
      };
      status.textContent = labels[current.mode] || "Hidden";
      status.className = `badge ${current.mode === "hidden" || current.mode === "disabled" ? "badge-info" : "badge-success"}`;
      summary.replaceChildren();
      [
        ["Mode", labels[current.mode] || "Hidden"],
        ["Model", current.model || "Not selected"],
        ["Local package", selectedModelOption()?.label || current.model || "Not selected"],
        ["Local files", current.localModelFile?.name || (current.localModelStatus === "installed" ? "Marked installed" : "Not installed")],
        ["Local file size", current.localModelFile?.size ? formatBytes(current.localModelFile.size) : "None"],
        ["Model source", current.localModelSource || "Not configured"],
        ["Endpoint", current.endpoint || "Not configured"],
        ["API key", current.hasKey ? `${current.keyStorage === "local" ? "Stored locally" : "Stored for this session"}` : "Not stored"],
        ["Visibility", current.mode === "hidden" ? "AI controls stay hidden outside Settings" : "AI controls may be shown when a feature uses them"]
      ].forEach(([label, value]) => {
        const row = document.createElement("div");
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
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
      if ([...localPackage.options].some((option) => option.value === current.model)) localPackage.value = current.model;
      localSource.value = current.localModelSource;
      endpoint.value = current.endpoint;
      keyStorage.value = current.keyStorage;
      apiKey.value = "";
      window.PlasmaDeck.AISettings = { ...current };
      setStatus();
    };
    Promise.resolve(window.DB?.getSetting?.("plasma-ai-settings")).then((saved) => {
      const sessionKey = sessionStorage.getItem(keyName);
      apply({
        mode: saved?.mode || "hidden",
        model: saved?.model || "gemma-local",
        endpoint: saved?.endpoint || "",
        keyStorage: saved?.keyStorage || "session",
        hasKey: Boolean(sessionKey || saved?.apiKey),
        localModelStatus: ["installed", "imported"].includes(saved?.localModelStatus) ? saved.localModelStatus : "not-installed",
        localModelSource: saved?.localModelSource || gemmaOptions[0]?.url || "https://ai.google.dev/gemma",
        localModelFile: saved?.localModelFile && typeof saved.localModelFile === "object" ? saved.localModelFile : null
      });
    }).catch(() => apply());
    on(localPackage, "change", () => {
      const option = selectedModelOption();
      model.value = option?.id || localPackage.value;
      if (option?.url && (!localSource.value || localSource.value === current.localModelSource)) localSource.value = option.url;
    });
    on(document.querySelector("[data-ai-save]"), "click", async () => {
      const rawKey = apiKey.value.trim();
      const next = {
        mode: mode.value,
        model: model.value.trim() || "gemma-local",
        endpoint: endpoint.value.trim(),
        keyStorage: keyStorage.value,
        hasKey: Boolean(rawKey || (keyStorage.value === "session" ? sessionStorage.getItem(keyName) : current.hasKey)),
        localModelStatus: current.localModelStatus,
        localModelSource: localSource.value.trim() || selectedModelOption()?.url || "https://ai.google.dev/gemma",
        localModelFile: current.localModelFile
      };
      if (next.mode === "hidden" || next.mode === "disabled") {
        next.hasKey = false;
        sessionStorage.removeItem(keyName);
      } else if (rawKey && next.keyStorage === "session") {
        sessionStorage.setItem(keyName, rawKey);
      }
      const stored = { ...next };
      if (rawKey && next.keyStorage === "local" && next.mode !== "hidden" && next.mode !== "disabled") {
        stored.apiKey = rawKey;
        stored.hasKey = true;
      }
      if (next.keyStorage === "session") delete stored.apiKey;
      await Promise.resolve(window.DB?.saveSetting?.("plasma-ai-settings", stored));
      apply(stored);
      Toast.success("AI options saved");
    });
    on(document.querySelector("[data-ai-open-local-source]"), "click", () => {
      const url = localSource.value.trim() || selectedModelOption()?.url;
      if (!/^https?:\/\//i.test(url)) {
        Toast.error("Local model source must be an HTTP or HTTPS URL");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    });
    on(document.querySelector("[data-ai-import-local-file]"), "click", () => {
      localFileInput.click();
    });
    on(localFileInput, "change", async () => {
      const file = localFileInput.files?.[0];
      if (!file) return;
      const imported = await window.PlasmaDeck?.AI?.importLocalModelFile?.(file);
      const stored = {
        ...current,
        mode: mode.value,
        model: model.value.trim() || selectedModelOption()?.id || current.model,
        endpoint: endpoint.value.trim(),
        keyStorage: keyStorage.value,
        localModelStatus: "imported",
        localModelSource: localSource.value.trim() || selectedModelOption()?.url || current.localModelSource,
        localModelFile: {
          name: imported?.name || file.name,
          size: imported?.size ?? file.size,
          type: imported?.type || file.type || "application/octet-stream",
          lastModified: imported?.lastModified ?? file.lastModified ?? 0,
          importedAt: imported?.importedAt || Date.now()
        }
      };
      await Promise.resolve(window.DB?.saveSetting?.("plasma-ai-settings", stored));
      localFileInput.value = "";
      apply(stored);
      Toast.success("Local model file registered");
    });
    on(document.querySelector("[data-ai-download-local-file]"), "click", async (event) => {
      const button = event.currentTarget;
      const url = localSource.value.trim() || selectedModelOption()?.url;
      if (!/^https?:\/\//i.test(url)) {
        Toast.error("Model source must be an HTTP or HTTPS URL");
        return;
      }
      const previous = button.textContent;
      button.disabled = true;
      button.textContent = "Downloading...";
      try {
        const downloaded = await window.PlasmaDeck?.AI?.downloadLocalModel?.(url, {
          onProgress(progress) {
            if (progress.percent) button.textContent = `Downloading ${progress.percent}%`;
          }
        });
        const stored = {
          ...current,
          mode: mode.value,
          model: model.value.trim() || selectedModelOption()?.id || current.model,
          endpoint: endpoint.value.trim(),
          keyStorage: keyStorage.value,
          localModelStatus: "imported",
          localModelSource: url,
          localModelFile: downloaded
        };
        await Promise.resolve(window.DB?.saveSetting?.("plasma-ai-settings", stored));
        apply(stored);
        Toast.success("Local model downloaded");
      } catch {
        Toast.error("Local model download failed");
      } finally {
        button.disabled = false;
        button.textContent = previous;
      }
    });
    on(document.querySelector("[data-ai-mark-local-installed]"), "click", async () => {
      const stored = {
        ...current,
        mode: mode.value,
        model: model.value.trim() || selectedModelOption()?.id || current.model,
        endpoint: endpoint.value.trim(),
        keyStorage: keyStorage.value,
        localModelStatus: "installed",
        localModelSource: localSource.value.trim() || selectedModelOption()?.url || current.localModelSource,
        localModelFile: current.localModelFile
      };
      await Promise.resolve(window.DB?.saveSetting?.("plasma-ai-settings", stored));
      apply(stored);
      Toast.success("Local model marked installed");
    });
    on(document.querySelector("[data-ai-clear-local-model]"), "click", async () => {
      await window.PlasmaDeck?.AI?.clearLocalModelFile?.();
      const stored = { ...current, localModelStatus: "not-installed", localModelFile: null };
      await Promise.resolve(window.DB?.saveSetting?.("plasma-ai-settings", stored));
      apply(stored);
      Toast.info("Local model marker cleared");
    });
    on(document.querySelector("[data-ai-clear-key]"), "click", async () => {
      sessionStorage.removeItem(keyName);
      const stored = { ...current, apiKey: void 0, hasKey: false };
      await Promise.resolve(window.DB?.saveSetting?.("plasma-ai-settings", stored));
      apply(stored);
      Toast.info("AI key cleared");
    });
    return { apply };
  }
  function renderStorageHealth() {
    const root = document.querySelector("[data-storage-health]");
    const bar = document.querySelector("[data-storage-bar]");
    const summary = document.querySelector("[data-storage-summary]");
    const status = document.querySelector("[data-storage-status]");
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
      const pct = hasQuota ? Math.min(100, Math.round(usage / quota * 100)) : 0;
      const available = hasQuota ? Math.max(0, quota - usage) : null;
      const localBytes = localStorageFootprint();
      const issue = window.PlasmaDeck?.lastStorageIssue;
      const statusText = !hasQuota ? "Unavailable" : pct >= 90 || issue?.error?.quota ? "Critical" : pct >= 75 ? "Watch" : "Healthy";
      status.textContent = statusText;
      status.className = `badge ${statusText === "Critical" ? "badge-danger" : statusText === "Healthy" ? "badge-success" : "badge-info"}`;
      bar.style.width = `${pct}%`;
      const progress = bar.closest('[role="progressbar"]');
      progress?.setAttribute?.("aria-valuenow", String(pct));
      summary.textContent = hasQuota ? `${formatBytes(usage)} used of ${formatBytes(quota)} (${pct}%), ${formatBytes(available)} available` : "Browser storage estimate is unavailable in this environment.";
      root.replaceChildren();
      [
        ["Storage status", statusText],
        ["Estimated usage", hasQuota ? formatBytes(usage) : "Unavailable"],
        ["Estimated quota", hasQuota ? formatBytes(quota) : "Unavailable"],
        ["Available space", hasQuota ? formatBytes(available) : "Unavailable"],
        ["localStorage footprint", formatBytes(localBytes)],
        ["Last save issue", issue ? issue.error?.quota ? "Quota error" : issue.kind || "Storage warning" : "None recorded"]
      ].forEach(([label, value]) => {
        const row = document.createElement("div");
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.textContent = label;
        dd.textContent = value;
        row.append(dt, dd);
        root.appendChild(row);
      });
    };
    update();
    return { update, timer: setInterval(update, 3e4) };
  }
}
export {
  mountSettingsView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3ZpZXdzL3NldHRpbmdzUm91dGUuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImV4cG9ydCBmdW5jdGlvbiBtb3VudFNldHRpbmdzVmlldyhkZXBzID0ge30pIHtcbiAgY29uc3Qge1xuICAgIHNldFZpZXcsXG4gICAgVGhlbWVNYW5hZ2VyLFxuICAgIEZvbnRTY2FsZSxcbiAgICBQcmVmcyxcbiAgICBUb2FzdCA9IHdpbmRvdy5QbGFzbWFEZWNrPy5Ub2FzdCxcbiAgICBmb3JtYXRCeXRlcyxcbiAgICBsb2NhbFN0b3JhZ2VGb290cHJpbnQsXG4gIH0gPSBkZXBzO1xuXG4gIHNldFZpZXcoYFxuICAgIDxzZWN0aW9uIGNsYXNzPVwidmlldyB2aWV3LXNldHRpbmdzXCI+XG4gICAgICA8ZGl2IGNsYXNzPVwicGFnZS1oZWFkZXJcIj5cbiAgICAgICAgPGgxIGNsYXNzPVwicGFnZS10aXRsZVwiPlNldHRpbmdzPC9oMT5cbiAgICAgICAgPHAgY2xhc3M9XCJwYWdlLXN1YnRpdGxlXCI+UGVyc29uYWxpemF0aW9uIGFuZCBkYXRhIHRvb2xzLjwvcD5cbiAgICAgIDwvZGl2PlxuXG4gICAgICA8ZGl2IGNsYXNzPVwiY2FyZCBjYXJkLWZpbGxlZFwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwiY2FyZC1ib2R5XCI+XG4gICAgICAgICAgPGRpdiBjbGFzcz1cImRhc2hib2FyZC1ncmlkXCIgc3R5bGU9XCJtYXJnaW4tYm90dG9tOjEycHhcIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkIGNhcmQtZ3JhZGllbnQgY29sLTEyIGNvbC1sZy02XCI+XG4gICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLWJvZHlcIj5cbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjtnYXA6MTJweDtmbGV4LXdyYXA6d3JhcFwiPlxuICAgICAgICAgICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImZvbnQtd2VpZ2h0OjgwMFwiPlVJIGZvbnQgc2l6ZTwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwidGV4dC1zbVwiIHN0eWxlPVwib3BhY2l0eTouN1wiPkFmZmVjdHMgdGhlIHdob2xlIGFwcCAoQ3RybCArIC8gQ3RybCAtIC8gQ3RybCAwKTwvZGl2PlxuICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OHB4XCI+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0IGJ0bi1zbVwiIGlkPVwiYnRuLWZvbnQtZGVjXCIgYXJpYS1sYWJlbD1cIkRlY3JlYXNlIGZvbnQgc2l6ZVwiPkEtPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiYmFkZ2VcIiBpZD1cImZvbnQtc2NhbGUtbGFiZWxcIj4xMDAlPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdCBidG4tc21cIiBpZD1cImJ0bi1mb250LWluY1wiIGFyaWEtbGFiZWw9XCJJbmNyZWFzZSBmb250IHNpemVcIj5BKzwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdCBidG4tc21cIiBpZD1cImJ0bi1mb250LXJlc2V0XCIgYXJpYS1sYWJlbD1cIlJlc2V0IGZvbnQgc2l6ZVwiPlJlc2V0PC9idXR0b24+XG4gICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQgY2FyZC1ncmFkaWVudCBjb2wtMTIgY29sLWxnLTZcIj5cbiAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQtYm9keVwiPlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO2dhcDoxMnB4O2ZsZXgtd3JhcDp3cmFwXCI+XG4gICAgICAgICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZm9udC13ZWlnaHQ6ODAwXCI+RGVuc2l0eTwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwidGV4dC1zbVwiIHN0eWxlPVwib3BhY2l0eTouN1wiPkNvbXBhY3QgLyBDb21mb3J0YWJsZSAvIFNwYWNpb3VzPC9kaXY+XG4gICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJzZWxlY3QgaW5wdXQtc21cIiBpZD1cInNlbGVjdC1kZW5zaXR5XCIgYXJpYS1sYWJlbD1cIlVJIGRlbnNpdHlcIj5cbiAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbXBhY3RcIj5Db21wYWN0PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb21mb3J0YWJsZVwiPkNvbWZvcnRhYmxlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzcGFjaW91c1wiPlNwYWNpb3VzPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjEwcHg7YWxpZ24taXRlbXM6Y2VudGVyXCI+XG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdFwiIGlkPVwiYnRuLXRoZW1lLXRvZ2dsZVwiPlRvZ2dsZSB0aGVtZTwvYnV0dG9uPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeVwiIGlkPVwiYnRuLWV4cG9ydC1qc29uLTJcIj5FeHBvcnQgYmFja3VwIEpTT048L2J1dHRvbj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0XCIgaWQ9XCJidG4taW1wb3J0LWpzb24tMlwiPkltcG9ydCBiYWNrdXAgSlNPTjwvYnV0dG9uPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDxwIHN0eWxlPVwibWFyZ2luLXRvcDoxMHB4O29wYWNpdHk6Ljc1XCI+XG4gICAgICAgICAgICBEYXRhIGlzIHN0b3JlZCBsb2NhbGx5IChJbmRleGVkREIpLiBVc2UgZXhwb3J0L2ltcG9ydCB0byBtb3ZlIGl0IGJldHdlZW4gZGV2aWNlcy5cbiAgICAgICAgICA8L3A+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG5cbiAgICAgIDxkaXYgY2xhc3M9XCJjYXJkIGNhcmQtZmlsbGVkXCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLWJvZHlcIj5cbiAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjtnYXA6MTJweDtmbGV4LXdyYXA6d3JhcFwiPlxuICAgICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgICAgPGgyIGNsYXNzPVwiaDNcIj5BSSBvcHRpb25zPC9oMj5cbiAgICAgICAgICAgICAgPHAgY2xhc3M9XCJ0ZXh0LXNtXCIgc3R5bGU9XCJvcGFjaXR5Oi43NVwiPkhpZGUgQUksIHVzZSBsb2NhbCBtb2RlLCBvciBjb25uZWN0IHlvdXIgb3duIEFQSS48L3A+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiYmFkZ2UgYmFkZ2UtaW5mb1wiIGRhdGEtYWktc3RhdHVzPkxvYWRpbmc8L3NwYW4+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPGRpdiBjbGFzcz1cImRhc2hib2FyZC1ncmlkXCIgc3R5bGU9XCJtYXJnaW4tdG9wOjEycHhcIj5cbiAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cImNvbC0xMiBjb2wtbGctNFwiIHN0eWxlPVwiZGlzcGxheTpncmlkO2dhcDo2cHhcIj5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJ0ZXh0LXNtXCI+QUkgbW9kZTwvc3Bhbj5cbiAgICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cInNlbGVjdCBpbnB1dC1zbVwiIGRhdGEtYWktbW9kZT5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiaGlkZGVuXCI+SGlkZGVuPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImRpc2FibGVkXCI+VmlzaWJsZSBidXQgb2ZmPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImxvY2FsLWdlbW1hXCI+TG9jYWwgR2VtbWE8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY3VzdG9tLWFwaVwiPk93biBBUEkgZW5kcG9pbnQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8L2xhYmVsPlxuICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwiY29sLTEyIGNvbC1sZy00XCIgc3R5bGU9XCJkaXNwbGF5OmdyaWQ7Z2FwOjZweFwiPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cInRleHQtc21cIj5Nb2RlbDwvc3Bhbj5cbiAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiaW5wdXQgaW5wdXQtc21cIiBkYXRhLWFpLW1vZGVsIHBsYWNlaG9sZGVyPVwiTW9kZWwgbmFtZSBvciBsb2NhbCBtb2RlbCBpZFwiIC8+XG4gICAgICAgICAgICA8L2xhYmVsPlxuICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwiY29sLTEyIGNvbC1sZy00XCIgc3R5bGU9XCJkaXNwbGF5OmdyaWQ7Z2FwOjZweFwiPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cInRleHQtc21cIj5BUEkga2V5IHN0b3JhZ2U8L3NwYW4+XG4gICAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJzZWxlY3QgaW5wdXQtc21cIiBkYXRhLWFpLWtleS1zdG9yYWdlPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzZXNzaW9uXCI+U2Vzc2lvbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJsb2NhbFwiPkxvY2FsIGRldmljZTwvb3B0aW9uPlxuICAgICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJjb2wtMTIgY29sLWxnLTZcIiBzdHlsZT1cImRpc3BsYXk6Z3JpZDtnYXA6NnB4XCI+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwidGV4dC1zbVwiPkFQSSBlbmRwb2ludDwvc3Bhbj5cbiAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiaW5wdXQgaW5wdXQtc21cIiBkYXRhLWFpLWVuZHBvaW50IHBsYWNlaG9sZGVyPVwiaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20vdjEvY2hhdC9jb21wbGV0aW9uc1wiIC8+XG4gICAgICAgICAgICA8L2xhYmVsPlxuICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwiY29sLTEyIGNvbC1sZy02XCIgc3R5bGU9XCJkaXNwbGF5OmdyaWQ7Z2FwOjZweFwiPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cInRleHQtc21cIj5BUEkga2V5PC9zcGFuPlxuICAgICAgICAgICAgICA8aW5wdXQgY2xhc3M9XCJpbnB1dCBpbnB1dC1zbVwiIGRhdGEtYWkta2V5IHR5cGU9XCJwYXNzd29yZFwiIGF1dG9jb21wbGV0ZT1cIm9mZlwiIHBsYWNlaG9sZGVyPVwiU3RvcmVkIG9ubHkgaWYgeW91IGNob29zZSBsb2NhbCBzdG9yYWdlXCIgLz5cbiAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJjb2wtMTIgY29sLWxnLTZcIiBzdHlsZT1cImRpc3BsYXk6Z3JpZDtnYXA6NnB4XCI+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwidGV4dC1zbVwiPkxvY2FsIHBhY2thZ2U8L3NwYW4+XG4gICAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJzZWxlY3QgaW5wdXQtc21cIiBkYXRhLWFpLWxvY2FsLXBhY2thZ2U+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImdlbW1hLTQtbG9jYWxcIj5HZW1tYSA0PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImdlbW1hLTNuLWxvY2FsXCI+R2VtbWEgM248L29wdGlvbj5cbiAgICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8L2xhYmVsPlxuICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwiY29sLTEyIGNvbC1sZy02XCIgc3R5bGU9XCJkaXNwbGF5OmdyaWQ7Z2FwOjZweFwiPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cInRleHQtc21cIj5Nb2RlbCBzb3VyY2U8L3NwYW4+XG4gICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImlucHV0IGlucHV0LXNtXCIgZGF0YS1haS1sb2NhbC1zb3VyY2UgcGxhY2Vob2xkZXI9XCJodHRwczovL2FpLmdvb2dsZS5kZXYvZ2VtbWFcIiAvPlxuICAgICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4O2ZsZXgtd3JhcDp3cmFwO2dhcDoxMHB4O2FsaWduLWl0ZW1zOmNlbnRlcjttYXJnaW4tdG9wOjEycHhcIj5cbiAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiZmlsZVwiIGRhdGEtYWktbG9jYWwtZmlsZSBoaWRkZW4gLz5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLXByaW1hcnlcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1haS1zYXZlPlNhdmUgQUkgT3B0aW9uczwvYnV0dG9uPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1haS1vcGVuLWxvY2FsLXNvdXJjZT5PcGVuIG1vZGVsIHBhZ2U8L2J1dHRvbj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0XCIgdHlwZT1cImJ1dHRvblwiIGRhdGEtYWktaW1wb3J0LWxvY2FsLWZpbGU+SW1wb3J0IG1vZGVsIGZpbGU8L2J1dHRvbj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0XCIgdHlwZT1cImJ1dHRvblwiIGRhdGEtYWktZG93bmxvYWQtbG9jYWwtZmlsZT5Eb3dubG9hZCB0byBjYWNoZTwvYnV0dG9uPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1haS1tYXJrLWxvY2FsLWluc3RhbGxlZD5NYXJrIGluc3RhbGxlZDwvYnV0dG9uPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1haS1jbGVhci1sb2NhbC1tb2RlbD5DbGVhciBtb2RlbDwvYnV0dG9uPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1haS1jbGVhci1rZXk+Q2xlYXIgQVBJIEtleTwvYnV0dG9uPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDxkbCBjbGFzcz1cImhlbHAtZmFjdHNcIiBkYXRhLWFpLXN1bW1hcnkgc3R5bGU9XCJtYXJnaW4tdG9wOjEycHhcIj5cbiAgICAgICAgICAgIDxkaXY+PGR0PlN0YXR1czwvZHQ+PGRkPkxvYWRpbmcuLi48L2RkPjwvZGl2PlxuICAgICAgICAgIDwvZGw+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG5cbiAgICAgIDxkaXYgY2xhc3M9XCJjYXJkIGNhcmQtZmlsbGVkXCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLWJvZHlcIj5cbiAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjtnYXA6MTJweDtmbGV4LXdyYXA6d3JhcFwiPlxuICAgICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgICAgPGgyIGNsYXNzPVwiaDNcIj5TdG9yYWdlIGhlYWx0aDwvaDI+XG4gICAgICAgICAgICAgIDxwIGNsYXNzPVwidGV4dC1zbVwiIHN0eWxlPVwib3BhY2l0eTouNzVcIj5DdXJyZW50IGJyb3dzZXIgcXVvdGEsIGxvY2FsIGZhbGxiYWNrIGZvb3RwcmludCwgYW5kIGxhc3Qgc2F2ZSBpc3N1ZS48L3A+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiYmFkZ2UgYmFkZ2UtaW5mb1wiIGRhdGEtc3RvcmFnZS1zdGF0dXM+Q2hlY2tpbmc8L3NwYW4+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPGRpdiByb2xlPVwicHJvZ3Jlc3NiYXJcIiBhcmlhLWxhYmVsPVwiU3RvcmFnZSB1c2FnZVwiIGFyaWEtdmFsdWVtaW49XCIwXCIgYXJpYS12YWx1ZW1heD1cIjEwMFwiIGFyaWEtdmFsdWVub3c9XCIwXCIgc3R5bGU9XCJoZWlnaHQ6MTBweDtib3JkZXItcmFkaXVzOjk5OXB4O2JhY2tncm91bmQ6cmdiYSgyNTUsMjU1LDI1NSwuMTIpO292ZXJmbG93OmhpZGRlbjttYXJnaW46MTRweCAwIDhweFwiPlxuICAgICAgICAgICAgPGRpdiBpZD1cInN0b3JhZ2UtYmFyXCIgZGF0YS1zdG9yYWdlLWJhciBzdHlsZT1cImhlaWdodDoxMDAlO3dpZHRoOjAlO2JhY2tncm91bmQ6dmFyKC0tYWNjZW50KTt0cmFuc2l0aW9uOndpZHRoIC4ycyBlYXNlXCI+PC9kaXY+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPHAgaWQ9XCJzdG9yYWdlLWxhYmVsXCIgZGF0YS1zdG9yYWdlLXN1bW1hcnkgY2xhc3M9XCJ0ZXh0LXNtXCIgc3R5bGU9XCJvcGFjaXR5Oi43NVwiPkNhbGN1bGF0aW5nIHN0b3JhZ2UgdXNhZ2UuLi48L3A+XG4gICAgICAgICAgPGRsIGNsYXNzPVwiaGVscC1mYWN0c1wiIGRhdGEtc3RvcmFnZS1oZWFsdGg+XG4gICAgICAgICAgICA8ZGl2PjxkdD5TdGF0dXM8L2R0PjxkZD5Mb2FkaW5nLi4uPC9kZD48L2Rpdj5cbiAgICAgICAgICA8L2RsPlxuICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjEwcHg7YWxpZ24taXRlbXM6Y2VudGVyO21hcmdpbi10b3A6MTJweFwiPlxuICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cInNlbGVjdCBpbnB1dC1zbVwiIGlkPVwic2VsZWN0LWNsZWFyLXNjb3BlXCIgYXJpYS1sYWJlbD1cIkRhdGEgdG8gd2lwZVwiPlxuICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicHJvZ3Jlc3NcIj5Qcm9ncmVzcyBvbmx5PC9vcHRpb24+XG4gICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJub3Rlc1wiPk5vdGVzIGFuZCBmb2xkZXJzPC9vcHRpb24+XG4gICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJtZWRpYVwiPlRpbWVzdGFtcHMgYW5kIFBERiBhbm5vdGF0aW9uczwvb3B0aW9uPlxuICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicGxheWxpc3RzXCI+U2F2ZWQgcGxheWxpc3RzPC9vcHRpb24+XG4gICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzdHVkaW9cIj5TdHVkaW8gYm9hcmRzPC9vcHRpb24+XG4gICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJwcmVmZXJlbmNlc1wiPlByZWZlcmVuY2VzIG9ubHk8L29wdGlvbj5cbiAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImFsbFwiPkV2ZXJ5dGhpbmcgbG9jYWw8L29wdGlvbj5cbiAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZGFuZ2VyXCIgaWQ9XCJidG4tY2xlYXItc2NvcGVcIj5XaXBlIHNlbGVjdGVkIGRhdGE8L2J1dHRvbj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L2Rpdj5cbiAgICA8L3NlY3Rpb24+XG4gIGApO1xuXG4gIGNvbnN0IHJvdXRlTGlzdGVuZXJzID0gW107XG4gIGNvbnN0IG9uID0gKHRhcmdldCwgdHlwZSwgaGFuZGxlciwgb3B0aW9ucykgPT4ge1xuICAgIGlmICghdGFyZ2V0KSByZXR1cm47XG4gICAgdGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXIodHlwZSwgaGFuZGxlciwgb3B0aW9ucyk7XG4gICAgcm91dGVMaXN0ZW5lcnMucHVzaCh7IHRhcmdldCwgdHlwZSwgaGFuZGxlciwgb3B0aW9ucyB9KTtcbiAgfTtcbiAgY29uc3QgdGhlbWVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnRuLXRoZW1lLXRvZ2dsZScpO1xuICBvbih0aGVtZUJ0biwgJ2NsaWNrJywgKCkgPT4gVGhlbWVNYW5hZ2VyLnRvZ2dsZT8uKCkpO1xuXG4gIGNvbnN0IHVwZGF0ZUZvbnRMYWJlbCA9ICgpID0+IHtcbiAgICBjb25zdCBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmb250LXNjYWxlLWxhYmVsJyk7XG4gICAgaWYgKCFlbCkgcmV0dXJuO1xuICAgIGVsLnRleHRDb250ZW50ID0gYCR7TWF0aC5yb3VuZChGb250U2NhbGUuZ2V0KCkgKiAxMDApfSVgO1xuICB9O1xuICB1cGRhdGVGb250TGFiZWwoKTtcbiAgb24oZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J0bi1mb250LWluYycpLCAnY2xpY2snLCAoKSA9PiB7IEZvbnRTY2FsZS5pbmMoKTsgdXBkYXRlRm9udExhYmVsKCk7IH0pO1xuICBvbihkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnRuLWZvbnQtZGVjJyksICdjbGljaycsICgpID0+IHsgRm9udFNjYWxlLmRlYygpOyB1cGRhdGVGb250TGFiZWwoKTsgfSk7XG4gIG9uKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidG4tZm9udC1yZXNldCcpLCAnY2xpY2snLCAoKSA9PiB7IEZvbnRTY2FsZS5yZXNldCgpOyB1cGRhdGVGb250TGFiZWwoKTsgfSk7XG4gIHdpbmRvdy5QbGFzbWFEZWNrPy5idXM/Lm9uPy4oJ2ZvbnRTY2FsZTpjaGFuZ2UnLCB1cGRhdGVGb250TGFiZWwpO1xuXG4gIGNvbnN0IGRlbnNpdHlTZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2VsZWN0LWRlbnNpdHknKTtcbiAgaWYgKGRlbnNpdHlTZWwpIHtcbiAgICBkZW5zaXR5U2VsLnZhbHVlID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1kZW5zaXR5JykgfHwgUHJlZnMuZ2V0KFByZWZzLktFWVMuZGVuc2l0eSwgJ2NvbWZvcnRhYmxlJykgfHwgJ2NvbWZvcnRhYmxlJztcbiAgICBvbihkZW5zaXR5U2VsLCAnY2hhbmdlJywgKCkgPT4ge1xuICAgICAgY29uc3QgdiA9IGRlbnNpdHlTZWwudmFsdWU7XG4gICAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2V0QXR0cmlidXRlKCdkYXRhLWRlbnNpdHknLCB2KTtcbiAgICAgIFByZWZzLnNldChQcmVmcy5LRVlTLmRlbnNpdHksIHYpO1xuICAgICAgd2luZG93LlBsYXNtYURlY2s/LmJ1cz8uZW1pdD8uKCdkZW5zaXR5OmNoYW5nZScsIHsgZGVuc2l0eTogdiB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IHdpcGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnRuLWNsZWFyLXNjb3BlJyk7XG4gIGNvbnN0IHdpcGVTY29wZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZWxlY3QtY2xlYXItc2NvcGUnKTtcbiAgY29uc3Qgc2NvcGVMYWJlbHMgPSB7XG4gICAgcHJvZ3Jlc3M6ICdwcm9ncmVzcyByZWNvcmRzJyxcbiAgICBub3RlczogJ25vdGVzLCBmb2xkZXJzLCBhbmQgbm90ZSBzZXR0aW5ncycsXG4gICAgbWVkaWE6ICd0aW1lc3RhbXBzIGFuZCBQREYgYW5ub3RhdGlvbnMnLFxuICAgIHBsYXlsaXN0czogJ3NhdmVkIHBsYXlsaXN0cycsXG4gICAgc3R1ZGlvOiAnU3R1ZGlvIGJvYXJkcycsXG4gICAgcHJlZmVyZW5jZXM6ICdwcmVmZXJlbmNlcycsXG4gICAgYWxsOiAnYWxsIGxvY2FsIFBsYXNtYURlY2sgZGF0YScsXG4gIH07XG4gIG9uKHdpcGVCdG4sICdjbGljaycsIGFzeW5jICgpID0+IHtcbiAgICBjb25zdCBzY29wZSA9IHdpcGVTY29wZT8udmFsdWUgfHwgJ2FsbCc7XG4gICAgY29uc3QgbGFiZWwgPSBzY29wZUxhYmVsc1tzY29wZV0gfHwgc2NvcGVMYWJlbHMuYWxsO1xuICAgIGNvbnN0IG9rID0gYXdhaXQgd2luZG93LlBsYXNtYURlY2s/LlVJPy5jb25maXJtPy4oYFRoaXMgd2lsbCBkZWxldGUgJHtsYWJlbH0uIENvbnRpbnVlP2ApO1xuICAgIGlmICghb2spIHJldHVybjtcbiAgICB0cnkge1xuICAgICAgaWYgKHdpbmRvdy5EQj8uY2xlYXJVc2VyRGF0YSkgYXdhaXQgd2luZG93LkRCLmNsZWFyVXNlckRhdGEoc2NvcGUpO1xuICAgICAgZWxzZSBpZiAoc2NvcGUgPT09ICdhbGwnKSBhd2FpdCB3aW5kb3cuREI/LmNsZWFyQWxsPy4oKTtcbiAgICAgIGlmIChzY29wZSA9PT0gJ2FsbCcgfHwgc2NvcGUgPT09ICdtZWRpYScpIHtcbiAgICAgICAgc2Vzc2lvblN0b3JhZ2UucmVtb3ZlSXRlbSgncGxhc21hX3BlbmRpbmdfdG9waWMnKTtcbiAgICAgICAgc2Vzc2lvblN0b3JhZ2UucmVtb3ZlSXRlbSgncGxhc21hX3BlbmRpbmdfcG9zaXRpb24nKTtcbiAgICAgICAgc2Vzc2lvblN0b3JhZ2UucmVtb3ZlSXRlbSgncGxhc21hX3BlbmRpbmdfY291cnNlX3Nlc3Npb24nKTtcbiAgICAgIH1cbiAgICAgIFRvYXN0LnN1Y2Nlc3MoYENsZWFyZWQgJHtsYWJlbH1gKTtcbiAgICAgIHN0b3JhZ2VDb250cm9sbGVyPy51cGRhdGU/LigpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgVG9hc3QuZXJyb3IoJ0NsZWFyIGZhaWxlZCcpO1xuICAgIH1cbiAgfSk7XG5cbiAgb24oZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J0bi1leHBvcnQtanNvbi0yJyksICdjbGljaycsICgpID0+IHtcbiAgICB0cnkgeyB3aW5kb3cuUHJvZ3Jlc3NTdGF0cz8uZXhwb3J0SlNPTj8uKCk7IH0gY2F0Y2ggeyBUb2FzdC5lcnJvcignRXhwb3J0IGZhaWxlZCcpOyB9XG4gIH0pO1xuICBvbihkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnRuLWltcG9ydC1qc29uLTInKSwgJ2NsaWNrJywgKCkgPT4ge1xuICAgIHRyeSB7IHdpbmRvdy5Qcm9ncmVzc1N0YXRzPy5pbXBvcnRKU09OPy4oKTsgfSBjYXRjaCB7IFRvYXN0LmVycm9yKCdJbXBvcnQgZmFpbGVkJyk7IH1cbiAgfSk7XG4gIHJlbmRlckFJU2V0dGluZ3MoKTtcbiAgY29uc3Qgc3RvcmFnZUNvbnRyb2xsZXIgPSByZW5kZXJTdG9yYWdlSGVhbHRoKCk7XG4gIHJldHVybiB7XG4gICAgdW5tb3VudCgpIHtcbiAgICAgIHJvdXRlTGlzdGVuZXJzLmZvckVhY2goKHsgdGFyZ2V0LCB0eXBlLCBoYW5kbGVyLCBvcHRpb25zIH0pID0+IHtcbiAgICAgICAgdHJ5IHsgdGFyZ2V0LnJlbW92ZUV2ZW50TGlzdGVuZXIodHlwZSwgaGFuZGxlciwgb3B0aW9ucyk7IH0gY2F0Y2gge31cbiAgICAgIH0pO1xuICAgICAgaWYgKHN0b3JhZ2VDb250cm9sbGVyPy50aW1lcikgY2xlYXJJbnRlcnZhbChzdG9yYWdlQ29udHJvbGxlci50aW1lcik7XG4gICAgICB3aW5kb3cuUGxhc21hRGVjaz8uYnVzPy5vZmY/LignZm9udFNjYWxlOmNoYW5nZScsIHVwZGF0ZUZvbnRMYWJlbCk7XG4gICAgfSxcbiAgfTtcblxuICBmdW5jdGlvbiByZW5kZXJBSVNldHRpbmdzKCkge1xuICAgIGNvbnN0IG1vZGUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1haS1tb2RlXScpO1xuICAgIGNvbnN0IG1vZGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtYWktbW9kZWxdJyk7XG4gICAgY29uc3QgZW5kcG9pbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1haS1lbmRwb2ludF0nKTtcbiAgICBjb25zdCBhcGlLZXkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1haS1rZXldJyk7XG4gICAgY29uc3Qga2V5U3RvcmFnZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWFpLWtleS1zdG9yYWdlXScpO1xuICAgIGNvbnN0IGxvY2FsUGFja2FnZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWFpLWxvY2FsLXBhY2thZ2VdJyk7XG4gICAgY29uc3QgbG9jYWxTb3VyY2UgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1haS1sb2NhbC1zb3VyY2VdJyk7XG4gICAgY29uc3QgbG9jYWxGaWxlSW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1haS1sb2NhbC1maWxlXScpO1xuICAgIGNvbnN0IHN0YXR1cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWFpLXN0YXR1c10nKTtcbiAgICBjb25zdCBzdW1tYXJ5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtYWktc3VtbWFyeV0nKTtcbiAgICBpZiAoIW1vZGUgfHwgIW1vZGVsIHx8ICFlbmRwb2ludCB8fCAhYXBpS2V5IHx8ICFrZXlTdG9yYWdlIHx8ICFsb2NhbFBhY2thZ2UgfHwgIWxvY2FsU291cmNlIHx8ICFsb2NhbEZpbGVJbnB1dCB8fCAhc3RhdHVzIHx8ICFzdW1tYXJ5KSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IGtleU5hbWUgPSAncGxhc21hLWFpLWFwaS1rZXktc2Vzc2lvbic7XG4gICAgY29uc3QgZ2VtbWFPcHRpb25zID0gd2luZG93LlBsYXNtYURlY2s/LkFJPy5nZW1tYU1vZGVsT3B0aW9ucyB8fCBbXG4gICAgICB7IGlkOiAnZ2VtbWEtNC1sb2NhbCcsIGxhYmVsOiAnR2VtbWEgNCcsIHVybDogJ2h0dHBzOi8vYWkuZ29vZ2xlLmRldi9nZW1tYScgfSxcbiAgICAgIHsgaWQ6ICdnZW1tYS0zbi1sb2NhbCcsIGxhYmVsOiAnR2VtbWEgM24nLCB1cmw6ICdodHRwczovL2FpLmdvb2dsZS5kZXYvZ2VtbWEnIH0sXG4gICAgXTtcbiAgICBsb2NhbFBhY2thZ2UucmVwbGFjZUNoaWxkcmVuKC4uLmdlbW1hT3B0aW9ucy5tYXAoKG9wdGlvbikgPT4ge1xuICAgICAgY29uc3QgaXRlbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ29wdGlvbicpO1xuICAgICAgaXRlbS52YWx1ZSA9IG9wdGlvbi5pZDtcbiAgICAgIGl0ZW0udGV4dENvbnRlbnQgPSBvcHRpb24ubGFiZWw7XG4gICAgICByZXR1cm4gaXRlbTtcbiAgICB9KSk7XG4gICAgY29uc3QgY3VycmVudCA9IHtcbiAgICAgIG1vZGU6ICdoaWRkZW4nLFxuICAgICAgbW9kZWw6ICdnZW1tYS00LWxvY2FsJyxcbiAgICAgIGVuZHBvaW50OiAnJyxcbiAgICAgIGtleVN0b3JhZ2U6ICdzZXNzaW9uJyxcbiAgICAgIGhhc0tleTogZmFsc2UsXG4gICAgICBsb2NhbE1vZGVsU3RhdHVzOiAnbm90LWluc3RhbGxlZCcsXG4gICAgICBsb2NhbE1vZGVsU291cmNlOiBnZW1tYU9wdGlvbnNbMF0/LnVybCB8fCAnaHR0cHM6Ly9haS5nb29nbGUuZGV2L2dlbW1hJyxcbiAgICAgIGxvY2FsTW9kZWxGaWxlOiBudWxsLFxuICAgIH07XG4gICAgY29uc3Qgc2VsZWN0ZWRNb2RlbE9wdGlvbiA9ICgpID0+IGdlbW1hT3B0aW9ucy5maW5kKG9wdGlvbiA9PiBvcHRpb24uaWQgPT09IGxvY2FsUGFja2FnZS52YWx1ZSkgfHwgZ2VtbWFPcHRpb25zWzBdO1xuICAgIGNvbnN0IHNldFN0YXR1cyA9ICgpID0+IHtcbiAgICAgIGNvbnN0IGxhYmVscyA9IHtcbiAgICAgICAgaGlkZGVuOiAnSGlkZGVuJyxcbiAgICAgICAgZGlzYWJsZWQ6ICdPZmYnLFxuICAgICAgICAnbG9jYWwtZ2VtbWEnOiAnTG9jYWwgbW9kZWwnLFxuICAgICAgICAnY3VzdG9tLWFwaSc6ICdPd24gQVBJJyxcbiAgICAgIH07XG4gICAgICBzdGF0dXMudGV4dENvbnRlbnQgPSBsYWJlbHNbY3VycmVudC5tb2RlXSB8fCAnSGlkZGVuJztcbiAgICAgIHN0YXR1cy5jbGFzc05hbWUgPSBgYmFkZ2UgJHtjdXJyZW50Lm1vZGUgPT09ICdoaWRkZW4nIHx8IGN1cnJlbnQubW9kZSA9PT0gJ2Rpc2FibGVkJyA/ICdiYWRnZS1pbmZvJyA6ICdiYWRnZS1zdWNjZXNzJ31gO1xuICAgICAgc3VtbWFyeS5yZXBsYWNlQ2hpbGRyZW4oKTtcbiAgICAgIFtcbiAgICAgICAgWydNb2RlJywgbGFiZWxzW2N1cnJlbnQubW9kZV0gfHwgJ0hpZGRlbiddLFxuICAgICAgICBbJ01vZGVsJywgY3VycmVudC5tb2RlbCB8fCAnTm90IHNlbGVjdGVkJ10sXG4gICAgICAgIFsnTG9jYWwgcGFja2FnZScsIHNlbGVjdGVkTW9kZWxPcHRpb24oKT8ubGFiZWwgfHwgY3VycmVudC5tb2RlbCB8fCAnTm90IHNlbGVjdGVkJ10sXG4gICAgICAgIFsnTG9jYWwgZmlsZXMnLCBjdXJyZW50LmxvY2FsTW9kZWxGaWxlPy5uYW1lIHx8IChjdXJyZW50LmxvY2FsTW9kZWxTdGF0dXMgPT09ICdpbnN0YWxsZWQnID8gJ01hcmtlZCBpbnN0YWxsZWQnIDogJ05vdCBpbnN0YWxsZWQnKV0sXG4gICAgICAgIFsnTG9jYWwgZmlsZSBzaXplJywgY3VycmVudC5sb2NhbE1vZGVsRmlsZT8uc2l6ZSA/IGZvcm1hdEJ5dGVzKGN1cnJlbnQubG9jYWxNb2RlbEZpbGUuc2l6ZSkgOiAnTm9uZSddLFxuICAgICAgICBbJ01vZGVsIHNvdXJjZScsIGN1cnJlbnQubG9jYWxNb2RlbFNvdXJjZSB8fCAnTm90IGNvbmZpZ3VyZWQnXSxcbiAgICAgICAgWydFbmRwb2ludCcsIGN1cnJlbnQuZW5kcG9pbnQgfHwgJ05vdCBjb25maWd1cmVkJ10sXG4gICAgICAgIFsnQVBJIGtleScsIGN1cnJlbnQuaGFzS2V5ID8gYCR7Y3VycmVudC5rZXlTdG9yYWdlID09PSAnbG9jYWwnID8gJ1N0b3JlZCBsb2NhbGx5JyA6ICdTdG9yZWQgZm9yIHRoaXMgc2Vzc2lvbid9YCA6ICdOb3Qgc3RvcmVkJ10sXG4gICAgICAgIFsnVmlzaWJpbGl0eScsIGN1cnJlbnQubW9kZSA9PT0gJ2hpZGRlbicgPyAnQUkgY29udHJvbHMgc3RheSBoaWRkZW4gb3V0c2lkZSBTZXR0aW5ncycgOiAnQUkgY29udHJvbHMgbWF5IGJlIHNob3duIHdoZW4gYSBmZWF0dXJlIHVzZXMgdGhlbSddLFxuICAgICAgXS5mb3JFYWNoKChbbGFiZWwsIHZhbHVlXSkgPT4ge1xuICAgICAgICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgY29uc3QgZHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkdCcpO1xuICAgICAgICBjb25zdCBkZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RkJyk7XG4gICAgICAgIGR0LnRleHRDb250ZW50ID0gbGFiZWw7XG4gICAgICAgIGRkLnRleHRDb250ZW50ID0gdmFsdWU7XG4gICAgICAgIHJvdy5hcHBlbmQoZHQsIGRkKTtcbiAgICAgICAgc3VtbWFyeS5hcHBlbmRDaGlsZChyb3cpO1xuICAgICAgfSk7XG4gICAgfTtcbiAgICBjb25zdCBhcHBseSA9IChuZXh0ID0ge30pID0+IHtcbiAgICAgIE9iamVjdC5hc3NpZ24oY3VycmVudCwgbmV4dCk7XG4gICAgICBtb2RlLnZhbHVlID0gY3VycmVudC5tb2RlO1xuICAgICAgbW9kZWwudmFsdWUgPSBjdXJyZW50Lm1vZGVsO1xuICAgICAgaWYgKFsuLi5sb2NhbFBhY2thZ2Uub3B0aW9uc10uc29tZShvcHRpb24gPT4gb3B0aW9uLnZhbHVlID09PSBjdXJyZW50Lm1vZGVsKSkgbG9jYWxQYWNrYWdlLnZhbHVlID0gY3VycmVudC5tb2RlbDtcbiAgICAgIGxvY2FsU291cmNlLnZhbHVlID0gY3VycmVudC5sb2NhbE1vZGVsU291cmNlO1xuICAgICAgZW5kcG9pbnQudmFsdWUgPSBjdXJyZW50LmVuZHBvaW50O1xuICAgICAga2V5U3RvcmFnZS52YWx1ZSA9IGN1cnJlbnQua2V5U3RvcmFnZTtcbiAgICAgIGFwaUtleS52YWx1ZSA9ICcnO1xuICAgICAgd2luZG93LlBsYXNtYURlY2suQUlTZXR0aW5ncyA9IHsgLi4uY3VycmVudCB9O1xuICAgICAgc2V0U3RhdHVzKCk7XG4gICAgfTtcblxuICAgIFByb21pc2UucmVzb2x2ZSh3aW5kb3cuREI/LmdldFNldHRpbmc/LigncGxhc21hLWFpLXNldHRpbmdzJykpLnRoZW4oKHNhdmVkKSA9PiB7XG4gICAgICBjb25zdCBzZXNzaW9uS2V5ID0gc2Vzc2lvblN0b3JhZ2UuZ2V0SXRlbShrZXlOYW1lKTtcbiAgICAgIGFwcGx5KHtcbiAgICAgICAgbW9kZTogc2F2ZWQ/Lm1vZGUgfHwgJ2hpZGRlbicsXG4gICAgICAgIG1vZGVsOiBzYXZlZD8ubW9kZWwgfHwgJ2dlbW1hLWxvY2FsJyxcbiAgICAgICAgZW5kcG9pbnQ6IHNhdmVkPy5lbmRwb2ludCB8fCAnJyxcbiAgICAgICAga2V5U3RvcmFnZTogc2F2ZWQ/LmtleVN0b3JhZ2UgfHwgJ3Nlc3Npb24nLFxuICAgICAgICBoYXNLZXk6IEJvb2xlYW4oc2Vzc2lvbktleSB8fCBzYXZlZD8uYXBpS2V5KSxcbiAgICAgICAgbG9jYWxNb2RlbFN0YXR1czogWydpbnN0YWxsZWQnLCAnaW1wb3J0ZWQnXS5pbmNsdWRlcyhzYXZlZD8ubG9jYWxNb2RlbFN0YXR1cykgPyBzYXZlZC5sb2NhbE1vZGVsU3RhdHVzIDogJ25vdC1pbnN0YWxsZWQnLFxuICAgICAgICBsb2NhbE1vZGVsU291cmNlOiBzYXZlZD8ubG9jYWxNb2RlbFNvdXJjZSB8fCBnZW1tYU9wdGlvbnNbMF0/LnVybCB8fCAnaHR0cHM6Ly9haS5nb29nbGUuZGV2L2dlbW1hJyxcbiAgICAgICAgbG9jYWxNb2RlbEZpbGU6IHNhdmVkPy5sb2NhbE1vZGVsRmlsZSAmJiB0eXBlb2Ygc2F2ZWQubG9jYWxNb2RlbEZpbGUgPT09ICdvYmplY3QnID8gc2F2ZWQubG9jYWxNb2RlbEZpbGUgOiBudWxsLFxuICAgICAgfSk7XG4gICAgfSkuY2F0Y2goKCkgPT4gYXBwbHkoKSk7XG5cbiAgICBvbihsb2NhbFBhY2thZ2UsICdjaGFuZ2UnLCAoKSA9PiB7XG4gICAgICBjb25zdCBvcHRpb24gPSBzZWxlY3RlZE1vZGVsT3B0aW9uKCk7XG4gICAgICBtb2RlbC52YWx1ZSA9IG9wdGlvbj8uaWQgfHwgbG9jYWxQYWNrYWdlLnZhbHVlO1xuICAgICAgaWYgKG9wdGlvbj8udXJsICYmICghbG9jYWxTb3VyY2UudmFsdWUgfHwgbG9jYWxTb3VyY2UudmFsdWUgPT09IGN1cnJlbnQubG9jYWxNb2RlbFNvdXJjZSkpIGxvY2FsU291cmNlLnZhbHVlID0gb3B0aW9uLnVybDtcbiAgICB9KTtcblxuICAgIG9uKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWFpLXNhdmVdJyksICdjbGljaycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHJhd0tleSA9IGFwaUtleS52YWx1ZS50cmltKCk7XG4gICAgICBjb25zdCBuZXh0ID0ge1xuICAgICAgICBtb2RlOiBtb2RlLnZhbHVlLFxuICAgICAgICBtb2RlbDogbW9kZWwudmFsdWUudHJpbSgpIHx8ICdnZW1tYS1sb2NhbCcsXG4gICAgICAgIGVuZHBvaW50OiBlbmRwb2ludC52YWx1ZS50cmltKCksXG4gICAgICAgIGtleVN0b3JhZ2U6IGtleVN0b3JhZ2UudmFsdWUsXG4gICAgICAgIGhhc0tleTogQm9vbGVhbihyYXdLZXkgfHwgKGtleVN0b3JhZ2UudmFsdWUgPT09ICdzZXNzaW9uJyA/IHNlc3Npb25TdG9yYWdlLmdldEl0ZW0oa2V5TmFtZSkgOiBjdXJyZW50Lmhhc0tleSkpLFxuICAgICAgICBsb2NhbE1vZGVsU3RhdHVzOiBjdXJyZW50LmxvY2FsTW9kZWxTdGF0dXMsXG4gICAgICAgIGxvY2FsTW9kZWxTb3VyY2U6IGxvY2FsU291cmNlLnZhbHVlLnRyaW0oKSB8fCBzZWxlY3RlZE1vZGVsT3B0aW9uKCk/LnVybCB8fCAnaHR0cHM6Ly9haS5nb29nbGUuZGV2L2dlbW1hJyxcbiAgICAgICAgbG9jYWxNb2RlbEZpbGU6IGN1cnJlbnQubG9jYWxNb2RlbEZpbGUsXG4gICAgICB9O1xuICAgICAgaWYgKG5leHQubW9kZSA9PT0gJ2hpZGRlbicgfHwgbmV4dC5tb2RlID09PSAnZGlzYWJsZWQnKSB7XG4gICAgICAgIG5leHQuaGFzS2V5ID0gZmFsc2U7XG4gICAgICAgIHNlc3Npb25TdG9yYWdlLnJlbW92ZUl0ZW0oa2V5TmFtZSk7XG4gICAgICB9IGVsc2UgaWYgKHJhd0tleSAmJiBuZXh0LmtleVN0b3JhZ2UgPT09ICdzZXNzaW9uJykge1xuICAgICAgICBzZXNzaW9uU3RvcmFnZS5zZXRJdGVtKGtleU5hbWUsIHJhd0tleSk7XG4gICAgICB9XG4gICAgICBjb25zdCBzdG9yZWQgPSB7IC4uLm5leHQgfTtcbiAgICAgIGlmIChyYXdLZXkgJiYgbmV4dC5rZXlTdG9yYWdlID09PSAnbG9jYWwnICYmIG5leHQubW9kZSAhPT0gJ2hpZGRlbicgJiYgbmV4dC5tb2RlICE9PSAnZGlzYWJsZWQnKSB7XG4gICAgICAgIHN0b3JlZC5hcGlLZXkgPSByYXdLZXk7XG4gICAgICAgIHN0b3JlZC5oYXNLZXkgPSB0cnVlO1xuICAgICAgfVxuICAgICAgaWYgKG5leHQua2V5U3RvcmFnZSA9PT0gJ3Nlc3Npb24nKSBkZWxldGUgc3RvcmVkLmFwaUtleTtcbiAgICAgIGF3YWl0IFByb21pc2UucmVzb2x2ZSh3aW5kb3cuREI/LnNhdmVTZXR0aW5nPy4oJ3BsYXNtYS1haS1zZXR0aW5ncycsIHN0b3JlZCkpO1xuICAgICAgYXBwbHkoc3RvcmVkKTtcbiAgICAgIFRvYXN0LnN1Y2Nlc3MoJ0FJIG9wdGlvbnMgc2F2ZWQnKTtcbiAgICB9KTtcblxuICAgIG9uKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWFpLW9wZW4tbG9jYWwtc291cmNlXScpLCAnY2xpY2snLCAoKSA9PiB7XG4gICAgICBjb25zdCB1cmwgPSBsb2NhbFNvdXJjZS52YWx1ZS50cmltKCkgfHwgc2VsZWN0ZWRNb2RlbE9wdGlvbigpPy51cmw7XG4gICAgICBpZiAoIS9eaHR0cHM/OlxcL1xcLy9pLnRlc3QodXJsKSkge1xuICAgICAgICBUb2FzdC5lcnJvcignTG9jYWwgbW9kZWwgc291cmNlIG11c3QgYmUgYW4gSFRUUCBvciBIVFRQUyBVUkwnKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgd2luZG93Lm9wZW4odXJsLCAnX2JsYW5rJywgJ25vb3BlbmVyLG5vcmVmZXJyZXInKTtcbiAgICB9KTtcblxuICAgIG9uKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWFpLWltcG9ydC1sb2NhbC1maWxlXScpLCAnY2xpY2snLCAoKSA9PiB7XG4gICAgICBsb2NhbEZpbGVJbnB1dC5jbGljaygpO1xuICAgIH0pO1xuXG4gICAgb24obG9jYWxGaWxlSW5wdXQsICdjaGFuZ2UnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBmaWxlID0gbG9jYWxGaWxlSW5wdXQuZmlsZXM/LlswXTtcbiAgICAgIGlmICghZmlsZSkgcmV0dXJuO1xuICAgICAgY29uc3QgaW1wb3J0ZWQgPSBhd2FpdCB3aW5kb3cuUGxhc21hRGVjaz8uQUk/LmltcG9ydExvY2FsTW9kZWxGaWxlPy4oZmlsZSk7XG4gICAgICBjb25zdCBzdG9yZWQgPSB7XG4gICAgICAgIC4uLmN1cnJlbnQsXG4gICAgICAgIG1vZGU6IG1vZGUudmFsdWUsXG4gICAgICAgIG1vZGVsOiBtb2RlbC52YWx1ZS50cmltKCkgfHwgc2VsZWN0ZWRNb2RlbE9wdGlvbigpPy5pZCB8fCBjdXJyZW50Lm1vZGVsLFxuICAgICAgICBlbmRwb2ludDogZW5kcG9pbnQudmFsdWUudHJpbSgpLFxuICAgICAgICBrZXlTdG9yYWdlOiBrZXlTdG9yYWdlLnZhbHVlLFxuICAgICAgICBsb2NhbE1vZGVsU3RhdHVzOiAnaW1wb3J0ZWQnLFxuICAgICAgICBsb2NhbE1vZGVsU291cmNlOiBsb2NhbFNvdXJjZS52YWx1ZS50cmltKCkgfHwgc2VsZWN0ZWRNb2RlbE9wdGlvbigpPy51cmwgfHwgY3VycmVudC5sb2NhbE1vZGVsU291cmNlLFxuICAgICAgICBsb2NhbE1vZGVsRmlsZToge1xuICAgICAgICAgIG5hbWU6IGltcG9ydGVkPy5uYW1lIHx8IGZpbGUubmFtZSxcbiAgICAgICAgICBzaXplOiBpbXBvcnRlZD8uc2l6ZSA/PyBmaWxlLnNpemUsXG4gICAgICAgICAgdHlwZTogaW1wb3J0ZWQ/LnR5cGUgfHwgZmlsZS50eXBlIHx8ICdhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW0nLFxuICAgICAgICAgIGxhc3RNb2RpZmllZDogaW1wb3J0ZWQ/Lmxhc3RNb2RpZmllZCA/PyBmaWxlLmxhc3RNb2RpZmllZCA/PyAwLFxuICAgICAgICAgIGltcG9ydGVkQXQ6IGltcG9ydGVkPy5pbXBvcnRlZEF0IHx8IERhdGUubm93KCksXG4gICAgICAgIH0sXG4gICAgICB9O1xuICAgICAgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHdpbmRvdy5EQj8uc2F2ZVNldHRpbmc/LigncGxhc21hLWFpLXNldHRpbmdzJywgc3RvcmVkKSk7XG4gICAgICBsb2NhbEZpbGVJbnB1dC52YWx1ZSA9ICcnO1xuICAgICAgYXBwbHkoc3RvcmVkKTtcbiAgICAgIFRvYXN0LnN1Y2Nlc3MoJ0xvY2FsIG1vZGVsIGZpbGUgcmVnaXN0ZXJlZCcpO1xuICAgIH0pO1xuXG4gICAgb24oZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtYWktZG93bmxvYWQtbG9jYWwtZmlsZV0nKSwgJ2NsaWNrJywgYXN5bmMgKGV2ZW50KSA9PiB7XG4gICAgICBjb25zdCBidXR0b24gPSBldmVudC5jdXJyZW50VGFyZ2V0O1xuICAgICAgY29uc3QgdXJsID0gbG9jYWxTb3VyY2UudmFsdWUudHJpbSgpIHx8IHNlbGVjdGVkTW9kZWxPcHRpb24oKT8udXJsO1xuICAgICAgaWYgKCEvXmh0dHBzPzpcXC9cXC8vaS50ZXN0KHVybCkpIHtcbiAgICAgICAgVG9hc3QuZXJyb3IoJ01vZGVsIHNvdXJjZSBtdXN0IGJlIGFuIEhUVFAgb3IgSFRUUFMgVVJMJyk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHByZXZpb3VzID0gYnV0dG9uLnRleHRDb250ZW50O1xuICAgICAgYnV0dG9uLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgIGJ1dHRvbi50ZXh0Q29udGVudCA9ICdEb3dubG9hZGluZy4uLic7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBkb3dubG9hZGVkID0gYXdhaXQgd2luZG93LlBsYXNtYURlY2s/LkFJPy5kb3dubG9hZExvY2FsTW9kZWw/Lih1cmwsIHtcbiAgICAgICAgICBvblByb2dyZXNzKHByb2dyZXNzKSB7XG4gICAgICAgICAgICBpZiAocHJvZ3Jlc3MucGVyY2VudCkgYnV0dG9uLnRleHRDb250ZW50ID0gYERvd25sb2FkaW5nICR7cHJvZ3Jlc3MucGVyY2VudH0lYDtcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3Qgc3RvcmVkID0ge1xuICAgICAgICAgIC4uLmN1cnJlbnQsXG4gICAgICAgICAgbW9kZTogbW9kZS52YWx1ZSxcbiAgICAgICAgICBtb2RlbDogbW9kZWwudmFsdWUudHJpbSgpIHx8IHNlbGVjdGVkTW9kZWxPcHRpb24oKT8uaWQgfHwgY3VycmVudC5tb2RlbCxcbiAgICAgICAgICBlbmRwb2ludDogZW5kcG9pbnQudmFsdWUudHJpbSgpLFxuICAgICAgICAgIGtleVN0b3JhZ2U6IGtleVN0b3JhZ2UudmFsdWUsXG4gICAgICAgICAgbG9jYWxNb2RlbFN0YXR1czogJ2ltcG9ydGVkJyxcbiAgICAgICAgICBsb2NhbE1vZGVsU291cmNlOiB1cmwsXG4gICAgICAgICAgbG9jYWxNb2RlbEZpbGU6IGRvd25sb2FkZWQsXG4gICAgICAgIH07XG4gICAgICAgIGF3YWl0IFByb21pc2UucmVzb2x2ZSh3aW5kb3cuREI/LnNhdmVTZXR0aW5nPy4oJ3BsYXNtYS1haS1zZXR0aW5ncycsIHN0b3JlZCkpO1xuICAgICAgICBhcHBseShzdG9yZWQpO1xuICAgICAgICBUb2FzdC5zdWNjZXNzKCdMb2NhbCBtb2RlbCBkb3dubG9hZGVkJyk7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgVG9hc3QuZXJyb3IoJ0xvY2FsIG1vZGVsIGRvd25sb2FkIGZhaWxlZCcpO1xuICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgYnV0dG9uLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgIGJ1dHRvbi50ZXh0Q29udGVudCA9IHByZXZpb3VzO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgb24oZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtYWktbWFyay1sb2NhbC1pbnN0YWxsZWRdJyksICdjbGljaycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0b3JlZCA9IHtcbiAgICAgICAgLi4uY3VycmVudCxcbiAgICAgICAgbW9kZTogbW9kZS52YWx1ZSxcbiAgICAgICAgbW9kZWw6IG1vZGVsLnZhbHVlLnRyaW0oKSB8fCBzZWxlY3RlZE1vZGVsT3B0aW9uKCk/LmlkIHx8IGN1cnJlbnQubW9kZWwsXG4gICAgICAgIGVuZHBvaW50OiBlbmRwb2ludC52YWx1ZS50cmltKCksXG4gICAgICAgIGtleVN0b3JhZ2U6IGtleVN0b3JhZ2UudmFsdWUsXG4gICAgICAgIGxvY2FsTW9kZWxTdGF0dXM6ICdpbnN0YWxsZWQnLFxuICAgICAgICBsb2NhbE1vZGVsU291cmNlOiBsb2NhbFNvdXJjZS52YWx1ZS50cmltKCkgfHwgc2VsZWN0ZWRNb2RlbE9wdGlvbigpPy51cmwgfHwgY3VycmVudC5sb2NhbE1vZGVsU291cmNlLFxuICAgICAgICBsb2NhbE1vZGVsRmlsZTogY3VycmVudC5sb2NhbE1vZGVsRmlsZSxcbiAgICAgIH07XG4gICAgICBhd2FpdCBQcm9taXNlLnJlc29sdmUod2luZG93LkRCPy5zYXZlU2V0dGluZz8uKCdwbGFzbWEtYWktc2V0dGluZ3MnLCBzdG9yZWQpKTtcbiAgICAgIGFwcGx5KHN0b3JlZCk7XG4gICAgICBUb2FzdC5zdWNjZXNzKCdMb2NhbCBtb2RlbCBtYXJrZWQgaW5zdGFsbGVkJyk7XG4gICAgfSk7XG5cbiAgICBvbihkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1haS1jbGVhci1sb2NhbC1tb2RlbF0nKSwgJ2NsaWNrJywgYXN5bmMgKCkgPT4ge1xuICAgICAgYXdhaXQgd2luZG93LlBsYXNtYURlY2s/LkFJPy5jbGVhckxvY2FsTW9kZWxGaWxlPy4oKTtcbiAgICAgIGNvbnN0IHN0b3JlZCA9IHsgLi4uY3VycmVudCwgbG9jYWxNb2RlbFN0YXR1czogJ25vdC1pbnN0YWxsZWQnLCBsb2NhbE1vZGVsRmlsZTogbnVsbCB9O1xuICAgICAgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHdpbmRvdy5EQj8uc2F2ZVNldHRpbmc/LigncGxhc21hLWFpLXNldHRpbmdzJywgc3RvcmVkKSk7XG4gICAgICBhcHBseShzdG9yZWQpO1xuICAgICAgVG9hc3QuaW5mbygnTG9jYWwgbW9kZWwgbWFya2VyIGNsZWFyZWQnKTtcbiAgICB9KTtcblxuICAgIG9uKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWFpLWNsZWFyLWtleV0nKSwgJ2NsaWNrJywgYXN5bmMgKCkgPT4ge1xuICAgICAgc2Vzc2lvblN0b3JhZ2UucmVtb3ZlSXRlbShrZXlOYW1lKTtcbiAgICAgIGNvbnN0IHN0b3JlZCA9IHsgLi4uY3VycmVudCwgYXBpS2V5OiB1bmRlZmluZWQsIGhhc0tleTogZmFsc2UgfTtcbiAgICAgIGF3YWl0IFByb21pc2UucmVzb2x2ZSh3aW5kb3cuREI/LnNhdmVTZXR0aW5nPy4oJ3BsYXNtYS1haS1zZXR0aW5ncycsIHN0b3JlZCkpO1xuICAgICAgYXBwbHkoc3RvcmVkKTtcbiAgICAgIFRvYXN0LmluZm8oJ0FJIGtleSBjbGVhcmVkJyk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHsgYXBwbHkgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlbmRlclN0b3JhZ2VIZWFsdGgoKSB7XG4gICAgY29uc3Qgcm9vdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXN0b3JhZ2UtaGVhbHRoXScpO1xuICAgIGNvbnN0IGJhciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXN0b3JhZ2UtYmFyXScpO1xuICAgIGNvbnN0IHN1bW1hcnkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1zdG9yYWdlLXN1bW1hcnldJyk7XG4gICAgY29uc3Qgc3RhdHVzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtc3RvcmFnZS1zdGF0dXNdJyk7XG4gICAgaWYgKCFyb290IHx8ICFiYXIgfHwgIXN1bW1hcnkgfHwgIXN0YXR1cykgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCB1cGRhdGUgPSBhc3luYyAoKSA9PiB7XG4gICAgICBsZXQgZXN0aW1hdGU7XG4gICAgICB0cnkge1xuICAgICAgICBlc3RpbWF0ZSA9IGF3YWl0IG5hdmlnYXRvci5zdG9yYWdlPy5lc3RpbWF0ZT8uKCkgPz8gbnVsbDtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICBlc3RpbWF0ZSA9IG51bGw7XG4gICAgICB9XG4gICAgICBpZiAoIWRvY3VtZW50LmJvZHkuY29udGFpbnMocm9vdCkpIHJldHVybjtcbiAgICAgIGNvbnN0IHVzYWdlID0gTnVtYmVyKGVzdGltYXRlPy51c2FnZSk7XG4gICAgICBjb25zdCBxdW90YSA9IE51bWJlcihlc3RpbWF0ZT8ucXVvdGEpO1xuICAgICAgY29uc3QgaGFzUXVvdGEgPSBOdW1iZXIuaXNGaW5pdGUodXNhZ2UpICYmIE51bWJlci5pc0Zpbml0ZShxdW90YSkgJiYgcXVvdGEgPiAwO1xuICAgICAgY29uc3QgcGN0ID0gaGFzUXVvdGEgPyBNYXRoLm1pbigxMDAsIE1hdGgucm91bmQoKHVzYWdlIC8gcXVvdGEpICogMTAwKSkgOiAwO1xuICAgICAgY29uc3QgYXZhaWxhYmxlID0gaGFzUXVvdGEgPyBNYXRoLm1heCgwLCBxdW90YSAtIHVzYWdlKSA6IG51bGw7XG4gICAgICBjb25zdCBsb2NhbEJ5dGVzID0gbG9jYWxTdG9yYWdlRm9vdHByaW50KCk7XG4gICAgICBjb25zdCBpc3N1ZSA9IHdpbmRvdy5QbGFzbWFEZWNrPy5sYXN0U3RvcmFnZUlzc3VlO1xuICAgICAgY29uc3Qgc3RhdHVzVGV4dCA9ICFoYXNRdW90YSA/ICdVbmF2YWlsYWJsZScgOiBwY3QgPj0gOTAgfHwgaXNzdWU/LmVycm9yPy5xdW90YSA/ICdDcml0aWNhbCcgOiBwY3QgPj0gNzUgPyAnV2F0Y2gnIDogJ0hlYWx0aHknO1xuXG4gICAgICBzdGF0dXMudGV4dENvbnRlbnQgPSBzdGF0dXNUZXh0O1xuICAgICAgc3RhdHVzLmNsYXNzTmFtZSA9IGBiYWRnZSAke3N0YXR1c1RleHQgPT09ICdDcml0aWNhbCcgPyAnYmFkZ2UtZGFuZ2VyJyA6IHN0YXR1c1RleHQgPT09ICdIZWFsdGh5JyA/ICdiYWRnZS1zdWNjZXNzJyA6ICdiYWRnZS1pbmZvJ31gO1xuICAgICAgYmFyLnN0eWxlLndpZHRoID0gYCR7cGN0fSVgO1xuICAgICAgY29uc3QgcHJvZ3Jlc3MgPSBiYXIuY2xvc2VzdCgnW3JvbGU9XCJwcm9ncmVzc2JhclwiXScpO1xuICAgICAgcHJvZ3Jlc3M/LnNldEF0dHJpYnV0ZT8uKCdhcmlhLXZhbHVlbm93JywgU3RyaW5nKHBjdCkpO1xuICAgICAgc3VtbWFyeS50ZXh0Q29udGVudCA9IGhhc1F1b3RhXG4gICAgICAgID8gYCR7Zm9ybWF0Qnl0ZXModXNhZ2UpfSB1c2VkIG9mICR7Zm9ybWF0Qnl0ZXMocXVvdGEpfSAoJHtwY3R9JSksICR7Zm9ybWF0Qnl0ZXMoYXZhaWxhYmxlKX0gYXZhaWxhYmxlYFxuICAgICAgICA6ICdCcm93c2VyIHN0b3JhZ2UgZXN0aW1hdGUgaXMgdW5hdmFpbGFibGUgaW4gdGhpcyBlbnZpcm9ubWVudC4nO1xuXG4gICAgICByb290LnJlcGxhY2VDaGlsZHJlbigpO1xuICAgICAgW1xuICAgICAgICBbJ1N0b3JhZ2Ugc3RhdHVzJywgc3RhdHVzVGV4dF0sXG4gICAgICAgIFsnRXN0aW1hdGVkIHVzYWdlJywgaGFzUXVvdGEgPyBmb3JtYXRCeXRlcyh1c2FnZSkgOiAnVW5hdmFpbGFibGUnXSxcbiAgICAgICAgWydFc3RpbWF0ZWQgcXVvdGEnLCBoYXNRdW90YSA/IGZvcm1hdEJ5dGVzKHF1b3RhKSA6ICdVbmF2YWlsYWJsZSddLFxuICAgICAgICBbJ0F2YWlsYWJsZSBzcGFjZScsIGhhc1F1b3RhID8gZm9ybWF0Qnl0ZXMoYXZhaWxhYmxlKSA6ICdVbmF2YWlsYWJsZSddLFxuICAgICAgICBbJ2xvY2FsU3RvcmFnZSBmb290cHJpbnQnLCBmb3JtYXRCeXRlcyhsb2NhbEJ5dGVzKV0sXG4gICAgICAgIFsnTGFzdCBzYXZlIGlzc3VlJywgaXNzdWUgPyAoaXNzdWUuZXJyb3I/LnF1b3RhID8gJ1F1b3RhIGVycm9yJyA6IGlzc3VlLmtpbmQgfHwgJ1N0b3JhZ2Ugd2FybmluZycpIDogJ05vbmUgcmVjb3JkZWQnXSxcbiAgICAgIF0uZm9yRWFjaCgoW2xhYmVsLCB2YWx1ZV0pID0+IHtcbiAgICAgICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIGNvbnN0IGR0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZHQnKTtcbiAgICAgICAgY29uc3QgZGQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkZCcpO1xuICAgICAgICBkdC50ZXh0Q29udGVudCA9IGxhYmVsO1xuICAgICAgICBkZC50ZXh0Q29udGVudCA9IHZhbHVlO1xuICAgICAgICByb3cuYXBwZW5kKGR0LCBkZCk7XG4gICAgICAgIHJvb3QuYXBwZW5kQ2hpbGQocm93KTtcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICB1cGRhdGUoKTtcbiAgICByZXR1cm4geyB1cGRhdGUsIHRpbWVyOiBzZXRJbnRlcnZhbCh1cGRhdGUsIDMwXzAwMCkgfTtcbiAgfVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFPLFNBQVMsa0JBQWtCLE9BQU8sQ0FBQyxHQUFHO0FBQzNDLFFBQU07QUFBQSxJQUNKO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQSxRQUFRLE9BQU8sWUFBWTtBQUFBLElBQzNCO0FBQUEsSUFDQTtBQUFBLEVBQ0YsSUFBSTtBQUVKLFVBQVE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7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
