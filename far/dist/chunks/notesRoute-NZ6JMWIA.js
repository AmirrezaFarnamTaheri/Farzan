// src/views/notesRoute.js
function mountNotesView({ setView } = {}) {
  setView(`
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
  `);
  try {
    window.PlasmaNotesApp?.init?.();
  } catch (e) {
    console.warn("[Notes view] init failed", e);
  }
  return {
    beforeLeave() {
      try {
        window.PlasmaNotesApp?.flushPendingSave?.();
      } catch {
      }
    },
    unmount() {
      try {
        window.PlasmaNotesApp?.destroy?.();
      } catch {
      }
    }
  };
}
export {
  mountNotesView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3ZpZXdzL25vdGVzUm91dGUuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImV4cG9ydCBmdW5jdGlvbiBtb3VudE5vdGVzVmlldyh7IHNldFZpZXcgfSA9IHt9KSB7XG4gIHNldFZpZXcoYFxuICAgIDxzZWN0aW9uIGNsYXNzPVwidmlldyB2aWV3LW5vdGVzXCI+XG4gICAgICA8ZGl2IGNsYXNzPVwicGFnZS1oZWFkZXJcIj5cbiAgICAgICAgPGgxIGNsYXNzPVwicGFnZS10aXRsZVwiPk5vdGVzPC9oMT5cbiAgICAgICAgPHAgY2xhc3M9XCJwYWdlLXN1YnRpdGxlXCI+TG9jYWwtZmlyc3QgcmljaCBub3Rlcy48L3A+XG4gICAgICA8L2Rpdj5cblxuICAgICAgPGRpdiBjbGFzcz1cIm5vdGVzLXNoZWxsXCI+XG4gICAgICAgIDxhc2lkZSBjbGFzcz1cIm5vdGVzLXNpZGViYXJcIj5cbiAgICAgICAgICA8ZGl2IGNsYXNzPVwibm90ZXMtYWN0aW9uc1wiPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeVwiIGRhdGEtYWN0aW9uPVwibmV3LW5vdGVcIj5OZXcgbm90ZTwvYnV0dG9uPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBkYXRhLWFjdGlvbj1cImV4cG9ydC1hbGxcIj5FeHBvcnQgSlNPTjwvYnV0dG9uPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBkYXRhLWFjdGlvbj1cImV4cG9ydC1tZFwiPkV4cG9ydCBNRDwvYnV0dG9uPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBkYXRhLWFjdGlvbj1cImltcG9ydC1ub3Rlc1wiPkltcG9ydDwvYnV0dG9uPlxuICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgPGRpdiBjbGFzcz1cIm5vdGVzLXNlYXJjaFwiPlxuICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiaW5wdXRcIiB0eXBlPVwic2VhcmNoXCIgcGxhY2Vob2xkZXI9XCJTZWFyY2ggbm90ZXMuLi5cIiBkYXRhLW5vdGVzLXNlYXJjaCAvPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImJ1dHRvbi1yb3dcIiBzdHlsZT1cIm1hcmdpbi10b3A6OHB4XCI+XG4gICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0IGJ0bi1zbVwiIHR5cGU9XCJidXR0b25cIiBkYXRhLW5vdGVzLXNlbWFudGljLXNlYXJjaCBoaWRkZW4+U2VtYW50aWMgc2VhcmNoPC9idXR0b24+XG4gICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0IGJ0bi1zbVwiIHR5cGU9XCJidXR0b25cIiBkYXRhLW5vdGVzLXNlbWFudGljLWNsZWFyIGhpZGRlbj5DbGVhciBzZW1hbnRpYzwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwidGV4dC1zbVwiIGRhdGEtbm90ZXMtc2VtYW50aWMtc3RhdHVzIGFyaWEtbGl2ZT1cInBvbGl0ZVwiIHN0eWxlPVwib3BhY2l0eTouNzU7bWFyZ2luLXRvcDo0cHhcIj48L2Rpdj5cbiAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJub3Rlcy1mb2xkZXJzXCIgZGF0YS1mb2xkZXJzLXBhbmVsPjwvZGl2PlxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJub3Rlcy1saXN0XCIgZGF0YS1ub3Rlcy1saXN0PjwvZGl2PlxuICAgICAgICA8L2FzaWRlPlxuXG4gICAgICAgIDxtYWluIGNsYXNzPVwibm90ZXMtbWFpblwiIGRhdGEtbm90ZXMtbWFpbi1wYW5lPlxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJub3Rlcy10b3BcIj5cbiAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImlucHV0IG5vdGVzLXRpdGxlXCIgZGF0YS1ub3RlLXRpdGxlLWlucHV0IHBsYWNlaG9sZGVyPVwiVGl0bGVcIiAvPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJub3Rlcy1zYXZlXCIgZGF0YS1zYXZlLXN0YXR1cz48L3NwYW4+XG4gICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICA8ZGl2IGNsYXNzPVwibm90ZXMtdG9vbGJhclwiIGRhdGEtbm90ZXMtdG9vbGJhcj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJub3Rlcy10b29sYmFyLXJvd1wiPlxuICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdFwiIGRhdGEtY21kPVwiYm9sZFwiPjxzdHJvbmc+Qjwvc3Ryb25nPjwvYnV0dG9uPlxuICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdFwiIGRhdGEtY21kPVwiaXRhbGljXCI+PGVtPkk8L2VtPjwvYnV0dG9uPlxuICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdFwiIGRhdGEtY21kPVwidW5kZXJsaW5lXCI+PHU+VTwvdT48L2J1dHRvbj5cbiAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBkYXRhLWNtZD1cInN0cmlrZXRocm91Z2hcIj48cz5TPC9zPjwvYnV0dG9uPlxuICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdFwiIGRhdGEtY21kPVwidWxcIj4tIExpc3Q8L2J1dHRvbj5cbiAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBkYXRhLWNtZD1cIm9sXCI+MS4gTGlzdDwvYnV0dG9uPlxuICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdFwiIGRhdGEtY21kPVwiYmxvY2txdW90ZVwiPlF1b3RlPC9idXR0b24+XG4gICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0XCIgZGF0YS1jbWQ9XCJjb2RlXCI+Q29kZTwvYnV0dG9uPlxuICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdFwiIGRhdGEtY21kLWJsb2NrIGRhdGEtY21kPVwiY29kZWJsb2NrXCI+Q29kZSBibG9jazwvYnV0dG9uPlxuICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdFwiIGRhdGEtY21kPVwibGlua1wiPkxpbms8L2J1dHRvbj5cbiAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBkYXRhLWNtZD1cImltYWdlXCI+SW1hZ2U8L2J1dHRvbj5cbiAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBkYXRhLWNtZD1cImhyXCI+SFI8L2J1dHRvbj5cbiAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBkYXRhLWNtZD1cInVuZG9cIj5VbmRvPC9idXR0b24+XG4gICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0XCIgZGF0YS1jbWQ9XCJyZWRvXCI+UmVkbzwvYnV0dG9uPlxuICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdFwiIGRhdGEtY21kPVwiY2xlYXJGb3JtYXRcIj5DbGVhcjwvYnV0dG9uPlxuICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdFwiIGRhdGEtYWktc3VtbWFyaXplIGhpZGRlbj5TdW1tYXJpemUgbm90ZTwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwibm90ZXMtdG9vbGJhci1yb3dcIiBzdHlsZT1cImdhcDoxMHB4O2ZsZXgtd3JhcDp3cmFwO21hcmdpbi10b3A6OHB4XCI+XG4gICAgICAgICAgICAgIDxsYWJlbCBzdHlsZT1cImRpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjZweFwiPlxuICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwib3BhY2l0eTouNzVcIj5TaXplPC9zcGFuPlxuICAgICAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJpbnB1dCBpbnB1dC1zbVwiIGRhdGEtZm9udC1zaXplPlxuICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIjEycHhcIj4xMjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIjE0cHhcIj4xNDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIjE2cHhcIiBzZWxlY3RlZD4xNjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIjE4cHhcIj4xODwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIjIycHhcIj4yMjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIjI4cHhcIj4yODwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgICA8L2xhYmVsPlxuICAgICAgICAgICAgICA8bGFiZWwgc3R5bGU9XCJkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo2cHhcIj5cbiAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cIm9wYWNpdHk6Ljc1XCI+Rm9udDwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwiaW5wdXQgaW5wdXQtc21cIiBkYXRhLWZvbnQtZmFtaWx5PlxuICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIkludGVyXCI+SW50ZXI8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJKZXRCcmFpbnMgTW9ub1wiPkpldEJyYWlucyBNb25vPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiUGxheWZhaXIgRGlzcGxheVwiPlBsYXlmYWlyIERpc3BsYXk8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzeXN0ZW0tdWlcIj5TeXN0ZW08L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgICAgICAgPGxhYmVsIHN0eWxlPVwiZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4XCI+XG4gICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJvcGFjaXR5Oi43NVwiPlRleHQ8L3NwYW4+XG4gICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjb2xvclwiIGRhdGEtdGV4dC1jb2xvciB2YWx1ZT1cIiNlNWU3ZWJcIiAvPlxuICAgICAgICAgICAgICA8L2xhYmVsPlxuICAgICAgICAgICAgICA8bGFiZWwgc3R5bGU9XCJkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo2cHhcIj5cbiAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cIm9wYWNpdHk6Ljc1XCI+SGlnaGxpZ2h0PC9zcGFuPlxuICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY29sb3JcIiBkYXRhLWhpZ2hsaWdodC1jb2xvciB2YWx1ZT1cIiNmNTllMGJcIiAvPlxuICAgICAgICAgICAgICA8L2xhYmVsPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPGRpdiBjbGFzcz1cIm5vdGVzLWVkaXRvci13cmFwXCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwibm90ZXMtZWRpdG9yXCIgZGF0YS1ub3Rlcy1lZGl0b3I+PC9kaXY+XG4gICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICA8ZGl2IGNsYXNzPVwibm90ZXMtbWV0YVwiPlxuICAgICAgICAgICAgPHNwYW4gZGF0YS1ub3RlLXdvcmRzPjwvc3Bhbj5cbiAgICAgICAgICAgIDxzcGFuIGRhdGEtbm90ZS1jaGFycz48L3NwYW4+XG4gICAgICAgICAgICA8c3BhbiBkYXRhLW5vdGUtZGF0ZT48L3NwYW4+XG4gICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICA8ZGl2IGNsYXNzPVwibm90ZXMtdGFnc1wiIGRhdGEtdGFncy1jbG91ZD48L2Rpdj5cbiAgICAgICAgPC9tYWluPlxuICAgICAgPC9kaXY+XG4gICAgPC9zZWN0aW9uPlxuICBgKTtcblxuICB0cnkgeyB3aW5kb3cuUGxhc21hTm90ZXNBcHA/LmluaXQ/LigpOyB9IGNhdGNoIChlKSB7IGNvbnNvbGUud2FybignW05vdGVzIHZpZXddIGluaXQgZmFpbGVkJywgZSk7IH1cbiAgcmV0dXJuIHtcbiAgICBiZWZvcmVMZWF2ZSgpIHtcbiAgICAgIHRyeSB7IHdpbmRvdy5QbGFzbWFOb3Rlc0FwcD8uZmx1c2hQZW5kaW5nU2F2ZT8uKCk7IH0gY2F0Y2gge31cbiAgICB9LFxuICAgIHVubW91bnQoKSB7XG4gICAgICB0cnkgeyB3aW5kb3cuUGxhc21hTm90ZXNBcHA/LmRlc3Ryb3k/LigpOyB9IGNhdGNoIHt9XG4gICAgfSxcbiAgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBTyxTQUFTLGVBQWUsRUFBRSxRQUFRLElBQUksQ0FBQyxHQUFHO0FBQy9DLFVBQVE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsR0FtR1A7QUFFRCxNQUFJO0FBQUUsV0FBTyxnQkFBZ0IsT0FBTztBQUFBLEVBQUcsU0FBUyxHQUFHO0FBQUUsWUFBUSxLQUFLLDRCQUE0QixDQUFDO0FBQUEsRUFBRztBQUNsRyxTQUFPO0FBQUEsSUFDTCxjQUFjO0FBQ1osVUFBSTtBQUFFLGVBQU8sZ0JBQWdCLG1CQUFtQjtBQUFBLE1BQUcsUUFBUTtBQUFBLE1BQUM7QUFBQSxJQUM5RDtBQUFBLElBQ0EsVUFBVTtBQUNSLFVBQUk7QUFBRSxlQUFPLGdCQUFnQixVQUFVO0FBQUEsTUFBRyxRQUFRO0FBQUEsTUFBQztBQUFBLElBQ3JEO0FBQUEsRUFDRjtBQUNGOyIsCiAgIm5hbWVzIjogW10KfQo=
