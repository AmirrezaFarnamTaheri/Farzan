export function mountBookmarksView(deps = {}) {
  const {
    setView,
    createElement,
    Router,
    Toast = window.OpenCourseDeck?.Toast
      // Fall back to no-ops: Toast may be unregistered during partial
      // init or in test harnesses, and a bare Toast.success() then threw
      // mid-handler, skipping the post-mutation UI refresh.
      ?? { success() {}, error() {}, info() {}, warning() {} },
    setPendingCourseMedia,
    setPendingPdfPage,
    sanitizeHtml,
  } = deps;

  setView(`
    <section class="view view-bookmarks">
      <div class="page-header bookmarks-header">
        <div>
          <div class="page-title-row">
            <h1 class="page-title">Bookmarks</h1>
          </div>
          <p class="page-subtitle">Return to saved video times, notes, and PDF pages.</p>
        </div>
      </div>
      <div class="stat-grid" data-bookmark-metrics></div>
      <div class="card card-filled bookmarks-section-card">
        <div class="card-body">
          <div class="filter-row bookmarks-filter-row" data-bookmark-filters aria-label="Bookmark filters">
            <button class="filter-chip active" type="button" data-bookmark-filter="all" aria-pressed="true">All</button>
            <button class="filter-chip" type="button" data-bookmark-filter="timestamp" aria-pressed="false">Timestamps</button>
            <button class="filter-chip" type="button" data-bookmark-filter="note" aria-pressed="false">Notes</button>
            <button class="filter-chip" type="button" data-bookmark-filter="pdf" aria-pressed="false">PDF</button>
          </div>
          <div class="grid grid-3 bookmarks-grid" data-bookmark-list>
            <p>Loading bookmarks...</p>
          </div>
        </div>
      </div>
    </section>
  `);
  let visibleLimit = 24;
  let renderVersion = 0;
  renderBookmarks();

  // Older imported annotations may use a synthetic global bucket instead
  // of a real PDF document ID. A page number alone is never a safe document
  // navigation target: it could be applied to an unrelated open PDF.
  const stablePdfDocId = value => {
    const id = String(value ?? '').trim();
    return id.length > 0 && id !== 'global';
  };

  function formatDuration(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return hours
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      : `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  async function renderBookmarks() {
    const metricsRoot = document.querySelector('[data-bookmark-metrics]');
    const listRoot = document.querySelector('[data-bookmark-list]');
    const filtersRoot = document.querySelector('[data-bookmark-filters]');
    if (!metricsRoot || !listRoot) return;
    const version = ++renderVersion;
    listRoot.setAttribute('aria-busy', 'true');
    const activeFilter = filtersRoot?.dataset.activeFilter || 'all';

    let readError = null;
    const readCollection = async (method, label) => {
      try {
        if (typeof method !== 'function') throw new Error(`${label} reader is unavailable`);
        const value = await method();
        if (!Array.isArray(value)) throw new TypeError(`${label} returned invalid records`);
        return value;
      } catch (error) {
        readError ||= new Error(`${label} could not be loaded`, { cause: error });
        return [];
      }
    };
    const [timestamps, notes, annotations, pdfBookmarks] = await Promise.all([
      readCollection(window.DB?.getAllTimestamps, 'Timestamps'),
      readCollection(window.DB?.getAllNotes, 'Notes'),
      readCollection(window.DB?.getAllAnnotations, 'PDF annotations'),
      // The canonical PDF bookmark store is optional on older/partial app
      // facades, but a present reader that throws cannot mean "no bookmarks".
      typeof window.DB?.getAllPdfBookmarks === 'function'
        ? readCollection(window.DB.getAllPdfBookmarks, 'PDF bookmarks')
        : Promise.resolve([]),
    ]);
    // A slower earlier filter request must never overwrite a newer result,
    // error or active filter. DOM replacement also invalidates old requests.
    if (!document.body.contains(listRoot) || renderVersion !== version) return;
    listRoot.removeAttribute('aria-busy');
    if (readError) {
      // A failed read must not inherit any earlier empty/single surface.
      const section = document.querySelector('.bookmarks-section-card');
      if (section) {
        section.dataset.bookmarkLayout = 'unavailable';
        section.classList.add('card', 'card-filled');
      }
      // Never present partial or fabricated zero totals after any canonical
      // read fails; the remaining records may be entirely correct.
      metricsRoot.replaceChildren();
      metricsRoot.hidden = true;
      if (filtersRoot) filtersRoot.hidden = true;
      listRoot.replaceChildren();
      const error = document.createElement('p');
      error.className = 'bookmarks-load-error';
      error.setAttribute('role', 'alert');
      error.textContent = 'Bookmarks could not be loaded. Your stored data was not changed.';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn btn-primary';
      retry.dataset.bookmarkRetry = 'true';
      retry.textContent = 'Retry loading bookmarks';
      retry.addEventListener('click', () => {
        retry.disabled = true;
        retry.textContent = 'Retrying bookmarks...';
        void renderBookmarks();
      });
      listRoot.append(error, retry);
      return;
    }
    const notesById = new Map(notes.map(note => [note.id, note]));
    const previewText = (value, limit = 140) => {
      const tmp = document.createElement('div');
      tmp.innerHTML = sanitizeHtml(value || '');
      const text = String(tmp.textContent || '').replace(/\s+/g, ' ').trim();
      return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
    };

    const bookmarkItems = [
      ...timestamps.map(item => ({
        type: 'Timestamp',
        title: item.title || item.topicTitle || item.topicId || 'Video timestamp',
        detail: item.position != null ? `At ${formatDuration(item.position)}` : 'Saved playback position',
        notePreview: item.note || notesById.get(item.noteId)?.content || '',
        noteId: item.noteId,
        href: '#/courses',
        id: item.id || item.topicId,
        topicId: item.topicId,
        position: item.position,
        updatedAt: item.updatedAt || item.createdAt || 0,
        source: item,
      })),
      ...notes.map(item => ({
        type: 'Note',
        title: item.title || item.topicId || 'Untitled note',
        detail: item.sourceType === 'pdf' || item.pdfPage || item.pdfDocId
          ? `PDF page ${item.pdfPage || item.page || 1}`
          : item.topicId ? `Linked to ${item.topicId}` : 'Saved note',
        href: item.sourceType === 'pdf' || item.pdfPage || item.pdfDocId ? '#/pdf' : '#/notes',
        id: item.id,
        topicId: item.topicId,
        docId: item.pdfDocId || item.docId,
        page: item.pdfPage || item.page,
        sourceType: item.sourceType,
        updatedAt: item.updatedAt || item.createdAt || 0,
      })),
      ...annotations.map(item => ({
        type: 'PDF',
        title: item.docTitle || item.docId || 'PDF annotation',
        detail: `Page ${item.page || 1}`,
        href: '#/pdf',
        id: item.id,
        docId: item.docId,
        page: item.page || 1,
        updatedAt: item.updatedAt || item.createdAt || 0,
      })),
      ...pdfBookmarks.filter(item => item && item.id != null).map(item => ({
        type: 'PDF',
        title: item.docTitle || item.title || item.docId || 'Saved PDF page',
        detail: `Page ${item.page || 1}`,
        href: '#/pdf',
        id: item.id,
        docId: item.docId,
        page: item.page || 1,
        updatedAt: item.updatedAt || item.createdAt || 0,
      })),
    ].sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt));
    // The outer card is useful for a true collection, but a single saved
    // item already owns a card. Do not double-wrap it (or first-use).
    // This is presentation-only: canonical records and filters are unchanged.
    const section = document.querySelector('.bookmarks-section-card');
    if (section) {
      const layout = bookmarkItems.length === 0 ? 'empty'
        : bookmarkItems.length === 1 ? 'single' : 'collection';
      section.dataset.bookmarkLayout = layout;
      section.classList.toggle('card', layout === 'collection');
      section.classList.toggle('card-filled', layout === 'collection');
    }
    // Category summaries and source filters only help when there is more than
    // one kind of saved item. A one-type library is already fully in view.
    const hasMultipleSources = new Set(bookmarkItems.map(item => item.type)).size > 1;
    metricsRoot.hidden = !hasMultipleSources;
    if (filtersRoot) {
      filtersRoot.hidden = !hasMultipleSources;
      if (!hasMultipleSources) {
        // A removed bookmark may invalidate a previously selected facet.
        // Reset it before computing the visible list so remaining items do
        // not disappear behind an inaccessible, now-hidden filter.
        filtersRoot.dataset.activeFilter = 'all';
        filtersRoot.querySelectorAll('[data-bookmark-filter]').forEach(button => {
          const selected = button.dataset.bookmarkFilter === 'all';
          button.classList.toggle('active', selected);
          button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
      }
    }
    const effectiveFilter = hasMultipleSources ? activeFilter : 'all';
    const visibleItems = effectiveFilter === 'all'
      ? bookmarkItems
      : bookmarkItems.filter(item => item.type.toLowerCase() === effectiveFilter);

    metricsRoot.replaceChildren();
    if (hasMultipleSources) {
      [
        ['Video timestamps', timestamps.length],
        ['Notes', notes.length],
        ['PDF annotations and saved pages', annotations.length + pdfBookmarks.length],
        ['Total bookmarks', bookmarkItems.length],
      ].forEach(([label, value]) => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        const strong = document.createElement('strong');
        strong.textContent = String(value);
        const span = document.createElement('span');
        span.textContent = label;
        card.append(strong, span);
        metricsRoot.appendChild(card);
      });
    }

    listRoot.replaceChildren();
    if (!bookmarkItems.length) {
      const empty = document.createElement('div');
      empty.className = 'bookmarks-empty-state';
      const title = document.createElement('h2');
      title.textContent = 'No saved items yet';
      const message = document.createElement('p');
      message.textContent = 'Notes, video timestamps, PDF annotations and saved PDF pages will appear here as you study.';
      const actions = document.createElement('div');
      actions.className = 'button-row';
      const notesLink = document.createElement('a');
      notesLink.href = '#/notes';
      notesLink.className = 'btn btn-primary';
      notesLink.textContent = 'Open Notes';
      const coursesLink = document.createElement('a');
      coursesLink.href = '#/courses';
      coursesLink.className = 'btn btn-ghost';
      coursesLink.textContent = 'Browse courses';
      actions.append(notesLink, coursesLink);
      empty.append(title, message, actions);
      listRoot.appendChild(empty);
      return;
    }
    if (!visibleItems.length) {
      const empty = document.createElement('p');
      empty.className = 'text-muted';
      empty.textContent = 'No bookmarks match this filter.';
      listRoot.appendChild(empty);
    }

    visibleItems.slice(0, visibleLimit).forEach(item => {
      const card = document.createElement('article');
      card.className = 'card';
      card.dataset.bookmarkType = item.type.toLowerCase();
      if (item.id) card.dataset.bookmarkId = String(item.id);
      if (item.topicId) card.dataset.topicId = String(item.topicId);
      if (item.docId) card.dataset.docId = String(item.docId);

      const body = document.createElement('div');
      body.className = 'card-body';
      const badge = document.createElement('span');
      badge.className = 'badge badge-info';
      badge.textContent = item.type;
      const title = document.createElement('h2');
      title.className = 'h4';
      title.textContent = item.title;
      const detail = document.createElement('p');
      detail.textContent = item.detail;
      const link = document.createElement('a');
      link.className = 'btn btn-ghost';
      link.href = item.href;
      link.textContent = 'Open';
      const pdfLink = item.href === '#/pdf';
      if (pdfLink && !stablePdfDocId(item.docId)) {
        // Preserve the saved card and its original page metadata, but guide
        // the learner to find the document manually. Never claim that an
        // unanchored page belongs to the previously mounted PDF.
        link.href = '#/materials';
        link.textContent = 'Find PDF';
        link.title = 'This saved page has no stable document ID; choose the PDF manually';
        link.addEventListener('click', event => {
          event.preventDefault();
          // A previous PDF page handoff must not remain queued after the
          // learner chooses source discovery instead of opening that PDF.
          setPendingPdfPage?.(null, null);
          Router.navigate('#/materials');
        });
      }
      if (item.type === 'Timestamp' && item.topicId) {
        link.addEventListener('click', (event) => {
          event.preventDefault();
          setPendingCourseMedia(item.topicId, item.position);
          Router.navigate('#/courses');
        });
      } else if (pdfLink && stablePdfDocId(item.docId)) {
        link.addEventListener('click', (event) => {
          event.preventDefault();
          // Only queue a page tied to a real stable PDF identity. The viewer
          // consumes the handoff after that document loads; do not seek a
          // previously mounted, unrelated PDF.
          setPendingPdfPage(item.docId, item.page ?? null);
          Router.navigate('#/pdf');
        });
      }
      body.append(badge, title, detail);
      if (item.type === 'Note' && (item.sourceType === 'pdf' || item.pdfPage || item.docId)) {
        body.appendChild(createElement('div', { class: 'bookmark-meta-row' },
          createElement('span', { class: 'badge badge-success' }, 'PDF page note')
        ));
      }
      if (item.type === 'Timestamp') {
        const meta = document.createElement('div');
        meta.className = 'bookmark-meta-row';
        if (item.noteId) meta.appendChild(createElement('span', { class: 'badge badge-success' }, 'Linked note'));
        if (item.notePreview) {
          const preview = document.createElement('p');
          preview.className = 'bookmark-note-preview';
          preview.textContent = previewText(item.notePreview);
          body.appendChild(preview);
        }
        if (meta.childElementCount) body.appendChild(meta);
        if (listRoot.dataset.editingTimestamp === String(item.id)) {
          const form = document.createElement('form');
          form.className = 'bookmark-edit-form';
          form.dataset.timestampEditForm = String(item.id);
          const titleInput = document.createElement('input');
          titleInput.className = 'input';
          titleInput.name = 'title';
          titleInput.value = item.title;
          titleInput.placeholder = 'Timestamp title';
          titleInput.setAttribute('aria-label', 'Timestamp title');
          const noteInput = document.createElement('textarea');
          noteInput.className = 'input';
          noteInput.name = 'note';
          noteInput.rows = 3;
          noteInput.value = item.source?.note || '';
          noteInput.placeholder = 'Timestamp note';
          noteInput.setAttribute('aria-label', 'Timestamp note');
          const save = document.createElement('button');
          save.type = 'submit';
          save.className = 'btn btn-primary btn-sm';
          save.dataset.saveTimestampEdit = String(item.id);
          save.textContent = 'Save';
          const cancel = document.createElement('button');
          cancel.type = 'button';
          cancel.className = 'btn btn-ghost btn-sm';
          cancel.dataset.cancelTimestampEdit = String(item.id);
          cancel.textContent = 'Cancel';
          form.append(
            titleInput,
            noteInput,
            createElement('div', { class: 'button-row' }, save, cancel)
          );
          body.appendChild(form);
        }
      }
      const actions = document.createElement('div');
      actions.className = 'button-row';
      actions.appendChild(link);
      if (item.type === 'Timestamp' && item.id && window.DB?.saveTimestamp) {
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'btn btn-ghost btn-sm';
        edit.dataset.editTimestamp = String(item.id);
        edit.textContent = 'Edit';
        actions.appendChild(edit);
      }
      if (item.type === 'Timestamp' && item.id && window.DB?.deleteTimestamp) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn btn-ghost btn-sm';
        del.dataset.deleteTimestamp = String(item.id);
        del.textContent = 'Delete';
        actions.appendChild(del);
      }
      body.appendChild(actions);
      card.appendChild(body);
      listRoot.appendChild(card);
    });

    if (visibleLimit < visibleItems.length) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'btn btn-ghost bookmarks-load-more';
      more.textContent = `Show ${Math.min(24, visibleItems.length - visibleLimit)} more`;
      more.addEventListener('click', () => {
        visibleLimit += 24;
        renderBookmarks();
      });
      listRoot.appendChild(more);
    }

    if (filtersRoot && !filtersRoot.dataset.bound) {
      filtersRoot.dataset.bound = 'true';
      filtersRoot.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-bookmark-filter]');
        if (!button) return;
        visibleLimit = 24;
        filtersRoot.dataset.activeFilter = button.dataset.bookmarkFilter || 'all';
        filtersRoot.querySelectorAll('[data-bookmark-filter]').forEach((btn) => {
          const active = btn === button;
          btn.classList.toggle('active', active);
          btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        renderBookmarks();
      });
    }

    listRoot.onclick = async (event) => {
      const editButton = event.target?.closest?.('[data-edit-timestamp]');
      if (editButton) {
        listRoot.dataset.editingTimestamp = editButton.dataset.editTimestamp;
        renderBookmarks();
        requestAnimationFrame(() => {
          listRoot.querySelector(`[data-timestamp-edit-form="${editButton.dataset.editTimestamp}"] input`)?.focus();
        });
        return;
      }
      const cancelButton = event.target?.closest?.('[data-cancel-timestamp-edit]');
      if (cancelButton) {
        delete listRoot.dataset.editingTimestamp;
        renderBookmarks();
        return;
      }
      const deleteButton = event.target?.closest?.('[data-delete-timestamp]');
      if (deleteButton) {
        const ok = await window.OpenCourseDeck?.UI?.confirm?.('Delete this timestamp bookmark?');
        if (!ok) return;
        try {
          const deleted = await window.DB?.deleteTimestamp?.(deleteButton.dataset.deleteTimestamp);
          if (deleted !== true) throw new Error('Timestamp deletion was not acknowledged');
          delete listRoot.dataset.editingTimestamp;
          Toast.success('Timestamp deleted');
          renderBookmarks();
        } catch {
          Toast.error('Timestamp delete failed');
        }
      }
    };
    listRoot.onsubmit = async (event) => {
      const form = event.target?.closest?.('[data-timestamp-edit-form]');
      if (!form) return;
      event.preventDefault();
      const original = timestamps.find(item => String(item.id || item.topicId) === String(form.dataset.timestampEditForm));
      if (!original || !window.DB?.saveTimestamp) return;
      const title = form.elements.title?.value?.trim();
      const note = form.elements.note?.value?.trim();
      try {
        const saved = await window.DB.saveTimestamp({
          ...original,
          id: original.id || form.dataset.timestampEditForm,
          title: title || original.title || original.topicTitle || 'Video timestamp',
          note: note || '',
          updatedAt: Date.now(),
        });
        if (saved !== true) throw new Error('Timestamp update was not acknowledged');
        delete listRoot.dataset.editingTimestamp;
        Toast.success('Timestamp updated');
        renderBookmarks();
      } catch {
        Toast.error('Timestamp update failed');
      }
    };
  }
}
