function z(L={}){let{setView:F,ThemeManager:N,FontScale:M,Prefs:I,Toast:r=window.PlasmaDeck?.Toast,formatBytes:f,localStorageFootprint:K}=L;F(`
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
  `);let A=[],s=(o,l,d,u)=>{o&&(o.addEventListener(l,d,u),A.push({target:o,type:l,handler:d,options:u}))},T=document.getElementById("btn-theme-toggle");s(T,"click",()=>N.toggle?.());let x=()=>{let o=document.getElementById("font-scale-label");o&&(o.textContent=`${Math.round(M.get()*100)}%`)};x(),s(document.getElementById("btn-font-inc"),"click",()=>{M.inc(),x()}),s(document.getElementById("btn-font-dec"),"click",()=>{M.dec(),x()}),s(document.getElementById("btn-font-reset"),"click",()=>{M.reset(),x()}),window.PlasmaDeck?.bus?.on?.("fontScale:change",x);let P=document.getElementById("select-density");P&&(P.value=document.documentElement.getAttribute("data-density")||I.get(I.KEYS.density,"comfortable")||"comfortable",s(P,"change",()=>{let o=P.value;document.documentElement.setAttribute("data-density",o),I.set(I.KEYS.density,o),window.PlasmaDeck?.bus?.emit?.("density:change",{density:o})}));let O=document.getElementById("btn-clear-scope"),H=document.getElementById("select-clear-scope"),E={progress:"progress records",notes:"notes, folders, and note settings",media:"timestamps and PDF annotations",playlists:"saved playlists",studio:"Studio boards",preferences:"preferences",all:"all local PlasmaDeck data"};s(O,"click",async()=>{let o=H?.value||"all",l=E[o]||E.all;if(await window.PlasmaDeck?.UI?.confirm?.(`This will delete ${l}. Continue?`))try{window.DB?.clearUserData?await window.DB.clearUserData(o):o==="all"&&await window.DB?.clearAll?.(),(o==="all"||o==="media")&&(sessionStorage.removeItem("plasma_pending_topic"),sessionStorage.removeItem("plasma_pending_position"),sessionStorage.removeItem("plasma_pending_course_session")),r.success(`Cleared ${l}`),D?.update?.()}catch{r.error("Clear failed")}}),s(document.getElementById("btn-export-json-2"),"click",()=>{try{window.ProgressStats?.exportJSON?.()}catch{r.error("Export failed")}}),s(document.getElementById("btn-import-json-2"),"click",()=>{try{window.ProgressStats?.importJSON?.()}catch{r.error("Import failed")}}),U();let D=$();return{unmount(){A.forEach(({target:o,type:l,handler:d,options:u})=>{try{o.removeEventListener(l,d,u)}catch{}}),D?.timer&&clearInterval(D.timer),window.PlasmaDeck?.bus?.off?.("fontScale:change",x)}};function U(){let o=document.querySelector("[data-ai-mode]"),l=document.querySelector("[data-ai-model]"),d=document.querySelector("[data-ai-endpoint]"),u=document.querySelector("[data-ai-key]"),g=document.querySelector("[data-ai-key-storage]"),m=document.querySelector("[data-ai-local-package]"),i=document.querySelector("[data-ai-local-source]"),p=document.querySelector("[data-ai-local-file]"),y=document.querySelector("[data-ai-status]"),v=document.querySelector("[data-ai-summary]");if(!o||!l||!d||!u||!g||!m||!i||!p||!y||!v)return null;let h="plasma-ai-api-key-session",w=window.PlasmaDeck?.AI?.gemmaModelOptions||[{id:"gemma-4-local",label:"Gemma 4",url:"https://ai.google.dev/gemma"},{id:"gemma-3n-local",label:"Gemma 3n",url:"https://ai.google.dev/gemma"}];m.replaceChildren(...w.map(e=>{let a=document.createElement("option");return a.value=e.id,a.textContent=e.label,a}));let t={mode:"hidden",model:"gemma-4-local",endpoint:"",keyStorage:"session",hasKey:!1,localModelStatus:"not-installed",localModelSource:w[0]?.url||"https://ai.google.dev/gemma",localModelFile:null},c=()=>w.find(e=>e.id===m.value)||w[0],B=()=>{let e={hidden:"Hidden",disabled:"Off","local-gemma":"Local model","custom-api":"Own API"};y.textContent=e[t.mode]||"Hidden",y.className=`badge ${t.mode==="hidden"||t.mode==="disabled"?"badge-info":"badge-success"}`,v.replaceChildren(),[["Mode",e[t.mode]||"Hidden"],["Model",t.model||"Not selected"],["Local package",c()?.label||t.model||"Not selected"],["Local files",t.localModelFile?.name||(t.localModelStatus==="installed"?"Marked installed":"Not installed")],["Local file size",t.localModelFile?.size?f(t.localModelFile.size):"None"],["Model source",t.localModelSource||"Not configured"],["Endpoint",t.endpoint||"Not configured"],["API key",t.hasKey?`${t.keyStorage==="local"?"Stored locally":"Stored for this session"}`:"Not stored"],["Visibility",t.mode==="hidden"?"AI controls stay hidden outside Settings":"AI controls may be shown when a feature uses them"]].forEach(([a,n])=>{let S=document.createElement("div"),C=document.createElement("dt"),k=document.createElement("dd");C.textContent=a,k.textContent=n,S.append(C,k),v.appendChild(S)})},b=(e={})=>{Object.assign(t,e),o.value=t.mode,l.value=t.model,[...m.options].some(a=>a.value===t.model)&&(m.value=t.model),i.value=t.localModelSource,d.value=t.endpoint,g.value=t.keyStorage,u.value="",window.PlasmaDeck.AISettings={...t},B()};return Promise.resolve(window.DB?.getSetting?.("plasma-ai-settings")).then(e=>{let a=sessionStorage.getItem(h);b({mode:e?.mode||"hidden",model:e?.model||"gemma-local",endpoint:e?.endpoint||"",keyStorage:e?.keyStorage||"session",hasKey:!!(a||e?.apiKey),localModelStatus:["installed","imported"].includes(e?.localModelStatus)?e.localModelStatus:"not-installed",localModelSource:e?.localModelSource||w[0]?.url||"https://ai.google.dev/gemma",localModelFile:e?.localModelFile&&typeof e.localModelFile=="object"?e.localModelFile:null})}).catch(()=>b()),s(m,"change",()=>{let e=c();l.value=e?.id||m.value,e?.url&&(!i.value||i.value===t.localModelSource)&&(i.value=e.url)}),s(document.querySelector("[data-ai-save]"),"click",async()=>{let e=u.value.trim(),a={mode:o.value,model:l.value.trim()||"gemma-local",endpoint:d.value.trim(),keyStorage:g.value,hasKey:!!(e||(g.value==="session"?sessionStorage.getItem(h):t.hasKey)),localModelStatus:t.localModelStatus,localModelSource:i.value.trim()||c()?.url||"https://ai.google.dev/gemma",localModelFile:t.localModelFile};a.mode==="hidden"||a.mode==="disabled"?(a.hasKey=!1,sessionStorage.removeItem(h)):e&&a.keyStorage==="session"&&sessionStorage.setItem(h,e);let n={...a};e&&a.keyStorage==="local"&&a.mode!=="hidden"&&a.mode!=="disabled"&&(n.apiKey=e,n.hasKey=!0),a.keyStorage==="session"&&delete n.apiKey,await Promise.resolve(window.DB?.saveSetting?.("plasma-ai-settings",n)),b(n),r.success("AI options saved")}),s(document.querySelector("[data-ai-open-local-source]"),"click",()=>{let e=i.value.trim()||c()?.url;if(!/^https?:\/\//i.test(e)){r.error("Local model source must be an HTTP or HTTPS URL");return}window.open(e,"_blank","noopener,noreferrer")}),s(document.querySelector("[data-ai-import-local-file]"),"click",()=>{p.click()}),s(p,"change",async()=>{let e=p.files?.[0];if(!e)return;let a=await window.PlasmaDeck?.AI?.importLocalModelFile?.(e),n={...t,mode:o.value,model:l.value.trim()||c()?.id||t.model,endpoint:d.value.trim(),keyStorage:g.value,localModelStatus:"imported",localModelSource:i.value.trim()||c()?.url||t.localModelSource,localModelFile:{name:a?.name||e.name,size:a?.size??e.size,type:a?.type||e.type||"application/octet-stream",lastModified:a?.lastModified??e.lastModified??0,importedAt:a?.importedAt||Date.now()}};await Promise.resolve(window.DB?.saveSetting?.("plasma-ai-settings",n)),p.value="",b(n),r.success("Local model file registered")}),s(document.querySelector("[data-ai-download-local-file]"),"click",async e=>{let a=e.currentTarget,n=i.value.trim()||c()?.url;if(!/^https?:\/\//i.test(n)){r.error("Model source must be an HTTP or HTTPS URL");return}let S=a.textContent;a.disabled=!0,a.textContent="Downloading...";try{let C=await window.PlasmaDeck?.AI?.downloadLocalModel?.(n,{onProgress(q){q.percent&&(a.textContent=`Downloading ${q.percent}%`)}}),k={...t,mode:o.value,model:l.value.trim()||c()?.id||t.model,endpoint:d.value.trim(),keyStorage:g.value,localModelStatus:"imported",localModelSource:n,localModelFile:C};await Promise.resolve(window.DB?.saveSetting?.("plasma-ai-settings",k)),b(k),r.success("Local model downloaded")}catch{r.error("Local model download failed")}finally{a.disabled=!1,a.textContent=S}}),s(document.querySelector("[data-ai-mark-local-installed]"),"click",async()=>{let e={...t,mode:o.value,model:l.value.trim()||c()?.id||t.model,endpoint:d.value.trim(),keyStorage:g.value,localModelStatus:"installed",localModelSource:i.value.trim()||c()?.url||t.localModelSource,localModelFile:t.localModelFile};await Promise.resolve(window.DB?.saveSetting?.("plasma-ai-settings",e)),b(e),r.success("Local model marked installed")}),s(document.querySelector("[data-ai-clear-local-model]"),"click",async()=>{await window.PlasmaDeck?.AI?.clearLocalModelFile?.();let e={...t,localModelStatus:"not-installed",localModelFile:null};await Promise.resolve(window.DB?.saveSetting?.("plasma-ai-settings",e)),b(e),r.info("Local model marker cleared")}),s(document.querySelector("[data-ai-clear-key]"),"click",async()=>{sessionStorage.removeItem(h);let e={...t,apiKey:void 0,hasKey:!1};await Promise.resolve(window.DB?.saveSetting?.("plasma-ai-settings",e)),b(e),r.info("AI key cleared")}),{apply:b}}function $(){let o=document.querySelector("[data-storage-health]"),l=document.querySelector("[data-storage-bar]"),d=document.querySelector("[data-storage-summary]"),u=document.querySelector("[data-storage-status]");if(!o||!l||!d||!u)return null;let g=async()=>{let m;try{m=await navigator.storage?.estimate?.()??null}catch{m=null}if(!document.body.contains(o))return;let i=Number(m?.usage),p=Number(m?.quota),y=Number.isFinite(i)&&Number.isFinite(p)&&p>0,v=y?Math.min(100,Math.round(i/p*100)):0,h=y?Math.max(0,p-i):null,w=K(),t=window.PlasmaDeck?.lastStorageIssue,c=y?v>=90||t?.error?.quota?"Critical":v>=75?"Watch":"Healthy":"Unavailable";u.textContent=c,u.className=`badge ${c==="Critical"?"badge-danger":c==="Healthy"?"badge-success":"badge-info"}`,l.style.width=`${v}%`,l.closest('[role="progressbar"]')?.setAttribute?.("aria-valuenow",String(v)),d.textContent=y?`${f(i)} used of ${f(p)} (${v}%), ${f(h)} available`:"Browser storage estimate is unavailable in this environment.",o.replaceChildren(),[["Storage status",c],["Estimated usage",y?f(i):"Unavailable"],["Estimated quota",y?f(p):"Unavailable"],["Available space",y?f(h):"Unavailable"],["localStorage footprint",f(w)],["Last save issue",t?t.error?.quota?"Quota error":t.kind||"Storage warning":"None recorded"]].forEach(([b,e])=>{let a=document.createElement("div"),n=document.createElement("dt"),S=document.createElement("dd");n.textContent=b,S.textContent=e,a.append(n,S),o.appendChild(a)})};return g(),{update:g,timer:setInterval(g,3e4)}}}export{z as mountSettingsView};
//# sourceMappingURL=settingsRoute-LFII767U.js.map
