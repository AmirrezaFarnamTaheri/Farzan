export function mountNotFoundView({ setView, hash } = {}) {
  setView(`
    <section class="view view-notfound">
      <div class="page-header notfound-header">
        <span class="eyebrow">404</span>
        <h1 class="page-title">Page not found</h1>
        <p class="page-subtitle">No view for <code>${String(hash ?? '')}</code></p>
      </div>
      <div class="card card-filled notfound-card">
        <div class="card-body notfound-body">
          <div class="notfound-icon"><svg class="icon" aria-hidden="true"><use href="#i-compass"/></svg></div>
          <p class="notfound-message">The route you requested could not be located or may have moved.</p>
          <div class="notfound-actions">
            <a class="btn btn-primary" href="#/"><svg class="icon" aria-hidden="true"><use href="#i-home"/></svg> Return Home</a>
            <a class="btn btn-ghost" href="#/courses"><svg class="icon" aria-hidden="true"><use href="#i-curriculum"/></svg> Browse Courses</a>
          </div>
        </div>
      </div>
    </section>
  `);
}

