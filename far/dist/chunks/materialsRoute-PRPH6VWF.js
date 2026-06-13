// src/views/materialsRoute.js
async function mountMaterialsView(deps = {}) {
  const {
    setView,
    createElement,
    eventTargetEl,
    safeMediaUrl,
    Router,
    Paginator,
    setPendingCourseMedia
  } = deps;
  setView(`
    <section class="view view-materials">
      <div class="page-header">
        <h1 class="page-title">Materials</h1>
        <p class="page-subtitle">All videos and PDFs in your catalog.</p>
      </div>
      <div class="card card-filled">
        <div class="card-body">
          <input class="input" id="materials-search" type="search" placeholder="Search topics..." />
          <div class="filter-row" aria-label="Material filters" style="margin-top:12px">
            <button class="filter-chip active" type="button" data-material-filter="all" aria-pressed="true">All</button>
            <button class="filter-chip" type="button" data-material-filter="video" aria-pressed="false">Video</button>
            <button class="filter-chip" type="button" data-material-filter="pdf" aria-pressed="false">PDF</button>
            <button class="filter-chip" type="button" data-material-filter="none" aria-pressed="false">No media</button>
          </div>
          <div class="grid grid-2" style="gap:10px;margin-top:12px">
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
      <div id="materials-pager" style="margin-top:12px"></div>
      <div id="materials-list" class="materials-list" style="margin-top:12px"></div>
    </section>
  `);
  await window.DataStore?.init?.();
  const viewRoot = document.querySelector(".view-materials");
  const pagerEl = document.getElementById("materials-pager");
  const listEl = document.getElementById("materials-list");
  const searchEl = document.getElementById("materials-search");
  const courseFilterEl = document.getElementById("materials-course-filter");
  const sourceFilterEl = document.getElementById("materials-source-filter");
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
  const courseEntries = [...new Map(topics.filter((topic) => topic?.courseId).map((topic) => [String(topic.courseId), String(topic.courseTitle || topic.courseId)])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const sourceEntries = [...new Map(topics.map((topic) => [String(topic.sourceLabel || "Source"), String(topic.sourceLabel || "Source")])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  courseEntries.forEach(([value, label]) => {
    courseFilterEl?.appendChild(createElement("option", { value }, label));
  });
  sourceEntries.forEach(([value, label]) => {
    sourceFilterEl?.appendChild(createElement("option", { value }, label));
  });
  const mediaClass = (topic) => {
    const hasVideo = (topic.videos?.length ?? 0) > 0;
    const hasPdf = (topic.pdfs?.length ?? 0) > 0;
    if (hasVideo && hasPdf) return "video-pdf";
    if (hasVideo) return "video";
    if (hasPdf) return "pdf";
    return "none";
  };
  let state = { page: 1, perPage: 50, query: "", filter: "all", courseId: "all", sourceLabel: "all" };
  const passesFilter = (topic) => state.filter === "all" || mediaClass(topic) === state.filter || state.filter === "video" && (topic.videos?.length ?? 0) > 0 || state.filter === "pdf" && (topic.pdfs?.length ?? 0) > 0;
  const materialBadge = (label) => createElement("span", { class: "badge" }, label);
  const materialActionButton = (action, label) => createElement("button", {
    class: "btn btn-ghost btn-sm",
    type: "button",
    "data-action": action
  }, label);
  const buildMaterialRow = (topic) => {
    const v = topic.videos?.[0];
    const p = topic.pdfs?.[0];
    const row = createElement("div", {
      class: "topic-row",
      "data-topic-id": topic.topicId,
      "data-course-id": topic.courseId,
      "data-media": mediaClass(topic)
    });
    const copy = createElement("div");
    copy.append(
      createElement("div", { class: "topic-title" }, topic.title),
      createElement("div", { class: "topic-submeta" }, `${topic.courseTitle ?? ""} - ${topic.sourceLabel ?? "Source"}`)
    );
    const meta = createElement("div", { class: "topic-meta" });
    if (v) meta.appendChild(materialBadge("video"));
    if (p) meta.appendChild(materialBadge("pdf"));
    if (!v && !p) meta.appendChild(materialBadge("no media"));
    const actions = createElement("div", { class: "topic-actions" });
    if (v) actions.appendChild(materialActionButton("play-video", "Play"));
    if (p) actions.appendChild(materialActionButton("open-pdf", "PDF"));
    row.append(copy, meta, actions);
    return row;
  };
  const render = (query = state.query) => {
    const q = query.trim().toLowerCase();
    const filtered = topics.filter((t) => {
      const matchesQuery = !q || String(t.title ?? "").toLowerCase().includes(q) || String(t.courseTitle ?? "").toLowerCase().includes(q) || String(t.sourceLabel ?? "").toLowerCase().includes(q);
      const matchesCourse = state.courseId === "all" || String(t.courseId || "") === state.courseId;
      const matchesSource = state.sourceLabel === "all" || String(t.sourceLabel || "Source") === state.sourceLabel;
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
        try {
          listEl.scrollTo?.({ top: 0, behavior: "smooth" });
        } catch {
          listEl.scrollTop = 0;
        }
      }
    });
    cancelRender();
    listEl.replaceChildren();
    if (!slice.length) {
      const empty = createElement("div", { class: "empty-state" }, createElement("p", {}, "No materials match this filter."));
      listEl.appendChild(empty);
      return;
    }
    const token = renderToken;
    const batchSize = Math.max(1, Number(window.PlasmaDeck?.materialsRenderBatchSize) || 50);
    const status = createElement("div", {
      class: "materials-render-status text-sm",
      "aria-live": "polite",
      "data-materials-render-status": ""
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
  render("");
  if (courseFilterEl) courseFilterEl.value = state.courseId;
  if (sourceFilterEl) sourceFilterEl.value = state.sourceLabel;
  on(searchEl, "input", () => render(searchEl.value));
  on(courseFilterEl, "change", () => {
    state.courseId = courseFilterEl.value || "all";
    state.page = 1;
    render(state.query);
  });
  on(sourceFilterEl, "change", () => {
    state.sourceLabel = sourceFilterEl.value || "all";
    state.page = 1;
    render(state.query);
  });
  on(viewRoot, "click", (e) => {
    const target = eventTargetEl(e);
    if (!target) return;
    const filterBtn = target.closest("[data-material-filter]");
    if (filterBtn) {
      state.filter = filterBtn.dataset.materialFilter || "all";
      state.page = 1;
      document.querySelectorAll("[data-material-filter]").forEach((btnEl) => {
        const isActive = btnEl === filterBtn;
        btnEl.classList.toggle("active", isActive);
        btnEl.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
      render(state.query);
      return;
    }
    const btn = target.closest("[data-action]");
    if (!btn) return;
    const row = target.closest("[data-topic-id]");
    if (!row) return;
    const t = topics.find((x) => x.topicId === row.dataset.topicId);
    if (!t) return;
    if (btn.dataset.action === "open-pdf") {
      const url = safeMediaUrl(t.pdfs?.[0]);
      if (!url) return;
      Router.navigate("#/pdf");
      setTimeout(() => {
        try {
          window.PlasmaPDFViewer?.load?.(url);
        } catch {
        }
      }, 50);
    }
    if (btn.dataset.action === "play-video") {
      const url = safeMediaUrl(t.videos?.[0]);
      if (!url) return;
      setPendingCourseMedia(t.topicId);
      Router.navigate("#/courses");
    }
  });
  return {
    unmount() {
      cancelRender();
      routeListeners.forEach(({ target, type, handler, options }) => {
        try {
          target.removeEventListener(type, handler, options);
        } catch {
        }
      });
    }
  };
}
export {
  mountMaterialsView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3ZpZXdzL21hdGVyaWFsc1JvdXRlLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJleHBvcnQgYXN5bmMgZnVuY3Rpb24gbW91bnRNYXRlcmlhbHNWaWV3KGRlcHMgPSB7fSkge1xuICBjb25zdCB7XG4gICAgc2V0VmlldyxcbiAgICBjcmVhdGVFbGVtZW50LFxuICAgIGV2ZW50VGFyZ2V0RWwsXG4gICAgc2FmZU1lZGlhVXJsLFxuICAgIFJvdXRlcixcbiAgICBQYWdpbmF0b3IsXG4gICAgc2V0UGVuZGluZ0NvdXJzZU1lZGlhLFxuICB9ID0gZGVwcztcblxuICBzZXRWaWV3KGBcbiAgICA8c2VjdGlvbiBjbGFzcz1cInZpZXcgdmlldy1tYXRlcmlhbHNcIj5cbiAgICAgIDxkaXYgY2xhc3M9XCJwYWdlLWhlYWRlclwiPlxuICAgICAgICA8aDEgY2xhc3M9XCJwYWdlLXRpdGxlXCI+TWF0ZXJpYWxzPC9oMT5cbiAgICAgICAgPHAgY2xhc3M9XCJwYWdlLXN1YnRpdGxlXCI+QWxsIHZpZGVvcyBhbmQgUERGcyBpbiB5b3VyIGNhdGFsb2cuPC9wPlxuICAgICAgPC9kaXY+XG4gICAgICA8ZGl2IGNsYXNzPVwiY2FyZCBjYXJkLWZpbGxlZFwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwiY2FyZC1ib2R5XCI+XG4gICAgICAgICAgPGlucHV0IGNsYXNzPVwiaW5wdXRcIiBpZD1cIm1hdGVyaWFscy1zZWFyY2hcIiB0eXBlPVwic2VhcmNoXCIgcGxhY2Vob2xkZXI9XCJTZWFyY2ggdG9waWNzLi4uXCIgLz5cbiAgICAgICAgICA8ZGl2IGNsYXNzPVwiZmlsdGVyLXJvd1wiIGFyaWEtbGFiZWw9XCJNYXRlcmlhbCBmaWx0ZXJzXCIgc3R5bGU9XCJtYXJnaW4tdG9wOjEycHhcIj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJmaWx0ZXItY2hpcCBhY3RpdmVcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1tYXRlcmlhbC1maWx0ZXI9XCJhbGxcIiBhcmlhLXByZXNzZWQ9XCJ0cnVlXCI+QWxsPC9idXR0b24+XG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZmlsdGVyLWNoaXBcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1tYXRlcmlhbC1maWx0ZXI9XCJ2aWRlb1wiIGFyaWEtcHJlc3NlZD1cImZhbHNlXCI+VmlkZW88L2J1dHRvbj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJmaWx0ZXItY2hpcFwiIHR5cGU9XCJidXR0b25cIiBkYXRhLW1hdGVyaWFsLWZpbHRlcj1cInBkZlwiIGFyaWEtcHJlc3NlZD1cImZhbHNlXCI+UERGPC9idXR0b24+XG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZmlsdGVyLWNoaXBcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1tYXRlcmlhbC1maWx0ZXI9XCJub25lXCIgYXJpYS1wcmVzc2VkPVwiZmFsc2VcIj5ObyBtZWRpYTwvYnV0dG9uPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJncmlkIGdyaWQtMlwiIHN0eWxlPVwiZ2FwOjEwcHg7bWFyZ2luLXRvcDoxMnB4XCI+XG4gICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJzdGFjay14c1wiPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cInRleHQtc20gdGV4dC1tdXRlZFwiPkNvdXJzZTwvc3Bhbj5cbiAgICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cInNlbGVjdFwiIGlkPVwibWF0ZXJpYWxzLWNvdXJzZS1maWx0ZXJcIiBhcmlhLWxhYmVsPVwiRmlsdGVyIG1hdGVyaWFscyBieSBjb3Vyc2VcIj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiYWxsXCI+QWxsIGNvdXJzZXM8L29wdGlvbj5cbiAgICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8L2xhYmVsPlxuICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwic3RhY2steHNcIj5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJ0ZXh0LXNtIHRleHQtbXV0ZWRcIj5Tb3VyY2U8L3NwYW4+XG4gICAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJzZWxlY3RcIiBpZD1cIm1hdGVyaWFscy1zb3VyY2UtZmlsdGVyXCIgYXJpYS1sYWJlbD1cIkZpbHRlciBtYXRlcmlhbHMgYnkgc291cmNlXCI+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImFsbFwiPkFsbCBzb3VyY2VzPC9vcHRpb24+XG4gICAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L2Rpdj5cbiAgICAgIDxkaXYgaWQ9XCJtYXRlcmlhbHMtcGFnZXJcIiBzdHlsZT1cIm1hcmdpbi10b3A6MTJweFwiPjwvZGl2PlxuICAgICAgPGRpdiBpZD1cIm1hdGVyaWFscy1saXN0XCIgY2xhc3M9XCJtYXRlcmlhbHMtbGlzdFwiIHN0eWxlPVwibWFyZ2luLXRvcDoxMnB4XCI+PC9kaXY+XG4gICAgPC9zZWN0aW9uPlxuICBgKTtcblxuICBhd2FpdCB3aW5kb3cuRGF0YVN0b3JlPy5pbml0Py4oKTtcbiAgY29uc3Qgdmlld1Jvb3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcudmlldy1tYXRlcmlhbHMnKTtcbiAgY29uc3QgcGFnZXJFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtYXRlcmlhbHMtcGFnZXInKTtcbiAgY29uc3QgbGlzdEVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21hdGVyaWFscy1saXN0Jyk7XG4gIGNvbnN0IHNlYXJjaEVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21hdGVyaWFscy1zZWFyY2gnKTtcbiAgY29uc3QgY291cnNlRmlsdGVyRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbWF0ZXJpYWxzLWNvdXJzZS1maWx0ZXInKTtcbiAgY29uc3Qgc291cmNlRmlsdGVyRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbWF0ZXJpYWxzLXNvdXJjZS1maWx0ZXInKTtcbiAgaWYgKCFsaXN0RWwpIHJldHVybjtcbiAgY29uc3Qgcm91dGVMaXN0ZW5lcnMgPSBbXTtcbiAgY29uc3Qgb24gPSAodGFyZ2V0LCB0eXBlLCBoYW5kbGVyLCBvcHRpb25zKSA9PiB7XG4gICAgaWYgKCF0YXJnZXQpIHJldHVybjtcbiAgICB0YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcih0eXBlLCBoYW5kbGVyLCBvcHRpb25zKTtcbiAgICByb3V0ZUxpc3RlbmVycy5wdXNoKHsgdGFyZ2V0LCB0eXBlLCBoYW5kbGVyLCBvcHRpb25zIH0pO1xuICB9O1xuICBsZXQgcmVuZGVyVG9rZW4gPSAwO1xuICBsZXQgcmVuZGVyVGltZXIgPSBudWxsO1xuICBjb25zdCBjYW5jZWxSZW5kZXIgPSAoKSA9PiB7XG4gICAgcmVuZGVyVG9rZW4gKz0gMTtcbiAgICBpZiAocmVuZGVyVGltZXIpIHtcbiAgICAgIGNsZWFyVGltZW91dChyZW5kZXJUaW1lcik7XG4gICAgICByZW5kZXJUaW1lciA9IG51bGw7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IHRvcGljcyA9IHdpbmRvdy5EYXRhU3RvcmU/LmFsbFRvcGljcz8uKCkgPz8gW107XG4gIGNvbnN0IGNvdXJzZUVudHJpZXMgPSBbLi4ubmV3IE1hcCh0b3BpY3NcbiAgICAuZmlsdGVyKCh0b3BpYykgPT4gdG9waWM/LmNvdXJzZUlkKVxuICAgIC5tYXAoKHRvcGljKSA9PiBbU3RyaW5nKHRvcGljLmNvdXJzZUlkKSwgU3RyaW5nKHRvcGljLmNvdXJzZVRpdGxlIHx8IHRvcGljLmNvdXJzZUlkKV0pKVxuICAgIC5lbnRyaWVzKCldXG4gICAgLnNvcnQoKGEsIGIpID0+IGFbMV0ubG9jYWxlQ29tcGFyZShiWzFdKSk7XG4gIGNvbnN0IHNvdXJjZUVudHJpZXMgPSBbLi4ubmV3IE1hcCh0b3BpY3NcbiAgICAubWFwKCh0b3BpYykgPT4gW1N0cmluZyh0b3BpYy5zb3VyY2VMYWJlbCB8fCAnU291cmNlJyksIFN0cmluZyh0b3BpYy5zb3VyY2VMYWJlbCB8fCAnU291cmNlJyldKSlcbiAgICAuZW50cmllcygpXVxuICAgIC5zb3J0KChhLCBiKSA9PiBhWzFdLmxvY2FsZUNvbXBhcmUoYlsxXSkpO1xuICBjb3Vyc2VFbnRyaWVzLmZvckVhY2goKFt2YWx1ZSwgbGFiZWxdKSA9PiB7XG4gICAgY291cnNlRmlsdGVyRWw/LmFwcGVuZENoaWxkKGNyZWF0ZUVsZW1lbnQoJ29wdGlvbicsIHsgdmFsdWUgfSwgbGFiZWwpKTtcbiAgfSk7XG4gIHNvdXJjZUVudHJpZXMuZm9yRWFjaCgoW3ZhbHVlLCBsYWJlbF0pID0+IHtcbiAgICBzb3VyY2VGaWx0ZXJFbD8uYXBwZW5kQ2hpbGQoY3JlYXRlRWxlbWVudCgnb3B0aW9uJywgeyB2YWx1ZSB9LCBsYWJlbCkpO1xuICB9KTtcbiAgY29uc3QgbWVkaWFDbGFzcyA9ICh0b3BpYykgPT4ge1xuICAgIGNvbnN0IGhhc1ZpZGVvID0gKHRvcGljLnZpZGVvcz8ubGVuZ3RoID8/IDApID4gMDtcbiAgICBjb25zdCBoYXNQZGYgPSAodG9waWMucGRmcz8ubGVuZ3RoID8/IDApID4gMDtcbiAgICBpZiAoaGFzVmlkZW8gJiYgaGFzUGRmKSByZXR1cm4gJ3ZpZGVvLXBkZic7XG4gICAgaWYgKGhhc1ZpZGVvKSByZXR1cm4gJ3ZpZGVvJztcbiAgICBpZiAoaGFzUGRmKSByZXR1cm4gJ3BkZic7XG4gICAgcmV0dXJuICdub25lJztcbiAgfTtcbiAgbGV0IHN0YXRlID0geyBwYWdlOiAxLCBwZXJQYWdlOiA1MCwgcXVlcnk6ICcnLCBmaWx0ZXI6ICdhbGwnLCBjb3Vyc2VJZDogJ2FsbCcsIHNvdXJjZUxhYmVsOiAnYWxsJyB9O1xuICBjb25zdCBwYXNzZXNGaWx0ZXIgPSAodG9waWMpID0+IHN0YXRlLmZpbHRlciA9PT0gJ2FsbCdcbiAgICB8fCBtZWRpYUNsYXNzKHRvcGljKSA9PT0gc3RhdGUuZmlsdGVyXG4gICAgfHwgKHN0YXRlLmZpbHRlciA9PT0gJ3ZpZGVvJyAmJiAodG9waWMudmlkZW9zPy5sZW5ndGggPz8gMCkgPiAwKVxuICAgIHx8IChzdGF0ZS5maWx0ZXIgPT09ICdwZGYnICYmICh0b3BpYy5wZGZzPy5sZW5ndGggPz8gMCkgPiAwKTtcbiAgY29uc3QgbWF0ZXJpYWxCYWRnZSA9IChsYWJlbCkgPT4gY3JlYXRlRWxlbWVudCgnc3BhbicsIHsgY2xhc3M6ICdiYWRnZScgfSwgbGFiZWwpO1xuICBjb25zdCBtYXRlcmlhbEFjdGlvbkJ1dHRvbiA9IChhY3Rpb24sIGxhYmVsKSA9PiBjcmVhdGVFbGVtZW50KCdidXR0b24nLCB7XG4gICAgY2xhc3M6ICdidG4gYnRuLWdob3N0IGJ0bi1zbScsXG4gICAgdHlwZTogJ2J1dHRvbicsXG4gICAgJ2RhdGEtYWN0aW9uJzogYWN0aW9uLFxuICB9LCBsYWJlbCk7XG4gIGNvbnN0IGJ1aWxkTWF0ZXJpYWxSb3cgPSAodG9waWMpID0+IHtcbiAgICBjb25zdCB2ID0gdG9waWMudmlkZW9zPy5bMF07XG4gICAgY29uc3QgcCA9IHRvcGljLnBkZnM/LlswXTtcbiAgICBjb25zdCByb3cgPSBjcmVhdGVFbGVtZW50KCdkaXYnLCB7XG4gICAgICBjbGFzczogJ3RvcGljLXJvdycsXG4gICAgICAnZGF0YS10b3BpYy1pZCc6IHRvcGljLnRvcGljSWQsXG4gICAgICAnZGF0YS1jb3Vyc2UtaWQnOiB0b3BpYy5jb3Vyc2VJZCxcbiAgICAgICdkYXRhLW1lZGlhJzogbWVkaWFDbGFzcyh0b3BpYyksXG4gICAgfSk7XG4gICAgY29uc3QgY29weSA9IGNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGNvcHkuYXBwZW5kKFxuICAgICAgY3JlYXRlRWxlbWVudCgnZGl2JywgeyBjbGFzczogJ3RvcGljLXRpdGxlJyB9LCB0b3BpYy50aXRsZSksXG4gICAgICBjcmVhdGVFbGVtZW50KCdkaXYnLCB7IGNsYXNzOiAndG9waWMtc3VibWV0YScgfSwgYCR7dG9waWMuY291cnNlVGl0bGUgPz8gJyd9IC0gJHt0b3BpYy5zb3VyY2VMYWJlbCA/PyAnU291cmNlJ31gKVxuICAgICk7XG4gICAgY29uc3QgbWV0YSA9IGNyZWF0ZUVsZW1lbnQoJ2RpdicsIHsgY2xhc3M6ICd0b3BpYy1tZXRhJyB9KTtcbiAgICBpZiAodikgbWV0YS5hcHBlbmRDaGlsZChtYXRlcmlhbEJhZGdlKCd2aWRlbycpKTtcbiAgICBpZiAocCkgbWV0YS5hcHBlbmRDaGlsZChtYXRlcmlhbEJhZGdlKCdwZGYnKSk7XG4gICAgaWYgKCF2ICYmICFwKSBtZXRhLmFwcGVuZENoaWxkKG1hdGVyaWFsQmFkZ2UoJ25vIG1lZGlhJykpO1xuICAgIGNvbnN0IGFjdGlvbnMgPSBjcmVhdGVFbGVtZW50KCdkaXYnLCB7IGNsYXNzOiAndG9waWMtYWN0aW9ucycgfSk7XG4gICAgaWYgKHYpIGFjdGlvbnMuYXBwZW5kQ2hpbGQobWF0ZXJpYWxBY3Rpb25CdXR0b24oJ3BsYXktdmlkZW8nLCAnUGxheScpKTtcbiAgICBpZiAocCkgYWN0aW9ucy5hcHBlbmRDaGlsZChtYXRlcmlhbEFjdGlvbkJ1dHRvbignb3Blbi1wZGYnLCAnUERGJykpO1xuICAgIHJvdy5hcHBlbmQoY29weSwgbWV0YSwgYWN0aW9ucyk7XG4gICAgcmV0dXJuIHJvdztcbiAgfTtcbiAgY29uc3QgcmVuZGVyID0gKHF1ZXJ5ID0gc3RhdGUucXVlcnkpID0+IHtcbiAgICBjb25zdCBxID0gcXVlcnkudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgZmlsdGVyZWQgPSB0b3BpY3MuZmlsdGVyKCh0KSA9PiB7XG4gICAgICBjb25zdCBtYXRjaGVzUXVlcnkgPSAhcVxuICAgICAgICB8fCBTdHJpbmcodC50aXRsZSA/PyAnJykudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxKVxuICAgICAgICB8fCBTdHJpbmcodC5jb3Vyc2VUaXRsZSA/PyAnJykudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxKVxuICAgICAgICB8fCBTdHJpbmcodC5zb3VyY2VMYWJlbCA/PyAnJykudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxKTtcbiAgICAgIGNvbnN0IG1hdGNoZXNDb3Vyc2UgPSBzdGF0ZS5jb3Vyc2VJZCA9PT0gJ2FsbCcgfHwgU3RyaW5nKHQuY291cnNlSWQgfHwgJycpID09PSBzdGF0ZS5jb3Vyc2VJZDtcbiAgICAgIGNvbnN0IG1hdGNoZXNTb3VyY2UgPSBzdGF0ZS5zb3VyY2VMYWJlbCA9PT0gJ2FsbCcgfHwgU3RyaW5nKHQuc291cmNlTGFiZWwgfHwgJ1NvdXJjZScpID09PSBzdGF0ZS5zb3VyY2VMYWJlbDtcbiAgICAgIHJldHVybiBtYXRjaGVzUXVlcnkgJiYgcGFzc2VzRmlsdGVyKHQpICYmIG1hdGNoZXNDb3Vyc2UgJiYgbWF0Y2hlc1NvdXJjZTtcbiAgICB9KTtcbiAgICBzdGF0ZS5xdWVyeSA9IHF1ZXJ5O1xuICAgIGNvbnN0IHsgcGFnZSwgcGVyUGFnZSwgcGFnZXMsIHRvdGFsLCBzbGljZSB9ID0gUGFnaW5hdG9yLnBhZ2luYXRlKGZpbHRlcmVkLCBzdGF0ZSk7XG4gICAgc3RhdGUucGFnZSA9IHBhZ2U7XG4gICAgc3RhdGUucGVyUGFnZSA9IHBlclBhZ2U7XG4gICAgUGFnaW5hdG9yLnJlbmRlckNvbnRyb2xzKHBhZ2VyRWwsIHtcbiAgICAgIHBhZ2UsXG4gICAgICBwYWdlcyxcbiAgICAgIHRvdGFsLFxuICAgICAgcGVyUGFnZSxcbiAgICAgIHBlclBhZ2VPcHRpb25zOiBbMjUsIDUwLCAxMDAsIDIwMF0sXG4gICAgICBvbkNoYW5nZTogKHsgcGFnZTogcCwgcGVyUGFnZTogcHAgfSkgPT4ge1xuICAgICAgICBzdGF0ZS5wYWdlID0gcCA/PyBzdGF0ZS5wYWdlO1xuICAgICAgICBzdGF0ZS5wZXJQYWdlID0gcHAgPz8gc3RhdGUucGVyUGFnZTtcbiAgICAgICAgcmVuZGVyKHN0YXRlLnF1ZXJ5KTtcbiAgICAgICAgdHJ5IHsgbGlzdEVsLnNjcm9sbFRvPy4oeyB0b3A6IDAsIGJlaGF2aW9yOiAnc21vb3RoJyB9KTsgfSBjYXRjaCB7IGxpc3RFbC5zY3JvbGxUb3AgPSAwOyB9XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY2FuY2VsUmVuZGVyKCk7XG4gICAgbGlzdEVsLnJlcGxhY2VDaGlsZHJlbigpO1xuICAgIGlmICghc2xpY2UubGVuZ3RoKSB7XG4gICAgICBjb25zdCBlbXB0eSA9IGNyZWF0ZUVsZW1lbnQoJ2RpdicsIHsgY2xhc3M6ICdlbXB0eS1zdGF0ZScgfSwgY3JlYXRlRWxlbWVudCgncCcsIHt9LCAnTm8gbWF0ZXJpYWxzIG1hdGNoIHRoaXMgZmlsdGVyLicpKTtcbiAgICAgIGxpc3RFbC5hcHBlbmRDaGlsZChlbXB0eSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHRva2VuID0gcmVuZGVyVG9rZW47XG4gICAgY29uc3QgYmF0Y2hTaXplID0gTWF0aC5tYXgoMSwgTnVtYmVyKHdpbmRvdy5QbGFzbWFEZWNrPy5tYXRlcmlhbHNSZW5kZXJCYXRjaFNpemUpIHx8IDUwKTtcbiAgICBjb25zdCBzdGF0dXMgPSBjcmVhdGVFbGVtZW50KCdkaXYnLCB7XG4gICAgICBjbGFzczogJ21hdGVyaWFscy1yZW5kZXItc3RhdHVzIHRleHQtc20nLFxuICAgICAgJ2FyaWEtbGl2ZSc6ICdwb2xpdGUnLFxuICAgICAgJ2RhdGEtbWF0ZXJpYWxzLXJlbmRlci1zdGF0dXMnOiAnJyxcbiAgICB9KTtcbiAgICBsZXQgaW5kZXggPSAwO1xuICAgIGNvbnN0IHJlbmRlckJhdGNoID0gKCkgPT4ge1xuICAgICAgaWYgKCFsaXN0RWwuaXNDb25uZWN0ZWQgfHwgdG9rZW4gIT09IHJlbmRlclRva2VuKSByZXR1cm47XG4gICAgICBjb25zdCBmcmFnbWVudCA9IGRvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcbiAgICAgIGNvbnN0IGVuZCA9IE1hdGgubWluKHNsaWNlLmxlbmd0aCwgaW5kZXggKyBiYXRjaFNpemUpO1xuICAgICAgZm9yICg7IGluZGV4IDwgZW5kOyBpbmRleCArPSAxKSBmcmFnbWVudC5hcHBlbmRDaGlsZChidWlsZE1hdGVyaWFsUm93KHNsaWNlW2luZGV4XSkpO1xuICAgICAgbGlzdEVsLmluc2VydEJlZm9yZShmcmFnbWVudCwgc3RhdHVzLmlzQ29ubmVjdGVkID8gc3RhdHVzIDogbnVsbCk7XG4gICAgICBpZiAoaW5kZXggPCBzbGljZS5sZW5ndGgpIHtcbiAgICAgICAgc3RhdHVzLnRleHRDb250ZW50ID0gYFNob3dpbmcgJHtpbmRleH0gb2YgJHtzbGljZS5sZW5ndGh9IHZpc2libGUgbWF0ZXJpYWxzYDtcbiAgICAgICAgaWYgKCFzdGF0dXMuaXNDb25uZWN0ZWQpIGxpc3RFbC5hcHBlbmRDaGlsZChzdGF0dXMpO1xuICAgICAgICByZW5kZXJUaW1lciA9IHNldFRpbWVvdXQocmVuZGVyQmF0Y2gsIDApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVuZGVyVGltZXIgPSBudWxsO1xuICAgICAgICBzdGF0dXMucmVtb3ZlKCk7XG4gICAgICB9XG4gICAgfTtcbiAgICByZW5kZXJCYXRjaCgpO1xuICB9O1xuXG4gIHJlbmRlcignJyk7XG4gIGlmIChjb3Vyc2VGaWx0ZXJFbCkgY291cnNlRmlsdGVyRWwudmFsdWUgPSBzdGF0ZS5jb3Vyc2VJZDtcbiAgaWYgKHNvdXJjZUZpbHRlckVsKSBzb3VyY2VGaWx0ZXJFbC52YWx1ZSA9IHN0YXRlLnNvdXJjZUxhYmVsO1xuXG4gIG9uKHNlYXJjaEVsLCAnaW5wdXQnLCAoKSA9PiByZW5kZXIoc2VhcmNoRWwudmFsdWUpKTtcbiAgb24oY291cnNlRmlsdGVyRWwsICdjaGFuZ2UnLCAoKSA9PiB7XG4gICAgc3RhdGUuY291cnNlSWQgPSBjb3Vyc2VGaWx0ZXJFbC52YWx1ZSB8fCAnYWxsJztcbiAgICBzdGF0ZS5wYWdlID0gMTtcbiAgICByZW5kZXIoc3RhdGUucXVlcnkpO1xuICB9KTtcbiAgb24oc291cmNlRmlsdGVyRWwsICdjaGFuZ2UnLCAoKSA9PiB7XG4gICAgc3RhdGUuc291cmNlTGFiZWwgPSBzb3VyY2VGaWx0ZXJFbC52YWx1ZSB8fCAnYWxsJztcbiAgICBzdGF0ZS5wYWdlID0gMTtcbiAgICByZW5kZXIoc3RhdGUucXVlcnkpO1xuICB9KTtcblxuICBvbih2aWV3Um9vdCwgJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGV2ZW50VGFyZ2V0RWwoZSk7XG4gICAgICBpZiAoIXRhcmdldCkgcmV0dXJuO1xuICAgICAgY29uc3QgZmlsdGVyQnRuID0gdGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLW1hdGVyaWFsLWZpbHRlcl0nKTtcbiAgICAgIGlmIChmaWx0ZXJCdG4pIHtcbiAgICAgICAgc3RhdGUuZmlsdGVyID0gZmlsdGVyQnRuLmRhdGFzZXQubWF0ZXJpYWxGaWx0ZXIgfHwgJ2FsbCc7XG4gICAgICAgIHN0YXRlLnBhZ2UgPSAxO1xuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1tYXRlcmlhbC1maWx0ZXJdJykuZm9yRWFjaCgoYnRuRWwpID0+IHtcbiAgICAgICAgICBjb25zdCBpc0FjdGl2ZSA9IGJ0bkVsID09PSBmaWx0ZXJCdG47XG4gICAgICAgICAgYnRuRWwuY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgaXNBY3RpdmUpO1xuICAgICAgICAgIGJ0bkVsLnNldEF0dHJpYnV0ZSgnYXJpYS1wcmVzc2VkJywgaXNBY3RpdmUgPyAndHJ1ZScgOiAnZmFsc2UnKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJlbmRlcihzdGF0ZS5xdWVyeSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGJ0biA9IHRhcmdldC5jbG9zZXN0KCdbZGF0YS1hY3Rpb25dJyk7XG4gICAgICBpZiAoIWJ0bikgcmV0dXJuO1xuICAgICAgY29uc3Qgcm93ID0gdGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXRvcGljLWlkXScpO1xuICAgICAgaWYgKCFyb3cpIHJldHVybjtcbiAgICAgIGNvbnN0IHQgPSB0b3BpY3MuZmluZCh4ID0+IHgudG9waWNJZCA9PT0gcm93LmRhdGFzZXQudG9waWNJZCk7XG4gICAgICBpZiAoIXQpIHJldHVybjtcbiAgICAgIGlmIChidG4uZGF0YXNldC5hY3Rpb24gPT09ICdvcGVuLXBkZicpIHtcbiAgICAgICAgY29uc3QgdXJsID0gc2FmZU1lZGlhVXJsKHQucGRmcz8uWzBdKTtcbiAgICAgICAgaWYgKCF1cmwpIHJldHVybjtcbiAgICAgICAgUm91dGVyLm5hdmlnYXRlKCcjL3BkZicpO1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHsgdHJ5IHsgd2luZG93LlBsYXNtYVBERlZpZXdlcj8ubG9hZD8uKHVybCk7IH0gY2F0Y2gge30gfSwgNTApO1xuICAgICAgfVxuICAgICAgaWYgKGJ0bi5kYXRhc2V0LmFjdGlvbiA9PT0gJ3BsYXktdmlkZW8nKSB7XG4gICAgICAgIGNvbnN0IHVybCA9IHNhZmVNZWRpYVVybCh0LnZpZGVvcz8uWzBdKTtcbiAgICAgICAgaWYgKCF1cmwpIHJldHVybjtcbiAgICAgICAgLy8gSnVtcCB0byBjb3Vyc2VzIGFuZCBhdXRvcGxheSB0aGUgZXhhY3QgdG9waWNcbiAgICAgICAgc2V0UGVuZGluZ0NvdXJzZU1lZGlhKHQudG9waWNJZCk7XG4gICAgICAgIFJvdXRlci5uYXZpZ2F0ZSgnIy9jb3Vyc2VzJyk7XG4gICAgICB9XG4gIH0pO1xuICByZXR1cm4ge1xuICAgIHVubW91bnQoKSB7XG4gICAgICBjYW5jZWxSZW5kZXIoKTtcbiAgICAgIHJvdXRlTGlzdGVuZXJzLmZvckVhY2goKHsgdGFyZ2V0LCB0eXBlLCBoYW5kbGVyLCBvcHRpb25zIH0pID0+IHtcbiAgICAgICAgdHJ5IHsgdGFyZ2V0LnJlbW92ZUV2ZW50TGlzdGVuZXIodHlwZSwgaGFuZGxlciwgb3B0aW9ucyk7IH0gY2F0Y2gge31cbiAgICAgIH0pO1xuICAgIH0sXG4gIH07XG59XG5cblxuXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQUEsZUFBc0IsbUJBQW1CLE9BQU8sQ0FBQyxHQUFHO0FBQ2xELFFBQU07QUFBQSxJQUNKO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FB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
