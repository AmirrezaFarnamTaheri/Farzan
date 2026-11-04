import { courseTopicIdentity } from '../core/courseTopicIdentity.js';

export function mountPlaylistsView({
  setView,
  safeMediaUrl,
  Router = window.OpenCourseDeck?.Router,
  setPendingCourseSession,
  Toast = window.OpenCourseDeck?.Toast
      // Fall back to no-ops: Toast may be unregistered during partial
      // init or in test harnesses, and a bare Toast.success() then threw
      // mid-handler, skipping the post-mutation UI refresh.
      ?? { success() {}, error() {}, info() {}, warning() {} },
} = {}) {
  setView(`
    <section class="view view-playlists">
      <div class="page-header playlists-header">
        <div>
          <div class="page-title-row">
            <h1 class="page-title">Playlists</h1>
          </div>
          <p class="page-subtitle">Organize videos into a playing order and return to saved moments.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" type="button" data-playlists-new>New playlist</button>
        </div>
      </div>
      <div class="stat-grid" data-playlist-metrics hidden></div>
      <div class="playlists-list-card">
        <div class="grid grid-3" data-playlist-list>
          <p>Loading your playlists...</p>
        </div>
      </div>
      <details class="playlists-discover" data-playlists-discover hidden>
        <summary class="playlists-discover-summary">Browse course queues</summary>
        <div class="card card-filled playlists-create-card">
          <div class="card-body">
            <div class="playlists-form">
              <label class="playlists-field">
                <span class="text-sm font-semibold">Course queue</span>
                <select class="select" data-playlist-source aria-label="Choose source course queue"></select>
              </label>
              <label class="playlists-field">
                <span class="text-sm font-semibold">Playlist name</span>
                <input class="input" data-playlist-name placeholder="e.g. Focus Sprint & Review Queue" />
              </label>
              <button class="btn btn-primary" type="button" data-save-playlist>
                <svg class="icon" aria-hidden="true"><use href="#i-bookmark"/></svg>
                Save selected queue
              </button>
            </div>
          </div>
        </div>
        <div class="grid grid-3" data-playlist-catalog></div>
      </details>
    </section>
  `);
  const create = document.querySelector('[data-playlists-new]');
  create?.addEventListener('click', () => {
    const discovery = document.querySelector('[data-playlists-discover]');
    if (!discovery) return;
    discovery.dataset.userOpened = 'true';
    discovery.hidden = false;
    discovery.open = true;
    document.querySelector('[data-playlist-name]')?.focus({ preventScroll: true });
  });
  renderPlaylists({ safeMediaUrl, Toast, Router, setPendingCourseSession });
}

function currentPlayerTracks() {
  return [...document.querySelectorAll('[data-player]')]
    .flatMap(el => {
      try { return el._pdPlayer?.queue ?? []; } catch { return []; }
    })
    .filter(track => track && (track.src || track.url || track.title));
}

// Read only an actual player position. The Playlists page cannot know the
// private randomized shuffle order, so it never guesses the next track.
function currentPlayerPosition() {
  for (const element of document.querySelectorAll('[data-player]')) {
    try {
      const player = element._pdPlayer;
      if (!player) continue;
      const snapshot = typeof player.snapshot === 'function' ? player.snapshot() : null;
      const queue = Array.isArray(snapshot?.queue) ? snapshot.queue : player.queue;
      if (!Array.isArray(queue) || !queue.length) continue;
      const index = snapshot?.queueIndex ?? player.trackIndex;
      if (!Number.isInteger(index) || index < 0 || index >= queue.length) continue;
      const title = track => track && (track.title || track.topicTitle || track.topicId);
      const current = title(queue[index]);
      if (!current) continue;
      const next = snapshot?.shuffle === true ? null : title(queue[index + 1]);
      return { current: String(current), next: next ? String(next) : null, index };
    } catch { /* A destroyed player must not block saved playlists. */ }
  }
  return null;
}

// A live queue is resumable only from the actual player, with its confirmed
// media ordering and explicit shuffle/repeat state. Never synthesize a resume
// session from the textual playlist preview or stale catalog metadata.
function readVerifiedLivePlayerSnapshot() {
  for (const node of document.querySelectorAll('[data-player]')) {
    try {
      const snapshot = node._pdPlayer?.snapshot?.();
      const queue = snapshot?.queue;
      const index = snapshot?.queueIndex;
      if (!Array.isArray(queue) || !queue.length
        || !Number.isInteger(index) || index < 0 || index >= queue.length
        || !queue.every(track => track && typeof track === 'object'
          && (typeof track.src === 'string' && track.src.length
            || typeof track.url === 'string' && track.url.length))
        || !queue[index]?.courseId
        || !Number.isFinite(snapshot.currentTime) || snapshot.currentTime < 0
        || typeof snapshot.shuffle !== 'boolean'
        || !['none', 'one', 'all'].includes(snapshot.repeat)
        || !Number.isFinite(snapshot.volume)
        || snapshot.volume < 0 || snapshot.volume > 1
        || typeof snapshot.muted !== 'boolean'
        || !Number.isFinite(snapshot.playbackRate) || snapshot.playbackRate <= 0) continue;
      return {
        ...snapshot, queue: queue.map(track => ({ ...track })),
        track: { ...queue[index] }, playing: false,
      };
    } catch { /* A disconnected or destroyed player is not a resume source. */ }
  }
  return null;
}

function catalogVideoTopics(topics, safeMediaUrl) {
  return topics.filter(topic => {
    const firstVideo = topic.videos?.[0] ?? topic.url;
    return Boolean(safeMediaUrl(firstVideo));
  });
}

function playlistTopicTitle(topic) {
  return topic?.title || topic?.topicTitle || topic?.topicId || 'Untitled topic';
}

// A course/topic pair is the canonical lookup key. JSON tuples cannot
// collide when imported identifiers contain separators or mixed scripts.
function courseTopicKey(courseId, topicId) {
  try { return courseTopicIdentity(courseId, topicId); }
  catch { return null; }
}

function savedSourceIsAligned(saved) {
  return Boolean(saved && typeof saved === 'object' && saved.id && saved.title
    && Array.isArray(saved.topicIds) && saved.topicIds.length > 0
    && Array.isArray(saved.sourceRefs) && saved.sourceRefs.length === saved.topicIds.length
    && saved.sourceRefs.every((ref, index) => ref && !Array.isArray(ref)
      && typeof ref === 'object' && typeof ref.courseId === 'string' && ref.courseId.trim()
      && typeof ref.topicId === 'string' && ref.topicId === String(saved.topicIds[index])
      && courseTopicKey(ref.courseId, ref.topicId)));
}

function resolveSavedTopic(saved, index, topicsByCourse, ambiguousCourse) {
  if (!savedSourceIsAligned(saved)) return null;
  const ref = saved.sourceRefs[index];
  const key = courseTopicKey(ref.courseId, ref.topicId);
  return key && !ambiguousCourse.has(key) ? topicsByCourse.get(key) || null : null;
}

function sanitizeSavedPlaylists(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some(item => !savedSourceIsAligned(item))) {
    throw new TypeError('Saved playlists require canonical course/topic source references');
  }
  return value.slice();
}

async function persistSavedPlaylists(db, expected, next) {
  if (typeof db?.compareAndSwapSetting !== 'function') {
    throw new Error('Canonical atomic saved playlist storage is unavailable');
  }
  const accepted = await db.compareAndSwapSetting('ocd_playlists', expected, next);
  if (accepted !== true) {
    throw new Error('Saved playlist changed elsewhere or atomic write was not acknowledged; reload before editing');
  }
  const verified = await db.getSetting('ocd_playlists');
  if (!Array.isArray(verified) || JSON.stringify(verified) !== JSON.stringify(next)) {
    throw new Error('Saved playlist write could not be verified after saving');
  }
}

async function renderPlaylists(deps) {
  const { safeMediaUrl, Router, setPendingCourseSession, Toast = window.OpenCourseDeck?.Toast } = deps;
  const metricsRoot = document.querySelector('[data-playlist-metrics]');
  const listRoot = document.querySelector('[data-playlist-list]');
  const catalogRoot = document.querySelector('[data-playlist-catalog]');
  const discover = document.querySelector('[data-playlists-discover]');
  if (!metricsRoot || !listRoot || !catalogRoot || !discover) return;

  let savedReadError = null;
  let catalogReadError = null;
  let timestampReadError = null;
  const [topics, timestamps, savedPlaylists] = await Promise.all([
    (async () => {
      try {
        if (typeof window.DataStore?.allTopics !== 'function') {
          throw new Error('Canonical course catalog reader unavailable');
        }
        await window.DataStore.init?.();
        // A failed imported-course overlay is not proof that the catalog has
        // no user-created courses; keep the saved playlist view read-only.
        await window.OpenCourseDeck?.UserLibrary?.overlay?.();
        const catalogTopics = await window.DataStore.allTopics();
        if (!Array.isArray(catalogTopics)) throw new TypeError('Invalid canonical playlist catalog topics');
        return catalogTopics;
      } catch (error) {
        // A known catalog reader failure is not an empty course library.
        // Do not expose mutation controls with a partial canonical corpus.
        catalogReadError = error;
        return [];
      }
    })(),
    (async () => {
      try {
        if (typeof window.DB?.getAllTimestamps !== 'function') {
          throw new Error('Canonical saved timestamp reader unavailable');
        }
        const values = await window.DB.getAllTimestamps();
        if (!Array.isArray(values)) throw new TypeError('Invalid canonical timestamp collection');
        return values;
      } catch (error) {
        // A known canonical failure is not proof of zero saved moments.
        timestampReadError = error;
        return [];
      }
    })(),
    (async () => {
      try {
        if (typeof window.DB?.getSetting !== 'function') {
          throw new Error('Canonical saved playlist reader unavailable');
        }
        return sanitizeSavedPlaylists((await window.DB.getSetting('ocd_playlists')) ?? []);
      } catch (error) {
        savedReadError = error;
        return [];
      }
    })(),
  ]);
  if (!document.body.contains(listRoot)) return;
  if (savedReadError || catalogReadError || timestampReadError) {
    // Neither an unreadable saved deck nor an inaccessible canonical catalog
    // is proof that the user's collection is empty. Hide all creation and
    // reordering controls until the required readers are healthy.
    console.warn(savedReadError ? '[Playlists] Failed to load saved queues'
      : catalogReadError ? '[Playlists] Failed to load course catalog'
        : '[Playlists] Failed to load saved timestamps',
    savedReadError || catalogReadError || timestampReadError);
    metricsRoot.replaceChildren();
    metricsRoot.hidden = true;
    discover.open = false;
    discover.hidden = true;
    catalogRoot.replaceChildren();
    listRoot.replaceChildren();
    listRoot.onclick = null;
    const alert = document.createElement('div');
    alert.className = 'playlists-load-error';
    alert.dataset.playlistsError = '';
    alert.setAttribute('role', 'alert');
    const description = document.createElement('p');
    description.textContent = savedReadError
      ? 'Saved playlists could not be loaded. No data has been changed.'
      : catalogReadError
        ? 'Course catalog could not be loaded. Your saved playlists have not been changed.'
        : 'Saved timestamps could not be loaded. Your resume moments and playlists have not been changed.';
    const retry = document.createElement('button');
    retry.className = 'btn btn-primary btn-sm';
    retry.type = 'button';
    retry.dataset.playlistsRetry = '';
    retry.textContent = 'Retry loading playlists';
    retry.addEventListener('click', () => {
      retry.disabled = true;
      void renderPlaylists(deps);
    });
    alert.append(description, retry);
    listRoot.appendChild(alert);
    return;
  }

  const activeQueue = currentPlayerTracks();
  const activePosition = activeQueue.length ? currentPlayerPosition() : null;
  const videoTopics = catalogVideoTopics(topics, safeMediaUrl);
  // Imported courses may reuse a topicId. A topic-only saved queue cannot
  // select one safely, so do not let last-write-wins Map semantics silently
  // redirect study playback to a different course.
  const topicsByCourse = new Map();
  const ambiguousCourseTopics = new Set();
  for (const topic of topics) {
    const key = courseTopicKey(topic?.courseId, topic?.topicId);
    if (!key || ambiguousCourseTopics.has(key)) continue;
    if (topicsByCourse.has(key)) {
      topicsByCourse.delete(key);
      ambiguousCourseTopics.add(key);
    } else topicsByCourse.set(key, topic);
  }
  const savedTopic = (saved, index) => resolveSavedTopic(
    saved, index, topicsByCourse, ambiguousCourseTopics,
  );
  const timestampTopics = timestamps
    .filter(item => item?.id && item?.topicId && item?.courseId)
    .map(item => {
      const key = courseTopicKey(item.courseId, item.topicId);
      const topic = key && !ambiguousCourseTopics.has(key) ? topicsByCourse.get(key) : null;
      // Keep the saved moment visible when a source is offline or ambiguous.
      // No topic-only fallback and no guessed playback destination: the card
      // links to Bookmarks, which validates its exact source before handoff.
      return {
        ...(topic || {}),
        topicId: item.topicId,
        courseId: item.courseId,
        position: item.position,
        timestampId: item.id,
        title: item.title || item.topicTitle || topic?.title || 'Saved timestamp',
      };
    });

  const playlists = [];
  savedPlaylists
    .slice()
    .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))
    .forEach(saved => {
      // Keep the saved order visible even when a lesson cannot currently
      // resolve, rather than compressing a partially unavailable queue.
      const savedItems = saved.topicIds.map((topicId, index) =>
        playlistTopicTitle(savedTopic(saved, index) || { topicId: String(topicId) }));
      playlists.push({
        id: saved.id,
        label: 'Saved',
        title: saved.title,
        detail: `${saved.topicIds.length} saved topic${saved.topicIds.length === 1 ? '' : 's'}`,
        href: '#/courses',
        items: savedItems,
        saved: true,
      });
    });
  if (activeQueue.length) {
    playlists.push({
      id: 'active-queue',
      label: 'Live',
      title: 'Active player queue',
      detail: `${activeQueue.length} track${activeQueue.length === 1 ? '' : 's'} currently loaded`,
      href: '#/courses',
      items: activeQueue.map(track => track.title || track.topicTitle || track.topicId || 'Queued track'),
    });
  }
  if (timestampTopics.length) {
    playlists.push({
      id: 'timestamp-queue',
      label: 'Resume',
      title: 'Saved timestamp queue',
      detail: `${timestampTopics.length} saved point${timestampTopics.length === 1 ? '' : 's'} ready to revisit`,
      href: '#/bookmarks',
      items: timestampTopics.map(playlistTopicTitle),
    });
  }

  const sourceGroups = new Map();
  videoTopics.forEach(topic => {
    const key = `${topic.courseId || 'course'}|${topic.sourceIndex ?? topic.sourceLabel ?? 'source'}`;
    if (!sourceGroups.has(key)) {
      sourceGroups.set(key, {
        id: `source-${sourceGroups.size + 1}`,
        label: 'Catalog',
        title: topic.courseTitle || topic.courseId || topic.sourceLabel || 'Catalog course',
        sourceLabel: topic.sourceLabel || '',
        courseId: topic.courseId,
        href: '#/courses',
        items: [],
        topicIds: [],
        sourceRefs: [],
      });
    }
    sourceGroups.get(key).items.push(playlistTopicTitle(topic));
    sourceGroups.get(key).topicIds.push(topic.topicId);
    sourceGroups.get(key).sourceRefs.push({
      courseId: topic.courseId == null ? '' : String(topic.courseId),
      topicId: topic.topicId == null ? '' : String(topic.topicId),
    });
  });
  const catalogGroups = [...sourceGroups.values()]
    .sort((a, b) => b.items.length - a.items.length || a.title.localeCompare(b.title));
  const catalogPlaylists = catalogGroups.slice(0, 10).map(group => ({
    ...group,
    detail: `${group.items.length} video topic${group.items.length === 1 ? '' : 's'}`,
  }));
  // Prioritize personal queues; discovery remains available without dominating the page.
  discover.hidden = catalogPlaylists.length === 0;
  discover.open = discover.dataset.userOpened === 'true'
    || (catalogPlaylists.length > 0 && playlists.length === 0);
  discover.querySelector('summary').textContent = `Browse featured course queues (${catalogPlaylists.length} of ${catalogGroups.length}) · Video topics: ${videoTopics.length}`;

  metricsRoot.replaceChildren();
  const meaningfulMetrics = [
    ['Saved playlists', savedPlaylists.length],
    ['Active tracks', activeQueue.length],
    ['Saved timestamps', timestamps.length],
  ].filter(([, count]) => count > 0);
  // One queue already reports its track count; do not repeat it as a lone stat.
  metricsRoot.hidden = meaningfulMetrics.length < 2;
  meaningfulMetrics.forEach(([label, value]) => {
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
  catalogRoot.replaceChildren();
  if (!playlists.length) {
    const empty = document.createElement('p');
    empty.className = 'text-muted playlists-empty';
    empty.textContent = catalogPlaylists.length
      ? 'No saved playlists yet. Browse course queues below to get started.'
      : 'No saved queues yet. Add video lessons to your library to build a playlist.';
    listRoot.appendChild(empty);
  }

  const appendPlaylistCard = (playlist, root) => {
    const card = document.createElement('article');
    card.className = 'card playlist-card';
    card.dataset.playlistId = playlist.id;
    if (playlist.courseId) card.dataset.courseId = String(playlist.courseId);
    const body = document.createElement('div');
    body.className = 'card-body playlist-card-body';
    const badge = document.createElement('span');
    badge.className = playlist.label === 'Live' ? 'badge badge-success' : 'badge badge-info';
    badge.textContent = playlist.label;
    const title = document.createElement('h2');
    title.className = 'h4 playlist-card-title';
    title.dir = 'auto';
    title.textContent = playlist.title;
    const section = document.createElement('p');
    section.className = 'playlist-source-label';
    if (playlist.sourceLabel && playlist.sourceLabel !== playlist.title) {
      const isolator = document.createElement('bdi');
      isolator.dir = 'auto';
      isolator.textContent = playlist.sourceLabel;
      section.appendChild(isolator);
    } else {
      section.hidden = true;
    }
    const detail = document.createElement('p');
    detail.className = 'playlist-card-detail';
    detail.textContent = playlist.detail;
    const preview = document.createElement('ol');
    preview.className = 'compact-list playlist-preview';
    // The currently playing row is already identified above with its real
    // player index. Do not repeat it as a second unlabeled preview line.
    const previewItems = playlist.id === 'active-queue'
      && activePosition && playlist.items[activePosition.index] === activePosition.current
      ? playlist.items.filter((_, index) => index !== activePosition.index)
      : playlist.items;
    previewItems.slice(0, 4).forEach(item => {
      const li = document.createElement('li');
      li.className = 'playlist-preview-item';
      li.dir = 'auto';
      li.textContent = item;
      li.title = item;
      preview.appendChild(li);
    });
    const more = document.createElement('p');
    more.className = 'playlist-more';
    const remaining = Math.max(0, previewItems.length - 4);
    more.textContent = `${remaining.toLocaleString()} more topic${remaining === 1 ? '' : 's'}`;
    more.hidden = remaining === 0;
    const actions = document.createElement('div');
    actions.className = 'playlist-card-actions';
    const link = document.createElement('a');
    link.className = 'btn btn-ghost';
    link.href = playlist.href;
    if (playlist.id === 'active-queue') link.dataset.resumeLiveQueue = '';
    link.textContent = playlist.label === 'Resume' ? 'Open saved items'
      : playlist.label === 'Live' ? 'Open player' : 'Open courses';
    body.append(badge, title, section, detail, preview, more, actions);
    if (playlist.id === 'active-queue' && activePosition) {
      const position = document.createElement('div');
      position.className = 'playlist-live-position';
      const addPosition = (label, value, key) => {
        const paragraph = document.createElement('p');
        paragraph.className = 'playlist-card-detail';
        paragraph.dataset[key] = '';
        const labelSpan = document.createElement('span');
        labelSpan.textContent = label + ': ';
        const isolator = document.createElement('bdi');
        isolator.dir = 'auto';
        isolator.textContent = value;
        paragraph.append(labelSpan, isolator);
        position.appendChild(paragraph);
      };
      addPosition('Current', activePosition.current, 'playlistCurrent');
      if (activePosition.next) addPosition('Up next', activePosition.next, 'playlistNext');
      body.insertBefore(position, preview);
    }
    actions.appendChild(link);
    if (playlist.saved) {
      // Keep the four-row compact preview. The disclosure exposes the full
      // saved order, including topics whose source is temporarily unavailable.
      const persisted = savedPlaylists.find(item => item.id === playlist.id);
      if (persisted?.topicIds?.length > 1) {
        const reorder = document.createElement('details');
        reorder.className = 'playlist-reorder';
        const summary = document.createElement('summary');
        summary.textContent = 'Reorder saved topics';
        const ordered = document.createElement('ol');
        ordered.className = 'compact-list playlist-reorder-list';
        persisted.topicIds.forEach((topicId, index) => {
          const item = document.createElement('li');
          item.className = 'playlist-reorder-item';
          const title = document.createElement('span');
          title.dir = 'auto';
          const resolved = savedTopic(persisted, index);
          title.textContent = resolved ? playlistTopicTitle(resolved) : String(topicId);
          // An unavailable source still needs a readable identity.
          item.appendChild(title);
          for (const direction of ['up', 'down']) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn-ghost btn-sm';
            button.dataset.playlistMove = direction;
            button.dataset.playlistId = String(playlist.id);
            button.dataset.topicIndex = String(index);
            button.dataset.topicId = String(topicId);
            button.dataset.playlistCourse = String(persisted.sourceRefs?.[index]?.courseId ?? '');
            button.setAttribute('aria-label', `Move ${title.textContent} ${direction}`);
            button.textContent = direction === 'up' ? 'Up' : 'Down';
            button.disabled = direction === 'up'
              ? index === 0 : index === persisted.topicIds.length - 1;
            item.appendChild(button);
          }
          ordered.appendChild(item);
        });
        reorder.append(summary, ordered);
        body.appendChild(reorder);
      }
      const openQueue = document.createElement('button');
      openQueue.className = 'btn btn-primary btn-sm';
      openQueue.type = 'button';
      openQueue.dataset.openPlaylist = playlist.id;
      openQueue.textContent = 'Open saved queue';
      actions.appendChild(openQueue);
      const remove = document.createElement('button');
      remove.className = 'btn btn-ghost';
      remove.type = 'button';
      remove.dataset.deletePlaylist = playlist.id;
      remove.textContent = 'Delete saved';
      actions.appendChild(remove);
    }
    card.appendChild(body);
    root.appendChild(card);
  };
  // A hard 24-card cap made saved queues after position 24 permanently
  // unreachable. Render in bounded pages without hiding user-owned data or
  // paying the cost of constructing every card on first entry.
  const pageSize = 24;
  let visibleCount = 0;
  const showMore = document.createElement('button');
  showMore.type = 'button';
  showMore.className = 'btn btn-ghost btn-sm playlists-show-more';
  showMore.dataset.playlistsShowMore = '';
  const appendNextPage = () => {
    const beforeCount = visibleCount;
    const hadFocus = document.activeElement === showMore;
    showMore.remove();
    const end = Math.min(playlists.length, visibleCount + pageSize);
    playlists.slice(visibleCount, end).forEach(playlist => appendPlaylistCard(playlist, listRoot));
    visibleCount = end;
    if (visibleCount < playlists.length) {
      showMore.textContent = `Show more playlists (${visibleCount} of ${playlists.length})`;
      listRoot.appendChild(showMore);
      if (hadFocus) showMore.focus({ preventScroll: true });
    } else if (hadFocus) {
      // Do not strand keyboard focus on a detached final disclosure button.
      const firstNew = listRoot.querySelectorAll('.playlist-card')[beforeCount];
      firstNew?.querySelector('[data-open-playlist], button')?.focus({ preventScroll: true });
    }
  };
  showMore.addEventListener('click', appendNextPage);
  appendNextPage();
  catalogPlaylists.forEach(playlist => appendPlaylistCard(playlist, catalogRoot));

  // New saved queues carry exact (courseId, topicId) identities, so a topic
  // ID reused in another course is not inherently ambiguous. When a catalog
  // lacks that identity, only globally unique topic IDs can be saved.
  const scopedCatalog = group => Boolean(group && group.topicIds.length
    && group.sourceRefs.length === group.topicIds.length
    && new Set(group.topicIds.map(String)).size === group.topicIds.length
    && group.sourceRefs.every(ref => {
      const key = courseTopicKey(ref.courseId, ref.topicId);
      return key && topicsByCourse.has(key) && !ambiguousCourseTopics.has(key);
    }));
  const canSaveCatalog = group => Boolean(group?.topicIds?.length && scopedCatalog(group));
  const firstCatalog = catalogGroups.find(canSaveCatalog) || catalogGroups[0];
  const sourcePicker = document.querySelector('[data-playlist-source]');
  if (sourcePicker) {
    sourcePicker.replaceChildren(...catalogGroups.map((group, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${group.title} · ${group.items.length} videos`;
      option.dir = 'auto';
      return option;
    }));
    sourcePicker.value = String(Math.max(0, catalogGroups.indexOf(firstCatalog)));
  }
  const selectedCatalog = () => catalogGroups[Number(sourcePicker?.value ?? 0)];
  const saveBtn = document.querySelector('[data-save-playlist]');
  if (saveBtn) {
    let creating = false;
    document.querySelector('[data-playlist-source-warning]')?.remove();
    const warning = document.createElement('p');
    warning.dataset.playlistSourceWarning = '';
    warning.setAttribute('role', 'alert');
    warning.textContent = 'This queue cannot be saved because its course/topic sources cannot be identified uniquely.';
    saveBtn.closest('.playlists-form')?.after(warning);
    const updateAvailability = () => {
      const unsafe = !canSaveCatalog(selectedCatalog());
      warning.hidden = !unsafe;
      saveBtn.disabled = creating || unsafe
        || typeof window.DB?.compareAndSwapSetting !== 'function'
        || typeof window.DB?.getSetting !== 'function';
    };
    if (sourcePicker) sourcePicker.onchange = updateAvailability;
    updateAvailability();
    saveBtn.onclick = async () => {
      const choice = selectedCatalog();
      if (creating || !canSaveCatalog(choice)
        || typeof window.DB?.compareAndSwapSetting !== 'function'
        || typeof window.DB?.getSetting !== 'function') return;
      const input = document.querySelector('[data-playlist-name]');
      const title = String(input?.value || choice.title || 'Saved playlist').trim() || 'Saved playlist';
      creating = true;
      updateAvailability();
      try {
        const raw = await window.DB.getSetting('ocd_playlists');
        const current = sanitizeSavedPlaylists(raw ?? []);
        if (current.length >= 50) throw new Error('Saved playlist limit reached; remove one before creating another');
        const now = Date.now();
        const id = `playlist-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        const next = [
          { id, title, topicIds: [...new Set(choice.topicIds.map(String))],
            sourceRefs: choice.sourceRefs.map(ref => ({ ...ref })),
            createdAt: now, updatedAt: now },
          ...current,
        ];
        await persistSavedPlaylists(window.DB, raw, next);
        if (input) input.value = '';
        Toast.success?.('Playlist saved');
        void renderPlaylists(deps);
      } catch (error) {
        Toast.error?.('Could not save playlist: ' + (error?.message || 'Storage unavailable'));
      } finally {
        creating = false;
        updateAvailability();
      }
    };
  }

  let reorderBusy = false;
  listRoot.onclick = async (event) => {
    const live = event.target?.closest?.('[data-resume-live-queue]');
    if (live) {
      const snapshot = readVerifiedLivePlayerSnapshot();
      // A missing or untrustworthy snapshot must not open unrelated media.
      // Leave the real href intact so normal catalog navigation still works.
      if (!snapshot || typeof setPendingCourseSession !== 'function'
        || typeof Router?.navigate !== 'function') return;
      event.preventDefault();
      event.stopPropagation();
      try {
        setPendingCourseSession(snapshot);
        Router.navigate('#/courses');
      } catch {
        Toast.error?.('The active player session could not be restored');
      }
      return;
    }
    const move = event.target?.closest?.('[data-playlist-move]');
    if (move) {
      if (reorderBusy || move.disabled) return;
      const wasExpanded = move.closest('details')?.open === true;
      const hadKeyboardFocus = document.activeElement === move;
      if (typeof window.DB?.getSetting !== 'function'
          || typeof window.DB?.compareAndSwapSetting !== 'function') {
        Toast.error?.('Saved playlist storage is unavailable');
        return;
      }
      reorderBusy = true;
      move.disabled = true;
      try {
        // Refetch the authoritative deck and refuse a stale UI action rather
        // than overwriting a more recent queue update from another tab.
        const records = await window.DB.getSetting('ocd_playlists');
        if (!Array.isArray(records)) throw new TypeError('Saved playlists could not be read');
        const selected = records.find(item => item?.id === move.dataset.playlistId);
        const rendered = savedPlaylists.find(item => item.id === move.dataset.playlistId);
        if (!selected || !Array.isArray(selected.topicIds) || !rendered
            || selected.topicIds.length !== rendered.topicIds.length
            || selected.topicIds.some((id, i) => String(id) !== String(rendered.topicIds[i]))
            || JSON.stringify(selected.sourceRefs) !== JSON.stringify(rendered.sourceRefs)
            || !savedSourceIsAligned(selected)) {
          throw new Error('Saved playlist was changed elsewhere; reload before reordering');
        }
        const from = Number(move.dataset.topicIndex);
        const to = from + (move.dataset.playlistMove === 'up' ? -1 : 1);
        if (!Number.isSafeInteger(from) || from < 0 || to < 0
            || to >= selected.topicIds.length
            || String(selected.topicIds[from]) !== move.dataset.topicId
            || String(selected.sourceRefs?.[from]?.courseId ?? '') !== move.dataset.playlistCourse) {
          throw new Error('This playlist order is no longer current');
        }
        const ids = [...selected.topicIds];
        [ids[from], ids[to]] = [ids[to], ids[from]];
        const refs = Array.isArray(selected.sourceRefs) ? [...selected.sourceRefs] : null;
        if (refs) [refs[from], refs[to]] = [refs[to], refs[from]];
        const updated = records.map(record => record === selected
          ? { ...record, topicIds: ids, ...(refs ? { sourceRefs: refs } : {}),
            updatedAt: Date.now() } : record);
        await persistSavedPlaylists(window.DB, records, updated);
        Toast.success?.('Playlist order saved');
        await renderPlaylists(deps);
        if (document.body.contains(listRoot)) {
          // The reorder controls are replaced on each canonical refresh.
          // Reopen the previous disclosure and put focus on the moved topic
          // rather than leaving keyboard users on a detached disabled button.
          const controls = [...listRoot.querySelectorAll('[data-playlist-move]')]
            .filter(button => button.dataset.playlistId === move.dataset.playlistId
              && button.dataset.topicId === move.dataset.topicId
              && button.dataset.playlistCourse === move.dataset.playlistCourse
              && Number(button.dataset.topicIndex) === to);
          const focusTarget = controls.find(button =>
            button.dataset.playlistMove === move.dataset.playlistMove && !button.disabled)
            || controls.find(button => !button.disabled);
          const disclosure = focusTarget?.closest('details');
          if (wasExpanded && disclosure) disclosure.open = true;
          if (hadKeyboardFocus && focusTarget && (!disclosure || disclosure.open)) {
            focusTarget.focus({ preventScroll: true });
          }
        }
      } catch (error) {
        Toast.error?.('Could not change playlist order: ' + (error?.message || 'Storage unavailable'));
      } finally {
        reorderBusy = false;
        move.disabled = false;
      }
      return;
    }
    const open = event.target?.closest?.('[data-open-playlist]');
    if (open) {
      if (typeof setPendingCourseSession !== 'function' || typeof Router?.navigate !== 'function') {
        Toast.error?.('Player navigation is unavailable');
        return;
      }
      const saved = savedPlaylists.find(item => item.id === open.dataset.openPlaylist);
      if (!saved) return;
      const stillCurrent = async () => {
        const rows = await window.DB?.getSetting?.('ocd_playlists');
        if (!Array.isArray(rows)) return false;
        const row = rows.find(record => String(record?.id) === String(saved.id));
        return row != null && JSON.stringify(row) === JSON.stringify(saved);
      };
      try {
        // The rendered card is not a durable revision. Revalidate before
        // and after async media resolution in case another tab changes it.
        if (!(await stillCurrent())) throw new Error('Saved playlist changed elsewhere; reload before opening');
        if (!saved.topicIds.length || !savedSourceIsAligned(saved)) {
          throw new Error('Saved queue has incomplete or invalid source identity');
        }
        const queue = [];
        for (let index = 0; index < saved.topicIds.length; index++) {
          const topicId = String(saved.topicIds[index]);
          const topic = savedTopic(saved, index);
          if (!topic) throw new Error('Saved queue source is ambiguous, missing or unavailable');
          const media = topic.videos?.[0] ?? topic.url;
          if (!media) throw new Error('Saved queue lesson is missing or unavailable');
          let src;
          try {
            const resolve = window.OpenCourseDeck?.UserLibrary?.resolvePlayable;
            src = typeof resolve === 'function' ? await resolve(media, safeMediaUrl) : safeMediaUrl(media);
          } catch {
            src = null;
          }
          // A partial queue is never a legitimate replay of a saved order.
          if (!src) throw new Error('Saved queue lesson is unavailable offline; no partial queue was opened');
          queue.push({
            id: topicId, topicId, courseId: topic.courseId,
            courseTitle: topic.courseTitle || '', title: playlistTopicTitle(topic),
            src, type: 'video',
          });
        }
        if (!(await stillCurrent())) throw new Error('Saved playlist changed elsewhere; reload before opening');
        setPendingCourseSession({
          queue, track: queue[0], queueIndex: 0, currentTime: 0,
          playing: false, repeat: 'none', shuffle: false,
        });
        Router.navigate('#/courses');
      } catch (error) {
        Toast.error?.('Could not open saved queue: ' + (error?.message || 'Source unavailable'));
      }
      return;
    }
    const btn = event.target?.closest?.('[data-delete-playlist]');
    if (!btn || btn.disabled) return;
    if (typeof window.DB?.getSetting !== 'function' || typeof window.DB?.compareAndSwapSetting !== 'function') {
      Toast.error?.('Could not delete playlist: storage is unavailable');
      return;
    }
    btn.disabled = true;
    try {
      const raw = await window.DB.getSetting('ocd_playlists');
      if (!Array.isArray(raw)) throw new TypeError('Saved playlists could not be read');
      const id = btn.dataset.deletePlaylist;
      const current = raw.find(item => String(item?.id) === id);
      const rendered = savedPlaylists.find(item => String(item.id) === id);
      if (!current || !rendered || !Array.isArray(current.topicIds)
        || JSON.stringify(current) !== JSON.stringify(rendered)) {
        throw new Error('Saved playlist changed elsewhere; reload before deleting');
      }
      // Only remove the selected row. Unknown records and metadata remain byte
      // for byte unchanged; they may be needed by another app version.
      const next = raw.filter(item => String(item?.id) !== id);
      await persistSavedPlaylists(window.DB, raw, next);
      Toast.success?.('Playlist deleted');
      void renderPlaylists(deps);
    } catch (error) {
      Toast.error?.('Could not delete playlist: ' + (error?.message || 'Storage unavailable'));
    } finally {
      btn.disabled = false;
    }
  };
}
