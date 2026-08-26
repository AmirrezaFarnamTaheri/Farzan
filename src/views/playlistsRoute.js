export function mountPlaylistsView({
  setView,
  safeMediaUrl,
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
          <span class="eyebrow">Study Queues</span>
          <div class="page-title-row">
            <h1 class="page-title">Playlists</h1>
            <span class="badge badge-success" aria-label="Feature status: ready">Ready</span>
          </div>
          <p class="page-subtitle">Study queues from the active player, saved timestamps, and catalog video sources.</p>
        </div>
      </div>
      <div class="stat-grid" data-playlist-metrics></div>
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
      <div class="card card-filled playlists-list-card">
        <div class="card-body">
          <div class="grid grid-3" data-playlist-list>
            <p>Loading playlists...</p>
          </div>
        </div>
      </div>
    </section>
  `);
  renderPlaylists({ safeMediaUrl, Toast });
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
  const { safeMediaUrl, Toast = window.OpenCourseDeck?.Toast } = deps;
  const metricsRoot = document.querySelector('[data-playlist-metrics]');
  const listRoot = document.querySelector('[data-playlist-list]');
  if (!metricsRoot || !listRoot) return;

  const [topics, timestamps, savedPlaylists] = await Promise.all([
    (async () => {
      try {
        await window.DataStore?.init?.();
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
        title: topic.sourceLabel || topic.courseTitle || topic.courseId || 'Catalog source',
        courseId: topic.courseId,
        href: '#/courses',
        items: [],
        topicIds: [],
      });
    }
    sourceGroups.get(key).items.push(playlistTopicTitle(topic));
    sourceGroups.get(key).topicIds.push(topic.topicId);
  });
  [...sourceGroups.values()]
    .sort((a, b) => b.items.length - a.items.length || a.title.localeCompare(b.title))
    .slice(0, 10)
    .forEach(group => {
      playlists.push({
        ...group,
        detail: `${group.items.length} video topic${group.items.length === 1 ? '' : 's'} from ${group.title}`,
      });
    });

  metricsRoot.replaceChildren();
  [
    ['Active tracks', activeQueue.length],
    ['Saved playlists', savedPlaylists.length],
    ['Video topics', videoTopics.length],
    ['Saved timestamps', timestamps.length],
    ['Queue cards', playlists.length],
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
  if (!playlists.length) {
    const empty = document.createElement('p');
    empty.className = 'text-muted';
    empty.textContent = 'No playable catalog videos, saved timestamps, or active player queue were found yet.';
    listRoot.appendChild(empty);
    return;
  }

  playlists.slice(0, 24).forEach(playlist => {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.playlistId = playlist.id;
    if (playlist.courseId) card.dataset.courseId = String(playlist.courseId);
    const body = document.createElement('div');
    body.className = 'card-body';
    const badge = document.createElement('span');
    badge.className = playlist.label === 'Live' ? 'badge badge-success' : 'badge badge-info';
    badge.textContent = playlist.label;
    const title = document.createElement('h2');
    title.className = 'h4';
    title.textContent = playlist.title;
    const detail = document.createElement('p');
    detail.textContent = playlist.detail;
    const preview = document.createElement('ol');
    preview.className = 'compact-list';
    playlist.items.slice(0, 4).forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      preview.appendChild(li);
    });
    const link = document.createElement('a');
    link.className = 'btn btn-ghost';
    link.href = playlist.href;
    link.textContent = playlist.label === 'Resume' ? 'Open bookmarks' : 'Open courses';
    body.append(badge, title, detail, preview, link);
    if (playlist.saved) {
      const remove = document.createElement('button');
      remove.className = 'btn btn-ghost';
      remove.type = 'button';
      remove.dataset.deletePlaylist = playlist.id;
      remove.textContent = 'Delete saved';
      body.appendChild(remove);
    }
    card.appendChild(body);
    listRoot.appendChild(card);
  });

  const firstCatalog = [...sourceGroups.values()]
    .sort((a, b) => b.items.length - a.items.length || a.title.localeCompare(b.title))[0];
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
    const btn = event.target?.closest?.('[data-delete-playlist]');
    if (!btn || !window.DB?.saveSetting) return;
    const current = sanitizeSavedPlaylists(await window.DB?.getSetting?.('ocd_playlists'));
    await window.DB.saveSetting('ocd_playlists', current.filter(item => item.id !== btn.dataset.deletePlaylist));
    Toast.success('Playlist deleted');
    renderPlaylists(deps);
  };
}
