// src/views/playlistsRoute.js
function mountPlaylistsView({
  setView,
  safeMediaUrl,
  Toast = window.PlasmaDeck?.Toast
} = {}) {
  setView(`
    <section class="view view-playlists">
      <div class="page-header">
        <div class="page-title-row">
          <h1 class="page-title">Playlists</h1>
          <span class="badge badge-success" aria-label="Feature status: ready">Ready</span>
        </div>
        <p class="page-subtitle">Study queues from the active player, saved timestamps, and catalog video sources.</p>
      </div>
      <div class="stat-grid" data-playlist-metrics></div>
      <div class="card card-filled" style="margin-bottom:16px">
        <div class="card-body">
          <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
            <label style="display:grid;gap:6px;min-width:240px">
              <span class="text-sm">Playlist name</span>
              <input class="input" data-playlist-name placeholder="Name a saved playlist" />
            </label>
            <button class="btn btn-primary" data-save-playlist>Save first catalog queue</button>
          </div>
        </div>
      </div>
      <div class="card card-filled">
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
  return [...document.querySelectorAll("[data-player]")].flatMap((el) => {
    try {
      return el._pdPlayer?.queue ?? [];
    } catch {
      return [];
    }
  }).filter((track) => track && (track.src || track.url || track.title));
}
function catalogVideoTopics(topics, safeMediaUrl) {
  return topics.filter((topic) => {
    const firstVideo = topic.videos?.[0] ?? topic.url;
    return Boolean(safeMediaUrl(firstVideo));
  });
}
function playlistTopicTitle(topic) {
  return topic?.title || topic?.topicTitle || topic?.topicId || "Untitled topic";
}
function sanitizeSavedPlaylists(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object" && item.id && item.title && Array.isArray(item.topicIds)) : [];
}
async function renderPlaylists(deps) {
  const { safeMediaUrl, Toast = window.PlasmaDeck?.Toast } = deps;
  const metricsRoot = document.querySelector("[data-playlist-metrics]");
  const listRoot = document.querySelector("[data-playlist-list]");
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
    (async () => {
      try {
        return await window.DB?.getAllTimestamps?.() ?? [];
      } catch {
        return [];
      }
    })(),
    (async () => {
      try {
        return sanitizeSavedPlaylists(await window.DB?.getSetting?.("plasma-playlists"));
      } catch {
        return [];
      }
    })()
  ]);
  if (!document.body.contains(listRoot)) return;
  const activeQueue = currentPlayerTracks();
  const videoTopics = catalogVideoTopics(topics, safeMediaUrl);
  const topicsById = new Map(topics.map((topic) => [topic.topicId, topic]));
  const timestampTopics = timestamps.map((item) => topicsById.get(item.topicId) || item).filter((item) => item?.topicId || item?.title || item?.topicTitle);
  const playlists = [];
  savedPlaylists.slice().sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0)).forEach((saved) => {
    const savedItems = saved.topicIds.map((topicId) => topicsById.get(topicId)).filter(Boolean).map(playlistTopicTitle);
    playlists.push({
      id: saved.id,
      label: "Saved",
      title: saved.title,
      detail: `${saved.topicIds.length} saved topic${saved.topicIds.length === 1 ? "" : "s"}`,
      href: "#/courses",
      items: savedItems.length ? savedItems : saved.topicIds,
      saved: true
    });
  });
  if (activeQueue.length) {
    playlists.push({
      id: "active-queue",
      label: "Live",
      title: "Active player queue",
      detail: `${activeQueue.length} track${activeQueue.length === 1 ? "" : "s"} currently loaded`,
      href: "#/courses",
      items: activeQueue.map((track) => track.title || track.topicTitle || track.topicId || "Queued track")
    });
  }
  if (timestampTopics.length) {
    playlists.push({
      id: "timestamp-queue",
      label: "Resume",
      title: "Saved timestamp queue",
      detail: `${timestampTopics.length} saved point${timestampTopics.length === 1 ? "" : "s"} ready to revisit`,
      href: "#/bookmarks",
      items: timestampTopics.map(playlistTopicTitle)
    });
  }
  const sourceGroups = /* @__PURE__ */ new Map();
  videoTopics.forEach((topic) => {
    const key = `${topic.courseId || "course"}|${topic.sourceIndex ?? topic.sourceLabel ?? "source"}`;
    if (!sourceGroups.has(key)) {
      sourceGroups.set(key, {
        id: `source-${sourceGroups.size + 1}`,
        label: "Catalog",
        title: topic.sourceLabel || topic.courseTitle || topic.courseId || "Catalog source",
        courseId: topic.courseId,
        href: "#/courses",
        items: [],
        topicIds: []
      });
    }
    sourceGroups.get(key).items.push(playlistTopicTitle(topic));
    sourceGroups.get(key).topicIds.push(topic.topicId);
  });
  [...sourceGroups.values()].sort((a, b) => b.items.length - a.items.length || a.title.localeCompare(b.title)).slice(0, 10).forEach((group) => {
    playlists.push({
      ...group,
      detail: `${group.items.length} video topic${group.items.length === 1 ? "" : "s"} from ${group.title}`
    });
  });
  metricsRoot.replaceChildren();
  [
    ["Active tracks", activeQueue.length],
    ["Saved playlists", savedPlaylists.length],
    ["Video topics", videoTopics.length],
    ["Saved timestamps", timestamps.length],
    ["Queue cards", playlists.length]
  ].forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "stat-card";
    const strong = document.createElement("strong");
    strong.textContent = String(value);
    const span = document.createElement("span");
    span.textContent = label;
    card.append(strong, span);
    metricsRoot.appendChild(card);
  });
  listRoot.replaceChildren();
  if (!playlists.length) {
    const empty = document.createElement("p");
    empty.className = "text-muted";
    empty.textContent = "No playable catalog videos, saved timestamps, or active player queue were found yet.";
    listRoot.appendChild(empty);
    return;
  }
  playlists.slice(0, 24).forEach((playlist) => {
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.playlistId = playlist.id;
    if (playlist.courseId) card.dataset.courseId = String(playlist.courseId);
    const body = document.createElement("div");
    body.className = "card-body";
    const badge = document.createElement("span");
    badge.className = playlist.label === "Live" ? "badge badge-success" : "badge badge-info";
    badge.textContent = playlist.label;
    const title = document.createElement("h2");
    title.className = "h4";
    title.textContent = playlist.title;
    const detail = document.createElement("p");
    detail.textContent = playlist.detail;
    const preview = document.createElement("ol");
    preview.className = "compact-list";
    playlist.items.slice(0, 4).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      preview.appendChild(li);
    });
    const link = document.createElement("a");
    link.className = "btn btn-ghost";
    link.href = playlist.href;
    link.textContent = playlist.label === "Resume" ? "Open bookmarks" : "Open courses";
    body.append(badge, title, detail, preview, link);
    if (playlist.saved) {
      const remove = document.createElement("button");
      remove.className = "btn btn-ghost";
      remove.type = "button";
      remove.dataset.deletePlaylist = playlist.id;
      remove.textContent = "Delete saved";
      body.appendChild(remove);
    }
    card.appendChild(body);
    listRoot.appendChild(card);
  });
  const firstCatalog = [...sourceGroups.values()].sort((a, b) => b.items.length - a.items.length || a.title.localeCompare(b.title))[0];
  const saveBtn = document.querySelector("[data-save-playlist]");
  if (saveBtn) {
    saveBtn.disabled = !firstCatalog?.topicIds?.length || !window.DB?.saveSetting;
    saveBtn.onclick = async () => {
      if (!firstCatalog?.topicIds?.length || !window.DB?.saveSetting) return;
      const input = document.querySelector("[data-playlist-name]");
      const title = String(input?.value || firstCatalog.title || "Saved playlist").trim() || "Saved playlist";
      const now = Date.now();
      const current = sanitizeSavedPlaylists(await window.DB?.getSetting?.("plasma-playlists"));
      const id = `playlist-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      await window.DB.saveSetting("plasma-playlists", [
        { id, title, topicIds: [...new Set(firstCatalog.topicIds)], createdAt: now, updatedAt: now },
        ...current
      ].slice(0, 50));
      if (input) input.value = "";
      Toast.success("Playlist saved");
      renderPlaylists(deps);
    };
  }
  listRoot.onclick = async (event) => {
    const btn = event.target?.closest?.("[data-delete-playlist]");
    if (!btn || !window.DB?.saveSetting) return;
    const current = sanitizeSavedPlaylists(await window.DB?.getSetting?.("plasma-playlists"));
    await window.DB.saveSetting("plasma-playlists", current.filter((item) => item.id !== btn.dataset.deletePlaylist));
    Toast.success("Playlist deleted");
    renderPlaylists(deps);
  };
}
export {
  mountPlaylistsView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3ZpZXdzL3BsYXlsaXN0c1JvdXRlLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJleHBvcnQgZnVuY3Rpb24gbW91bnRQbGF5bGlzdHNWaWV3KHtcbiAgc2V0VmlldyxcbiAgc2FmZU1lZGlhVXJsLFxuICBUb2FzdCA9IHdpbmRvdy5QbGFzbWFEZWNrPy5Ub2FzdCxcbn0gPSB7fSkge1xuICBzZXRWaWV3KGBcbiAgICA8c2VjdGlvbiBjbGFzcz1cInZpZXcgdmlldy1wbGF5bGlzdHNcIj5cbiAgICAgIDxkaXYgY2xhc3M9XCJwYWdlLWhlYWRlclwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwicGFnZS10aXRsZS1yb3dcIj5cbiAgICAgICAgICA8aDEgY2xhc3M9XCJwYWdlLXRpdGxlXCI+UGxheWxpc3RzPC9oMT5cbiAgICAgICAgICA8c3BhbiBjbGFzcz1cImJhZGdlIGJhZGdlLXN1Y2Nlc3NcIiBhcmlhLWxhYmVsPVwiRmVhdHVyZSBzdGF0dXM6IHJlYWR5XCI+UmVhZHk8L3NwYW4+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8cCBjbGFzcz1cInBhZ2Utc3VidGl0bGVcIj5TdHVkeSBxdWV1ZXMgZnJvbSB0aGUgYWN0aXZlIHBsYXllciwgc2F2ZWQgdGltZXN0YW1wcywgYW5kIGNhdGFsb2cgdmlkZW8gc291cmNlcy48L3A+XG4gICAgICA8L2Rpdj5cbiAgICAgIDxkaXYgY2xhc3M9XCJzdGF0LWdyaWRcIiBkYXRhLXBsYXlsaXN0LW1ldHJpY3M+PC9kaXY+XG4gICAgICA8ZGl2IGNsYXNzPVwiY2FyZCBjYXJkLWZpbGxlZFwiIHN0eWxlPVwibWFyZ2luLWJvdHRvbToxNnB4XCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLWJvZHlcIj5cbiAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4O2dhcDoxMHB4O2FsaWduLWl0ZW1zOmVuZDtmbGV4LXdyYXA6d3JhcFwiPlxuICAgICAgICAgICAgPGxhYmVsIHN0eWxlPVwiZGlzcGxheTpncmlkO2dhcDo2cHg7bWluLXdpZHRoOjI0MHB4XCI+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwidGV4dC1zbVwiPlBsYXlsaXN0IG5hbWU8L3NwYW4+XG4gICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImlucHV0XCIgZGF0YS1wbGF5bGlzdC1uYW1lIHBsYWNlaG9sZGVyPVwiTmFtZSBhIHNhdmVkIHBsYXlsaXN0XCIgLz5cbiAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1wcmltYXJ5XCIgZGF0YS1zYXZlLXBsYXlsaXN0PlNhdmUgZmlyc3QgY2F0YWxvZyBxdWV1ZTwvYnV0dG9uPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgICAgPGRpdiBjbGFzcz1cImNhcmQgY2FyZC1maWxsZWRcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQtYm9keVwiPlxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJncmlkIGdyaWQtM1wiIGRhdGEtcGxheWxpc3QtbGlzdD5cbiAgICAgICAgICAgIDxwPkxvYWRpbmcgcGxheWxpc3RzLi4uPC9wPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgIDwvc2VjdGlvbj5cbiAgYCk7XG4gIHJlbmRlclBsYXlsaXN0cyh7IHNhZmVNZWRpYVVybCwgVG9hc3QgfSk7XG59XG5cbmZ1bmN0aW9uIGN1cnJlbnRQbGF5ZXJUcmFja3MoKSB7XG4gIHJldHVybiBbLi4uZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtcGxheWVyXScpXVxuICAgIC5mbGF0TWFwKGVsID0+IHtcbiAgICAgIHRyeSB7IHJldHVybiBlbC5fcGRQbGF5ZXI/LnF1ZXVlID8/IFtdOyB9IGNhdGNoIHsgcmV0dXJuIFtdOyB9XG4gICAgfSlcbiAgICAuZmlsdGVyKHRyYWNrID0+IHRyYWNrICYmICh0cmFjay5zcmMgfHwgdHJhY2sudXJsIHx8IHRyYWNrLnRpdGxlKSk7XG59XG5cbmZ1bmN0aW9uIGNhdGFsb2dWaWRlb1RvcGljcyh0b3BpY3MsIHNhZmVNZWRpYVVybCkge1xuICByZXR1cm4gdG9waWNzLmZpbHRlcih0b3BpYyA9PiB7XG4gICAgY29uc3QgZmlyc3RWaWRlbyA9IHRvcGljLnZpZGVvcz8uWzBdID8/IHRvcGljLnVybDtcbiAgICByZXR1cm4gQm9vbGVhbihzYWZlTWVkaWFVcmwoZmlyc3RWaWRlbykpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gcGxheWxpc3RUb3BpY1RpdGxlKHRvcGljKSB7XG4gIHJldHVybiB0b3BpYz8udGl0bGUgfHwgdG9waWM/LnRvcGljVGl0bGUgfHwgdG9waWM/LnRvcGljSWQgfHwgJ1VudGl0bGVkIHRvcGljJztcbn1cblxuZnVuY3Rpb24gc2FuaXRpemVTYXZlZFBsYXlsaXN0cyh2YWx1ZSkge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheSh2YWx1ZSlcbiAgICA/IHZhbHVlLmZpbHRlcihpdGVtID0+IGl0ZW0gJiYgdHlwZW9mIGl0ZW0gPT09ICdvYmplY3QnICYmIGl0ZW0uaWQgJiYgaXRlbS50aXRsZSAmJiBBcnJheS5pc0FycmF5KGl0ZW0udG9waWNJZHMpKVxuICAgIDogW107XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlbmRlclBsYXlsaXN0cyhkZXBzKSB7XG4gIGNvbnN0IHsgc2FmZU1lZGlhVXJsLCBUb2FzdCA9IHdpbmRvdy5QbGFzbWFEZWNrPy5Ub2FzdCB9ID0gZGVwcztcbiAgY29uc3QgbWV0cmljc1Jvb3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1wbGF5bGlzdC1tZXRyaWNzXScpO1xuICBjb25zdCBsaXN0Um9vdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXBsYXlsaXN0LWxpc3RdJyk7XG4gIGlmICghbWV0cmljc1Jvb3QgfHwgIWxpc3RSb290KSByZXR1cm47XG5cbiAgY29uc3QgW3RvcGljcywgdGltZXN0YW1wcywgc2F2ZWRQbGF5bGlzdHNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgIChhc3luYyAoKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB3aW5kb3cuRGF0YVN0b3JlPy5pbml0Py4oKTtcbiAgICAgICAgcmV0dXJuIHdpbmRvdy5EYXRhU3RvcmU/LmFsbFRvcGljcz8uKCkgPz8gW107XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfVxuICAgIH0pKCksXG4gICAgKGFzeW5jICgpID0+IHsgdHJ5IHsgcmV0dXJuIGF3YWl0IHdpbmRvdy5EQj8uZ2V0QWxsVGltZXN0YW1wcz8uKCkgPz8gW107IH0gY2F0Y2ggeyByZXR1cm4gW107IH0gfSkoKSxcbiAgICAoYXN5bmMgKCkgPT4geyB0cnkgeyByZXR1cm4gc2FuaXRpemVTYXZlZFBsYXlsaXN0cyhhd2FpdCB3aW5kb3cuREI/LmdldFNldHRpbmc/LigncGxhc21hLXBsYXlsaXN0cycpKTsgfSBjYXRjaCB7IHJldHVybiBbXTsgfSB9KSgpLFxuICBdKTtcbiAgaWYgKCFkb2N1bWVudC5ib2R5LmNvbnRhaW5zKGxpc3RSb290KSkgcmV0dXJuO1xuXG4gIGNvbnN0IGFjdGl2ZVF1ZXVlID0gY3VycmVudFBsYXllclRyYWNrcygpO1xuICBjb25zdCB2aWRlb1RvcGljcyA9IGNhdGFsb2dWaWRlb1RvcGljcyh0b3BpY3MsIHNhZmVNZWRpYVVybCk7XG4gIGNvbnN0IHRvcGljc0J5SWQgPSBuZXcgTWFwKHRvcGljcy5tYXAodG9waWMgPT4gW3RvcGljLnRvcGljSWQsIHRvcGljXSkpO1xuICBjb25zdCB0aW1lc3RhbXBUb3BpY3MgPSB0aW1lc3RhbXBzXG4gICAgLm1hcChpdGVtID0+IHRvcGljc0J5SWQuZ2V0KGl0ZW0udG9waWNJZCkgfHwgaXRlbSlcbiAgICAuZmlsdGVyKGl0ZW0gPT4gaXRlbT8udG9waWNJZCB8fCBpdGVtPy50aXRsZSB8fCBpdGVtPy50b3BpY1RpdGxlKTtcblxuICBjb25zdCBwbGF5bGlzdHMgPSBbXTtcbiAgc2F2ZWRQbGF5bGlzdHNcbiAgICAuc2xpY2UoKVxuICAgIC5zb3J0KChhLCBiKSA9PiBOdW1iZXIoYi51cGRhdGVkQXQgfHwgYi5jcmVhdGVkQXQgfHwgMCkgLSBOdW1iZXIoYS51cGRhdGVkQXQgfHwgYS5jcmVhdGVkQXQgfHwgMCkpXG4gICAgLmZvckVhY2goc2F2ZWQgPT4ge1xuICAgICAgY29uc3Qgc2F2ZWRJdGVtcyA9IHNhdmVkLnRvcGljSWRzXG4gICAgICAgIC5tYXAodG9waWNJZCA9PiB0b3BpY3NCeUlkLmdldCh0b3BpY0lkKSlcbiAgICAgICAgLmZpbHRlcihCb29sZWFuKVxuICAgICAgICAubWFwKHBsYXlsaXN0VG9waWNUaXRsZSk7XG4gICAgICBwbGF5bGlzdHMucHVzaCh7XG4gICAgICAgIGlkOiBzYXZlZC5pZCxcbiAgICAgICAgbGFiZWw6ICdTYXZlZCcsXG4gICAgICAgIHRpdGxlOiBzYXZlZC50aXRsZSxcbiAgICAgICAgZGV0YWlsOiBgJHtzYXZlZC50b3BpY0lkcy5sZW5ndGh9IHNhdmVkIHRvcGljJHtzYXZlZC50b3BpY0lkcy5sZW5ndGggPT09IDEgPyAnJyA6ICdzJ31gLFxuICAgICAgICBocmVmOiAnIy9jb3Vyc2VzJyxcbiAgICAgICAgaXRlbXM6IHNhdmVkSXRlbXMubGVuZ3RoID8gc2F2ZWRJdGVtcyA6IHNhdmVkLnRvcGljSWRzLFxuICAgICAgICBzYXZlZDogdHJ1ZSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICBpZiAoYWN0aXZlUXVldWUubGVuZ3RoKSB7XG4gICAgcGxheWxpc3RzLnB1c2goe1xuICAgICAgaWQ6ICdhY3RpdmUtcXVldWUnLFxuICAgICAgbGFiZWw6ICdMaXZlJyxcbiAgICAgIHRpdGxlOiAnQWN0aXZlIHBsYXllciBxdWV1ZScsXG4gICAgICBkZXRhaWw6IGAke2FjdGl2ZVF1ZXVlLmxlbmd0aH0gdHJhY2ske2FjdGl2ZVF1ZXVlLmxlbmd0aCA9PT0gMSA/ICcnIDogJ3MnfSBjdXJyZW50bHkgbG9hZGVkYCxcbiAgICAgIGhyZWY6ICcjL2NvdXJzZXMnLFxuICAgICAgaXRlbXM6IGFjdGl2ZVF1ZXVlLm1hcCh0cmFjayA9PiB0cmFjay50aXRsZSB8fCB0cmFjay50b3BpY1RpdGxlIHx8IHRyYWNrLnRvcGljSWQgfHwgJ1F1ZXVlZCB0cmFjaycpLFxuICAgIH0pO1xuICB9XG4gIGlmICh0aW1lc3RhbXBUb3BpY3MubGVuZ3RoKSB7XG4gICAgcGxheWxpc3RzLnB1c2goe1xuICAgICAgaWQ6ICd0aW1lc3RhbXAtcXVldWUnLFxuICAgICAgbGFiZWw6ICdSZXN1bWUnLFxuICAgICAgdGl0bGU6ICdTYXZlZCB0aW1lc3RhbXAgcXVldWUnLFxuICAgICAgZGV0YWlsOiBgJHt0aW1lc3RhbXBUb3BpY3MubGVuZ3RofSBzYXZlZCBwb2ludCR7dGltZXN0YW1wVG9waWNzLmxlbmd0aCA9PT0gMSA/ICcnIDogJ3MnfSByZWFkeSB0byByZXZpc2l0YCxcbiAgICAgIGhyZWY6ICcjL2Jvb2ttYXJrcycsXG4gICAgICBpdGVtczogdGltZXN0YW1wVG9waWNzLm1hcChwbGF5bGlzdFRvcGljVGl0bGUpLFxuICAgIH0pO1xuICB9XG5cbiAgY29uc3Qgc291cmNlR3JvdXBzID0gbmV3IE1hcCgpO1xuICB2aWRlb1RvcGljcy5mb3JFYWNoKHRvcGljID0+IHtcbiAgICBjb25zdCBrZXkgPSBgJHt0b3BpYy5jb3Vyc2VJZCB8fCAnY291cnNlJ318JHt0b3BpYy5zb3VyY2VJbmRleCA/PyB0b3BpYy5zb3VyY2VMYWJlbCA/PyAnc291cmNlJ31gO1xuICAgIGlmICghc291cmNlR3JvdXBzLmhhcyhrZXkpKSB7XG4gICAgICBzb3VyY2VHcm91cHMuc2V0KGtleSwge1xuICAgICAgICBpZDogYHNvdXJjZS0ke3NvdXJjZUdyb3Vwcy5zaXplICsgMX1gLFxuICAgICAgICBsYWJlbDogJ0NhdGFsb2cnLFxuICAgICAgICB0aXRsZTogdG9waWMuc291cmNlTGFiZWwgfHwgdG9waWMuY291cnNlVGl0bGUgfHwgdG9waWMuY291cnNlSWQgfHwgJ0NhdGFsb2cgc291cmNlJyxcbiAgICAgICAgY291cnNlSWQ6IHRvcGljLmNvdXJzZUlkLFxuICAgICAgICBocmVmOiAnIy9jb3Vyc2VzJyxcbiAgICAgICAgaXRlbXM6IFtdLFxuICAgICAgICB0b3BpY0lkczogW10sXG4gICAgICB9KTtcbiAgICB9XG4gICAgc291cmNlR3JvdXBzLmdldChrZXkpLml0ZW1zLnB1c2gocGxheWxpc3RUb3BpY1RpdGxlKHRvcGljKSk7XG4gICAgc291cmNlR3JvdXBzLmdldChrZXkpLnRvcGljSWRzLnB1c2godG9waWMudG9waWNJZCk7XG4gIH0pO1xuICBbLi4uc291cmNlR3JvdXBzLnZhbHVlcygpXVxuICAgIC5zb3J0KChhLCBiKSA9PiBiLml0ZW1zLmxlbmd0aCAtIGEuaXRlbXMubGVuZ3RoIHx8IGEudGl0bGUubG9jYWxlQ29tcGFyZShiLnRpdGxlKSlcbiAgICAuc2xpY2UoMCwgMTApXG4gICAgLmZvckVhY2goZ3JvdXAgPT4ge1xuICAgICAgcGxheWxpc3RzLnB1c2goe1xuICAgICAgICAuLi5ncm91cCxcbiAgICAgICAgZGV0YWlsOiBgJHtncm91cC5pdGVtcy5sZW5ndGh9IHZpZGVvIHRvcGljJHtncm91cC5pdGVtcy5sZW5ndGggPT09IDEgPyAnJyA6ICdzJ30gZnJvbSAke2dyb3VwLnRpdGxlfWAsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICBtZXRyaWNzUm9vdC5yZXBsYWNlQ2hpbGRyZW4oKTtcbiAgW1xuICAgIFsnQWN0aXZlIHRyYWNrcycsIGFjdGl2ZVF1ZXVlLmxlbmd0aF0sXG4gICAgWydTYXZlZCBwbGF5bGlzdHMnLCBzYXZlZFBsYXlsaXN0cy5sZW5ndGhdLFxuICAgIFsnVmlkZW8gdG9waWNzJywgdmlkZW9Ub3BpY3MubGVuZ3RoXSxcbiAgICBbJ1NhdmVkIHRpbWVzdGFtcHMnLCB0aW1lc3RhbXBzLmxlbmd0aF0sXG4gICAgWydRdWV1ZSBjYXJkcycsIHBsYXlsaXN0cy5sZW5ndGhdLFxuICBdLmZvckVhY2goKFtsYWJlbCwgdmFsdWVdKSA9PiB7XG4gICAgY29uc3QgY2FyZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGNhcmQuY2xhc3NOYW1lID0gJ3N0YXQtY2FyZCc7XG4gICAgY29uc3Qgc3Ryb25nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3Ryb25nJyk7XG4gICAgc3Ryb25nLnRleHRDb250ZW50ID0gU3RyaW5nKHZhbHVlKTtcbiAgICBjb25zdCBzcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICAgIHNwYW4udGV4dENvbnRlbnQgPSBsYWJlbDtcbiAgICBjYXJkLmFwcGVuZChzdHJvbmcsIHNwYW4pO1xuICAgIG1ldHJpY3NSb290LmFwcGVuZENoaWxkKGNhcmQpO1xuICB9KTtcblxuICBsaXN0Um9vdC5yZXBsYWNlQ2hpbGRyZW4oKTtcbiAgaWYgKCFwbGF5bGlzdHMubGVuZ3RoKSB7XG4gICAgY29uc3QgZW1wdHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJyk7XG4gICAgZW1wdHkuY2xhc3NOYW1lID0gJ3RleHQtbXV0ZWQnO1xuICAgIGVtcHR5LnRleHRDb250ZW50ID0gJ05vIHBsYXlhYmxlIGNhdGFsb2cgdmlkZW9zLCBzYXZlZCB0aW1lc3RhbXBzLCBvciBhY3RpdmUgcGxheWVyIHF1ZXVlIHdlcmUgZm91bmQgeWV0Lic7XG4gICAgbGlzdFJvb3QuYXBwZW5kQ2hpbGQoZW1wdHkpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHBsYXlsaXN0cy5zbGljZSgwLCAyNCkuZm9yRWFjaChwbGF5bGlzdCA9PiB7XG4gICAgY29uc3QgY2FyZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2FydGljbGUnKTtcbiAgICBjYXJkLmNsYXNzTmFtZSA9ICdjYXJkJztcbiAgICBjYXJkLmRhdGFzZXQucGxheWxpc3RJZCA9IHBsYXlsaXN0LmlkO1xuICAgIGlmIChwbGF5bGlzdC5jb3Vyc2VJZCkgY2FyZC5kYXRhc2V0LmNvdXJzZUlkID0gU3RyaW5nKHBsYXlsaXN0LmNvdXJzZUlkKTtcbiAgICBjb25zdCBib2R5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgYm9keS5jbGFzc05hbWUgPSAnY2FyZC1ib2R5JztcbiAgICBjb25zdCBiYWRnZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICBiYWRnZS5jbGFzc05hbWUgPSBwbGF5bGlzdC5sYWJlbCA9PT0gJ0xpdmUnID8gJ2JhZGdlIGJhZGdlLXN1Y2Nlc3MnIDogJ2JhZGdlIGJhZGdlLWluZm8nO1xuICAgIGJhZGdlLnRleHRDb250ZW50ID0gcGxheWxpc3QubGFiZWw7XG4gICAgY29uc3QgdGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdoMicpO1xuICAgIHRpdGxlLmNsYXNzTmFtZSA9ICdoNCc7XG4gICAgdGl0bGUudGV4dENvbnRlbnQgPSBwbGF5bGlzdC50aXRsZTtcbiAgICBjb25zdCBkZXRhaWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJyk7XG4gICAgZGV0YWlsLnRleHRDb250ZW50ID0gcGxheWxpc3QuZGV0YWlsO1xuICAgIGNvbnN0IHByZXZpZXcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvbCcpO1xuICAgIHByZXZpZXcuY2xhc3NOYW1lID0gJ2NvbXBhY3QtbGlzdCc7XG4gICAgcGxheWxpc3QuaXRlbXMuc2xpY2UoMCwgNCkuZm9yRWFjaChpdGVtID0+IHtcbiAgICAgIGNvbnN0IGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTtcbiAgICAgIGxpLnRleHRDb250ZW50ID0gaXRlbTtcbiAgICAgIHByZXZpZXcuYXBwZW5kQ2hpbGQobGkpO1xuICAgIH0pO1xuICAgIGNvbnN0IGxpbmsgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgbGluay5jbGFzc05hbWUgPSAnYnRuIGJ0bi1naG9zdCc7XG4gICAgbGluay5ocmVmID0gcGxheWxpc3QuaHJlZjtcbiAgICBsaW5rLnRleHRDb250ZW50ID0gcGxheWxpc3QubGFiZWwgPT09ICdSZXN1bWUnID8gJ09wZW4gYm9va21hcmtzJyA6ICdPcGVuIGNvdXJzZXMnO1xuICAgIGJvZHkuYXBwZW5kKGJhZGdlLCB0aXRsZSwgZGV0YWlsLCBwcmV2aWV3LCBsaW5rKTtcbiAgICBpZiAocGxheWxpc3Quc2F2ZWQpIHtcbiAgICAgIGNvbnN0IHJlbW92ZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICAgICAgcmVtb3ZlLmNsYXNzTmFtZSA9ICdidG4gYnRuLWdob3N0JztcbiAgICAgIHJlbW92ZS50eXBlID0gJ2J1dHRvbic7XG4gICAgICByZW1vdmUuZGF0YXNldC5kZWxldGVQbGF5bGlzdCA9IHBsYXlsaXN0LmlkO1xuICAgICAgcmVtb3ZlLnRleHRDb250ZW50ID0gJ0RlbGV0ZSBzYXZlZCc7XG4gICAgICBib2R5LmFwcGVuZENoaWxkKHJlbW92ZSk7XG4gICAgfVxuICAgIGNhcmQuYXBwZW5kQ2hpbGQoYm9keSk7XG4gICAgbGlzdFJvb3QuYXBwZW5kQ2hpbGQoY2FyZCk7XG4gIH0pO1xuXG4gIGNvbnN0IGZpcnN0Q2F0YWxvZyA9IFsuLi5zb3VyY2VHcm91cHMudmFsdWVzKCldXG4gICAgLnNvcnQoKGEsIGIpID0+IGIuaXRlbXMubGVuZ3RoIC0gYS5pdGVtcy5sZW5ndGggfHwgYS50aXRsZS5sb2NhbGVDb21wYXJlKGIudGl0bGUpKVswXTtcbiAgY29uc3Qgc2F2ZUJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXNhdmUtcGxheWxpc3RdJyk7XG4gIGlmIChzYXZlQnRuKSB7XG4gICAgc2F2ZUJ0bi5kaXNhYmxlZCA9ICFmaXJzdENhdGFsb2c/LnRvcGljSWRzPy5sZW5ndGggfHwgIXdpbmRvdy5EQj8uc2F2ZVNldHRpbmc7XG4gICAgc2F2ZUJ0bi5vbmNsaWNrID0gYXN5bmMgKCkgPT4ge1xuICAgICAgaWYgKCFmaXJzdENhdGFsb2c/LnRvcGljSWRzPy5sZW5ndGggfHwgIXdpbmRvdy5EQj8uc2F2ZVNldHRpbmcpIHJldHVybjtcbiAgICAgIGNvbnN0IGlucHV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtcGxheWxpc3QtbmFtZV0nKTtcbiAgICAgIGNvbnN0IHRpdGxlID0gU3RyaW5nKGlucHV0Py52YWx1ZSB8fCBmaXJzdENhdGFsb2cudGl0bGUgfHwgJ1NhdmVkIHBsYXlsaXN0JykudHJpbSgpIHx8ICdTYXZlZCBwbGF5bGlzdCc7XG4gICAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgICAgY29uc3QgY3VycmVudCA9IHNhbml0aXplU2F2ZWRQbGF5bGlzdHMoYXdhaXQgd2luZG93LkRCPy5nZXRTZXR0aW5nPy4oJ3BsYXNtYS1wbGF5bGlzdHMnKSk7XG4gICAgICBjb25zdCBpZCA9IGBwbGF5bGlzdC0ke25vdy50b1N0cmluZygzNil9LSR7TWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMiwgNyl9YDtcbiAgICAgIGF3YWl0IHdpbmRvdy5EQi5zYXZlU2V0dGluZygncGxhc21hLXBsYXlsaXN0cycsIFtcbiAgICAgICAgeyBpZCwgdGl0bGUsIHRvcGljSWRzOiBbLi4ubmV3IFNldChmaXJzdENhdGFsb2cudG9waWNJZHMpXSwgY3JlYXRlZEF0OiBub3csIHVwZGF0ZWRBdDogbm93IH0sXG4gICAgICAgIC4uLmN1cnJlbnQsXG4gICAgICBdLnNsaWNlKDAsIDUwKSk7XG4gICAgICBpZiAoaW5wdXQpIGlucHV0LnZhbHVlID0gJyc7XG4gICAgICBUb2FzdC5zdWNjZXNzKCdQbGF5bGlzdCBzYXZlZCcpO1xuICAgICAgcmVuZGVyUGxheWxpc3RzKGRlcHMpO1xuICAgIH07XG4gIH1cblxuICBsaXN0Um9vdC5vbmNsaWNrID0gYXN5bmMgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgYnRuID0gZXZlbnQudGFyZ2V0Py5jbG9zZXN0Py4oJ1tkYXRhLWRlbGV0ZS1wbGF5bGlzdF0nKTtcbiAgICBpZiAoIWJ0biB8fCAhd2luZG93LkRCPy5zYXZlU2V0dGluZykgcmV0dXJuO1xuICAgIGNvbnN0IGN1cnJlbnQgPSBzYW5pdGl6ZVNhdmVkUGxheWxpc3RzKGF3YWl0IHdpbmRvdy5EQj8uZ2V0U2V0dGluZz8uKCdwbGFzbWEtcGxheWxpc3RzJykpO1xuICAgIGF3YWl0IHdpbmRvdy5EQi5zYXZlU2V0dGluZygncGxhc21hLXBsYXlsaXN0cycsIGN1cnJlbnQuZmlsdGVyKGl0ZW0gPT4gaXRlbS5pZCAhPT0gYnRuLmRhdGFzZXQuZGVsZXRlUGxheWxpc3QpKTtcbiAgICBUb2FzdC5zdWNjZXNzKCdQbGF5bGlzdCBkZWxldGVkJyk7XG4gICAgcmVuZGVyUGxheWxpc3RzKGRlcHMpO1xuICB9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFPLFNBQVMsbUJBQW1CO0FBQUEsRUFDakM7QUFBQSxFQUNBO0FBQUEsRUFDQSxRQUFRLE9BQU8sWUFBWTtBQUM3QixJQUFJLENBQUMsR0FBRztBQUNOLFVBQVE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEdBNkJQO0FBQ0Qsa0JBQWdCLEVBQUUsY0FBYyxNQUFNLENBQUM7QUFDekM7QUFFQSxTQUFTLHNCQUFzQjtBQUM3QixTQUFPLENBQUMsR0FBRyxTQUFTLGlCQUFpQixlQUFlLENBQUMsRUFDbEQsUUFBUSxRQUFNO0FBQ2IsUUFBSTtBQUFFLGFBQU8sR0FBRyxXQUFXLFNBQVMsQ0FBQztBQUFBLElBQUcsUUFBUTtBQUFFLGFBQU8sQ0FBQztBQUFBLElBQUc7QUFBQSxFQUMvRCxDQUFDLEVBQ0EsT0FBTyxXQUFTLFVBQVUsTUFBTSxPQUFPLE1BQU0sT0FBTyxNQUFNLE1BQU07QUFDckU7QUFFQSxTQUFTLG1CQUFtQixRQUFRLGNBQWM7QUFDaEQsU0FBTyxPQUFPLE9BQU8sV0FBUztBQUM1QixVQUFNLGFBQWEsTUFBTSxTQUFTLENBQUMs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TyxDQUFDLEVBQzNDLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxNQUFNLFNBQVMsRUFBRSxNQUFNLFVBQVUsRUFBRSxNQUFNLGNBQWMsRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDO0FBQ3RGLFFBQU0sVUFBVSxTQUFTLGNBQWMsc0JBQXNCO0FBQzdELE1BQUksU0FBUztBQUNYLFlBQVEsV0FBVyxDQUFDLGNBQWMsVUFBVSxVQUFVLENBQUMsT0FBTyxJQUFJO0FBQ2xFLFlBQVEsVUFBVSxZQUFZO0FBQzVCLFVBQUksQ0FBQyxjQUFjLFVBQVUsVUFBVSxDQUFDLE9BQU8sSUFBSSxZQUFhO0FBQ2hFLFlBQU0sUUFBUSxTQUFTLGNBQWMsc0JBQXNCO0FBQzNELFlBQU0sUUFBUSxPQUFPLE9BQU8sU0FBUyxhQUFhLFNBQVMsZ0JBQWdCLEVBQUUsS0FBSyxLQUFLO0FBQ3ZGLFlBQU0sTUFBTSxLQUFLLElBQUk7QUFDckIsWUFBTSxVQUFVLHVCQUF1QixNQUFNLE9BQU8sSUFBSSxhQUFhLGtCQUFrQixDQUFDO0FBQ3hGLFlBQU0sS0FBSyxZQUFZLElBQUksU0FBUyxFQUFFLENBQUMsSUFBSSxLQUFLLE9BQU8sRUFBRSxTQUFTLEVBQUUsRUFBRSxNQUFNLEdBQUcsQ0FBQyxDQUFDO0FBQ2pGLFlBQU0sT0FBTyxHQUFHLFlBQVksb0JBQW9CO0FBQUEsUUFDOUMsRUFBRSxJQUFJLE9BQU8sVUFBVSxDQUFDLEdBQUcsSUFBSSxJQUFJLGFBQWEsUUFBUSxDQUFDLEdBQUcsV0FBVyxLQUFLLFdBQVcsSUFBSTtBQUFBLFFBQzNGLEdBQUc7QUFBQSxNQUNMLEVBQUUsTUFBTSxHQUFHLEVBQUUsQ0FBQztBQUNkLFVBQUksTUFBTyxPQUFNLFFBQVE7QUFDekIsWUFBTSxRQUFRLGdCQUFnQjtBQUM5QixzQkFBZ0IsSUFBSTtBQUFBLElBQ3RCO0FBQUEsRUFDRjtBQUVBLFdBQVMsVUFBVSxPQUFPLFVBQVU7QUFDbEMsVUFBTSxNQUFNLE1BQU0sUUFBUSxVQUFVLHdCQUF3QjtBQUM1RCxRQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sSUFBSSxZQUFhO0FBQ3JDLFVBQU0sVUFBVSx1QkFBdUIsTUFBTSxPQUFPLElBQUksYUFBYSxrQkFBa0IsQ0FBQztBQUN4RixVQUFNLE9BQU8sR0FBRyxZQUFZLG9CQUFvQixRQUFRLE9BQU8sVUFBUSxLQUFLLE9BQU8sSUFBSSxRQUFRLGNBQWMsQ0FBQztBQUM5RyxVQUFNLFFBQVEsa0JBQWtCO0FBQ2hDLG9CQUFnQixJQUFJO0FBQUEsRUFDdEI7QUFDRjsiLAogICJuYW1lcyI6IFtdCn0K
