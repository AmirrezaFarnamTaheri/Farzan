export function mountNotFoundView({ setView, hash } = {}) {
  setView(`
    <section class="view view-notfound">
      <div class="page-header">
        <h1 class="page-title">Not found</h1>
        <p class="page-subtitle">No view for <code>${String(hash ?? '')}</code></p>
      </div>
    </section>
  `);
}
