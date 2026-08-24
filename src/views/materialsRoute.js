export async function mountMaterialsView(deps = {}) {
  const {
    setView,
    createElement,
    eventTargetEl,
    safeMediaUrl,
    Router,
    Paginator,
    setPendingCourseMedia,
  } = deps;

  setView(`
    <section class="view view-materials">
      <div class="page-header materials-header">
        <div>
          <span class="eyebrow">Curriculum Index</span>
          <h1 class="page-title">Materials</h1>
          <p class="page-subtitle">All videos and PDFs in your catalog, searchable and filterable by source.</p>
        </div>
      </div>
      <div class="card card-filled materials-controls-card">
        <div class="card-body">
          <input class="input" id="materials-search" type="search" placeholder="Search topics..." />
          <div class="filter-row materials-filter-row" aria-label="Material filters">
            <button class="filter-chip active" type="button" data-material-filter="all" aria-pressed="true">All</button>
            <button class="filter-chip" type="button" data-material-filter="video" aria-pressed="false">Video</button>
            <button class="filter-chip" type="button" data-material-filter="pdf" aria-pressed="false">PDF</button>
            <button class="filter-chip" type="button" data-material-filter="none" aria-pressed="false">No media</button>
          </div>
          <div class="grid grid-2 materials-select-row">
            <label class="stack-xs">
              <span class="text-sm text-muted">Course</span>
              <select class="select" id="materials-course-filter" aria-label="Filter materials by course">
                <option value="all">All courses</option>
              </select>
            </label>
            <label class="stack-xs">
              <span class="text-sm text-muted">Source</span>
              <select class="select" id="materials-source-filter" aria-label="Filter materials by source">
                <option value="all">All sources</option>
              </select>
            </label>
          </div>
        </div>
      </div>
      <div id="materials-pager" class="materials-pager"></div>
      <div id="materials-list" class="materials-list"></div>
    </section>
  `);

  await window.DataStore?.init?.();
  const viewRoot = document.querySelector('.view-materials');
  const pagerEl = document.getElementById('materials-pager');
  const listEl = document.getElementById('materials-list');
  const searchEl = document.getElementById('materials-search');
  const courseFilterEl = document.getElementById('materials-course-filter');
  const sourceFilterEl = document.getElementById('materials-source-filter');
  if (!listEl) return;
  const routeListeners = [];
  const on = (target, type, handler, options) => {
    if (!target) return;
    target.addEventListener(type, handler, options);
    routeListeners.push({ target, type, handler, options });
  };
  let renderToken = 0;
  let renderTimer = null;
  const cancelRender = () => {
    renderToken += 1;
    if (renderTimer) {
      clearTimeout(renderTimer);
      renderTimer = null;
    }
  };

  const topics = window.DataStore?.allTopics?.() ?? [];
  const courseEntries = [...new Map(topics
    .filter((topic) => topic?.courseId)
    .map((topic) => [String(topic.courseId), String(topic.courseTitle || topic.courseId)]))
    .entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const sourceEntries = [...new Map(topics
    .map((topic) => [String(topic.sourceLabel || 'Source'), String(topic.sourceLabel || 'Source')]))
    .entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  courseEntries.forEach(([value, label]) => {
    courseFilterEl?.appendChild(createElement('option', { value }, label));
  });
  sourceEntries.forEach(([value, label]) => {
    sourceFilterEl?.appendChild(createElement('option', { value }, label));
  });
  const mediaClass = (topic) => {
    const hasVideo = (topic.videos?.length ?? 0) > 0;
    const hasPdf = (topic.pdfs?.length ?? 0) > 0;
    if (hasVideo && hasPdf) return 'video-pdf';
    if (hasVideo) return 'video';
    if (hasPdf) return 'pdf';
    return 'none';
  };
  let state = { page: 1, perPage: 50, query: '', filter: 'all', courseId: 'all', sourceLabel: 'all' };
  const passesFilter = (topic) => state.filter === 'all'
    || mediaClass(topic) === state.filter
    || (state.filter === 'video' && (topic.videos?.length ?? 0) > 0)
    || (state.filter === 'pdf' && (topic.pdfs?.length ?? 0) > 0);
  const materialBadge = (label) => createElement('span', { class: 'badge' }, label);
  const materialActionButton = (action, label) => createElement('button', {
    class: 'btn btn-ghost btn-sm',
    type: 'button',
    'data-action': action,
  }, label);
  const buildMaterialRow = (topic) => {
    const v = topic.videos?.[0];
    const p = topic.pdfs?.[0];
    const row = createElement('div', {
      class: 'topic-row',
      'data-topic-id': topic.topicId,
      'data-course-id': topic.courseId,
      'data-media': mediaClass(topic),
    });
    const copy = createElement('div');
    copy.append(
      createElement('div', { class: 'topic-title' }, topic.title),
      createElement('div', { class: 'topic-submeta' }, `${topic.courseTitle ?? ''} - ${topic.sourceLabel ?? 'Source'}`)
    );
    const meta = createElement('div', { class: 'topic-meta' });
    if (v) meta.appendChild(materialBadge('video'));
    if (p) meta.appendChild(materialBadge('pdf'));
    if (!v && !p) meta.appendChild(materialBadge('no media'));
    const actions = createElement('div', { class: 'topic-actions' });
    if (v) actions.appendChild(materialActionButton('play-video', 'Play'));
    if (p) actions.appendChild(materialActionButton('open-pdf', 'PDF'));
    row.append(copy, meta, actions);
    return row;
  };
  const render = (query = state.query) => {
    const q = query.trim().toLowerCase();
    const filtered = topics.filter((t) => {
      const matchesQuery = !q
        || String(t.title ?? '').toLowerCase().includes(q)
        || String(t.courseTitle ?? '').toLowerCase().includes(q)
        || String(t.sourceLabel ?? '').toLowerCase().includes(q);
      const matchesCourse = state.courseId === 'all' || String(t.courseId || '') === state.courseId;
      const matchesSource = state.sourceLabel === 'all' || String(t.sourceLabel || 'Source') === state.sourceLabel;
      return matchesQuery && passesFilter(t) && matchesCourse && matchesSource;
    });
    state.query = query;
    const { page, perPage, pages, total, slice } = Paginator.paginate(filtered, state);
    state.page = page;
    state.perPage = perPage;
    Paginator.renderControls(pagerEl, {
      page,
      pages,
      total,
      perPage,
      perPageOptions: [25, 50, 100, 200],
      onChange: ({ page: p, perPage: pp }) => {
        state.page = p ?? state.page;
        state.perPage = pp ?? state.perPage;
        render(state.query);
        try { listEl.scrollTo?.({ top: 0, behavior: 'smooth' }); } catch { listEl.scrollTop = 0; }
      },
    });

    cancelRender();
    listEl.replaceChildren();
    if (!slice.length) {
      const empty = createElement('div', { class: 'empty-state' }, createElement('p', {}, 'No materials match this filter.'));
      listEl.appendChild(empty);
      return;
    }
    const token = renderToken;
    const batchSize = Math.max(1, Number(window.OpenCourseDeck?.materialsRenderBatchSize) || 50);
    const status = createElement('div', {
      class: 'materials-render-status text-sm',
      'aria-live': 'polite',
      'data-materials-render-status': '',
    });
    let index = 0;
    const renderBatch = () => {
      if (!listEl.isConnected || token !== renderToken) return;
      const fragment = document.createDocumentFragment();
      const end = Math.min(slice.length, index + batchSize);
      for (; index < end; index += 1) fragment.appendChild(buildMaterialRow(slice[index]));
      listEl.insertBefore(fragment, status.isConnected ? status : null);
      if (index < slice.length) {
        status.textContent = `Showing ${index} of ${slice.length} visible materials`;
        if (!status.isConnected) listEl.appendChild(status);
        renderTimer = setTimeout(renderBatch, 0);
      } else {
        renderTimer = null;
        status.remove();
      }
    };
    renderBatch();
  };

  render('');
  if (courseFilterEl) courseFilterEl.value = state.courseId;
  if (sourceFilterEl) sourceFilterEl.value = state.sourceLabel;

  on(searchEl, 'input', () => render(searchEl.value));
  on(courseFilterEl, 'change', () => {
    state.courseId = courseFilterEl.value || 'all';
    state.page = 1;
    render(state.query);
  });
  on(sourceFilterEl, 'change', () => {
    state.sourceLabel = sourceFilterEl.value || 'all';
    state.page = 1;
    render(state.query);
  });

  on(viewRoot, 'click', (e) => {
      const target = eventTargetEl(e);
      if (!target) return;
      const filterBtn = target.closest('[data-material-filter]');
      if (filterBtn) {
        state.filter = filterBtn.dataset.materialFilter || 'all';
        state.page = 1;
        document.querySelectorAll('[data-material-filter]').forEach((btnEl) => {
          const isActive = btnEl === filterBtn;
          btnEl.classList.toggle('active', isActive);
          btnEl.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        render(state.query);
        return;
      }
      const btn = target.closest('[data-action]');
      if (!btn) return;
      const row = target.closest('[data-topic-id]');
      if (!row) return;
      const t = topics.find(x => x.topicId === row.dataset.topicId);
      if (!t) return;
      if (btn.dataset.action === 'open-pdf') {
        const url = safeMediaUrl(t.pdfs?.[0]);
        if (!url) return;
        Router.navigate('#/pdf');
        setTimeout(() => { try { window.PlasmaPDFViewer?.load?.(url); } catch {} }, 50);
      }
      if (btn.dataset.action === 'play-video') {
        const url = safeMediaUrl(t.videos?.[0]);
        if (!url) return;
        // Jump to courses and autoplay the exact topic
        setPendingCourseMedia(t.topicId);
        Router.navigate('#/courses');
      }
  });
  return {
    unmount() {
      cancelRender();
      routeListeners.forEach(({ target, type, handler, options }) => {
        try { target.removeEventListener(type, handler, options); } catch {}
      });
    },
  };
}



