export function mountNotesView({ setView } = {}) {
  setView(`
    <section class="view view-notes">
      <div class="page-header notes-page-header">
        <div>
          <span class="eyebrow">Knowledge workspace</span>
          <h1 class="page-title">Notes</h1>
          <p class="page-subtitle">Capture ideas, connect them to learning materials, and keep every note available offline.</p>
        </div>
        <div class="notes-header-actions">
          <button class="btn btn-primary" type="button" data-action="new-note">
            <i class="fa-solid fa-plus" aria-hidden="true"></i>
            New note
          </button>
          <details class="notes-export-menu">
            <summary class="btn btn-ghost">
              <i class="fa-solid fa-ellipsis" aria-hidden="true"></i>
              More actions
            </summary>
            <div class="notes-export-popover">
              <button type="button" data-action="export-all"><i class="fa-solid fa-file-code" aria-hidden="true"></i>Export JSON</button>
              <button type="button" data-action="export-md"><i class="fa-brands fa-markdown" aria-hidden="true"></i>Export Markdown</button>
              <button type="button" data-action="import-notes"><i class="fa-solid fa-upload" aria-hidden="true"></i>Import notes</button>
            </div>
          </details>
        </div>
      </div>

      <div class="notes-shell">
        <aside class="notes-sidebar" aria-label="Notes library">
          <div class="notes-sidebar-head">
            <div>
              <span class="eyebrow">Library</span>
              <h2>Your notes</h2>
            </div>
            <button class="notes-quick-add" type="button" data-action="new-note" aria-label="Create a new note" title="Create a new note">
              <i class="fa-solid fa-plus" aria-hidden="true"></i>
            </button>
          </div>

          <div class="notes-search" role="search">
            <label class="notes-search-field">
              <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
              <span class="sr-only">Search notes</span>
              <input class="input" type="search" placeholder="Search notes…" data-notes-search autocomplete="off" />
            </label>
            <div class="notes-semantic-actions">
              <button class="btn btn-ghost btn-sm" type="button" data-notes-semantic-search hidden>
                <i class="fa-solid fa-brain" aria-hidden="true"></i>
                Semantic search
              </button>
              <button class="btn btn-ghost btn-sm" type="button" data-notes-semantic-clear hidden>Clear</button>
            </div>
            <div class="notes-semantic-status" data-notes-semantic-status aria-live="polite"></div>
          </div>

          <section class="notes-library-section" aria-labelledby="notes-folders-heading">
            <div class="notes-section-heading">
              <h3 id="notes-folders-heading">Folders</h3>
            </div>
            <div class="notes-folders" data-folders-panel></div>
          </section>

          <section class="notes-library-section notes-library-list" aria-labelledby="notes-list-heading">
            <div class="notes-section-heading">
              <h3 id="notes-list-heading">All notes</h3>
              <span class="notes-section-hint">Newest first</span>
            </div>
            <div class="notes-list" data-notes-list aria-live="polite"></div>
          </section>
        </aside>

        <main class="notes-main" data-notes-main-pane>
          <div class="notes-document-header">
            <div class="notes-top">
              <label class="sr-only" for="note-title-input">Note title</label>
              <input class="input notes-title" id="note-title-input" data-note-title-input placeholder="Untitled note" />
              <span class="notes-save" data-save-status aria-live="polite"></span>
            </div>

            <div class="notes-document-meta" aria-label="Note information">
              <span><i class="fa-solid fa-align-left" aria-hidden="true"></i><span data-note-words>0 words</span></span>
              <span><i class="fa-solid fa-font" aria-hidden="true"></i><span data-note-chars>0 characters</span></span>
              <span><i class="fa-regular fa-clock" aria-hidden="true"></i><span data-note-date>Not saved yet</span></span>
            </div>
          </div>

          <div class="notes-toolbar" data-notes-toolbar role="toolbar" aria-label="Note formatting tools">
            <div class="notes-toolbar-scroll">
              <div class="notes-tool-group" aria-label="Text emphasis">
                <button class="notes-tool-btn" type="button" data-cmd="bold" aria-label="Bold" title="Bold"><strong>B</strong></button>
                <button class="notes-tool-btn" type="button" data-cmd="italic" aria-label="Italic" title="Italic"><em>I</em></button>
                <button class="notes-tool-btn" type="button" data-cmd="underline" aria-label="Underline" title="Underline"><u>U</u></button>
                <button class="notes-tool-btn" type="button" data-cmd="strikethrough" aria-label="Strikethrough" title="Strikethrough"><s>S</s></button>
              </div>

              <div class="notes-tool-group" aria-label="Lists and blocks">
                <button class="notes-tool-btn" type="button" data-cmd="ul" aria-label="Bulleted list" title="Bulleted list"><i class="fa-solid fa-list-ul" aria-hidden="true"></i></button>
                <button class="notes-tool-btn" type="button" data-cmd="ol" aria-label="Numbered list" title="Numbered list"><i class="fa-solid fa-list-ol" aria-hidden="true"></i></button>
                <button class="notes-tool-btn" type="button" data-cmd="blockquote" aria-label="Block quote" title="Block quote"><i class="fa-solid fa-quote-left" aria-hidden="true"></i></button>
                <button class="notes-tool-btn" type="button" data-cmd="code" aria-label="Inline code" title="Inline code"><i class="fa-solid fa-code" aria-hidden="true"></i></button>
                <button class="notes-tool-btn" type="button" data-cmd-block data-cmd="codeblock" aria-label="Code block" title="Code block"><i class="fa-solid fa-file-code" aria-hidden="true"></i></button>
              </div>

              <div class="notes-tool-group" aria-label="Insert content">
                <button class="notes-tool-btn" type="button" data-cmd="link" aria-label="Insert link" title="Insert link"><i class="fa-solid fa-link" aria-hidden="true"></i></button>
                <button class="notes-tool-btn" type="button" data-cmd="image" aria-label="Insert image" title="Insert image"><i class="fa-regular fa-image" aria-hidden="true"></i></button>
                <button class="notes-tool-btn" type="button" data-cmd="hr" aria-label="Insert divider" title="Insert divider"><i class="fa-solid fa-minus" aria-hidden="true"></i></button>
              </div>

              <div class="notes-tool-group" aria-label="History and cleanup">
                <button class="notes-tool-btn" type="button" data-cmd="undo" aria-label="Undo" title="Undo"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i></button>
                <button class="notes-tool-btn" type="button" data-cmd="redo" aria-label="Redo" title="Redo"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i></button>
                <button class="notes-tool-btn" type="button" data-cmd="clearFormat" aria-label="Clear formatting" title="Clear formatting"><i class="fa-solid fa-eraser" aria-hidden="true"></i></button>
              </div>

              <button class="notes-ai-action" type="button" data-ai-summarize hidden>
                <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
                Summarize
              </button>
            </div>

            <div class="notes-format-row">
              <label class="notes-format-control">
                <span>Size</span>
                <select class="input input-sm" data-font-size aria-label="Text size">
                  <option value="12px">12</option>
                  <option value="14px">14</option>
                  <option value="16px" selected>16</option>
                  <option value="18px">18</option>
                  <option value="22px">22</option>
                  <option value="28px">28</option>
                </select>
              </label>
              <label class="notes-format-control">
                <span>Font</span>
                <select class="input input-sm" data-font-family aria-label="Font family">
                  <option value="Inter">Inter</option>
                  <option value="JetBrains Mono">JetBrains Mono</option>
                  <option value="Playfair Display">Playfair Display</option>
                  <option value="system-ui">System</option>
                </select>
              </label>
              <label class="notes-color-control">
                <span>Text</span>
                <input type="color" data-text-color value="#e5e7eb" aria-label="Text color" />
              </label>
              <label class="notes-color-control">
                <span>Highlight</span>
                <input type="color" data-highlight-color value="#f59e0b" aria-label="Highlight color" />
              </label>
            </div>
          </div>

          <div class="notes-editor-wrap">
            <div class="notes-editor" data-notes-editor role="textbox" aria-multiline="true" aria-label="Note editor"></div>
          </div>

          <footer class="notes-footer">
            <div class="notes-tags" data-tags-cloud aria-label="Note tags"></div>
            <span class="notes-privacy-note"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>Stored locally on this device</span>
          </footer>
        </main>
      </div>
    </section>
  `);

  try { window.PlasmaNotesApp?.init?.(); } catch (error) {
    console.warn('[Notes view] init failed', error);
  }
  return {
    beforeLeave() {
      try { window.PlasmaNotesApp?.flushPendingSave?.(); } catch {}
    },
    unmount() {
      try { window.PlasmaNotesApp?.destroy?.(); } catch {}
    },
  };
}
