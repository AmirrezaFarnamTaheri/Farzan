// src/views/tagsRoute.js
function mountTagsView({ setView } = {}) {
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
  const tag = String(value ?? "").trim();
  if (!tag) return null;
  return tag.replace(/\s+/g, " ");
}
function readTagValues(record) {
  const values = [];
  ["tags", "keywords", "labels"].forEach((key) => {
    const raw = record?.[key];
    if (Array.isArray(raw)) values.push(...raw);
    else if (typeof raw === "string") values.push(...raw.split(","));
  });
  return values.map(normalizeTagValue).filter(Boolean);
}
async function renderTags() {
  const metricsRoot = document.querySelector("[data-tag-metrics]");
  const listRoot = document.querySelector("[data-tag-list]");
  const searchEl = document.querySelector("[data-tag-search]");
  const filtersRoot = document.querySelector("[data-tag-filters]");
  if (!metricsRoot || !listRoot || !searchEl || !filtersRoot) return;
  const [notes, topics] = await Promise.all([
    (async () => {
      try {
        return await window.DB?.getAllNotes?.() ?? [];
      } catch {
        return [];
      }
    })(),
    (async () => {
      try {
        await window.DataStore?.init?.();
        return window.DataStore?.allTopics?.() ?? [];
      } catch {
        return [];
      }
    })()
  ]);
  if (!document.body.contains(listRoot)) return;
  const tagsByKey = /* @__PURE__ */ new Map();
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
        notes: /* @__PURE__ */ new Set(),
        topics: /* @__PURE__ */ new Set()
      });
    }
    return tagsByKey.get(key);
  };
  notes.forEach((note) => {
    readTagValues(note).forEach((rawTag) => {
      const entry = ensureTag(rawTag);
      if (!entry) return;
      entry.noteCount += 1;
      if (note.id) entry.notes.add(String(note.id));
    });
  });
  topics.forEach((topic) => {
    readTagValues(topic).forEach((rawTag) => {
      const entry = ensureTag(rawTag);
      if (!entry) return;
      entry.topicCount += 1;
      if (topic.topicId || topic.id) entry.topics.add(String(topic.topicId || topic.id));
    });
  });
  const tagEntries = [...tagsByKey.values()].sort((a, b) => b.noteCount + b.topicCount - (a.noteCount + a.topicCount) || a.label.localeCompare(b.label));
  const routeState = window.PlasmaDeck = window.PlasmaDeck ?? {};
  routeState.tagFacetState = routeState.tagFacetState || { query: "", filter: "all" };
  const state = routeState.tagFacetState;
  const noteTagCount = tagEntries.filter((tag) => tag.noteCount > 0).length;
  const catalogTagCount = tagEntries.filter((tag) => tag.topicCount > 0).length;
  const taggedNotes = /* @__PURE__ */ new Set();
  const taggedTopics = /* @__PURE__ */ new Set();
  tagEntries.forEach((tag) => {
    tag.notes.forEach((id) => taggedNotes.add(id));
    tag.topics.forEach((id) => taggedTopics.add(id));
  });
  metricsRoot.replaceChildren();
  [
    ["Unique tags", tagEntries.length],
    ["Note tags", noteTagCount],
    ["Catalog tags", catalogTagCount],
    ["Tagged records", taggedNotes.size + taggedTopics.size]
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
  const matchesTagFilter = (tag) => {
    if (state.filter === "all") return true;
    if (state.filter === "mixed") return tag.noteCount > 0 && tag.topicCount > 0;
    if (state.filter === "note") return tag.noteCount > 0 && tag.topicCount === 0;
    if (state.filter === "catalog") return tag.topicCount > 0 && tag.noteCount === 0;
    return true;
  };
  const q = String(state.query || "").trim().toLowerCase();
  const visibleTags = tagEntries.filter((tag) => {
    const matchesQuery = !q || tag.label.toLowerCase().includes(q);
    return matchesQuery && matchesTagFilter(tag);
  });
  const renderVisibleTags = () => {
    listRoot.replaceChildren();
    if (!tagEntries.length) {
      const empty = document.createElement("p");
      empty.className = "text-muted";
      empty.textContent = "No tags yet. Add tags to notes or catalog records and they will appear here.";
      listRoot.appendChild(empty);
      return;
    }
    if (!visibleTags.length) {
      const empty = document.createElement("p");
      empty.className = "text-muted";
      empty.textContent = "No tags match this search or filter.";
      listRoot.appendChild(empty);
      return;
    }
    visibleTags.slice(0, 48).forEach((tag) => {
      const source = tag.noteCount && tag.topicCount ? "Mixed" : tag.noteCount ? "Note" : "Catalog";
      const card = document.createElement("article");
      card.className = "card";
      card.dataset.tagName = tag.key;
      card.dataset.tagSource = source.toLowerCase();
      const body = document.createElement("div");
      body.className = "card-body";
      const badge = document.createElement("span");
      badge.className = source === "Mixed" ? "badge badge-success" : "badge badge-info";
      badge.textContent = source;
      const title = document.createElement("h2");
      title.className = "h4";
      title.textContent = tag.label;
      const detail = document.createElement("p");
      detail.textContent = `${tag.noteCount} note${tag.noteCount === 1 ? "" : "s"} and ${tag.topicCount} catalog topic${tag.topicCount === 1 ? "" : "s"}`;
      const links = document.createElement("div");
      links.className = "button-row";
      if (tag.noteCount) {
        const notesLink = document.createElement("a");
        notesLink.className = "btn btn-ghost";
        notesLink.href = "#/notes";
        notesLink.textContent = "Notes";
        links.appendChild(notesLink);
      }
      if (tag.topicCount) {
        const coursesLink = document.createElement("a");
        coursesLink.className = "btn btn-ghost";
        coursesLink.href = "#/courses";
        coursesLink.textContent = "Courses";
        links.appendChild(coursesLink);
      }
      body.append(badge, title, detail, links);
      card.appendChild(body);
      listRoot.appendChild(card);
    });
  };
  searchEl.value = state.query;
  filtersRoot.querySelectorAll("[data-tag-filter]").forEach((button) => {
    const active = button.dataset.tagFilter === state.filter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  renderVisibleTags();
  if (!searchEl.dataset.pdBound) {
    searchEl.dataset.pdBound = "true";
    searchEl.addEventListener("input", () => {
      state.query = searchEl.value || "";
      renderTags();
    });
  }
  if (!filtersRoot.dataset.pdBound) {
    filtersRoot.dataset.pdBound = "true";
    filtersRoot.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-tag-filter]");
      if (!button) return;
      state.filter = button.dataset.tagFilter || "all";
      renderTags();
    });
  }
}
export {
  mountTagsView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3ZpZXdzL3RhZ3NSb3V0ZS5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IGZ1bmN0aW9uIG1vdW50VGFnc1ZpZXcoeyBzZXRWaWV3IH0gPSB7fSkge1xuICBzZXRWaWV3KGBcbiAgICA8c2VjdGlvbiBjbGFzcz1cInZpZXcgdmlldy10YWdzXCI+XG4gICAgICA8ZGl2IGNsYXNzPVwicGFnZS1oZWFkZXJcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cInBhZ2UtdGl0bGUtcm93XCI+XG4gICAgICAgICAgPGgxIGNsYXNzPVwicGFnZS10aXRsZVwiPlRhZ3M8L2gxPlxuICAgICAgICAgIDxzcGFuIGNsYXNzPVwiYmFkZ2UgYmFkZ2Utc3VjY2Vzc1wiIGFyaWEtbGFiZWw9XCJGZWF0dXJlIHN0YXR1czogcmVhZHlcIj5SZWFkeTwvc3Bhbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxwIGNsYXNzPVwicGFnZS1zdWJ0aXRsZVwiPkJyb3dzZSBub3RlIHRhZ3MgYW5kIGNhdGFsb2cgdGFncyBmcm9tIG9uZSBwbGFjZS48L3A+XG4gICAgICA8L2Rpdj5cbiAgICAgIDxkaXYgY2xhc3M9XCJzdGF0LWdyaWRcIiBkYXRhLXRhZy1tZXRyaWNzPjwvZGl2PlxuICAgICAgPGRpdiBjbGFzcz1cImNhcmQgY2FyZC1maWxsZWRcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQtYm9keVwiPlxuICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImlucHV0XCIgdHlwZT1cInNlYXJjaFwiIGRhdGEtdGFnLXNlYXJjaCBwbGFjZWhvbGRlcj1cIlNlYXJjaCB0YWdzLi4uXCIgLz5cbiAgICAgICAgICA8ZGl2IGNsYXNzPVwiZmlsdGVyLXJvd1wiIGRhdGEtdGFnLWZpbHRlcnMgYXJpYS1sYWJlbD1cIlRhZyBmaWx0ZXJzXCIgc3R5bGU9XCJtYXJnaW4tdG9wOjEycHhcIj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJmaWx0ZXItY2hpcCBhY3RpdmVcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS10YWctZmlsdGVyPVwiYWxsXCIgYXJpYS1wcmVzc2VkPVwidHJ1ZVwiPkFsbDwvYnV0dG9uPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImZpbHRlci1jaGlwXCIgdHlwZT1cImJ1dHRvblwiIGRhdGEtdGFnLWZpbHRlcj1cIm1peGVkXCIgYXJpYS1wcmVzc2VkPVwiZmFsc2VcIj5NaXhlZDwvYnV0dG9uPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImZpbHRlci1jaGlwXCIgdHlwZT1cImJ1dHRvblwiIGRhdGEtdGFnLWZpbHRlcj1cIm5vdGVcIiBhcmlhLXByZXNzZWQ9XCJmYWxzZVwiPk5vdGVzPC9idXR0b24+XG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZmlsdGVyLWNoaXBcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS10YWctZmlsdGVyPVwiY2F0YWxvZ1wiIGFyaWEtcHJlc3NlZD1cImZhbHNlXCI+Q2F0YWxvZzwvYnV0dG9uPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJncmlkIGdyaWQtM1wiIGRhdGEtdGFnLWxpc3Q+XG4gICAgICAgICAgICA8cD5Mb2FkaW5nIHRhZ3MuLi48L3A+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG4gICAgPC9zZWN0aW9uPlxuICBgKTtcbiAgcmVuZGVyVGFncygpO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVUYWdWYWx1ZSh2YWx1ZSkge1xuICBjb25zdCB0YWcgPSBTdHJpbmcodmFsdWUgPz8gJycpLnRyaW0oKTtcbiAgaWYgKCF0YWcpIHJldHVybiBudWxsO1xuICByZXR1cm4gdGFnLnJlcGxhY2UoL1xccysvZywgJyAnKTtcbn1cblxuZnVuY3Rpb24gcmVhZFRhZ1ZhbHVlcyhyZWNvcmQpIHtcbiAgY29uc3QgdmFsdWVzID0gW107XG4gIFsndGFncycsICdrZXl3b3JkcycsICdsYWJlbHMnXS5mb3JFYWNoKGtleSA9PiB7XG4gICAgY29uc3QgcmF3ID0gcmVjb3JkPy5ba2V5XTtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShyYXcpKSB2YWx1ZXMucHVzaCguLi5yYXcpO1xuICAgIGVsc2UgaWYgKHR5cGVvZiByYXcgPT09ICdzdHJpbmcnKSB2YWx1ZXMucHVzaCguLi5yYXcuc3BsaXQoJywnKSk7XG4gIH0pO1xuICByZXR1cm4gdmFsdWVzXG4gICAgLm1hcChub3JtYWxpemVUYWdWYWx1ZSlcbiAgICAuZmlsdGVyKEJvb2xlYW4pO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZW5kZXJUYWdzKCkge1xuICBjb25zdCBtZXRyaWNzUm9vdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXRhZy1tZXRyaWNzXScpO1xuICBjb25zdCBsaXN0Um9vdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXRhZy1saXN0XScpO1xuICBjb25zdCBzZWFyY2hFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXRhZy1zZWFyY2hdJyk7XG4gIGNvbnN0IGZpbHRlcnNSb290ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtdGFnLWZpbHRlcnNdJyk7XG4gIGlmICghbWV0cmljc1Jvb3QgfHwgIWxpc3RSb290IHx8ICFzZWFyY2hFbCB8fCAhZmlsdGVyc1Jvb3QpIHJldHVybjtcblxuICBjb25zdCBbbm90ZXMsIHRvcGljc10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgKGFzeW5jICgpID0+IHsgdHJ5IHsgcmV0dXJuIGF3YWl0IHdpbmRvdy5EQj8uZ2V0QWxsTm90ZXM/LigpID8/IFtdOyB9IGNhdGNoIHsgcmV0dXJuIFtdOyB9IH0pKCksXG4gICAgKGFzeW5jICgpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHdpbmRvdy5EYXRhU3RvcmU/LmluaXQ/LigpO1xuICAgICAgICByZXR1cm4gd2luZG93LkRhdGFTdG9yZT8uYWxsVG9waWNzPy4oKSA/PyBbXTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gW107XG4gICAgICB9XG4gICAgfSkoKSxcbiAgXSk7XG4gIGlmICghZG9jdW1lbnQuYm9keS5jb250YWlucyhsaXN0Um9vdCkpIHJldHVybjtcblxuICBjb25zdCB0YWdzQnlLZXkgPSBuZXcgTWFwKCk7XG4gIGNvbnN0IGVuc3VyZVRhZyA9IChyYXdUYWcpID0+IHtcbiAgICBjb25zdCBsYWJlbCA9IG5vcm1hbGl6ZVRhZ1ZhbHVlKHJhd1RhZyk7XG4gICAgaWYgKCFsYWJlbCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3Qga2V5ID0gbGFiZWwudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAoIXRhZ3NCeUtleS5oYXMoa2V5KSkge1xuICAgICAgdGFnc0J5S2V5LnNldChrZXksIHtcbiAgICAgICAga2V5LFxuICAgICAgICBsYWJlbCxcbiAgICAgICAgbm90ZUNvdW50OiAwLFxuICAgICAgICB0b3BpY0NvdW50OiAwLFxuICAgICAgICBub3RlczogbmV3IFNldCgpLFxuICAgICAgICB0b3BpY3M6IG5ldyBTZXQoKSxcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gdGFnc0J5S2V5LmdldChrZXkpO1xuICB9O1xuXG4gIG5vdGVzLmZvckVhY2gobm90ZSA9PiB7XG4gICAgcmVhZFRhZ1ZhbHVlcyhub3RlKS5mb3JFYWNoKHJhd1RhZyA9PiB7XG4gICAgICBjb25zdCBlbnRyeSA9IGVuc3VyZVRhZyhyYXdUYWcpO1xuICAgICAgaWYgKCFlbnRyeSkgcmV0dXJuO1xuICAgICAgZW50cnkubm90ZUNvdW50ICs9IDE7XG4gICAgICBpZiAobm90ZS5pZCkgZW50cnkubm90ZXMuYWRkKFN0cmluZyhub3RlLmlkKSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIHRvcGljcy5mb3JFYWNoKHRvcGljID0+IHtcbiAgICByZWFkVGFnVmFsdWVzKHRvcGljKS5mb3JFYWNoKHJhd1RhZyA9PiB7XG4gICAgICBjb25zdCBlbnRyeSA9IGVuc3VyZVRhZyhyYXdUYWcpO1xuICAgICAgaWYgKCFlbnRyeSkgcmV0dXJuO1xuICAgICAgZW50cnkudG9waWNDb3VudCArPSAxO1xuICAgICAgaWYgKHRvcGljLnRvcGljSWQgfHwgdG9waWMuaWQpIGVudHJ5LnRvcGljcy5hZGQoU3RyaW5nKHRvcGljLnRvcGljSWQgfHwgdG9waWMuaWQpKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgY29uc3QgdGFnRW50cmllcyA9IFsuLi50YWdzQnlLZXkudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IChcbiAgICAoYi5ub3RlQ291bnQgKyBiLnRvcGljQ291bnQpIC0gKGEubm90ZUNvdW50ICsgYS50b3BpY0NvdW50KVxuICAgIHx8IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKVxuICApKTtcbiAgY29uc3Qgcm91dGVTdGF0ZSA9IHdpbmRvdy5QbGFzbWFEZWNrID0gd2luZG93LlBsYXNtYURlY2sgPz8ge307XG4gIHJvdXRlU3RhdGUudGFnRmFjZXRTdGF0ZSA9IHJvdXRlU3RhdGUudGFnRmFjZXRTdGF0ZSB8fCB7IHF1ZXJ5OiAnJywgZmlsdGVyOiAnYWxsJyB9O1xuICBjb25zdCBzdGF0ZSA9IHJvdXRlU3RhdGUudGFnRmFjZXRTdGF0ZTtcbiAgY29uc3Qgbm90ZVRhZ0NvdW50ID0gdGFnRW50cmllcy5maWx0ZXIodGFnID0+IHRhZy5ub3RlQ291bnQgPiAwKS5sZW5ndGg7XG4gIGNvbnN0IGNhdGFsb2dUYWdDb3VudCA9IHRhZ0VudHJpZXMuZmlsdGVyKHRhZyA9PiB0YWcudG9waWNDb3VudCA+IDApLmxlbmd0aDtcbiAgY29uc3QgdGFnZ2VkTm90ZXMgPSBuZXcgU2V0KCk7XG4gIGNvbnN0IHRhZ2dlZFRvcGljcyA9IG5ldyBTZXQoKTtcbiAgdGFnRW50cmllcy5mb3JFYWNoKHRhZyA9PiB7XG4gICAgdGFnLm5vdGVzLmZvckVhY2goaWQgPT4gdGFnZ2VkTm90ZXMuYWRkKGlkKSk7XG4gICAgdGFnLnRvcGljcy5mb3JFYWNoKGlkID0+IHRhZ2dlZFRvcGljcy5hZGQoaWQpKTtcbiAgfSk7XG5cbiAgbWV0cmljc1Jvb3QucmVwbGFjZUNoaWxkcmVuKCk7XG4gIFtcbiAgICBbJ1VuaXF1ZSB0YWdzJywgdGFnRW50cmllcy5sZW5ndGhdLFxuICAgIFsnTm90ZSB0YWdzJywgbm90ZVRhZ0NvdW50XSxcbiAgICBbJ0NhdGFsb2cgdGFncycsIGNhdGFsb2dUYWdDb3VudF0sXG4gICAgWydUYWdnZWQgcmVjb3JkcycsIHRhZ2dlZE5vdGVzLnNpemUgKyB0YWdnZWRUb3BpY3Muc2l6ZV0sXG4gIF0uZm9yRWFjaCgoW2xhYmVsLCB2YWx1ZV0pID0+IHtcbiAgICBjb25zdCBjYXJkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgY2FyZC5jbGFzc05hbWUgPSAnc3RhdC1jYXJkJztcbiAgICBjb25zdCBzdHJvbmcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHJvbmcnKTtcbiAgICBzdHJvbmcudGV4dENvbnRlbnQgPSBTdHJpbmcodmFsdWUpO1xuICAgIGNvbnN0IHNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG4gICAgc3Bhbi50ZXh0Q29udGVudCA9IGxhYmVsO1xuICAgIGNhcmQuYXBwZW5kKHN0cm9uZywgc3Bhbik7XG4gICAgbWV0cmljc1Jvb3QuYXBwZW5kQ2hpbGQoY2FyZCk7XG4gIH0pO1xuXG4gIGNvbnN0IG1hdGNoZXNUYWdGaWx0ZXIgPSAodGFnKSA9PiB7XG4gICAgaWYgKHN0YXRlLmZpbHRlciA9PT0gJ2FsbCcpIHJldHVybiB0cnVlO1xuICAgIGlmIChzdGF0ZS5maWx0ZXIgPT09ICdtaXhlZCcpIHJldHVybiB0YWcubm90ZUNvdW50ID4gMCAmJiB0YWcudG9waWNDb3VudCA+IDA7XG4gICAgaWYgKHN0YXRlLmZpbHRlciA9PT0gJ25vdGUnKSByZXR1cm4gdGFnLm5vdGVDb3VudCA+IDAgJiYgdGFnLnRvcGljQ291bnQgPT09IDA7XG4gICAgaWYgKHN0YXRlLmZpbHRlciA9PT0gJ2NhdGFsb2cnKSByZXR1cm4gdGFnLnRvcGljQ291bnQgPiAwICYmIHRhZy5ub3RlQ291bnQgPT09IDA7XG4gICAgcmV0dXJuIHRydWU7XG4gIH07XG4gIGNvbnN0IHEgPSBTdHJpbmcoc3RhdGUucXVlcnkgfHwgJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICBjb25zdCB2aXNpYmxlVGFncyA9IHRhZ0VudHJpZXMuZmlsdGVyKCh0YWcpID0+IHtcbiAgICBjb25zdCBtYXRjaGVzUXVlcnkgPSAhcSB8fCB0YWcubGFiZWwudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxKTtcbiAgICByZXR1cm4gbWF0Y2hlc1F1ZXJ5ICYmIG1hdGNoZXNUYWdGaWx0ZXIodGFnKTtcbiAgfSk7XG5cbiAgY29uc3QgcmVuZGVyVmlzaWJsZVRhZ3MgPSAoKSA9PiB7XG4gICAgbGlzdFJvb3QucmVwbGFjZUNoaWxkcmVuKCk7XG4gICAgaWYgKCF0YWdFbnRyaWVzLmxlbmd0aCkge1xuICAgICAgY29uc3QgZW1wdHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJyk7XG4gICAgICBlbXB0eS5jbGFzc05hbWUgPSAndGV4dC1tdXRlZCc7XG4gICAgICBlbXB0eS50ZXh0Q29udGVudCA9ICdObyB0YWdzIHlldC4gQWRkIHRhZ3MgdG8gbm90ZXMgb3IgY2F0YWxvZyByZWNvcmRzIGFuZCB0aGV5IHdpbGwgYXBwZWFyIGhlcmUuJztcbiAgICAgIGxpc3RSb290LmFwcGVuZENoaWxkKGVtcHR5KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCF2aXNpYmxlVGFncy5sZW5ndGgpIHtcbiAgICAgIGNvbnN0IGVtcHR5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xuICAgICAgZW1wdHkuY2xhc3NOYW1lID0gJ3RleHQtbXV0ZWQnO1xuICAgICAgZW1wdHkudGV4dENvbnRlbnQgPSAnTm8gdGFncyBtYXRjaCB0aGlzIHNlYXJjaCBvciBmaWx0ZXIuJztcbiAgICAgIGxpc3RSb290LmFwcGVuZENoaWxkKGVtcHR5KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmlzaWJsZVRhZ3Muc2xpY2UoMCwgNDgpLmZvckVhY2godGFnID0+IHtcbiAgICBjb25zdCBzb3VyY2UgPSB0YWcubm90ZUNvdW50ICYmIHRhZy50b3BpY0NvdW50ID8gJ01peGVkJyA6IHRhZy5ub3RlQ291bnQgPyAnTm90ZScgOiAnQ2F0YWxvZyc7XG4gICAgY29uc3QgY2FyZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2FydGljbGUnKTtcbiAgICBjYXJkLmNsYXNzTmFtZSA9ICdjYXJkJztcbiAgICBjYXJkLmRhdGFzZXQudGFnTmFtZSA9IHRhZy5rZXk7XG4gICAgY2FyZC5kYXRhc2V0LnRhZ1NvdXJjZSA9IHNvdXJjZS50b0xvd2VyQ2FzZSgpO1xuXG4gICAgY29uc3QgYm9keSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGJvZHkuY2xhc3NOYW1lID0gJ2NhcmQtYm9keSc7XG4gICAgY29uc3QgYmFkZ2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG4gICAgYmFkZ2UuY2xhc3NOYW1lID0gc291cmNlID09PSAnTWl4ZWQnID8gJ2JhZGdlIGJhZGdlLXN1Y2Nlc3MnIDogJ2JhZGdlIGJhZGdlLWluZm8nO1xuICAgIGJhZGdlLnRleHRDb250ZW50ID0gc291cmNlO1xuICAgIGNvbnN0IHRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaDInKTtcbiAgICB0aXRsZS5jbGFzc05hbWUgPSAnaDQnO1xuICAgIHRpdGxlLnRleHRDb250ZW50ID0gdGFnLmxhYmVsO1xuICAgIGNvbnN0IGRldGFpbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcbiAgICBkZXRhaWwudGV4dENvbnRlbnQgPSBgJHt0YWcubm90ZUNvdW50fSBub3RlJHt0YWcubm90ZUNvdW50ID09PSAxID8gJycgOiAncyd9IGFuZCAke3RhZy50b3BpY0NvdW50fSBjYXRhbG9nIHRvcGljJHt0YWcudG9waWNDb3VudCA9PT0gMSA/ICcnIDogJ3MnfWA7XG4gICAgY29uc3QgbGlua3MgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBsaW5rcy5jbGFzc05hbWUgPSAnYnV0dG9uLXJvdyc7XG4gICAgaWYgKHRhZy5ub3RlQ291bnQpIHtcbiAgICAgIGNvbnN0IG5vdGVzTGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgIG5vdGVzTGluay5jbGFzc05hbWUgPSAnYnRuIGJ0bi1naG9zdCc7XG4gICAgICBub3Rlc0xpbmsuaHJlZiA9ICcjL25vdGVzJztcbiAgICAgIG5vdGVzTGluay50ZXh0Q29udGVudCA9ICdOb3Rlcyc7XG4gICAgICBsaW5rcy5hcHBlbmRDaGlsZChub3Rlc0xpbmspO1xuICAgIH1cbiAgICBpZiAodGFnLnRvcGljQ291bnQpIHtcbiAgICAgIGNvbnN0IGNvdXJzZXNMaW5rID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgY291cnNlc0xpbmsuY2xhc3NOYW1lID0gJ2J0biBidG4tZ2hvc3QnO1xuICAgICAgY291cnNlc0xpbmsuaHJlZiA9ICcjL2NvdXJzZXMnO1xuICAgICAgY291cnNlc0xpbmsudGV4dENvbnRlbnQgPSAnQ291cnNlcyc7XG4gICAgICBsaW5rcy5hcHBlbmRDaGlsZChjb3Vyc2VzTGluayk7XG4gICAgfVxuICAgIGJvZHkuYXBwZW5kKGJhZGdlLCB0aXRsZSwgZGV0YWlsLCBsaW5rcyk7XG4gICAgY2FyZC5hcHBlbmRDaGlsZChib2R5KTtcbiAgICBsaXN0Um9vdC5hcHBlbmRDaGlsZChjYXJkKTtcbiAgICB9KTtcbiAgfTtcblxuICBzZWFyY2hFbC52YWx1ZSA9IHN0YXRlLnF1ZXJ5O1xuICBmaWx0ZXJzUm9vdC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS10YWctZmlsdGVyXScpLmZvckVhY2goKGJ1dHRvbikgPT4ge1xuICAgIGNvbnN0IGFjdGl2ZSA9IGJ1dHRvbi5kYXRhc2V0LnRhZ0ZpbHRlciA9PT0gc3RhdGUuZmlsdGVyO1xuICAgIGJ1dHRvbi5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCBhY3RpdmUpO1xuICAgIGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtcHJlc3NlZCcsIGFjdGl2ZSA/ICd0cnVlJyA6ICdmYWxzZScpO1xuICB9KTtcbiAgcmVuZGVyVmlzaWJsZVRhZ3MoKTtcblxuICBpZiAoIXNlYXJjaEVsLmRhdGFzZXQucGRCb3VuZCkge1xuICAgIHNlYXJjaEVsLmRhdGFzZXQucGRCb3VuZCA9ICd0cnVlJztcbiAgICBzZWFyY2hFbC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsICgpID0+IHtcbiAgICAgIHN0YXRlLnF1ZXJ5ID0gc2VhcmNoRWwudmFsdWUgfHwgJyc7XG4gICAgICByZW5kZXJUYWdzKCk7XG4gICAgfSk7XG4gIH1cbiAgaWYgKCFmaWx0ZXJzUm9vdC5kYXRhc2V0LnBkQm91bmQpIHtcbiAgICBmaWx0ZXJzUm9vdC5kYXRhc2V0LnBkQm91bmQgPSAndHJ1ZSc7XG4gICAgZmlsdGVyc1Jvb3QuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IGJ1dHRvbiA9IGV2ZW50LnRhcmdldD8uY2xvc2VzdD8uKCdbZGF0YS10YWctZmlsdGVyXScpO1xuICAgICAgaWYgKCFidXR0b24pIHJldHVybjtcbiAgICAgIHN0YXRlLmZpbHRlciA9IGJ1dHRvbi5kYXRhc2V0LnRhZ0ZpbHRlciB8fCAnYWxsJztcbiAgICAgIHJlbmRlclRhZ3MoKTtcbiAgICB9KTtcbiAgfVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFPLFNBQVMsY0FBYyxFQUFFLFFBQVEsSUFBSSxDQUFDLEdBQUc7QUFDOUMsVUFBUTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEdBeUJQO0FBQ0QsYUFBVztBQUNiO0FBRUEsU0FBUyxr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
