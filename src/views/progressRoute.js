export function mountProgressView({ setView } = {}) {
  setView(`
    <section class="view view-progress">
      <div class="page-header progress-page-header">
        <div>
          <h1 class="page-title">Progress</h1>
          <p class="page-subtitle">See completed topics and activity. Export or restore saved study data.</p>
        </div>

        <div class="progress-toolbar" aria-label="Progress data actions">
          <details class="progress-export-menu">
            <summary class="btn btn-primary" aria-label="Data and backup options">
              <svg class="icon" aria-hidden="true"><use href="#i-download"/></svg>
              Data &amp; backups
            </summary>
            <div class="progress-export-popover" role="group" aria-label="Backup and export formats">
              <p class="progress-export-label">Backup &amp; restore</p>
              <button type="button" id="btn-export-json" aria-label="Export app-data JSON">Export app-data JSON</button>
              <button type="button" id="btn-import-json">Import backup</button>
              <p class="progress-export-label progress-export-other">Other formats</p>
              <button type="button" id="btn-export-csv">Export CSV</button>
              <button type="button" id="btn-export-md">Export Notes Markdown</button>
              <button type="button" id="btn-export-vault">Export Vault Markdown</button>
              <button type="button" id="btn-export-vault-archive">Export Vault Archive</button>
              <button type="button" id="btn-export-vault-zip">Export Vault ZIP</button>
              <button type="button" id="btn-export-vault-directory">Export Vault Folder</button>
            </div>
          </details>
          <details class="progress-manage-menu">
            <summary class="btn btn-ghost" aria-label="Manage saved data">
              <svg class="icon" aria-hidden="true"><use href="#i-more-h"/></svg>
              Manage data
            </summary>
            <div class="progress-manage-popover" role="group" aria-label="Destructive data actions">
              <p>Reset removes saved learning progress and local study data. Export a backup first.</p>
              <button class="btn btn-danger" id="btn-reset-all" type="button">
                <svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg>
                Reset all
              </button>
            </div>
          </details>
        </div>
      </div>

            <div class="progress-metric-grid" aria-label="Learning summary" aria-busy="true" data-progress-loading>
        <article class="progress-metric progress-metric-featured">
          <span class="progress-metric-label">Completion</span>
          <strong id="stat-completion-pct">—</strong>
          <span class="progress-metric-note progress-completion-detail">
            <span id="stat-done-topics">—</span> of <span id="stat-total-topics">—</span> topics done
          </span>
          <div class="mini-bar-wrap progress-overall-track" aria-hidden="true">
            <div class="mini-bar" id="stat-overall-bar"></div>
          </div>
        </article>

        <article class="progress-metric">
          <span class="progress-metric-label">In progress</span>
          <strong id="stat-in-progress">—</strong>
          <span class="progress-metric-note">Active learning threads</span>
        </article>

        <article class="progress-metric">
          <span class="progress-metric-label">Study time</span>
          <strong id="stat-watched-time">—</strong>
          <span class="progress-metric-note">Recorded watch time</span>
        </article>

        <article class="progress-metric">
          <span class="progress-metric-label">Current streak</span>
          <strong><span id="stat-streak">—</span><small id="stat-streak-unit"></small></strong>
          <span class="progress-metric-note">Consecutive active days</span>
        </article>

        <article class="progress-metric">
          <span class="progress-metric-label">Active days</span>
          <strong><span id="stat-active-days">—</span><small id="stat-active-days-unit"></small></strong>
          <span class="progress-metric-note">Days with study activity</span>
        </article>
      </div>

      <div class="progress-dashboard-grid">
        <section class="card card-filled progress-chart-card" aria-labelledby="progress-overall-title">
          <div class="card-body">
            <div class="progress-card-heading">
              <div>
                <h2 id="progress-overall-title">Topic status</h2>
              </div>
              <span class="progress-card-hint">Completed vs active</span>
            </div>
            <div class="progress-chart-frame">
              <canvas id="chart-overall" height="220" aria-label="Overall progress chart"></canvas>
            </div>
          </div>
        </section>

        <section class="card card-filled progress-chart-card progress-chart-card-wide" aria-labelledby="progress-courses-title">
          <div class="card-body">
            <div class="progress-card-heading">
              <div>
                <h2 id="progress-courses-title">Completion by course</h2>
              </div>
              <span class="progress-card-hint">Relative progress</span>
            </div>
            <div class="progress-chart-frame progress-chart-frame-wide">
              <canvas id="chart-courses" height="220" aria-label="Course completion chart"></canvas>
            </div>
          </div>
        </section>

        <section class="card card-filled progress-table-card" aria-labelledby="progress-table-title">
          <div class="card-body">
            <div class="progress-card-heading">
              <div>
                <h2 id="progress-table-title">Course performance</h2>
              </div>
              <span class="progress-card-hint">Scroll horizontally on small screens</span>
            </div>
            <div class="progress-table-wrap" tabindex="0" role="region" aria-label="Course performance table">
              <table class="table progress-table">
                <thead>
                  <tr>
                    <th scope="col">Course</th>
                    <th scope="col">Total</th>
                    <th scope="col">Done</th>
                    <th scope="col">In progress</th>
                    <th scope="col">Completion</th>
                    <th scope="col">Watch time</th>
                    <th scope="col">Last activity</th>
                  </tr>
                </thead>
                <tbody id="stat-course-table-body"></tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </section>
  `);

  const loadingRegion = document.querySelector('[data-progress-loading]');
  const ready = Promise.resolve(window.OpenCourseDeck?.ProgressStatsInit?.())
    .then(() => {
      loadingRegion?.setAttribute('aria-busy', 'false');
    })
    .catch((error) => {
      loadingRegion?.setAttribute('aria-busy', 'false');
      const alert = document.createElement('p');
      alert.className = 'progress-load-error';
      alert.setAttribute('role', 'alert');
      alert.textContent = 'Learning history could not be loaded. Your stored data was not changed.';
      loadingRegion?.prepend(alert);
      console.error('[Progress] history load failed', error);
    });
  return {
    ready,
    unmount() {
      try { window.OpenCourseDeck?.ProgressStats?.destroy?.(); } catch {}
    },
  };
}
