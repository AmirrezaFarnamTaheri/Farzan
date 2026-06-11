export function mountProgressView({ setView } = {}) {
  setView(`
    <section class="view view-progress">
      <div class="page-header">
        <h1 class="page-title">Progress</h1>
        <p class="page-subtitle">Analytics and export.</p>
      </div>

      <div class="progress-actions">
        <button class="btn btn-primary" id="btn-export-json">Export JSON</button>
        <button class="btn btn-ghost" id="btn-export-csv">Export CSV</button>
        <button class="btn btn-ghost" id="btn-export-md">Export Notes MD</button>
        <button class="btn btn-ghost" id="btn-export-vault">Export Vault MD</button>
        <button class="btn btn-ghost" id="btn-export-vault-archive">Export Vault Archive</button>
        <button class="btn btn-ghost" id="btn-export-vault-zip">Export Vault ZIP</button>
        <button class="btn btn-ghost" id="btn-export-vault-directory">Export Vault Folder</button>
        <button class="btn btn-ghost" id="btn-import-json">Import</button>
        <button class="btn btn-danger" id="btn-reset-all">Reset all</button>
      </div>

      <div class="progress-grid">
        <div class="card card-filled">
          <div class="card-body">
            <div>Total topics: <strong id="stat-total-topics">0</strong></div>
            <div>Done: <strong id="stat-done-topics">0</strong></div>
            <div>In progress: <strong id="stat-in-progress">0</strong></div>
            <div>Completion: <strong id="stat-completion-pct">0%</strong></div>
            <div>Watched: <strong id="stat-watched-time">0:00</strong></div>
            <div>Streak: <strong id="stat-streak">0</strong></div>
            <div>Active days: <strong id="stat-active-days">0</strong></div>
            <div class="mini-bar-wrap" style="margin-top:10px">
              <div class="mini-bar" id="stat-overall-bar" style="width:0%"></div>
            </div>
          </div>
        </div>

        <div class="card card-filled">
          <div class="card-body">
            <canvas id="chart-overall" height="220"></canvas>
          </div>
        </div>

        <div class="card card-filled" style="grid-column:1/-1">
          <div class="card-body">
            <canvas id="chart-courses" height="220"></canvas>
          </div>
        </div>

        <div class="card card-filled" style="grid-column:1/-1">
          <div class="card-body">
            <table class="table">
              <thead>
                <tr>
                  <th>Course</th><th>Total</th><th>Done</th><th>In progress</th><th>%</th><th>Watch time</th><th>Last</th>
                </tr>
              </thead>
              <tbody id="stat-course-table-body"></tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  `);

  window.PlasmaDeck?.ProgressStatsInit?.();
  return {
    unmount() {
      try { window.PlasmaDeck?.ProgressStats?.destroy?.(); } catch {}
    },
  };
}
