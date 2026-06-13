// src/views/helpRoute.js
function mountHelpView(deps = {}) {
  const {
    setView,
    Toast = window.PlasmaDeck?.Toast
  } = deps;
  setView(`
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
  `);
  const origin = document.getElementById("help-origin");
  if (origin) origin.textContent = window.location.origin || "Current browser origin";
  renderCatalogHealth();
  document.getElementById("help-backup-btn")?.addEventListener("click", () => {
    try {
      window.ProgressStats?.exportJSON?.();
    } catch {
      Toast.error("Export failed");
    }
  });
  document.getElementById("help-shortcuts-btn")?.addEventListener("click", () => {
    window.PlasmaDeck?.KeyboardShortcuts?._showHelp?.();
  });
}
async function renderCatalogHealth() {
  const root = document.querySelector("[data-catalog-health]");
  if (!root) return;
  const { topics, courses } = await (async () => {
    try {
      await window.DataStore?.init?.();
      return {
        topics: window.DataStore?.allTopics?.() ?? [],
        courses: window.DataStore?.allCourses?.() ?? window.DataStore?.courses?.() ?? []
      };
    } catch {
      return { topics: [], courses: [] };
    }
  })();
  if (!document.body.contains(root)) return;
  const sourceKeys = new Set(topics.map((topic) => `${topic.courseId || ""}:${topic.sourceIndex ?? topic.sourceLabel ?? ""}`));
  const videos = topics.reduce((sum, topic) => sum + (Array.isArray(topic.videos) ? topic.videos.length : topic.url ? 1 : 0), 0);
  const pdfs = topics.reduce((sum, topic) => sum + (Array.isArray(topic.pdfs) ? topic.pdfs.length : 0), 0);
  const noMedia = topics.filter((topic) => {
    const hasVideo = Array.isArray(topic.videos) && topic.videos.length || topic.url;
    const hasPdf = Array.isArray(topic.pdfs) && topic.pdfs.length;
    return !hasVideo && !hasPdf;
  }).length;
  const blankErrors = topics.filter((topic) => !String(topic.title ?? "").trim() && topic.error).length;
  root.replaceChildren();
  [
    ["Courses", courses.length],
    ["Sources", sourceKeys.size],
    ["Topics", topics.length],
    ["Videos", videos],
    ["PDFs", pdfs],
    ["No media topics", noMedia],
    ["Blank error topics", blankErrors]
  ].forEach(([label, value]) => {
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = String(value);
    row.append(dt, dd);
    root.appendChild(row);
  });
}
export {
  mountHelpView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3ZpZXdzL2hlbHBSb3V0ZS5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IGZ1bmN0aW9uIG1vdW50SGVscFZpZXcoZGVwcyA9IHt9KSB7XG4gIGNvbnN0IHtcbiAgICBzZXRWaWV3LFxuICAgIFRvYXN0ID0gd2luZG93LlBsYXNtYURlY2s/LlRvYXN0LFxuICB9ID0gZGVwcztcblxuICBzZXRWaWV3KGBcbiAgICA8c2VjdGlvbiBjbGFzcz1cInZpZXcgdmlldy1oZWxwXCI+XG4gICAgICA8ZGl2IGNsYXNzPVwicGFnZS1oZWFkZXJcIj5cbiAgICAgICAgPGRpdj5cbiAgICAgICAgICA8aDEgY2xhc3M9XCJwYWdlLXRpdGxlXCI+SGVscDwvaDE+XG4gICAgICAgICAgPHAgY2xhc3M9XCJwYWdlLXN1YnRpdGxlXCI+U3RhcnQgcXVpY2tseSwgZmluZCB5b3VyIGRhdGEsIGFuZCBrZWVwIHlvdXIgbGlicmFyeSBwb3J0YWJsZS48L3A+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwicGFnZS1hY3Rpb25zXCI+XG4gICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeVwiIGlkPVwiaGVscC1iYWNrdXAtYnRuXCI+XG4gICAgICAgICAgICA8aSBjbGFzcz1cImZhLXNvbGlkIGZhLWZpbGUtZXhwb3J0XCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+PC9pPlxuICAgICAgICAgICAgRXhwb3J0IGJhY2t1cFxuICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0XCIgaWQ9XCJoZWxwLXNob3J0Y3V0cy1idG5cIj5cbiAgICAgICAgICAgIDxpIGNsYXNzPVwiZmEtc29saWQgZmEta2V5Ym9hcmRcIiBhcmlhLWhpZGRlbj1cInRydWVcIj48L2k+XG4gICAgICAgICAgICBTaG9ydGN1dHNcbiAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L2Rpdj5cblxuICAgICAgPGRpdiBjbGFzcz1cImhlbHAtZ3JpZFwiPlxuICAgICAgICA8c2VjdGlvbiBjbGFzcz1cImNhcmQgY2FyZC1maWxsZWQgaGVscC1jYXJkIGhlbHAtY2FyZC1wcmltYXJ5XCI+XG4gICAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQtYm9keVwiPlxuICAgICAgICAgICAgPGgyIGNsYXNzPVwiaGVscC1jYXJkLXRpdGxlXCI+Rmlyc3QtcnVuIGNoZWNrbGlzdDwvaDI+XG4gICAgICAgICAgICA8b2wgY2xhc3M9XCJoZWxwLWNoZWNrbGlzdFwiPlxuICAgICAgICAgICAgICA8bGk+PHNwYW4gYXJpYS1oaWRkZW49XCJ0cnVlXCI+MTwvc3Bhbj48cD5TdGFydCB3aXRoIDxjb2RlPm5wbSBzdGFydDwvY29kZT4gb3IgdGhlIFdpbmRvd3MgbGF1bmNoZXIsIHRoZW4gb3BlbiA8Y29kZT5odHRwOi8vbG9jYWxob3N0OjUxNzMvPC9jb2RlPi48L3A+PC9saT5cbiAgICAgICAgICAgICAgPGxpPjxzcGFuIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPjI8L3NwYW4+PHA+VXNlIENvdXJzZXMgb3IgTWF0ZXJpYWxzIHRvIG9wZW4gY29udGVudCBmcm9tIHRoZSBhY3RpdmUgY2F0YWxvZy48L3A+PC9saT5cbiAgICAgICAgICAgICAgPGxpPjxzcGFuIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPjM8L3NwYW4+PHA+Q3JlYXRlIGEgbm90ZSwgdHJ5IHRoZSBQREYgdmlldywgYW5kIG9wZW4gU3R1ZGlvIGZvciBjYW52YXMgd29yay48L3A+PC9saT5cbiAgICAgICAgICAgICAgPGxpPjxzcGFuIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPjQ8L3NwYW4+PHA+RXhwb3J0IGEgYmFja3VwIGJlZm9yZSBzd2l0Y2hpbmcgcG9ydHMsIGJyb3dzZXJzLCBwcm9maWxlcywgb3IgY2F0YWxvZ3MuPC9wPjwvbGk+XG4gICAgICAgICAgICA8L29sPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L3NlY3Rpb24+XG5cbiAgICAgICAgPHNlY3Rpb24gY2xhc3M9XCJjYXJkIGNhcmQtZmlsbGVkIGhlbHAtY2FyZFwiPlxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLWJvZHlcIj5cbiAgICAgICAgICAgIDxoMiBjbGFzcz1cImhlbHAtY2FyZC10aXRsZVwiPldoZXJlIHlvdXIgZGF0YSBsaXZlczwvaDI+XG4gICAgICAgICAgICA8cD5QbGFzbWFEZWNrIHN0b3JlcyB5b3VyIGRhdGEgaW4gdGhpcyBicm93c2VyIHByb2ZpbGUgZm9yIHRoaXMgZXhhY3Qgb3JpZ2luLiBDaGFuZ2luZyBmcm9tIDxjb2RlPmxvY2FsaG9zdDo1MTczPC9jb2RlPiB0byBhbm90aGVyIHBvcnQgY3JlYXRlcyBhIGRpZmZlcmVudCBzdG9yYWdlIGJ1Y2tldC48L3A+XG4gICAgICAgICAgICA8ZGwgY2xhc3M9XCJoZWxwLWZhY3RzXCI+XG4gICAgICAgICAgICAgIDxkaXY+PGR0PlByb2dyZXNzPC9kdD48ZGQ+SW5kZXhlZERCPC9kZD48L2Rpdj5cbiAgICAgICAgICAgICAgPGRpdj48ZHQ+UHJlZmVyZW5jZXM8L2R0PjxkZD5sb2NhbFN0b3JhZ2U8L2RkPjwvZGl2PlxuICAgICAgICAgICAgICA8ZGl2PjxkdD5CYWNrdXBzPC9kdD48ZGQ+SlNPTiBleHBvcnQgZmlsZXM8L2RkPjwvZGl2PlxuICAgICAgICAgICAgICA8ZGl2PjxkdD5DdXJyZW50IG9yaWdpbjwvZHQ+PGRkIGlkPVwiaGVscC1vcmlnaW5cIj48L2RkPjwvZGl2PlxuICAgICAgICAgICAgPC9kbD5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9zZWN0aW9uPlxuXG4gICAgICAgIDxzZWN0aW9uIGNsYXNzPVwiY2FyZCBjYXJkLWZpbGxlZCBoZWxwLWNhcmRcIj5cbiAgICAgICAgICA8ZGl2IGNsYXNzPVwiY2FyZC1ib2R5XCI+XG4gICAgICAgICAgICA8aDIgY2xhc3M9XCJoZWxwLWNhcmQtdGl0bGVcIj5RdWljayBsaW5rczwvaDI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiaGVscC1saW5rc1wiIGFyaWEtbGFiZWw9XCJIZWxwIGxpbmtzXCI+XG4gICAgICAgICAgICAgIDxhIGhyZWY9XCJkb2NzL2dldHRpbmctc3RhcnRlZC5tZFwiPkdldHRpbmcgc3RhcnRlZDwvYT5cbiAgICAgICAgICAgICAgPGEgaHJlZj1cImRvY3MvY29udGVudC1hbmQtY2F0YWxvZy5tZFwiPkNvbnRlbnQgYW5kIGNhdGFsb2c8L2E+XG4gICAgICAgICAgICAgIDxhIGhyZWY9XCJkb2NzL2FyY2hpdGVjdHVyZS5tZFwiPkFyY2hpdGVjdHVyZSBhbmQgc3RvcmFnZTwvYT5cbiAgICAgICAgICAgICAgPGEgaHJlZj1cImRvY3MvYmFja3VwLXJlc3RvcmUubWRcIj5CYWNrdXAgYW5kIHJlc3RvcmU8L2E+XG4gICAgICAgICAgICAgIDxhIGhyZWY9XCJkb2NzL3Ryb3VibGVzaG9vdGluZy5tZFwiPlRyb3VibGVzaG9vdGluZzwvYT5cbiAgICAgICAgICAgICAgPGEgaHJlZj1cImRvY3Mvcm9hZG1hcC5tZFwiPlJvYWRtYXA8L2E+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9zZWN0aW9uPlxuXG4gICAgICAgIDxzZWN0aW9uIGNsYXNzPVwiY2FyZCBjYXJkLWZpbGxlZCBoZWxwLWNhcmRcIj5cbiAgICAgICAgICA8ZGl2IGNsYXNzPVwiY2FyZC1ib2R5XCI+XG4gICAgICAgICAgICA8aDIgY2xhc3M9XCJoZWxwLWNhcmQtdGl0bGVcIj5DYXRhbG9nIGhlYWx0aDwvaDI+XG4gICAgICAgICAgICA8ZGwgY2xhc3M9XCJoZWxwLWZhY3RzXCIgZGF0YS1jYXRhbG9nLWhlYWx0aD5cbiAgICAgICAgICAgICAgPGRpdj48ZHQ+U3RhdHVzPC9kdD48ZGQ+TG9hZGluZy4uLjwvZGQ+PC9kaXY+XG4gICAgICAgICAgICA8L2RsPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L3NlY3Rpb24+XG5cbiAgICAgICAgPHNlY3Rpb24gY2xhc3M9XCJjYXJkIGNhcmQtZmlsbGVkIGhlbHAtY2FyZFwiPlxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLWJvZHlcIj5cbiAgICAgICAgICAgIDxoMiBjbGFzcz1cImhlbHAtY2FyZC10aXRsZVwiPkNvbW1vbiByZWNvdmVyeSBtb3ZlczwvaDI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiaGVscC1yZWNvdmVyeS1saXN0XCI+XG4gICAgICAgICAgICAgIDxkaXY+XG4gICAgICAgICAgICAgICAgPHN0cm9uZz5CbGFuayBvciBzdHVjayBsb2FkaW5nPzwvc3Ryb25nPlxuICAgICAgICAgICAgICAgIDxwPlJ1biA8Y29kZT5ucG0gcnVuIGJ1aWxkPC9jb2RlPiwgaGFyZCByZWZyZXNoLCB0aGVuIG9wZW4gPGNvZGU+P2RlYnVnPTE8L2NvZGU+IGlmIGl0IHN0aWxsIHN0YWxscy48L3A+XG4gICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgIDxzdHJvbmc+RGF0YSBsb29rcyBtaXNzaW5nPzwvc3Ryb25nPlxuICAgICAgICAgICAgICAgIDxwPkNoZWNrIHRoYXQgeW91IGFyZSB1c2luZyB0aGUgc2FtZSBicm93c2VyLCBwcm9maWxlLCBob3N0bmFtZSwgYW5kIHBvcnQgYXMgYmVmb3JlLjwvcD5cbiAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgIDxkaXY+XG4gICAgICAgICAgICAgICAgPHN0cm9uZz5PZmZsaW5lIGFwcCBzZWVtcyBzdGFsZT88L3N0cm9uZz5cbiAgICAgICAgICAgICAgICA8cD5SdW4gPGNvZGU+bnBtIHJ1biBidWlsZDpzdzwvY29kZT4sIHJlbG9hZCBvbmNlIG9ubGluZSwgb3IgY2xlYXIgdGhlIHNlcnZpY2Ugd29ya2VyIGluIGJyb3dzZXIgZGV2dG9vbHMuPC9wPlxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L3NlY3Rpb24+XG5cbiAgICAgICAgPHNlY3Rpb24gY2xhc3M9XCJjYXJkIGNhcmQtZmlsbGVkIGhlbHAtY2FyZFwiPlxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLWJvZHlcIj5cbiAgICAgICAgICAgIDxoMiBjbGFzcz1cImhlbHAtY2FyZC10aXRsZVwiPktleWJvYXJkIGVzc2VudGlhbHM8L2gyPlxuICAgICAgICAgICAgPHRhYmxlIGNsYXNzPVwic2hvcnRjdXRzLXRhYmxlIGhlbHAtc2hvcnRjdXRzXCI+XG4gICAgICAgICAgICAgIDx0Ym9keT5cbiAgICAgICAgICAgICAgICA8dHI+PHRkPjxrYmQ+Q3RybCtLPC9rYmQ+PC90ZD48dGQ+Q29tbWFuZCBwYWxldHRlPC90ZD48L3RyPlxuICAgICAgICAgICAgICAgIDx0cj48dGQ+PGtiZD5DdHJsKy88L2tiZD48L3RkPjx0ZD5BbGwgc2hvcnRjdXRzPC90ZD48L3RyPlxuICAgICAgICAgICAgICAgIDx0cj48dGQ+PGtiZD5DdHJsK0I8L2tiZD48L3RkPjx0ZD5Ub2dnbGUgc2lkZWJhcjwvdGQ+PC90cj5cbiAgICAgICAgICAgICAgICA8dHI+PHRkPjxrYmQ+Q3RybCs9PC9rYmQ+PC90ZD48dGQ+SW5jcmVhc2UgVUkgZm9udCBzaXplPC90ZD48L3RyPlxuICAgICAgICAgICAgICAgIDx0cj48dGQ+PGtiZD5DdHJsKy08L2tiZD48L3RkPjx0ZD5EZWNyZWFzZSBVSSBmb250IHNpemU8L3RkPjwvdHI+XG4gICAgICAgICAgICAgIDwvdGJvZHk+XG4gICAgICAgICAgICA8L3RhYmxlPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L3NlY3Rpb24+XG4gICAgICA8L2Rpdj5cbiAgICA8L3NlY3Rpb24+XG4gIGApO1xuXG4gIGNvbnN0IG9yaWdpbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdoZWxwLW9yaWdpbicpO1xuICBpZiAob3JpZ2luKSBvcmlnaW4udGV4dENvbnRlbnQgPSB3aW5kb3cubG9jYXRpb24ub3JpZ2luIHx8ICdDdXJyZW50IGJyb3dzZXIgb3JpZ2luJztcbiAgcmVuZGVyQ2F0YWxvZ0hlYWx0aCgpO1xuXG4gIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdoZWxwLWJhY2t1cC1idG4nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgdHJ5IHsgd2luZG93LlByb2dyZXNzU3RhdHM/LmV4cG9ydEpTT04/LigpOyB9XG4gICAgY2F0Y2ggeyBUb2FzdC5lcnJvcignRXhwb3J0IGZhaWxlZCcpOyB9XG4gIH0pO1xuICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaGVscC1zaG9ydGN1dHMtYnRuJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgIHdpbmRvdy5QbGFzbWFEZWNrPy5LZXlib2FyZFNob3J0Y3V0cz8uX3Nob3dIZWxwPy4oKTtcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlbmRlckNhdGFsb2dIZWFsdGgoKSB7XG4gIGNvbnN0IHJvb3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1jYXRhbG9nLWhlYWx0aF0nKTtcbiAgaWYgKCFyb290KSByZXR1cm47XG4gIGNvbnN0IHsgdG9waWNzLCBjb3Vyc2VzIH0gPSBhd2FpdCAoYXN5bmMgKCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB3aW5kb3cuRGF0YVN0b3JlPy5pbml0Py4oKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHRvcGljczogd2luZG93LkRhdGFTdG9yZT8uYWxsVG9waWNzPy4oKSA/PyBbXSxcbiAgICAgICAgY291cnNlczogd2luZG93LkRhdGFTdG9yZT8uYWxsQ291cnNlcz8uKCkgPz8gd2luZG93LkRhdGFTdG9yZT8uY291cnNlcz8uKCkgPz8gW10sXG4gICAgICB9O1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHsgdG9waWNzOiBbXSwgY291cnNlczogW10gfTtcbiAgICB9XG4gIH0pKCk7XG4gIGlmICghZG9jdW1lbnQuYm9keS5jb250YWlucyhyb290KSkgcmV0dXJuO1xuXG4gIGNvbnN0IHNvdXJjZUtleXMgPSBuZXcgU2V0KHRvcGljcy5tYXAodG9waWMgPT4gYCR7dG9waWMuY291cnNlSWQgfHwgJyd9OiR7dG9waWMuc291cmNlSW5kZXggPz8gdG9waWMuc291cmNlTGFiZWwgPz8gJyd9YCkpO1xuICBjb25zdCB2aWRlb3MgPSB0b3BpY3MucmVkdWNlKChzdW0sIHRvcGljKSA9PiBzdW0gKyAoQXJyYXkuaXNBcnJheSh0b3BpYy52aWRlb3MpID8gdG9waWMudmlkZW9zLmxlbmd0aCA6IHRvcGljLnVybCA/IDEgOiAwKSwgMCk7XG4gIGNvbnN0IHBkZnMgPSB0b3BpY3MucmVkdWNlKChzdW0sIHRvcGljKSA9PiBzdW0gKyAoQXJyYXkuaXNBcnJheSh0b3BpYy5wZGZzKSA/IHRvcGljLnBkZnMubGVuZ3RoIDogMCksIDApO1xuICBjb25zdCBub01lZGlhID0gdG9waWNzLmZpbHRlcih0b3BpYyA9PiB7XG4gICAgY29uc3QgaGFzVmlkZW8gPSAoQXJyYXkuaXNBcnJheSh0b3BpYy52aWRlb3MpICYmIHRvcGljLnZpZGVvcy5sZW5ndGgpIHx8IHRvcGljLnVybDtcbiAgICBjb25zdCBoYXNQZGYgPSBBcnJheS5pc0FycmF5KHRvcGljLnBkZnMpICYmIHRvcGljLnBkZnMubGVuZ3RoO1xuICAgIHJldHVybiAhaGFzVmlkZW8gJiYgIWhhc1BkZjtcbiAgfSkubGVuZ3RoO1xuICBjb25zdCBibGFua0Vycm9ycyA9IHRvcGljcy5maWx0ZXIodG9waWMgPT4gIVN0cmluZyh0b3BpYy50aXRsZSA/PyAnJykudHJpbSgpICYmIHRvcGljLmVycm9yKS5sZW5ndGg7XG5cbiAgcm9vdC5yZXBsYWNlQ2hpbGRyZW4oKTtcbiAgW1xuICAgIFsnQ291cnNlcycsIGNvdXJzZXMubGVuZ3RoXSxcbiAgICBbJ1NvdXJjZXMnLCBzb3VyY2VLZXlzLnNpemVdLFxuICAgIFsnVG9waWNzJywgdG9waWNzLmxlbmd0aF0sXG4gICAgWydWaWRlb3MnLCB2aWRlb3NdLFxuICAgIFsnUERGcycsIHBkZnNdLFxuICAgIFsnTm8gbWVkaWEgdG9waWNzJywgbm9NZWRpYV0sXG4gICAgWydCbGFuayBlcnJvciB0b3BpY3MnLCBibGFua0Vycm9yc10sXG4gIF0uZm9yRWFjaCgoW2xhYmVsLCB2YWx1ZV0pID0+IHtcbiAgICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBjb25zdCBkdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2R0Jyk7XG4gICAgY29uc3QgZGQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkZCcpO1xuICAgIGR0LnRleHRDb250ZW50ID0gbGFiZWw7XG4gICAgZGQudGV4dENvbnRlbnQgPSBTdHJpbmcodmFsdWUpO1xuICAgIHJvdy5hcHBlbmQoZHQsIGRkKTtcbiAgICByb290LmFwcGVuZENoaWxkKHJvdyk7XG4gIH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFPLFNBQVMsY0FBYyxPQUFPLENBQUMsR0FBRztBQUN2QyxRQUFNO0FBQUEsSUFDSjtBQUFBLElBQ0EsUUFBUSxPQUFPLFlBQVk7QUFBQSxFQUM3QixJQUFJO0FBRUosVUFBUTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FB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
