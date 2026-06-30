export function mountBookmarksView(deps = {}) {
  const {
    setView,
    createElement,
    Router,
    Toast = window.OpenCourseDeck?.Toast,
    setPendingCourseMedia,
    setPendingPdfPage,
    sanitizeHtml,
  } = deps;

  setView(`
    <section class="view view-bookmarks">
      <div class="page-header">
        <div class="page-title-row">
          <h1 class="page-title">Bookmarks</h1>
          <span class="badge badge-success" aria-label="Feature status: ready">Ready</span>
        </div>
        <p class="page-subtitle">Quick links into your study materials, notes, timestamps, and PDF annotations.</p>
      </div>
      <div class="stat-grid" data-bookmark-metrics></div>
      <div class="card card-filled">
        <div class="card-body">
          <div class="filter-row" data-bookmark-filters aria-label="Bookmark filters">
            <button class="filter-chip active" type="button" data-bookmark-filter="all" aria-pressed="true">All</button>
            <button class="filter-chip" type="button" data-bookmark-filter="timestamp" aria-pressed="false">Timestamps</button>
            <button class="filter-chip" type="button" data-bookmark-filter="note" aria-pressed="false">Notes</button>
            <button class="filter-chip" type="button" data-bookmark-filter="pdf" aria-pressed="false">PDF</button>
          </div>
          <div class="grid grid-3" data-bookmark-list>
            <p>Loading bookmarks...</p>
          </div>
        </div>
      </div>
    </section>
  `);
  renderBookmarks();

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
    const activeFilter = filtersRoot?.dataset.activeFilter || 'all';

    const [timestamps, notes, annotations] = await Promise.all([
      (async () => { try { return await window.DB?.getAllTimestamps?.() ?? []; } catch { return []; } })(),
      (async () => { try { return await window.DB?.getAllNotes?.() ?? []; } catch { return []; } })(),
      (async () => { try { return await window.DB?.getAllAnnotations?.() ?? []; } catch { return []; } })(),
    ]);
    if (!document.body.contains(listRoot)) return;
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
    ].sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt));
    const visibleItems = activeFilter === 'all'
      ? bookmarkItems
      : bookmarkItems.filter(item => item.type.toLowerCase() === activeFilter);

    metricsRoot.replaceChildren();
    [
      ['Video timestamps', timestamps.length],
      ['Notes', notes.length],
      ['PDF annotations', annotations.length],
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

    listRoot.replaceChildren();
    if (!bookmarkItems.length) {
      const empty = document.createElement('p');
      empty.className = 'text-muted';
      empty.textContent = 'No bookmarks yet. Notes, timestamps, and PDF annotations will appear here.';
      listRoot.appendChild(empty);
      return;
    }
    if (!visibleItems.length) {
      const empty = document.createElement('p');
      empty.className = 'text-muted';
      empty.textContent = 'No bookmarks match this filter.';
      listRoot.appendChild(empty);
    }

    visibleItems.slice(0, 24).forEach(item => {
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
      if (item.type === 'Timestamp' && item.topicId) {
        link.addEventListener('click', (event) => {
          event.preventDefault();
          setPendingCourseMedia(item.topicId, item.position);
          Router.navigate('#/courses');
        });
      } else if (item.href === '#/pdf' && (item.docId || item.page)) {
        link.addEventListener('click', (event) => {
          event.preventDefault();
          setPendingPdfPage(item.docId, item.page);
          try {
            if (item.page) window.PlasmaPDFViewer?.goTo?.(item.page);
          } catch {}
          Router.navigate('#/pdf');
          setTimeout(() => {
            try {
              if (item.page) window.PlasmaPDFViewer?.goTo?.(item.page);
            } catch {}
          }, 80);
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
          const noteInput = document.createElement('textarea');
          noteInput.className = 'input';
          noteInput.name = 'note';
          noteInput.rows = 3;
          noteInput.value = item.source?.note || '';
          noteInput.placeholder = 'Timestamp note';
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

    if (filtersRoot && !filtersRoot.dataset.bound) {
      filtersRoot.dataset.bound = 'true';
      filtersRoot.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-bookmark-filter]');
        if (!button) return;
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
          await window.DB?.deleteTimestamp?.(deleteButton.dataset.deleteTimestamp);
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
        await window.DB.saveTimestamp({
          ...original,
          id: original.id || form.dataset.timestampEditForm,
          title: title || original.title || original.topicTitle || 'Video timestamp',
          note: note || '',
          updatedAt: Date.now(),
        });
        delete listRoot.dataset.editingTimestamp;
        Toast.success('Timestamp updated');
        renderBookmarks();
      } catch {
        Toast.error('Timestamp update failed');
      }
    };
  }
}
