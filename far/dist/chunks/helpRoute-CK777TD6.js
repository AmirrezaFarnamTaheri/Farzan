function b(a={}){let{setView:d,Toast:o=window.PlasmaDeck?.Toast}=a;d(`
    <section class="view view-help">
      <div class="page-header">
        <div>
          <h1 class="page-title">Help</h1>
          <p class="page-subtitle">Start quickly, find your data, and keep your library portable.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="help-backup-btn">
            <i class="fa-solid fa-file-export" aria-hidden="true"></i>
            Export backup
          </button>
          <button class="btn btn-ghost" id="help-shortcuts-btn">
            <i class="fa-solid fa-keyboard" aria-hidden="true"></i>
            Shortcuts
          </button>
        </div>
      </div>

      <div class="help-grid">
        <section class="card card-filled help-card help-card-primary">
          <div class="card-body">
            <h2 class="help-card-title">First-run checklist</h2>
            <ol class="help-checklist">
              <li><span aria-hidden="true">1</span><p>Start with <code>npm start</code> or the Windows launcher, then open <code>http://localhost:5173/</code>.</p></li>
              <li><span aria-hidden="true">2</span><p>Use Courses or Materials to open content from the active catalog.</p></li>
              <li><span aria-hidden="true">3</span><p>Create a note, try the PDF view, and open Studio for canvas work.</p></li>
              <li><span aria-hidden="true">4</span><p>Export a backup before switching ports, browsers, profiles, or catalogs.</p></li>
            </ol>
          </div>
        </section>

        <section class="card card-filled help-card">
          <div class="card-body">
            <h2 class="help-card-title">Where your data lives</h2>
            <p>PlasmaDeck stores your data in this browser profile for this exact origin. Changing from <code>localhost:5173</code> to another port creates a different storage bucket.</p>
            <dl class="help-facts">
              <div><dt>Progress</dt><dd>IndexedDB</dd></div>
              <div><dt>Preferences</dt><dd>localStorage</dd></div>
              <div><dt>Backups</dt><dd>JSON export files</dd></div>
              <div><dt>Current origin</dt><dd id="help-origin"></dd></div>
            </dl>
          </div>
        </section>

        <section class="card card-filled help-card">
          <div class="card-body">
            <h2 class="help-card-title">Quick links</h2>
            <div class="help-links" aria-label="Help links">
              <a href="docs/getting-started.md">Getting started</a>
              <a href="docs/content-and-catalog.md">Content and catalog</a>
              <a href="docs/architecture.md">Architecture and storage</a>
              <a href="docs/backup-restore.md">Backup and restore</a>
              <a href="docs/troubleshooting.md">Troubleshooting</a>
              <a href="docs/roadmap.md">Roadmap</a>
            </div>
          </div>
        </section>

        <section class="card card-filled help-card">
          <div class="card-body">
            <h2 class="help-card-title">Catalog health</h2>
            <dl class="help-facts" data-catalog-health>
              <div><dt>Status</dt><dd>Loading...</dd></div>
            </dl>
          </div>
        </section>

        <section class="card card-filled help-card">
          <div class="card-body">
            <h2 class="help-card-title">Common recovery moves</h2>
            <div class="help-recovery-list">
              <div>
                <strong>Blank or stuck loading?</strong>
                <p>Run <code>npm run build</code>, hard refresh, then open <code>?debug=1</code> if it still stalls.</p>
              </div>
              <div>
                <strong>Data looks missing?</strong>
                <p>Check that you are using the same browser, profile, hostname, and port as before.</p>
              </div>
              <div>
                <strong>Offline app seems stale?</strong>
                <p>Run <code>npm run build:sw</code>, reload once online, or clear the service worker in browser devtools.</p>
              </div>
            </div>
          </div>
        </section>

        <section class="card card-filled help-card">
          <div class="card-body">
            <h2 class="help-card-title">Keyboard essentials</h2>
            <table class="shortcuts-table help-shortcuts">
              <tbody>
                <tr><td><kbd>Ctrl+K</kbd></td><td>Command palette</td></tr>
                <tr><td><kbd>Ctrl+/</kbd></td><td>All shortcuts</td></tr>
                <tr><td><kbd>Ctrl+B</kbd></td><td>Toggle sidebar</td></tr>
                <tr><td><kbd>Ctrl+=</kbd></td><td>Increase UI font size</td></tr>
                <tr><td><kbd>Ctrl+-</kbd></td><td>Decrease UI font size</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  `);let r=document.getElementById("help-origin");r&&(r.textContent=window.location.origin||"Current browser origin"),u(),document.getElementById("help-backup-btn")?.addEventListener("click",()=>{try{window.ProgressStats?.exportJSON?.()}catch{o.error("Export failed")}}),document.getElementById("help-shortcuts-btn")?.addEventListener("click",()=>{window.PlasmaDeck?.KeyboardShortcuts?._showHelp?.()})}async function u(){let a=document.querySelector("[data-catalog-health]");if(!a)return;let{topics:d,courses:o}=await(async()=>{try{return await window.DataStore?.init?.(),{topics:window.DataStore?.allTopics?.()??[],courses:window.DataStore?.allCourses?.()??window.DataStore?.courses?.()??[]}}catch{return{topics:[],courses:[]}}})();if(!document.body.contains(a))return;let r=new Set(d.map(e=>`${e.courseId||""}:${e.sourceIndex??e.sourceLabel??""}`)),l=d.reduce((e,t)=>e+(Array.isArray(t.videos)?t.videos.length:t.url?1:0),0),n=d.reduce((e,t)=>e+(Array.isArray(t.pdfs)?t.pdfs.length:0),0),h=d.filter(e=>{let t=Array.isArray(e.videos)&&e.videos.length||e.url,s=Array.isArray(e.pdfs)&&e.pdfs.length;return!t&&!s}).length,p=d.filter(e=>!String(e.title??"").trim()&&e.error).length;a.replaceChildren(),[["Courses",o.length],["Sources",r.size],["Topics",d.length],["Videos",l],["PDFs",n],["No media topics",h],["Blank error topics",p]].forEach(([e,t])=>{let s=document.createElement("div"),i=document.createElement("dt"),c=document.createElement("dd");i.textContent=e,c.textContent=String(t),s.append(i,c),a.appendChild(s)})}export{b as mountHelpView};
//# sourceMappingURL=helpRoute-CK777TD6.js.map
