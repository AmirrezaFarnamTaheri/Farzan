export function mountProgressView({ setView } = {}) {
  setView(`
    <section class="view view-progress">
      <div class="page-header progress-page-header">
        <div>
          <span class="eyebrow">Learning analytics</span>
          <h1 class="page-title">Progress</h1>
          <p class="page-subtitle">Track momentum, review course completion, and keep portable backups of your learning data.</p>
        </div>

        <div class="progress-toolbar" aria-label="Progress data actions">
          <button class="btn btn-primary" id="btn-export-json" type="button">
            <i class="fa-solid fa-download" aria-hidden="true"></i>
            Export backup
          </button>
          <button class="btn btn-ghost" id="btn-import-json" type="button">
            <i class="fa-solid fa-upload" aria-hidden="true"></i>
            Import
          </button>
          <details class="progress-export-menu">
            <summary class="btn btn-ghost" aria-label="More export formats">
              <i class="fa-solid fa-ellipsis" aria-hidden="true"></i>
              More exports
            </summary>
            <div class="progress-export-popover">
              <button type="button" id="btn-export-csv">Export CSV</button>
              <button type="button" id="btn-export-md">Export Notes Markdown</button>
              <button type="button" id="btn-export-vault">Export Vault Markdown</button>
              <button type="button" id="btn-export-vault-archive">Export Vault Archive</button>
              <button type="button" id="btn-export-vault-zip">Export Vault ZIP</button>
              <button type="button" id="btn-export-vault-directory">Export Vault Folder</button>
            </div>
          </details>
          <button class="btn btn-danger" id="btn-reset-all" type="button">
            <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
            Reset all
          </button>
        </div>
      </div>

      <div class="progress-metric-grid" aria-label="Learning summary">
        <article class="progress-metric">
          <span class="progress-metric-icon"><i class="fa-solid fa-layer-group" aria-hidden="true"></i></span>
          <span class="progress-metric-label">Total topics</span>
          <strong id="stat-total-topics">0</strong>
          <span class="progress-metric-note">Available in your catalog</span>
        </article>

        <article class="progress-metric">
          <span class="progress-metric-icon"><i class="fa-solid fa-circle-check" aria-hidden="true"></i></span>
          <span class="progress-metric-label">Completed</span>
          <strong id="stat-done-topics">0</strong>
          <span class="progress-metric-note">Topics marked done</span>
        </article>

        <article class="progress-metric">
          <span class="progress-metric-icon"><i class="fa-solid fa-spinner" aria-hidden="true"></i></span>
          <span class="progress-metric-label">In progress</span>
          <strong id="stat-in-progress">0</strong>
          <span class="progress-metric-note">Active learning threads</span>
        </article>

        <article class="progress-metric progress-metric-featured">
          <span class="progress-metric-icon"><i class="fa-solid fa-chart-line" aria-hidden="true"></i></span>
          <span class="progress-metric-label">Completion</span>
          <strong id="stat-completion-pct">0%</strong>
          <div class="mini-bar-wrap progress-overall-track" aria-hidden="true">
            <div class="mini-bar" id="stat-overall-bar" style="width:0%"></div>
          </div>
        </article>

        <article class="progress-metric">
          <span class="progress-metric-icon"><i class="fa-solid fa-clock" aria-hidden="true"></i></span>
          <span class="progress-metric-label">Watched</span>
          <strong id="stat-watched-time">0:00</strong>
          <span class="progress-metric-note">Recorded learning time</span>
        </article>

        <article class="progress-metric">
          <span class="progress-metric-icon"><i class="fa-solid fa-fire" aria-hidden="true"></i></span>
          <span class="progress-metric-label">Current streak</span>
          <strong><span id="stat-streak">0</span><small> days</small></strong>
          <span class="progress-metric-note">Consecutive active days</span>
        </article>

        <article class="progress-metric">
          <span class="progress-metric-icon"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i></span>
          <span class="progress-metric-label">Active days</span>
          <strong id="stat-active-days">0</strong>
          <span class="progress-metric-note">Days with saved activity</span>
        </article>
      </div>

      <div class="progress-dashboard-grid">
        <section class="card card-filled progress-chart-card" aria-labelledby="progress-overall-title">
          <div class="card-body">
            <div class="progress-card-heading">
              <div>
                <span class="eyebrow">Overall mix</span>
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
                <span class="eyebrow">Course comparison</span>
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
                <span class="eyebrow">Detailed breakdown</span>
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

  window.OpenCourseDeck?.ProgressStatsInit?.();
  return {
    unmount() {
      try { window.OpenCourseDeck?.ProgressStats?.destroy?.(); } catch {}
    },
  };
}
