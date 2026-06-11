function s({setView:t}={}){t(`
    <section class="view view-notes">
      <div class="page-header">
        <h1 class="page-title">Notes</h1>
        <p class="page-subtitle">Local-first rich notes.</p>
      </div>

      <div class="notes-shell">
        <aside class="notes-sidebar">
          <div class="notes-actions">
            <button class="btn btn-primary" data-action="new-note">New note</button>
            <button class="btn btn-ghost" data-action="export-all">Export JSON</button>
            <button class="btn btn-ghost" data-action="export-md">Export MD</button>
            <button class="btn btn-ghost" data-action="import-notes">Import</button>
          </div>

          <div class="notes-search">
            <input class="input" type="search" placeholder="Search notes..." data-notes-search />
            <div class="button-row" style="margin-top:8px">
              <button class="btn btn-ghost btn-sm" type="button" data-notes-semantic-search hidden>Semantic search</button>
              <button class="btn btn-ghost btn-sm" type="button" data-notes-semantic-clear hidden>Clear semantic</button>
            </div>
            <div class="text-sm" data-notes-semantic-status aria-live="polite" style="opacity:.75;margin-top:4px"></div>
          </div>

          <div class="notes-folders" data-folders-panel></div>
          <div class="notes-list" data-notes-list></div>
        </aside>

        <main class="notes-main" data-notes-main-pane>
          <div class="notes-top">
            <input class="input notes-title" data-note-title-input placeholder="Title" />
            <span class="notes-save" data-save-status></span>
          </div>

          <div class="notes-toolbar" data-notes-toolbar>
            <div class="notes-toolbar-row">
              <button class="btn btn-ghost" data-cmd="bold"><strong>B</strong></button>
              <button class="btn btn-ghost" data-cmd="italic"><em>I</em></button>
              <button class="btn btn-ghost" data-cmd="underline"><u>U</u></button>
              <button class="btn btn-ghost" data-cmd="strikethrough"><s>S</s></button>
              <button class="btn btn-ghost" data-cmd="ul">- List</button>
              <button class="btn btn-ghost" data-cmd="ol">1. List</button>
              <button class="btn btn-ghost" data-cmd="blockquote">Quote</button>
              <button class="btn btn-ghost" data-cmd="code">Code</button>
              <button class="btn btn-ghost" data-cmd-block data-cmd="codeblock">Code block</button>
              <button class="btn btn-ghost" data-cmd="link">Link</button>
              <button class="btn btn-ghost" data-cmd="image">Image</button>
              <button class="btn btn-ghost" data-cmd="hr">HR</button>
              <button class="btn btn-ghost" data-cmd="undo">Undo</button>
              <button class="btn btn-ghost" data-cmd="redo">Redo</button>
              <button class="btn btn-ghost" data-cmd="clearFormat">Clear</button>
              <button class="btn btn-ghost" data-ai-summarize hidden>Summarize note</button>
            </div>
            <div class="notes-toolbar-row" style="gap:10px;flex-wrap:wrap;margin-top:8px">
              <label style="display:flex;align-items:center;gap:6px">
                <span style="opacity:.75">Size</span>
                <select class="input input-sm" data-font-size>
                  <option value="12px">12</option>
                  <option value="14px">14</option>
                  <option value="16px" selected>16</option>
                  <option value="18px">18</option>
                  <option value="22px">22</option>
                  <option value="28px">28</option>
                </select>
              </label>
              <label style="display:flex;align-items:center;gap:6px">
                <span style="opacity:.75">Font</span>
                <select class="input input-sm" data-font-family>
                  <option value="Inter">Inter</option>
                  <option value="JetBrains Mono">JetBrains Mono</option>
                  <option value="Playfair Display">Playfair Display</option>
                  <option value="system-ui">System</option>
                </select>
              </label>
              <label style="display:flex;align-items:center;gap:6px">
                <span style="opacity:.75">Text</span>
                <input type="color" data-text-color value="#e5e7eb" />
              </label>
              <label style="display:flex;align-items:center;gap:6px">
                <span style="opacity:.75">Highlight</span>
                <input type="color" data-highlight-color value="#f59e0b" />
              </label>
            </div>
          </div>
          <div class="notes-editor-wrap">
            <div class="notes-editor" data-notes-editor></div>
          </div>

          <div class="notes-meta">
            <span data-note-words></span>
            <span data-note-chars></span>
            <span data-note-date></span>
          </div>

          <div class="notes-tags" data-tags-cloud></div>
        </main>
      </div>
    </section>
  `);try{window.PlasmaNotesApp?.init?.()}catch(a){}return{beforeLeave(){try{window.PlasmaNotesApp?.flushPendingSave?.()}catch{}},unmount(){try{window.PlasmaNotesApp?.destroy?.()}catch{}}}}export{s as mountNotesView};
//# sourceMappingURL=notesRoute-CPTHEGA6.js.map
