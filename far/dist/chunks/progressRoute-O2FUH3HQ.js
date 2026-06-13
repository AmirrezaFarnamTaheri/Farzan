// src/views/progressRoute.js
function mountProgressView({ setView } = {}) {
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
      try {
        window.PlasmaDeck?.ProgressStats?.destroy?.();
      } catch {
      }
    }
  };
}
export {
  mountProgressView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3ZpZXdzL3Byb2dyZXNzUm91dGUuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImV4cG9ydCBmdW5jdGlvbiBtb3VudFByb2dyZXNzVmlldyh7IHNldFZpZXcgfSA9IHt9KSB7XG4gIHNldFZpZXcoYFxuICAgIDxzZWN0aW9uIGNsYXNzPVwidmlldyB2aWV3LXByb2dyZXNzXCI+XG4gICAgICA8ZGl2IGNsYXNzPVwicGFnZS1oZWFkZXJcIj5cbiAgICAgICAgPGgxIGNsYXNzPVwicGFnZS10aXRsZVwiPlByb2dyZXNzPC9oMT5cbiAgICAgICAgPHAgY2xhc3M9XCJwYWdlLXN1YnRpdGxlXCI+QW5hbHl0aWNzIGFuZCBleHBvcnQuPC9wPlxuICAgICAgPC9kaXY+XG5cbiAgICAgIDxkaXYgY2xhc3M9XCJwcm9ncmVzcy1hY3Rpb25zXCI+XG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLXByaW1hcnlcIiBpZD1cImJ0bi1leHBvcnQtanNvblwiPkV4cG9ydCBKU09OPC9idXR0b24+XG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0XCIgaWQ9XCJidG4tZXhwb3J0LWNzdlwiPkV4cG9ydCBDU1Y8L2J1dHRvbj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBpZD1cImJ0bi1leHBvcnQtbWRcIj5FeHBvcnQgTm90ZXMgTUQ8L2J1dHRvbj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBpZD1cImJ0bi1leHBvcnQtdmF1bHRcIj5FeHBvcnQgVmF1bHQgTUQ8L2J1dHRvbj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBpZD1cImJ0bi1leHBvcnQtdmF1bHQtYXJjaGl2ZVwiPkV4cG9ydCBWYXVsdCBBcmNoaXZlPC9idXR0b24+XG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0XCIgaWQ9XCJidG4tZXhwb3J0LXZhdWx0LXppcFwiPkV4cG9ydCBWYXVsdCBaSVA8L2J1dHRvbj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBpZD1cImJ0bi1leHBvcnQtdmF1bHQtZGlyZWN0b3J5XCI+RXhwb3J0IFZhdWx0IEZvbGRlcjwvYnV0dG9uPlxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdFwiIGlkPVwiYnRuLWltcG9ydC1qc29uXCI+SW1wb3J0PC9idXR0b24+XG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWRhbmdlclwiIGlkPVwiYnRuLXJlc2V0LWFsbFwiPlJlc2V0IGFsbDwvYnV0dG9uPlxuICAgICAgPC9kaXY+XG5cbiAgICAgIDxkaXYgY2xhc3M9XCJwcm9ncmVzcy1ncmlkXCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkIGNhcmQtZmlsbGVkXCI+XG4gICAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQtYm9keVwiPlxuICAgICAgICAgICAgPGRpdj5Ub3RhbCB0b3BpY3M6IDxzdHJvbmcgaWQ9XCJzdGF0LXRvdGFsLXRvcGljc1wiPjA8L3N0cm9uZz48L2Rpdj5cbiAgICAgICAgICAgIDxkaXY+RG9uZTogPHN0cm9uZyBpZD1cInN0YXQtZG9uZS10b3BpY3NcIj4wPC9zdHJvbmc+PC9kaXY+XG4gICAgICAgICAgICA8ZGl2PkluIHByb2dyZXNzOiA8c3Ryb25nIGlkPVwic3RhdC1pbi1wcm9ncmVzc1wiPjA8L3N0cm9uZz48L2Rpdj5cbiAgICAgICAgICAgIDxkaXY+Q29tcGxldGlvbjogPHN0cm9uZyBpZD1cInN0YXQtY29tcGxldGlvbi1wY3RcIj4wJTwvc3Ryb25nPjwvZGl2PlxuICAgICAgICAgICAgPGRpdj5XYXRjaGVkOiA8c3Ryb25nIGlkPVwic3RhdC13YXRjaGVkLXRpbWVcIj4wOjAwPC9zdHJvbmc+PC9kaXY+XG4gICAgICAgICAgICA8ZGl2PlN0cmVhazogPHN0cm9uZyBpZD1cInN0YXQtc3RyZWFrXCI+MDwvc3Ryb25nPjwvZGl2PlxuICAgICAgICAgICAgPGRpdj5BY3RpdmUgZGF5czogPHN0cm9uZyBpZD1cInN0YXQtYWN0aXZlLWRheXNcIj4wPC9zdHJvbmc+PC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwibWluaS1iYXItd3JhcFwiIHN0eWxlPVwibWFyZ2luLXRvcDoxMHB4XCI+XG4gICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJtaW5pLWJhclwiIGlkPVwic3RhdC1vdmVyYWxsLWJhclwiIHN0eWxlPVwid2lkdGg6MCVcIj48L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5cblxuICAgICAgICA8ZGl2IGNsYXNzPVwiY2FyZCBjYXJkLWZpbGxlZFwiPlxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLWJvZHlcIj5cbiAgICAgICAgICAgIDxjYW52YXMgaWQ9XCJjaGFydC1vdmVyYWxsXCIgaGVpZ2h0PVwiMjIwXCI+PC9jYW52YXM+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PlxuXG4gICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkIGNhcmQtZmlsbGVkXCIgc3R5bGU9XCJncmlkLWNvbHVtbjoxLy0xXCI+XG4gICAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQtYm9keVwiPlxuICAgICAgICAgICAgPGNhbnZhcyBpZD1cImNoYXJ0LWNvdXJzZXNcIiBoZWlnaHQ9XCIyMjBcIj48L2NhbnZhcz5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQgY2FyZC1maWxsZWRcIiBzdHlsZT1cImdyaWQtY29sdW1uOjEvLTFcIj5cbiAgICAgICAgICA8ZGl2IGNsYXNzPVwiY2FyZC1ib2R5XCI+XG4gICAgICAgICAgICA8dGFibGUgY2xhc3M9XCJ0YWJsZVwiPlxuICAgICAgICAgICAgICA8dGhlYWQ+XG4gICAgICAgICAgICAgICAgPHRyPlxuICAgICAgICAgICAgICAgICAgPHRoPkNvdXJzZTwvdGg+PHRoPlRvdGFsPC90aD48dGg+RG9uZTwvdGg+PHRoPkluIHByb2dyZXNzPC90aD48dGg+JTwvdGg+PHRoPldhdGNoIHRpbWU8L3RoPjx0aD5MYXN0PC90aD5cbiAgICAgICAgICAgICAgICA8L3RyPlxuICAgICAgICAgICAgICA8L3RoZWFkPlxuICAgICAgICAgICAgICA8dGJvZHkgaWQ9XCJzdGF0LWNvdXJzZS10YWJsZS1ib2R5XCI+PC90Ym9keT5cbiAgICAgICAgICAgIDwvdGFibGU+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG4gICAgPC9zZWN0aW9uPlxuICBgKTtcblxuICB3aW5kb3cuUGxhc21hRGVjaz8uUHJvZ3Jlc3NTdGF0c0luaXQ/LigpO1xuICByZXR1cm4ge1xuICAgIHVubW91bnQoKSB7XG4gICAgICB0cnkgeyB3aW5kb3cuUGxhc21hRGVjaz8uUHJvZ3Jlc3NTdGF0cz8uZGVzdHJveT8uKCk7IH0gY2F0Y2gge31cbiAgICB9LFxuICB9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFPLFNBQVMsa0JBQWtCLEVBQUUsUUFBUSxJQUFJLENBQUMsR0FBRztBQUNsRCxVQUFRO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsR0E2RFA7QUFFRCxTQUFPLFlBQVksb0JBQW9CO0FBQ3ZDLFNBQU87QUFBQSxJQUNMLFVBQVU7QUFDUixVQUFJO0FBQUUsZUFBTyxZQUFZLGVBQWUsVUFBVTtBQUFBLE1BQUcsUUFBUTtBQUFBLE1BQUM7QUFBQSxJQUNoRTtBQUFBLEVBQ0Y7QUFDRjsiLAogICJuYW1lcyI6IFtdCn0K
