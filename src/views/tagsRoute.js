import { normalizeSearchQuery } from '../core/searchRanking.js';
import {
  TAG_TAXONOMY_KEY, parseTagTaxonomy, resolveTaxonomyKey,
  createTaxonomyTag, mergeTaxonomyTags, unmergeTaxonomyTag, persistTagTaxonomy,
} from '../features/tagTaxonomy.js';

// A stale read must not replace a more recent successful retry or a new route.
const renderVersions = new WeakMap();

export function mountTagsView({ setView } = {}) {
  setView(`
    <section class="view view-tags">
      <div class="page-header tags-header">
        <div>
          <div class="page-title-row">
            <h1 class="page-title">Tags</h1>
          </div>
          <p class="page-subtitle">Find notes and course materials by tag.</p>
        </div>
      </div>
      <div class="stat-grid" data-tag-metrics></div>
      <div class="card card-filled tags-controls-card">
        <div class="card-body">
          <input class="input" type="search" data-tag-search placeholder="Search tags..." aria-label="Search tags" />
          <div class="filter-row tags-filter-row" data-tag-filters aria-label="Tag filters">
            <button class="filter-chip active" type="button" data-tag-filter="all" aria-pressed="true">All</button>
            <button class="filter-chip" type="button" data-tag-filter="mixed" aria-pressed="false">Mixed</button>
            <button class="filter-chip" type="button" data-tag-filter="note" aria-pressed="false">Notes</button>
            <button class="filter-chip" type="button" data-tag-filter="catalog" aria-pressed="false">Catalog</button>
          </div>
          <div class="tags-taxonomy-controls" data-tag-taxonomy-controls>
            <div data-tag-create-form class="filter-row" role="group" aria-label="Create a personal tag">
              <label for="tag-new-label">New personal tag</label>
              <input id="tag-new-label" class="input" data-tag-create-name maxlength="80"
                placeholder="Name a tag..." disabled required />
              <button class="btn btn-ghost" type="button" disabled>Create tag</button>
            </div>
            <details class="tags-taxonomy-advanced" data-tag-advanced hidden>
              <summary>Manage labels</summary>
            <div data-tag-merge-form class="filter-row" role="group" aria-label="Merge two tag facets without changing saved content">
              <label for="tag-merge-from">Merge label</label>
              <select class="select" id="tag-merge-from" data-tag-merge-from disabled></select>
              <label for="tag-merge-to">Into</label>
              <select class="select" id="tag-merge-to" data-tag-merge-to disabled></select>
              <button class="btn btn-ghost" type="button" disabled>Merge labels</button>
            </div>
            <div data-tag-unmerge-form class="filter-row" role="group"
              aria-label="Undo a taxonomy merge without changing saved records">
              <label for="tag-unmerge-source">Restore merged label</label>
              <select class="select" id="tag-unmerge-source" data-tag-unmerge-source disabled></select>
              <button class="btn btn-ghost" type="button" disabled>Unmerge label</button>
            </div>
            <p class="text-muted">Merged labels stay in original Notes and courses; only the displayed taxonomy changes. Unmerge restores their original categories.</p>
            </details>
            <p role="status" aria-live="polite" data-tag-mutation-status></p>
          </div>
          <div class="grid grid-3 tags-grid" data-tag-list>
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
  const taxonomyControls = document.querySelector('[data-tag-taxonomy-controls]');
  if (!metricsRoot || !listRoot || !searchEl || !filtersRoot || !taxonomyControls) return;

  const version = (renderVersions.get(listRoot) || 0) + 1;
  renderVersions.set(listRoot, version);
  listRoot.setAttribute('aria-busy', 'true');
  const [notesResult, topicsResult, taxonomyResult] = await Promise.allSettled([
    (async () => {
      if (typeof window.DB?.getAllNotes !== 'function') throw new Error('Notes reader is unavailable');
      const notes = await window.DB.getAllNotes();
      if (!Array.isArray(notes)) throw new TypeError('Notes returned invalid records');
      return notes;
    })(),
    (async () => {
      await window.DataStore?.init?.();
      if (typeof window.DataStore?.allTopics !== 'function') throw new Error('Catalog reader is unavailable');
      const topics = await window.DataStore.allTopics();
      if (!Array.isArray(topics)) throw new TypeError('Catalog returned invalid records');
      return topics;
    })(),
    (async () => {
      const db = window.DB;
      if (typeof db?.getSetting !== 'function') {
        // Legacy read-only integrations can still browse existing labels;
        // only genuine canonical store support enables new mutations.
        return { writable: false, taxonomy: parseTagTaxonomy(null) };
      }
      const saved = await db.getSetting(TAG_TAXONOMY_KEY);
      return { writable: typeof db.saveSetting === 'function', taxonomy: parseTagTaxonomy(saved) };
    })(),
  ]);
  if (!document.body.contains(listRoot) || renderVersions.get(listRoot) !== version) return;
  listRoot.setAttribute('aria-busy', 'false');

  if (notesResult.status === 'rejected' || topicsResult.status === 'rejected'
      || taxonomyResult.status === 'rejected') {
    // Showing partial tag totals or a normal zero state after a canonical
    // read failure misrepresents the user's stored Notes and catalog.
    metricsRoot.replaceChildren();
    listRoot.replaceChildren();
    searchEl.disabled = true;
    filtersRoot.querySelectorAll('button').forEach(button => { button.disabled = true; });
    taxonomyControls.querySelectorAll('input,select,button').forEach(control => { control.disabled = true; });
    const routeState = window.OpenCourseDeck = window.OpenCourseDeck || {};
    routeState.rerenderVisibleTags = null;
    const failed = [
      notesResult.status === 'rejected' ? 'saved notes' : null,
      topicsResult.status === 'rejected' ? 'catalog' : null,
      taxonomyResult.status === 'rejected' ? 'tag taxonomy' : null,
    ].filter(Boolean).join(' and ');
    const error = document.createElement('div');
    error.className = 'tag-load-error';
    error.setAttribute('role', 'alert');
    const message = document.createElement('p');
    message.textContent = `Tags could not be loaded (${failed}). Your stored data was not changed.`;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn-primary';
    retry.dataset.tagRetry = 'true';
    retry.textContent = 'Retry loading tags';
    retry.addEventListener('click', () => {
      retry.disabled = true;
      retry.textContent = 'Retrying tags...';
      renderTags().catch(() => {
        retry.disabled = false;
        retry.textContent = 'Retry loading tags';
      });
    });
    error.append(message, retry);
    listRoot.appendChild(error);
    return;
  }

  searchEl.disabled = false;
  filtersRoot.querySelectorAll('button').forEach(button => { button.disabled = false; });
  const notes = notesResult.value;
  const topics = topicsResult.value;
  const { taxonomy, writable } = taxonomyResult.value;
  const preferredLabels = new Map(taxonomy.labels.map(item => [item.key, item.label]));

  const tagsByKey = new Map();
  const ensureTag = (rawTag) => {
    const label = normalizeTagValue(rawTag);
    if (!label) return null;
    // Use the same multilingual matching key as topbar and command palette.
    // Display remains the first user-provided label; the stored fields are read-only.
    const key = resolveTaxonomyKey(taxonomy, label);
    if (!key) return null;
    if (!tagsByKey.has(key)) {
      tagsByKey.set(key, {
        key,
        label: preferredLabels.get(key) || label,
        noteCount: 0,
        topicCount: 0,
        notes: new Set(),
        topics: new Set(),
      });
    }
    return tagsByKey.get(key);
  };

  notes.forEach(note => {
    const counted = new Set();
    readTagValues(note).forEach(rawTag => {
      const entry = ensureTag(rawTag);
      if (!entry || counted.has(entry.key)) return;
      counted.add(entry.key);
      entry.noteCount += 1;
      if (note.id) entry.notes.add(String(note.id));
    });
  });

  topics.forEach(topic => {
    const counted = new Set();
    readTagValues(topic).forEach(rawTag => {
      const entry = ensureTag(rawTag);
      if (!entry || counted.has(entry.key)) return;
      counted.add(entry.key);
      entry.topicCount += 1;
      if (topic.topicId || topic.id) entry.topics.add(String(topic.topicId || topic.id));
    });
  });

  // User-created labels with no linked record are useful empty taxonomy
  // entries, not evidence of fabricated study activity.
  taxonomy.labels.forEach(item => ensureTag(item.label));

  const tagEntries = [...tagsByKey.values()].sort((a, b) => (
    (b.noteCount + b.topicCount) - (a.noteCount + a.topicCount)
    || a.label.localeCompare(b.label)
  ));
  const routeState = window.OpenCourseDeck = window.OpenCourseDeck ?? {};
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

  const hasTags = tagEntries.length > 0;
  const advanced = taxonomyControls.querySelector('[data-tag-advanced]');
  if (advanced) advanced.hidden = tagEntries.length < 2 && Object.keys(taxonomy.aliases).length === 0;
  metricsRoot.hidden = !hasTags;
  searchEl.hidden = !hasTags;
  filtersRoot.hidden = !hasTags;
  metricsRoot.replaceChildren();
  if (hasTags) {
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
  }

  const matchesTagFilter = (tag) => {
    if (state.filter === 'all') return true;
    if (state.filter === 'mixed') return tag.noteCount > 0 && tag.topicCount > 0;
    if (state.filter === 'note') return tag.noteCount > 0 && tag.topicCount === 0;
    if (state.filter === 'catalog') return tag.topicCount > 0 && tag.noteCount === 0;
    return true;
  };
  // Recomputed per render: renderVisibleTags() is re-invoked on every search
  // keystroke and filter click, so the query/filter must be read at render
  // time rather than captured once when renderTags() built the tag maps.
  const computeVisibleTags = () => {
    const q = normalizeSearchQuery(state.query);
    return tagEntries.filter((tag) => {
      const matchesQuery = !q || tag.key.includes(q);
      return matchesQuery && matchesTagFilter(tag);
    });
  };

  const renderVisibleTags = () => {
    const visibleTags = computeVisibleTags();
    listRoot.replaceChildren();
    if (!tagEntries.length) {
      const empty = document.createElement('div');
      empty.className = 'tags-first-use';
      empty.dataset.tagFirstUse = 'true';
      const title = document.createElement('h2');
      title.textContent = 'No tags yet';
      const message = document.createElement('p');
      message.textContent = 'Add tags to notes or course materials to organize and find them here.';
      const actions = document.createElement('div');
      actions.className = 'button-row';
      const notesLink = document.createElement('a');
      notesLink.className = 'btn btn-primary';
      notesLink.href = '#/notes';
      notesLink.textContent = 'Open Notes';
      const coursesLink = document.createElement('a');
      coursesLink.className = 'btn btn-ghost';
      coursesLink.href = '#/courses';
      coursesLink.textContent = 'Browse courses';
      actions.append(notesLink, coursesLink);
      empty.append(title, message, actions);
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
    const source = tag.noteCount && tag.topicCount ? 'Mixed'
      : tag.noteCount ? 'Note' : tag.topicCount ? 'Catalog' : 'Personal';
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

  // Search and filter changes only affect which of the already-loaded tags
  // are shown, so re-run the in-memory render rather than renderTags(),
  // which re-reads the whole notes store and rebuilds the tag maps on every
  // keystroke (and races overlapping async renders against the DOM).
  routeState.rerenderVisibleTags = renderVisibleTags;

  const createForm = taxonomyControls.querySelector('[data-tag-create-form]');
  const createName = taxonomyControls.querySelector('[data-tag-create-name]');
  const mergeForm = taxonomyControls.querySelector('[data-tag-merge-form]');
  const mergeFrom = taxonomyControls.querySelector('[data-tag-merge-from]');
  const mergeTo = taxonomyControls.querySelector('[data-tag-merge-to]');
  const unmergeForm = taxonomyControls.querySelector('[data-tag-unmerge-form]');
  const unmergeSource = taxonomyControls.querySelector('[data-tag-unmerge-source]');
  const status = taxonomyControls.querySelector('[data-tag-mutation-status]');
  const mutationEnabled = writable && typeof window.DB?.getSetting === 'function';
  createName.disabled = !mutationEnabled;
  createForm.querySelector('button').disabled = !mutationEnabled;
  for (const field of [mergeFrom, mergeTo]) {
    const previous = field.value;
    field.replaceChildren();
    tagEntries.forEach(tag => {
      const option = document.createElement('option');
      option.value = tag.key;
      option.textContent = tag.label;
      field.appendChild(option);
    });
    if (tagEntries.some(tag => tag.key === previous)) field.value = previous;
    field.disabled = !mutationEnabled || tagEntries.length < 2;
  }
  mergeForm.querySelector('button').disabled = !mutationEnabled || tagEntries.length < 2;
  const previousAlias = unmergeSource.value;
  unmergeSource.replaceChildren();
  Object.keys(taxonomy.aliases).sort().forEach(key => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = (taxonomy.labels.find(label => label.key === key)?.label || key)
      + ' → ' + (preferredLabels.get(resolveTaxonomyKey(taxonomy, key))
        || resolveTaxonomyKey(taxonomy, key));
    unmergeSource.appendChild(option);
  });
  if (Object.prototype.hasOwnProperty.call(taxonomy.aliases, previousAlias)) {
    unmergeSource.value = previousAlias;
  }
  unmergeSource.disabled = !mutationEnabled || !Object.keys(taxonomy.aliases).length;
  unmergeForm.querySelector('button').disabled = unmergeSource.disabled;
  let mutationPending = false;
  const applyMutation = async transform => {
    if (mutationPending || !mutationEnabled) return;
    mutationPending = true;
    taxonomyControls.querySelectorAll('input,select,button').forEach(control => { control.disabled = true; });
    status.removeAttribute('data-tag-mutation-error');
    status.textContent = 'Saving tag taxonomy...';
    try {
      await persistTagTaxonomy(window.DB, transform);
      status.textContent = 'Tag taxonomy saved.';
      // Keep search/filter state and re-read durable data; never claim a
      // completed edit by modifying only the client-side facet map.
      if (document.body.contains(listRoot)) await renderTags();
    } catch (error) {
      if (document.body.contains(listRoot)) {
        status.dataset.tagMutationError = 'true';
        status.textContent = 'Tag taxonomy was not saved or verified. ' + (error?.message || String(error));
        createName.disabled = false;
        createForm.querySelector('button').disabled = false;
        const canMerge = tagEntries.length > 1;
        mergeFrom.disabled = !canMerge;
        mergeTo.disabled = !canMerge;
        mergeForm.querySelector('button').disabled = !canMerge;
        const canUnmerge = Object.keys(taxonomy.aliases).length > 0;
        unmergeSource.disabled = !canUnmerge;
        unmergeForm.querySelector('button').disabled = !canUnmerge;
      }
    } finally {
      mutationPending = false;
    }
  };
  // Rebind to the current render state: leaving an old listener in place
  // retains stale controls, counts and write permissions after reload.
  const submitCreate = () => void applyMutation(current => createTaxonomyTag(current, createName.value));
  const submitMerge = () => void applyMutation(current => mergeTaxonomyTags(current, mergeFrom.value, mergeTo.value));
  createForm.querySelector('button').onclick = submitCreate;
  mergeForm.querySelector('button').onclick = submitMerge;
  unmergeForm.querySelector('button').onclick = () => void applyMutation(current =>
    unmergeTaxonomyTag(current, unmergeSource.value));
  createName.onkeydown = event => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    if (!createForm.querySelector('button').disabled) submitCreate();
  };

  if (!searchEl.dataset.pdBound) {
    searchEl.dataset.pdBound = 'true';
    searchEl.addEventListener('input', () => {
      state.query = searchEl.value || '';
      routeState.rerenderVisibleTags?.();
    });
  }
  if (!filtersRoot.dataset.pdBound) {
    filtersRoot.dataset.pdBound = 'true';
    filtersRoot.addEventListener('click', (event) => {
      const button = event.target?.closest?.('[data-tag-filter]');
      if (!button) return;
      state.filter = button.dataset.tagFilter || 'all';
      filtersRoot.querySelectorAll('[data-tag-filter]').forEach((chip) => {
        const active = chip.dataset.tagFilter === state.filter;
        chip.classList.toggle('active', active);
        chip.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      routeState.rerenderVisibleTags?.();
    });
  }
}
