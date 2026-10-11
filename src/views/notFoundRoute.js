export function mountNotFoundView({ setView, hash } = {}) {
  setView(`
    <section class="view view-notfound">
      <div class="page-header notfound-header">
        <h1 class="page-title">Page not found</h1>
        <p class="page-subtitle">This page doesn't exist. Check the address or return home.</p>
        <p class="notfound-requested">Requested address: <code data-missing-route></code></p>
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
  // Render untrusted URL text as text, not template HTML.
  const target = document.querySelector('[data-missing-route]');
  if (target) target.textContent = String(hash ?? '');
}

