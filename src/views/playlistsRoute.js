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
      <div class="card card-filled playlists-list-card">
        <div class="card-body">
          <div class="grid grid-3" data-playlist-list>
            <p>Loading your playlists...</p>
          </div>
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

async function renderPlaylists(deps) {
  const { safeMediaUrl, Router, setPendingCourseSession, Toast = window.OpenCourseDeck?.Toast } = deps;
  const metricsRoot = document.querySelector('[data-playlist-metrics]');
  const listRoot = document.querySelector('[data-playlist-list]');
  const catalogRoot = document.querySelector('[data-playlist-catalog]');
  const discover = document.querySelector('[data-playlists-discover]');
  if (!metricsRoot || !listRoot || !catalogRoot || !discover) return;

  const [topics, timestamps, savedPlaylists] = await Promise.all([
    (async () => {
      try {
        await window.DataStore?.init?.();
        try { await window.OpenCourseDeck?.UserLibrary?.overlay?.(); } catch {}
        return window.DataStore?.allTopics?.() ?? [];
      } catch {
        return [];
      }
    })(),
    (async () => { try { return await window.DB?.getAllTimestamps?.() ?? []; } catch { return []; } })(),
    (async () => { try { return sanitizeSavedPlaylists(await window.DB?.getSetting?.('ocd_playlists')); } catch { return []; } })(),
  ]);
  if (!document.body.contains(listRoot)) return;

  const activeQueue = currentPlayerTracks();
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
  metricsRoot.hidden = meaningfulMetrics.length === 0;
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
    playlist.items.slice(0, 4).forEach(item => {
      const li = document.createElement('li');
      li.className = 'playlist-preview-item';
      li.dir = 'auto';
      li.textContent = item;
      li.title = item;
      preview.appendChild(li);
    });
    const more = document.createElement('p');
    more.className = 'playlist-more';
    const remaining = Math.max(0, playlist.items.length - 4);
    more.textContent = `${remaining.toLocaleString()} more topic${remaining === 1 ? '' : 's'}`;
    more.hidden = remaining === 0;
    const actions = document.createElement('div');
    actions.className = 'playlist-card-actions';
    const link = document.createElement('a');
    link.className = 'btn btn-ghost';
    link.href = playlist.href;
    link.textContent = playlist.label === 'Resume' ? 'Open bookmarks' : 'Open courses';
    body.append(badge, title, section, detail, preview, more, actions);
    actions.appendChild(link);
    if (playlist.saved) {
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
    saveBtn.disabled = !firstCatalog?.topicIds?.length || !window.DB?.saveSetting;
    saveBtn.onclick = async () => {
      if (!firstCatalog?.topicIds?.length || !window.DB?.saveSetting) return;
      const input = document.querySelector('[data-playlist-name]');
      const title = String(input?.value || firstCatalog.title || 'Saved playlist').trim() || 'Saved playlist';
      const now = Date.now();
      const current = sanitizeSavedPlaylists(await window.DB?.getSetting?.('ocd_playlists'));
      const id = `playlist-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      await window.DB.saveSetting('ocd_playlists', [
        { id, title, topicIds: [...new Set(firstCatalog.topicIds)], createdAt: now, updatedAt: now },
        ...current,
      ].slice(0, 50));
      if (input) input.value = '';
      Toast.success('Playlist saved');
      renderPlaylists(deps);
    };
  }

  listRoot.onclick = async (event) => {
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
    if (!btn || !window.DB?.saveSetting) return;
    const current = sanitizeSavedPlaylists(await window.DB?.getSetting?.('ocd_playlists'));
    await window.DB.saveSetting('ocd_playlists', current.filter(item => item.id !== btn.dataset.deletePlaylist));
    Toast.success('Playlist deleted');
    renderPlaylists(deps);
  };
}
