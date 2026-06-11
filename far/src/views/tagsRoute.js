export function mountTagsView({ setView } = {}) {
  setView(`
    <section class="view view-tags">
      <div class="page-header">
        <div class="page-title-row">
          <h1 class="page-title">Tags</h1>
          <span class="badge badge-success" aria-label="Feature status: ready">Ready</span>
        </div>
        <p class="page-subtitle">Browse note tags and catalog tags from one place.</p>
      </div>
      <div class="stat-grid" data-tag-metrics></div>
      <div class="card card-filled">
        <div class="card-body">
          <input class="input" type="search" data-tag-search placeholder="Search tags..." />
          <div class="filter-row" data-tag-filters aria-label="Tag filters" style="margin-top:12px">
            <button class="filter-chip active" type="button" data-tag-filter="all" aria-pressed="true">All</button>
            <button class="filter-chip" type="button" data-tag-filter="mixed" aria-pressed="false">Mixed</button>
            <button class="filter-chip" type="button" data-tag-filter="note" aria-pressed="false">Notes</button>
            <button class="filter-chip" type="button" data-tag-filter="catalog" aria-pressed="false">Catalog</button>
          </div>
          <div class="grid grid-3" data-tag-list>
            <p>Loading tags...</p>
          </div>
        </div>
      </div>
    </section>
  `);
  renderTags();
}

function normalizeTagValue(value) {
  const tag = String(value ?? '').trim();
  if (!tag) return null;
  return tag.replace(/\s+/g, ' ');
}

function readTagValues(record) {
  const values = [];
  ['tags', 'keywords', 'labels'].forEach(key => {
    const raw = record?.[key];
    if (Array.isArray(raw)) values.push(...raw);
    else if (typeof raw === 'string') values.push(...raw.split(','));
  });
  return values
    .map(normalizeTagValue)
    .filter(Boolean);
}

async function renderTags() {
  const metricsRoot = document.querySelector('[data-tag-metrics]');
  const listRoot = document.querySelector('[data-tag-list]');
  const searchEl = document.querySelector('[data-tag-search]');
  const filtersRoot = document.querySelector('[data-tag-filters]');
  if (!metricsRoot || !listRoot || !searchEl || !filtersRoot) return;

  const [notes, topics] = await Promise.all([
    (async () => { try { return await window.DB?.getAllNotes?.() ?? []; } catch { return []; } })(),
    (async () => {
      try {
        await window.DataStore?.init?.();
        return window.DataStore?.allTopics?.() ?? [];
      } catch {
        return [];
      }
    })(),
  ]);
  if (!document.body.contains(listRoot)) return;

  const tagsByKey = new Map();
  const ensureTag = (rawTag) => {
    const label = normalizeTagValue(rawTag);
    if (!label) return null;
    const key = label.toLowerCase();
    if (!tagsByKey.has(key)) {
      tagsByKey.set(key, {
        key,
        label,
        noteCount: 0,
        topicCount: 0,
        notes: new Set(),
        topics: new Set(),
      });
    }
    return tagsByKey.get(key);
  };

  notes.forEach(note => {
    readTagValues(note).forEach(rawTag => {
      const entry = ensureTag(rawTag);
      if (!entry) return;
      entry.noteCount += 1;
      if (note.id) entry.notes.add(String(note.id));
    });
  });

  topics.forEach(topic => {
    readTagValues(topic).forEach(rawTag => {
      const entry = ensureTag(rawTag);
      if (!entry) return;
      entry.topicCount += 1;
      if (topic.topicId || topic.id) entry.topics.add(String(topic.topicId || topic.id));
    });
  });

  const tagEntries = [...tagsByKey.values()].sort((a, b) => (
    (b.noteCount + b.topicCount) - (a.noteCount + a.topicCount)
    || a.label.localeCompare(b.label)
  ));
  const routeState = window.PlasmaDeck = window.PlasmaDeck ?? {};
  routeState.tagFacetState = routeState.tagFacetState || { query: '', filter: 'all' };
  const state = routeState.tagFacetState;
  const noteTagCount = tagEntries.filter(tag => tag.noteCount > 0).length;
  const catalogTagCount = tagEntries.filter(tag => tag.topicCount > 0).length;
  const taggedNotes = new Set();
  const taggedTopics = new Set();
  tagEntries.forEach(tag => {
    tag.notes.forEach(id => taggedNotes.add(id));
    tag.topics.forEach(id => taggedTopics.add(id));
  });

  metricsRoot.replaceChildren();
  [
    ['Unique tags', tagEntries.length],
    ['Note tags', noteTagCount],
    ['Catalog tags', catalogTagCount],
    ['Tagged records', taggedNotes.size + taggedTopics.size],
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

  const matchesTagFilter = (tag) => {
    if (state.filter === 'all') return true;
    if (state.filter === 'mixed') return tag.noteCount > 0 && tag.topicCount > 0;
    if (state.filter === 'note') return tag.noteCount > 0 && tag.topicCount === 0;
    if (state.filter === 'catalog') return tag.topicCount > 0 && tag.noteCount === 0;
    return true;
  };
  const q = String(state.query || '').trim().toLowerCase();
  const visibleTags = tagEntries.filter((tag) => {
    const matchesQuery = !q || tag.label.toLowerCase().includes(q);
    return matchesQuery && matchesTagFilter(tag);
  });

  const renderVisibleTags = () => {
    listRoot.replaceChildren();
    if (!tagEntries.length) {
      const empty = document.createElement('p');
      empty.className = 'text-muted';
      empty.textContent = 'No tags yet. Add tags to notes or catalog records and they will appear here.';
      listRoot.appendChild(empty);
      return;
    }
    if (!visibleTags.length) {
      const empty = document.createElement('p');
      empty.className = 'text-muted';
      empty.textContent = 'No tags match this search or filter.';
      listRoot.appendChild(empty);
      return;
    }
    visibleTags.slice(0, 48).forEach(tag => {
    const source = tag.noteCount && tag.topicCount ? 'Mixed' : tag.noteCount ? 'Note' : 'Catalog';
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.tagName = tag.key;
    card.dataset.tagSource = source.toLowerCase();

    const body = document.createElement('div');
    body.className = 'card-body';
    const badge = document.createElement('span');
    badge.className = source === 'Mixed' ? 'badge badge-success' : 'badge badge-info';
    badge.textContent = source;
    const title = document.createElement('h2');
    title.className = 'h4';
    title.textContent = tag.label;
    const detail = document.createElement('p');
    detail.textContent = `${tag.noteCount} note${tag.noteCount === 1 ? '' : 's'} and ${tag.topicCount} catalog topic${tag.topicCount === 1 ? '' : 's'}`;
    const links = document.createElement('div');
    links.className = 'button-row';
    if (tag.noteCount) {
      const notesLink = document.createElement('a');
      notesLink.className = 'btn btn-ghost';
      notesLink.href = '#/notes';
      notesLink.textContent = 'Notes';
      links.appendChild(notesLink);
    }
    if (tag.topicCount) {
      const coursesLink = document.createElement('a');
      coursesLink.className = 'btn btn-ghost';
      coursesLink.href = '#/courses';
      coursesLink.textContent = 'Courses';
      links.appendChild(coursesLink);
    }
    body.append(badge, title, detail, links);
    card.appendChild(body);
    listRoot.appendChild(card);
    });
  };

  searchEl.value = state.query;
  filtersRoot.querySelectorAll('[data-tag-filter]').forEach((button) => {
    const active = button.dataset.tagFilter === state.filter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  renderVisibleTags();

  if (!searchEl.dataset.pdBound) {
    searchEl.dataset.pdBound = 'true';
    searchEl.addEventListener('input', () => {
      state.query = searchEl.value || '';
      renderTags();
    });
  }
  if (!filtersRoot.dataset.pdBound) {
    filtersRoot.dataset.pdBound = 'true';
    filtersRoot.addEventListener('click', (event) => {
      const button = event.target?.closest?.('[data-tag-filter]');
      if (!button) return;
      state.filter = button.dataset.tagFilter || 'all';
      renderTags();
    });
  }
}
