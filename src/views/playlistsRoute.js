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
                <span class="text-sm font-semibold">Playlist name</span>
                <input class="input" data-playlist-name placeholder="e.g. Focus Sprint & Review Queue" />
              </label>
              <button class="btn btn-primary" type="button" data-save-playlist>
                <svg class="icon" aria-hidden="true"><use href="#i-bookmark"/></svg>
                Save first catalog queue
              </button>
            </div>
          </div>
        </div>
        <div class="grid grid-3" data-playlist-catalog></div>
      </details>
    </section>
  `);
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

function sanitizeSavedPlaylists(value) {
  return Array.isArray(value)
    ? value.filter(item => item && typeof item === 'object' && item.id && item.title && Array.isArray(item.topicIds))
    : [];
}

// Canonical saveSetting may acknowledge with true or the exact saved value.
// False, null, missing or unrelated receipts cannot establish a durable write.
function assertSavedPlaylistReceipt(receipt, expected) {
  if (receipt === true) return;
  if (Array.isArray(receipt) && JSON.stringify(receipt) === JSON.stringify(expected)) return;
  throw new Error('Saved playlist write was not acknowledged');
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
  const [topics, timestamps, savedPlaylists] = await Promise.all([
    (async () => {
      try {
        await window.DataStore?.init?.();
        try { await window.OpenCourseDeck?.UserLibrary?.overlay?.(); } catch {}
        // Support synchronous catalog readers and promise-backed adapters
        // before validating the complete result as a canonical collection.
        const catalogTopics = (await window.DataStore?.allTopics?.()) ?? [];
        if (!Array.isArray(catalogTopics)) throw new TypeError('Invalid canonical playlist catalog topics');
        return catalogTopics;
      } catch (error) {
        // A known catalog reader failure is not an empty course library.
        // Do not expose mutation controls with a partial canonical corpus.
        catalogReadError = error;
        return [];
      }
    })(),
    (async () => { try { return await window.DB?.getAllTimestamps?.() ?? []; } catch { return []; } })(),
    (async () => { try { return sanitizeSavedPlaylists(await window.DB?.getSetting?.('ocd_playlists')); } catch (error) { savedReadError = error; return []; } })(),
  ]);
  if (!document.body.contains(listRoot)) return;
  if (savedReadError || catalogReadError) {
    // Neither an unreadable saved deck nor an inaccessible canonical catalog
    // is proof that the user's collection is empty. Hide all creation and
    // reordering controls until the required readers are healthy.
    console.warn(savedReadError
      ? '[Playlists] Failed to load saved queues'
      : '[Playlists] Failed to load course catalog', savedReadError || catalogReadError);
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
      : 'Course catalog could not be loaded. Your saved playlists have not been changed.';
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
  const topicsById = new Map(topics.map(topic => [topic.topicId, topic]));
  const timestampTopics = timestamps
    .map(item => topicsById.get(item.topicId) || item)
    .filter(item => item?.topicId || item?.title || item?.topicTitle);

  const playlists = [];
  savedPlaylists
    .slice()
    .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))
    .forEach(saved => {
      const savedItems = saved.topicIds
        .map(topicId => topicsById.get(topicId))
        .filter(Boolean)
        .map(playlistTopicTitle);
      playlists.push({
        id: saved.id,
        label: 'Saved',
        title: saved.title,
        detail: `${saved.topicIds.length} saved topic${saved.topicIds.length === 1 ? '' : 's'}`,
        href: '#/courses',
        items: savedItems.length ? savedItems : saved.topicIds,
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
      });
    }
    sourceGroups.get(key).items.push(playlistTopicTitle(topic));
    sourceGroups.get(key).topicIds.push(topic.topicId);
  });
  const catalogGroups = [...sourceGroups.values()]
    .sort((a, b) => b.items.length - a.items.length || a.title.localeCompare(b.title));
  const catalogPlaylists = catalogGroups.slice(0, 10).map(group => ({
    ...group,
    detail: `${group.items.length} video topic${group.items.length === 1 ? '' : 's'}`,
  }));
  // Prioritize personal queues; discovery remains available without dominating the page.
  discover.hidden = catalogPlaylists.length === 0;
  discover.open = catalogPlaylists.length > 0 && playlists.length === 0;
  discover.querySelector('summary').textContent = `Browse course queues (${catalogPlaylists.length}) · Video topics: ${videoTopics.length}`;

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
    link.textContent = playlist.label === 'Resume' ? 'Open bookmarks'
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
          title.textContent = playlistTopicTitle(topicsById.get(topicId))
            || String(topicId);
          // An unavailable source still needs a readable identity.
          if (!topicsById.has(topicId)) title.textContent = String(topicId);
          item.appendChild(title);
          for (const direction of ['up', 'down']) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn-ghost btn-sm';
            button.dataset.playlistMove = direction;
            button.dataset.playlistId = String(playlist.id);
            button.dataset.topicIndex = String(index);
            button.dataset.topicId = String(topicId);
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
  playlists.slice(0, 24).forEach(playlist => appendPlaylistCard(playlist, listRoot));
  catalogPlaylists.forEach(playlist => appendPlaylistCard(playlist, catalogRoot));

  const firstCatalog = catalogGroups[0];
  const saveBtn = document.querySelector('[data-save-playlist]');
  if (saveBtn) {
    let creating = false;
    saveBtn.disabled = !firstCatalog?.topicIds?.length
      || typeof window.DB?.saveSetting !== 'function'
      || typeof window.DB?.getSetting !== 'function';
    saveBtn.onclick = async () => {
      if (creating || !firstCatalog?.topicIds?.length
        || typeof window.DB?.saveSetting !== 'function'
        || typeof window.DB?.getSetting !== 'function') return;
      const input = document.querySelector('[data-playlist-name]');
      const title = String(input?.value || firstCatalog.title || 'Saved playlist').trim() || 'Saved playlist';
      creating = true;
      saveBtn.disabled = true;
      try {
        // Preserve unknown future-version rows verbatim. Silently sanitizing
        // the complete collection before a write can erase user data.
        const raw = await window.DB.getSetting('ocd_playlists');
        if (raw != null && !Array.isArray(raw)) throw new TypeError('Saved playlists could not be read');
        const current = raw ?? [];
        if (current.length >= 50) throw new Error('Saved playlist limit reached; remove one before creating another');
        const now = Date.now();
        const id = `playlist-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        const next = [
          { id, title, topicIds: [...new Set(firstCatalog.topicIds)], createdAt: now, updatedAt: now },
          ...current,
        ];
        assertSavedPlaylistReceipt(await window.DB.saveSetting('ocd_playlists', next), next);
        if (input) input.value = '';
        Toast.success?.('Playlist saved');
        void renderPlaylists(deps);
      } catch (error) {
        Toast.error?.('Could not save playlist: ' + (error?.message || 'Storage unavailable'));
      } finally {
        creating = false;
        saveBtn.disabled = false;
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
          || typeof window.DB?.saveSetting !== 'function') {
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
            || selected.topicIds.some((id, i) => String(id) !== String(rendered.topicIds[i]))) {
          throw new Error('Saved playlist was changed elsewhere; reload before reordering');
        }
        const from = Number(move.dataset.topicIndex);
        const to = from + (move.dataset.playlistMove === 'up' ? -1 : 1);
        if (!Number.isSafeInteger(from) || from < 0 || to < 0
            || to >= selected.topicIds.length
            || String(selected.topicIds[from]) !== move.dataset.topicId) {
          throw new Error('This playlist order is no longer current');
        }
        const ids = [...selected.topicIds];
        [ids[from], ids[to]] = [ids[to], ids[from]];
        const updated = records.map(record => record === selected
          ? { ...record, topicIds: ids, updatedAt: Date.now() } : record);
        const receipt = await window.DB.saveSetting('ocd_playlists', updated);
        assertSavedPlaylistReceipt(receipt, updated);
        Toast.success?.('Playlist order saved');
        await renderPlaylists(deps);
        if (document.body.contains(listRoot)) {
          // The reorder controls are replaced on each canonical refresh.
          // Reopen the previous disclosure and put focus on the moved topic
          // rather than leaving keyboard users on a detached disabled button.
          const controls = [...listRoot.querySelectorAll('[data-playlist-move]')]
            .filter(button => button.dataset.playlistId === move.dataset.playlistId
              && button.dataset.topicId === move.dataset.topicId
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
      const queue = [];
      for (const topicId of saved.topicIds) {
        const topic = topicsById.get(topicId);
        const media = topic?.videos?.[0];
        if (!media) continue;
        let src;
        try {
          const resolve = window.OpenCourseDeck?.UserLibrary?.resolvePlayable;
          src = typeof resolve === 'function' ? await resolve(media, safeMediaUrl) : safeMediaUrl(media);
        } catch {
          src = null;
        }
        if (!src) continue;
        queue.push({
          id: topicId, topicId, courseId: topic.courseId,
          courseTitle: topic.courseTitle || '', title: playlistTopicTitle(topic),
          src, type: 'video',
        });
      }
      if (!queue.length) {
        Toast.error?.('No playable videos are available in this saved queue');
        return;
      }
      setPendingCourseSession({
        queue, track: queue[0], queueIndex: 0, currentTime: 0,
        playing: false, repeat: 'none', shuffle: false,
      });
      Router.navigate('#/courses');
      return;
    }
    const btn = event.target?.closest?.('[data-delete-playlist]');
    if (!btn || btn.disabled) return;
    if (typeof window.DB?.getSetting !== 'function' || typeof window.DB?.saveSetting !== 'function') {
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
        || current.topicIds.length !== rendered.topicIds.length
        || current.topicIds.some((value, i) => String(value) !== String(rendered.topicIds[i]))) {
        throw new Error('Saved playlist changed elsewhere; reload before deleting');
      }
      // Only remove the selected row. Unknown records and metadata remain byte
      // for byte unchanged; they may be needed by another app version.
      const next = raw.filter(item => String(item?.id) !== id);
      assertSavedPlaylistReceipt(await window.DB.saveSetting('ocd_playlists', next), next);
      Toast.success?.('Playlist deleted');
      void renderPlaylists(deps);
    } catch (error) {
      Toast.error?.('Could not delete playlist: ' + (error?.message || 'Storage unavailable'));
    } finally {
      btn.disabled = false;
    }
  };
}
