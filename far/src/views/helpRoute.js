export function mountHelpView(deps = {}) {
  const {
    setView,
    Toast = window.OpenCourseDeck?.Toast
      // Fall back to no-ops: Toast may be unregistered during partial
      // init or in test harnesses, and a bare Toast.success() then threw
      // mid-handler, skipping the post-mutation UI refresh.
      ?? { success() {}, error() {}, info() {}, warning() {} },
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
            <p>OpenCourseDeck stores your data in this browser profile for this exact origin. Changing from <code>localhost:5173</code> to another port creates a different storage bucket.</p>
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

  const origin = document.getElementById('help-origin');
  if (origin) origin.textContent = window.location.origin || 'Current browser origin';
  renderCatalogHealth();

  document.getElementById('help-backup-btn')?.addEventListener('click', () => {
    try { window.ProgressStats?.exportJSON?.(); }
    catch { Toast.error('Export failed'); }
  });
  document.getElementById('help-shortcuts-btn')?.addEventListener('click', () => {
    window.OpenCourseDeck?.KeyboardShortcuts?._showHelp?.();
  });
}

async function renderCatalogHealth() {
  const root = document.querySelector('[data-catalog-health]');
  if (!root) return;
  const { topics, courses } = await (async () => {
    try {
      await window.DataStore?.init?.();
      return {
        topics: window.DataStore?.allTopics?.() ?? [],
        courses: window.DataStore?.allCourses?.() ?? window.DataStore?.courses?.() ?? [],
      };
    } catch {
      return { topics: [], courses: [] };
    }
  })();
  if (!document.body.contains(root)) return;

  const sourceKeys = new Set(topics.map(topic => `${topic.courseId || ''}:${topic.sourceIndex ?? topic.sourceLabel ?? ''}`));
  const videos = topics.reduce((sum, topic) => sum + (Array.isArray(topic.videos) ? topic.videos.length : topic.url ? 1 : 0), 0);
  const pdfs = topics.reduce((sum, topic) => sum + (Array.isArray(topic.pdfs) ? topic.pdfs.length : 0), 0);
  const noMedia = topics.filter(topic => {
    const hasVideo = (Array.isArray(topic.videos) && topic.videos.length) || topic.url;
    const hasPdf = Array.isArray(topic.pdfs) && topic.pdfs.length;
    return !hasVideo && !hasPdf;
  }).length;
  const blankErrors = topics.filter(topic => !String(topic.title ?? '').trim() && topic.error).length;

  root.replaceChildren();
  [
    ['Courses', courses.length],
    ['Sources', sourceKeys.size],
    ['Topics', topics.length],
    ['Videos', videos],
    ['PDFs', pdfs],
    ['No media topics', noMedia],
    ['Blank error topics', blankErrors],
  ].forEach(([label, value]) => {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = String(value);
    row.append(dt, dd);
    root.appendChild(row);
  });
}
