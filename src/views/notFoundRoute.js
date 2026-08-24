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
          <div class="notfound-icon"><i class="fa-solid fa-compass-drafting" aria-hidden="true"></i></div>
          <p class="notfound-message">The route you requested could not be located or may have moved.</p>
          <div class="notfound-actions">
            <a class="btn btn-primary" href="#/"><i class="fa-solid fa-house" aria-hidden="true"></i> Return Home</a>
            <a class="btn btn-ghost" href="#/courses"><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i> Browse Courses</a>
          </div>
        </div>
      </div>
    </section>
  `);
}

