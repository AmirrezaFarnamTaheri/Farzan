// src/views/bookmarksRoute.js
function mountBookmarksView(deps = {}) {
  const {
    setView,
    createElement,
    Router,
    Toast = window.PlasmaDeck?.Toast,
    setPendingCourseMedia,
    setPendingPdfPage,
    sanitizeHtml
  } = deps;
  setView(`
    <section class="view view-bookmarks">
      <div class="page-header">
        <div class="page-title-row">
          <h1 class="page-title">Bookmarks</h1>
          <span class="badge badge-success" aria-label="Feature status: ready">Ready</span>
        </div>
        <p class="page-subtitle">Quick links into your study materials, notes, timestamps, and PDF annotations.</p>
      </div>
      <div class="stat-grid" data-bookmark-metrics></div>
      <div class="card card-filled">
        <div class="card-body">
          <div class="filter-row" data-bookmark-filters aria-label="Bookmark filters">
            <button class="filter-chip active" type="button" data-bookmark-filter="all" aria-pressed="true">All</button>
            <button class="filter-chip" type="button" data-bookmark-filter="timestamp" aria-pressed="false">Timestamps</button>
            <button class="filter-chip" type="button" data-bookmark-filter="note" aria-pressed="false">Notes</button>
            <button class="filter-chip" type="button" data-bookmark-filter="pdf" aria-pressed="false">PDF</button>
          </div>
          <div class="grid grid-3" data-bookmark-list>
            <p>Loading bookmarks...</p>
          </div>
        </div>
      </div>
    </section>
  `);
  renderBookmarks();
  function formatDuration(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(total % 3600 / 60);
    const secs = total % 60;
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${minutes}:${String(secs).padStart(2, "0")}`;
  }
  async function renderBookmarks() {
    const metricsRoot = document.querySelector("[data-bookmark-metrics]");
    const listRoot = document.querySelector("[data-bookmark-list]");
    const filtersRoot = document.querySelector("[data-bookmark-filters]");
    if (!metricsRoot || !listRoot) return;
    const activeFilter = filtersRoot?.dataset.activeFilter || "all";
    const [timestamps, notes, annotations] = await Promise.all([
      (async () => {
        try {
          return await window.DB?.getAllTimestamps?.() ?? [];
        } catch {
          return [];
        }
      })(),
      (async () => {
        try {
          return await window.DB?.getAllNotes?.() ?? [];
        } catch {
          return [];
        }
      })(),
      (async () => {
        try {
          return await window.DB?.getAllAnnotations?.() ?? [];
        } catch {
          return [];
        }
      })()
    ]);
    if (!document.body.contains(listRoot)) return;
    const notesById = new Map(notes.map((note) => [note.id, note]));
    const previewText = (value, limit = 140) => {
      const tmp = document.createElement("div");
      tmp.innerHTML = sanitizeHtml(value || "");
      const text = String(tmp.textContent || "").replace(/\s+/g, " ").trim();
      return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
    };
    const bookmarkItems = [
      ...timestamps.map((item) => ({
        type: "Timestamp",
        title: item.title || item.topicTitle || item.topicId || "Video timestamp",
        detail: item.position != null ? `At ${formatDuration(item.position)}` : "Saved playback position",
        notePreview: item.note || notesById.get(item.noteId)?.content || "",
        noteId: item.noteId,
        href: "#/courses",
        id: item.id || item.topicId,
        topicId: item.topicId,
        position: item.position,
        updatedAt: item.updatedAt || item.createdAt || 0,
        source: item
      })),
      ...notes.map((item) => ({
        type: "Note",
        title: item.title || item.topicId || "Untitled note",
        detail: item.sourceType === "pdf" || item.pdfPage || item.pdfDocId ? `PDF page ${item.pdfPage || item.page || 1}` : item.topicId ? `Linked to ${item.topicId}` : "Saved note",
        href: item.sourceType === "pdf" || item.pdfPage || item.pdfDocId ? "#/pdf" : "#/notes",
        id: item.id,
        topicId: item.topicId,
        docId: item.pdfDocId || item.docId,
        page: item.pdfPage || item.page,
        sourceType: item.sourceType,
        updatedAt: item.updatedAt || item.createdAt || 0
      })),
      ...annotations.map((item) => ({
        type: "PDF",
        title: item.docTitle || item.docId || "PDF annotation",
        detail: `Page ${item.page || 1}`,
        href: "#/pdf",
        id: item.id,
        docId: item.docId,
        page: item.page || 1,
        updatedAt: item.updatedAt || item.createdAt || 0
      }))
    ].sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt));
    const visibleItems = activeFilter === "all" ? bookmarkItems : bookmarkItems.filter((item) => item.type.toLowerCase() === activeFilter);
    metricsRoot.replaceChildren();
    [
      ["Video timestamps", timestamps.length],
      ["Notes", notes.length],
      ["PDF annotations", annotations.length],
      ["Total bookmarks", bookmarkItems.length]
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
    if (!bookmarkItems.length) {
      const empty = document.createElement("p");
      empty.className = "text-muted";
      empty.textContent = "No bookmarks yet. Notes, timestamps, and PDF annotations will appear here.";
      listRoot.appendChild(empty);
      return;
    }
    if (!visibleItems.length) {
      const empty = document.createElement("p");
      empty.className = "text-muted";
      empty.textContent = "No bookmarks match this filter.";
      listRoot.appendChild(empty);
    }
    visibleItems.slice(0, 24).forEach((item) => {
      const card = document.createElement("article");
      card.className = "card";
      card.dataset.bookmarkType = item.type.toLowerCase();
      if (item.id) card.dataset.bookmarkId = String(item.id);
      if (item.topicId) card.dataset.topicId = String(item.topicId);
      if (item.docId) card.dataset.docId = String(item.docId);
      const body = document.createElement("div");
      body.className = "card-body";
      const badge = document.createElement("span");
      badge.className = "badge badge-info";
      badge.textContent = item.type;
      const title = document.createElement("h2");
      title.className = "h4";
      title.textContent = item.title;
      const detail = document.createElement("p");
      detail.textContent = item.detail;
      const link = document.createElement("a");
      link.className = "btn btn-ghost";
      link.href = item.href;
      link.textContent = "Open";
      if (item.type === "Timestamp" && item.topicId) {
        link.addEventListener("click", (event) => {
          event.preventDefault();
          setPendingCourseMedia(item.topicId, item.position);
          Router.navigate("#/courses");
        });
      } else if (item.href === "#/pdf" && (item.docId || item.page)) {
        link.addEventListener("click", (event) => {
          event.preventDefault();
          setPendingPdfPage(item.docId, item.page);
          try {
            if (item.page) window.PlasmaPDFViewer?.goTo?.(item.page);
          } catch {
          }
          Router.navigate("#/pdf");
          setTimeout(() => {
            try {
              if (item.page) window.PlasmaPDFViewer?.goTo?.(item.page);
            } catch {
            }
          }, 80);
        });
      }
      body.append(badge, title, detail);
      if (item.type === "Note" && (item.sourceType === "pdf" || item.pdfPage || item.docId)) {
        body.appendChild(createElement(
          "div",
          { class: "bookmark-meta-row" },
          createElement("span", { class: "badge badge-success" }, "PDF page note")
        ));
      }
      if (item.type === "Timestamp") {
        const meta = document.createElement("div");
        meta.className = "bookmark-meta-row";
        if (item.noteId) meta.appendChild(createElement("span", { class: "badge badge-success" }, "Linked note"));
        if (item.notePreview) {
          const preview = document.createElement("p");
          preview.className = "bookmark-note-preview";
          preview.textContent = previewText(item.notePreview);
          body.appendChild(preview);
        }
        if (meta.childElementCount) body.appendChild(meta);
        if (listRoot.dataset.editingTimestamp === String(item.id)) {
          const form = document.createElement("form");
          form.className = "bookmark-edit-form";
          form.dataset.timestampEditForm = String(item.id);
          const titleInput = document.createElement("input");
          titleInput.className = "input";
          titleInput.name = "title";
          titleInput.value = item.title;
          titleInput.placeholder = "Timestamp title";
          const noteInput = document.createElement("textarea");
          noteInput.className = "input";
          noteInput.name = "note";
          noteInput.rows = 3;
          noteInput.value = item.source?.note || "";
          noteInput.placeholder = "Timestamp note";
          const save = document.createElement("button");
          save.type = "submit";
          save.className = "btn btn-primary btn-sm";
          save.dataset.saveTimestampEdit = String(item.id);
          save.textContent = "Save";
          const cancel = document.createElement("button");
          cancel.type = "button";
          cancel.className = "btn btn-ghost btn-sm";
          cancel.dataset.cancelTimestampEdit = String(item.id);
          cancel.textContent = "Cancel";
          form.append(
            titleInput,
            noteInput,
            createElement("div", { class: "button-row" }, save, cancel)
          );
          body.appendChild(form);
        }
      }
      const actions = document.createElement("div");
      actions.className = "button-row";
      actions.appendChild(link);
      if (item.type === "Timestamp" && item.id && window.DB?.saveTimestamp) {
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "btn btn-ghost btn-sm";
        edit.dataset.editTimestamp = String(item.id);
        edit.textContent = "Edit";
        actions.appendChild(edit);
      }
      if (item.type === "Timestamp" && item.id && window.DB?.deleteTimestamp) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn btn-ghost btn-sm";
        del.dataset.deleteTimestamp = String(item.id);
        del.textContent = "Delete";
        actions.appendChild(del);
      }
      body.appendChild(actions);
      card.appendChild(body);
      listRoot.appendChild(card);
    });
    if (filtersRoot && !filtersRoot.dataset.bound) {
      filtersRoot.dataset.bound = "true";
      filtersRoot.addEventListener("click", (event) => {
        const button = event.target?.closest?.("[data-bookmark-filter]");
        if (!button) return;
        filtersRoot.dataset.activeFilter = button.dataset.bookmarkFilter || "all";
        filtersRoot.querySelectorAll("[data-bookmark-filter]").forEach((btn) => {
          const active = btn === button;
          btn.classList.toggle("active", active);
          btn.setAttribute("aria-pressed", active ? "true" : "false");
        });
        renderBookmarks();
      });
    }
    listRoot.onclick = async (event) => {
      const editButton = event.target?.closest?.("[data-edit-timestamp]");
      if (editButton) {
        listRoot.dataset.editingTimestamp = editButton.dataset.editTimestamp;
        renderBookmarks();
        return;
      }
      const cancelButton = event.target?.closest?.("[data-cancel-timestamp-edit]");
      if (cancelButton) {
        delete listRoot.dataset.editingTimestamp;
        renderBookmarks();
        return;
      }
      const deleteButton = event.target?.closest?.("[data-delete-timestamp]");
      if (deleteButton) {
        const ok = await window.PlasmaDeck?.UI?.confirm?.("Delete this timestamp bookmark?");
        if (!ok) return;
        try {
          await window.DB?.deleteTimestamp?.(deleteButton.dataset.deleteTimestamp);
          delete listRoot.dataset.editingTimestamp;
          Toast.success("Timestamp deleted");
          renderBookmarks();
        } catch {
          Toast.error("Timestamp delete failed");
        }
      }
    };
    listRoot.onsubmit = async (event) => {
      const form = event.target?.closest?.("[data-timestamp-edit-form]");
      if (!form) return;
      event.preventDefault();
      const original = timestamps.find((item) => String(item.id || item.topicId) === String(form.dataset.timestampEditForm));
      if (!original || !window.DB?.saveTimestamp) return;
      const title = form.elements.title?.value?.trim();
      const note = form.elements.note?.value?.trim();
      try {
        await window.DB.saveTimestamp({
          ...original,
          id: original.id || form.dataset.timestampEditForm,
          title: title || original.title || original.topicTitle || "Video timestamp",
          note: note || "",
          updatedAt: Date.now()
        });
        delete listRoot.dataset.editingTimestamp;
        Toast.success("Timestamp updated");
        renderBookmarks();
      } catch {
        Toast.error("Timestamp update failed");
      }
    };
  }
}
export {
  mountBookmarksView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3ZpZXdzL2Jvb2ttYXJrc1JvdXRlLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJleHBvcnQgZnVuY3Rpb24gbW91bnRCb29rbWFya3NWaWV3KGRlcHMgPSB7fSkge1xuICBjb25zdCB7XG4gICAgc2V0VmlldyxcbiAgICBjcmVhdGVFbGVtZW50LFxuICAgIFJvdXRlcixcbiAgICBUb2FzdCA9IHdpbmRvdy5QbGFzbWFEZWNrPy5Ub2FzdCxcbiAgICBzZXRQZW5kaW5nQ291cnNlTWVkaWEsXG4gICAgc2V0UGVuZGluZ1BkZlBhZ2UsXG4gICAgc2FuaXRpemVIdG1sLFxuICB9ID0gZGVwcztcblxuICBzZXRWaWV3KGBcbiAgICA8c2VjdGlvbiBjbGFzcz1cInZpZXcgdmlldy1ib29rbWFya3NcIj5cbiAgICAgIDxkaXYgY2xhc3M9XCJwYWdlLWhlYWRlclwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwicGFnZS10aXRsZS1yb3dcIj5cbiAgICAgICAgICA8aDEgY2xhc3M9XCJwYWdlLXRpdGxlXCI+Qm9va21hcmtzPC9oMT5cbiAgICAgICAgICA8c3BhbiBjbGFzcz1cImJhZGdlIGJhZGdlLXN1Y2Nlc3NcIiBhcmlhLWxhYmVsPVwiRmVhdHVyZSBzdGF0dXM6IHJlYWR5XCI+UmVhZHk8L3NwYW4+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8cCBjbGFzcz1cInBhZ2Utc3VidGl0bGVcIj5RdWljayBsaW5rcyBpbnRvIHlvdXIgc3R1ZHkgbWF0ZXJpYWxzLCBub3RlcywgdGltZXN0YW1wcywgYW5kIFBERiBhbm5vdGF0aW9ucy48L3A+XG4gICAgICA8L2Rpdj5cbiAgICAgIDxkaXYgY2xhc3M9XCJzdGF0LWdyaWRcIiBkYXRhLWJvb2ttYXJrLW1ldHJpY3M+PC9kaXY+XG4gICAgICA8ZGl2IGNsYXNzPVwiY2FyZCBjYXJkLWZpbGxlZFwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwiY2FyZC1ib2R5XCI+XG4gICAgICAgICAgPGRpdiBjbGFzcz1cImZpbHRlci1yb3dcIiBkYXRhLWJvb2ttYXJrLWZpbHRlcnMgYXJpYS1sYWJlbD1cIkJvb2ttYXJrIGZpbHRlcnNcIj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJmaWx0ZXItY2hpcCBhY3RpdmVcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1ib29rbWFyay1maWx0ZXI9XCJhbGxcIiBhcmlhLXByZXNzZWQ9XCJ0cnVlXCI+QWxsPC9idXR0b24+XG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZmlsdGVyLWNoaXBcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1ib29rbWFyay1maWx0ZXI9XCJ0aW1lc3RhbXBcIiBhcmlhLXByZXNzZWQ9XCJmYWxzZVwiPlRpbWVzdGFtcHM8L2J1dHRvbj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJmaWx0ZXItY2hpcFwiIHR5cGU9XCJidXR0b25cIiBkYXRhLWJvb2ttYXJrLWZpbHRlcj1cIm5vdGVcIiBhcmlhLXByZXNzZWQ9XCJmYWxzZVwiPk5vdGVzPC9idXR0b24+XG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZmlsdGVyLWNoaXBcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1ib29rbWFyay1maWx0ZXI9XCJwZGZcIiBhcmlhLXByZXNzZWQ9XCJmYWxzZVwiPlBERjwvYnV0dG9uPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJncmlkIGdyaWQtM1wiIGRhdGEtYm9va21hcmstbGlzdD5cbiAgICAgICAgICAgIDxwPkxvYWRpbmcgYm9va21hcmtzLi4uPC9wPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgIDwvc2VjdGlvbj5cbiAgYCk7XG4gIHJlbmRlckJvb2ttYXJrcygpO1xuXG4gIGZ1bmN0aW9uIGZvcm1hdER1cmF0aW9uKHNlY29uZHMpIHtcbiAgICBjb25zdCB0b3RhbCA9IE1hdGgubWF4KDAsIE1hdGguZmxvb3IoTnVtYmVyKHNlY29uZHMpIHx8IDApKTtcbiAgICBjb25zdCBob3VycyA9IE1hdGguZmxvb3IodG90YWwgLyAzNjAwKTtcbiAgICBjb25zdCBtaW51dGVzID0gTWF0aC5mbG9vcigodG90YWwgJSAzNjAwKSAvIDYwKTtcbiAgICBjb25zdCBzZWNzID0gdG90YWwgJSA2MDtcbiAgICByZXR1cm4gaG91cnNcbiAgICAgID8gYCR7aG91cnN9OiR7U3RyaW5nKG1pbnV0ZXMpLnBhZFN0YXJ0KDIsICcwJyl9OiR7U3RyaW5nKHNlY3MpLnBhZFN0YXJ0KDIsICcwJyl9YFxuICAgICAgOiBgJHttaW51dGVzfToke1N0cmluZyhzZWNzKS5wYWRTdGFydCgyLCAnMCcpfWA7XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiByZW5kZXJCb29rbWFya3MoKSB7XG4gICAgY29uc3QgbWV0cmljc1Jvb3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1ib29rbWFyay1tZXRyaWNzXScpO1xuICAgIGNvbnN0IGxpc3RSb290ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtYm9va21hcmstbGlzdF0nKTtcbiAgICBjb25zdCBmaWx0ZXJzUm9vdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWJvb2ttYXJrLWZpbHRlcnNdJyk7XG4gICAgaWYgKCFtZXRyaWNzUm9vdCB8fCAhbGlzdFJvb3QpIHJldHVybjtcbiAgICBjb25zdCBhY3RpdmVGaWx0ZXIgPSBmaWx0ZXJzUm9vdD8uZGF0YXNldC5hY3RpdmVGaWx0ZXIgfHwgJ2FsbCc7XG5cbiAgICBjb25zdCBbdGltZXN0YW1wcywgbm90ZXMsIGFubm90YXRpb25zXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgIChhc3luYyAoKSA9PiB7IHRyeSB7IHJldHVybiBhd2FpdCB3aW5kb3cuREI/LmdldEFsbFRpbWVzdGFtcHM/LigpID8/IFtdOyB9IGNhdGNoIHsgcmV0dXJuIFtdOyB9IH0pKCksXG4gICAgICAoYXN5bmMgKCkgPT4geyB0cnkgeyByZXR1cm4gYXdhaXQgd2luZG93LkRCPy5nZXRBbGxOb3Rlcz8uKCkgPz8gW107IH0gY2F0Y2ggeyByZXR1cm4gW107IH0gfSkoKSxcbiAgICAgIChhc3luYyAoKSA9PiB7IHRyeSB7IHJldHVybiBhd2FpdCB3aW5kb3cuREI/LmdldEFsbEFubm90YXRpb25zPy4oKSA/PyBbXTsgfSBjYXRjaCB7IHJldHVybiBbXTsgfSB9KSgpLFxuICAgIF0pO1xuICAgIGlmICghZG9jdW1lbnQuYm9keS5jb250YWlucyhsaXN0Um9vdCkpIHJldHVybjtcbiAgICBjb25zdCBub3Rlc0J5SWQgPSBuZXcgTWFwKG5vdGVzLm1hcChub3RlID0+IFtub3RlLmlkLCBub3RlXSkpO1xuICAgIGNvbnN0IHByZXZpZXdUZXh0ID0gKHZhbHVlLCBsaW1pdCA9IDE0MCkgPT4ge1xuICAgICAgY29uc3QgdG1wID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICB0bXAuaW5uZXJIVE1MID0gc2FuaXRpemVIdG1sKHZhbHVlIHx8ICcnKTtcbiAgICAgIGNvbnN0IHRleHQgPSBTdHJpbmcodG1wLnRleHRDb250ZW50IHx8ICcnKS5yZXBsYWNlKC9cXHMrL2csICcgJykudHJpbSgpO1xuICAgICAgcmV0dXJuIHRleHQubGVuZ3RoID4gbGltaXQgPyBgJHt0ZXh0LnNsaWNlKDAsIGxpbWl0IC0gMSl9Li4uYCA6IHRleHQ7XG4gICAgfTtcblxuICAgIGNvbnN0IGJvb2ttYXJrSXRlbXMgPSBbXG4gICAgICAuLi50aW1lc3RhbXBzLm1hcChpdGVtID0+ICh7XG4gICAgICAgIHR5cGU6ICdUaW1lc3RhbXAnLFxuICAgICAgICB0aXRsZTogaXRlbS50aXRsZSB8fCBpdGVtLnRvcGljVGl0bGUgfHwgaXRlbS50b3BpY0lkIHx8ICdWaWRlbyB0aW1lc3RhbXAnLFxuICAgICAgICBkZXRhaWw6IGl0ZW0ucG9zaXRpb24gIT0gbnVsbCA/IGBBdCAke2Zvcm1hdER1cmF0aW9uKGl0ZW0ucG9zaXRpb24pfWAgOiAnU2F2ZWQgcGxheWJhY2sgcG9zaXRpb24nLFxuICAgICAgICBub3RlUHJldmlldzogaXRlbS5ub3RlIHx8IG5vdGVzQnlJZC5nZXQoaXRlbS5ub3RlSWQpPy5jb250ZW50IHx8ICcnLFxuICAgICAgICBub3RlSWQ6IGl0ZW0ubm90ZUlkLFxuICAgICAgICBocmVmOiAnIy9jb3Vyc2VzJyxcbiAgICAgICAgaWQ6IGl0ZW0uaWQgfHwgaXRlbS50b3BpY0lkLFxuICAgICAgICB0b3BpY0lkOiBpdGVtLnRvcGljSWQsXG4gICAgICAgIHBvc2l0aW9uOiBpdGVtLnBvc2l0aW9uLFxuICAgICAgICB1cGRhdGVkQXQ6IGl0ZW0udXBkYXRlZEF0IHx8IGl0ZW0uY3JlYXRlZEF0IHx8IDAsXG4gICAgICAgIHNvdXJjZTogaXRlbSxcbiAgICAgIH0pKSxcbiAgICAgIC4uLm5vdGVzLm1hcChpdGVtID0+ICh7XG4gICAgICAgIHR5cGU6ICdOb3RlJyxcbiAgICAgICAgdGl0bGU6IGl0ZW0udGl0bGUgfHwgaXRlbS50b3BpY0lkIHx8ICdVbnRpdGxlZCBub3RlJyxcbiAgICAgICAgZGV0YWlsOiBpdGVtLnNvdXJjZVR5cGUgPT09ICdwZGYnIHx8IGl0ZW0ucGRmUGFnZSB8fCBpdGVtLnBkZkRvY0lkXG4gICAgICAgICAgPyBgUERGIHBhZ2UgJHtpdGVtLnBkZlBhZ2UgfHwgaXRlbS5wYWdlIHx8IDF9YFxuICAgICAgICAgIDogaXRlbS50b3BpY0lkID8gYExpbmtlZCB0byAke2l0ZW0udG9waWNJZH1gIDogJ1NhdmVkIG5vdGUnLFxuICAgICAgICBocmVmOiBpdGVtLnNvdXJjZVR5cGUgPT09ICdwZGYnIHx8IGl0ZW0ucGRmUGFnZSB8fCBpdGVtLnBkZkRvY0lkID8gJyMvcGRmJyA6ICcjL25vdGVzJyxcbiAgICAgICAgaWQ6IGl0ZW0uaWQsXG4gICAgICAgIHRvcGljSWQ6IGl0ZW0udG9waWNJZCxcbiAgICAgICAgZG9jSWQ6IGl0ZW0ucGRmRG9jSWQgfHwgaXRlbS5kb2NJZCxcbiAgICAgICAgcGFnZTogaXRlbS5wZGZQYWdlIHx8IGl0ZW0ucGFnZSxcbiAgICAgICAgc291cmNlVHlwZTogaXRlbS5zb3VyY2VUeXBlLFxuICAgICAgICB1cGRhdGVkQXQ6IGl0ZW0udXBkYXRlZEF0IHx8IGl0ZW0uY3JlYXRlZEF0IHx8IDAsXG4gICAgICB9KSksXG4gICAgICAuLi5hbm5vdGF0aW9ucy5tYXAoaXRlbSA9PiAoe1xuICAgICAgICB0eXBlOiAnUERGJyxcbiAgICAgICAgdGl0bGU6IGl0ZW0uZG9jVGl0bGUgfHwgaXRlbS5kb2NJZCB8fCAnUERGIGFubm90YXRpb24nLFxuICAgICAgICBkZXRhaWw6IGBQYWdlICR7aXRlbS5wYWdlIHx8IDF9YCxcbiAgICAgICAgaHJlZjogJyMvcGRmJyxcbiAgICAgICAgaWQ6IGl0ZW0uaWQsXG4gICAgICAgIGRvY0lkOiBpdGVtLmRvY0lkLFxuICAgICAgICBwYWdlOiBpdGVtLnBhZ2UgfHwgMSxcbiAgICAgICAgdXBkYXRlZEF0OiBpdGVtLnVwZGF0ZWRBdCB8fCBpdGVtLmNyZWF0ZWRBdCB8fCAwLFxuICAgICAgfSkpLFxuICAgIF0uc29ydCgoYSwgYikgPT4gTnVtYmVyKGIudXBkYXRlZEF0KSAtIE51bWJlcihhLnVwZGF0ZWRBdCkpO1xuICAgIGNvbnN0IHZpc2libGVJdGVtcyA9IGFjdGl2ZUZpbHRlciA9PT0gJ2FsbCdcbiAgICAgID8gYm9va21hcmtJdGVtc1xuICAgICAgOiBib29rbWFya0l0ZW1zLmZpbHRlcihpdGVtID0+IGl0ZW0udHlwZS50b0xvd2VyQ2FzZSgpID09PSBhY3RpdmVGaWx0ZXIpO1xuXG4gICAgbWV0cmljc1Jvb3QucmVwbGFjZUNoaWxkcmVuKCk7XG4gICAgW1xuICAgICAgWydWaWRlbyB0aW1lc3RhbXBzJywgdGltZXN0YW1wcy5sZW5ndGhdLFxuICAgICAgWydOb3RlcycsIG5vdGVzLmxlbmd0aF0sXG4gICAgICBbJ1BERiBhbm5vdGF0aW9ucycsIGFubm90YXRpb25zLmxlbmd0aF0sXG4gICAgICBbJ1RvdGFsIGJvb2ttYXJrcycsIGJvb2ttYXJrSXRlbXMubGVuZ3RoXSxcbiAgICBdLmZvckVhY2goKFtsYWJlbCwgdmFsdWVdKSA9PiB7XG4gICAgICBjb25zdCBjYXJkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICBjYXJkLmNsYXNzTmFtZSA9ICdzdGF0LWNhcmQnO1xuICAgICAgY29uc3Qgc3Ryb25nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3Ryb25nJyk7XG4gICAgICBzdHJvbmcudGV4dENvbnRlbnQgPSBTdHJpbmcodmFsdWUpO1xuICAgICAgY29uc3Qgc3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICAgIHNwYW4udGV4dENvbnRlbnQgPSBsYWJlbDtcbiAgICAgIGNhcmQuYXBwZW5kKHN0cm9uZywgc3Bhbik7XG4gICAgICBtZXRyaWNzUm9vdC5hcHBlbmRDaGlsZChjYXJkKTtcbiAgICB9KTtcblxuICAgIGxpc3RSb290LnJlcGxhY2VDaGlsZHJlbigpO1xuICAgIGlmICghYm9va21hcmtJdGVtcy5sZW5ndGgpIHtcbiAgICAgIGNvbnN0IGVtcHR5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xuICAgICAgZW1wdHkuY2xhc3NOYW1lID0gJ3RleHQtbXV0ZWQnO1xuICAgICAgZW1wdHkudGV4dENvbnRlbnQgPSAnTm8gYm9va21hcmtzIHlldC4gTm90ZXMsIHRpbWVzdGFtcHMsIGFuZCBQREYgYW5ub3RhdGlvbnMgd2lsbCBhcHBlYXIgaGVyZS4nO1xuICAgICAgbGlzdFJvb3QuYXBwZW5kQ2hpbGQoZW1wdHkpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIXZpc2libGVJdGVtcy5sZW5ndGgpIHtcbiAgICAgIGNvbnN0IGVtcHR5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xuICAgICAgZW1wdHkuY2xhc3NOYW1lID0gJ3RleHQtbXV0ZWQnO1xuICAgICAgZW1wdHkudGV4dENvbnRlbnQgPSAnTm8gYm9va21hcmtzIG1hdGNoIHRoaXMgZmlsdGVyLic7XG4gICAgICBsaXN0Um9vdC5hcHBlbmRDaGlsZChlbXB0eSk7XG4gICAgfVxuXG4gICAgdmlzaWJsZUl0ZW1zLnNsaWNlKDAsIDI0KS5mb3JFYWNoKGl0ZW0gPT4ge1xuICAgICAgY29uc3QgY2FyZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2FydGljbGUnKTtcbiAgICAgIGNhcmQuY2xhc3NOYW1lID0gJ2NhcmQnO1xuICAgICAgY2FyZC5kYXRhc2V0LmJvb2ttYXJrVHlwZSA9IGl0ZW0udHlwZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgaWYgKGl0ZW0uaWQpIGNhcmQuZGF0YXNldC5ib29rbWFya0lkID0gU3RyaW5nKGl0ZW0uaWQpO1xuICAgICAgaWYgKGl0ZW0udG9waWNJZCkgY2FyZC5kYXRhc2V0LnRvcGljSWQgPSBTdHJpbmcoaXRlbS50b3BpY0lkKTtcbiAgICAgIGlmIChpdGVtLmRvY0lkKSBjYXJkLmRhdGFzZXQuZG9jSWQgPSBTdHJpbmcoaXRlbS5kb2NJZCk7XG5cbiAgICAgIGNvbnN0IGJvZHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgIGJvZHkuY2xhc3NOYW1lID0gJ2NhcmQtYm9keSc7XG4gICAgICBjb25zdCBiYWRnZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICAgIGJhZGdlLmNsYXNzTmFtZSA9ICdiYWRnZSBiYWRnZS1pbmZvJztcbiAgICAgIGJhZGdlLnRleHRDb250ZW50ID0gaXRlbS50eXBlO1xuICAgICAgY29uc3QgdGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdoMicpO1xuICAgICAgdGl0bGUuY2xhc3NOYW1lID0gJ2g0JztcbiAgICAgIHRpdGxlLnRleHRDb250ZW50ID0gaXRlbS50aXRsZTtcbiAgICAgIGNvbnN0IGRldGFpbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcbiAgICAgIGRldGFpbC50ZXh0Q29udGVudCA9IGl0ZW0uZGV0YWlsO1xuICAgICAgY29uc3QgbGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgIGxpbmsuY2xhc3NOYW1lID0gJ2J0biBidG4tZ2hvc3QnO1xuICAgICAgbGluay5ocmVmID0gaXRlbS5ocmVmO1xuICAgICAgbGluay50ZXh0Q29udGVudCA9ICdPcGVuJztcbiAgICAgIGlmIChpdGVtLnR5cGUgPT09ICdUaW1lc3RhbXAnICYmIGl0ZW0udG9waWNJZCkge1xuICAgICAgICBsaW5rLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGV2ZW50KSA9PiB7XG4gICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICBzZXRQZW5kaW5nQ291cnNlTWVkaWEoaXRlbS50b3BpY0lkLCBpdGVtLnBvc2l0aW9uKTtcbiAgICAgICAgICBSb3V0ZXIubmF2aWdhdGUoJyMvY291cnNlcycpO1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSBpZiAoaXRlbS5ocmVmID09PSAnIy9wZGYnICYmIChpdGVtLmRvY0lkIHx8IGl0ZW0ucGFnZSkpIHtcbiAgICAgICAgbGluay5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChldmVudCkgPT4ge1xuICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgc2V0UGVuZGluZ1BkZlBhZ2UoaXRlbS5kb2NJZCwgaXRlbS5wYWdlKTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKGl0ZW0ucGFnZSkgd2luZG93LlBsYXNtYVBERlZpZXdlcj8uZ29Ubz8uKGl0ZW0ucGFnZSk7XG4gICAgICAgICAgfSBjYXRjaCB7fVxuICAgICAgICAgIFJvdXRlci5uYXZpZ2F0ZSgnIy9wZGYnKTtcbiAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGlmIChpdGVtLnBhZ2UpIHdpbmRvdy5QbGFzbWFQREZWaWV3ZXI/LmdvVG8/LihpdGVtLnBhZ2UpO1xuICAgICAgICAgICAgfSBjYXRjaCB7fVxuICAgICAgICAgIH0sIDgwKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBib2R5LmFwcGVuZChiYWRnZSwgdGl0bGUsIGRldGFpbCk7XG4gICAgICBpZiAoaXRlbS50eXBlID09PSAnTm90ZScgJiYgKGl0ZW0uc291cmNlVHlwZSA9PT0gJ3BkZicgfHwgaXRlbS5wZGZQYWdlIHx8IGl0ZW0uZG9jSWQpKSB7XG4gICAgICAgIGJvZHkuYXBwZW5kQ2hpbGQoY3JlYXRlRWxlbWVudCgnZGl2JywgeyBjbGFzczogJ2Jvb2ttYXJrLW1ldGEtcm93JyB9LFxuICAgICAgICAgIGNyZWF0ZUVsZW1lbnQoJ3NwYW4nLCB7IGNsYXNzOiAnYmFkZ2UgYmFkZ2Utc3VjY2VzcycgfSwgJ1BERiBwYWdlIG5vdGUnKVxuICAgICAgICApKTtcbiAgICAgIH1cbiAgICAgIGlmIChpdGVtLnR5cGUgPT09ICdUaW1lc3RhbXAnKSB7XG4gICAgICAgIGNvbnN0IG1ldGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgbWV0YS5jbGFzc05hbWUgPSAnYm9va21hcmstbWV0YS1yb3cnO1xuICAgICAgICBpZiAoaXRlbS5ub3RlSWQpIG1ldGEuYXBwZW5kQ2hpbGQoY3JlYXRlRWxlbWVudCgnc3BhbicsIHsgY2xhc3M6ICdiYWRnZSBiYWRnZS1zdWNjZXNzJyB9LCAnTGlua2VkIG5vdGUnKSk7XG4gICAgICAgIGlmIChpdGVtLm5vdGVQcmV2aWV3KSB7XG4gICAgICAgICAgY29uc3QgcHJldmlldyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcbiAgICAgICAgICBwcmV2aWV3LmNsYXNzTmFtZSA9ICdib29rbWFyay1ub3RlLXByZXZpZXcnO1xuICAgICAgICAgIHByZXZpZXcudGV4dENvbnRlbnQgPSBwcmV2aWV3VGV4dChpdGVtLm5vdGVQcmV2aWV3KTtcbiAgICAgICAgICBib2R5LmFwcGVuZENoaWxkKHByZXZpZXcpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChtZXRhLmNoaWxkRWxlbWVudENvdW50KSBib2R5LmFwcGVuZENoaWxkKG1ldGEpO1xuICAgICAgICBpZiAobGlzdFJvb3QuZGF0YXNldC5lZGl0aW5nVGltZXN0YW1wID09PSBTdHJpbmcoaXRlbS5pZCkpIHtcbiAgICAgICAgICBjb25zdCBmb3JtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZm9ybScpO1xuICAgICAgICAgIGZvcm0uY2xhc3NOYW1lID0gJ2Jvb2ttYXJrLWVkaXQtZm9ybSc7XG4gICAgICAgICAgZm9ybS5kYXRhc2V0LnRpbWVzdGFtcEVkaXRGb3JtID0gU3RyaW5nKGl0ZW0uaWQpO1xuICAgICAgICAgIGNvbnN0IHRpdGxlSW5wdXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpbnB1dCcpO1xuICAgICAgICAgIHRpdGxlSW5wdXQuY2xhc3NOYW1lID0gJ2lucHV0JztcbiAgICAgICAgICB0aXRsZUlucHV0Lm5hbWUgPSAndGl0bGUnO1xuICAgICAgICAgIHRpdGxlSW5wdXQudmFsdWUgPSBpdGVtLnRpdGxlO1xuICAgICAgICAgIHRpdGxlSW5wdXQucGxhY2Vob2xkZXIgPSAnVGltZXN0YW1wIHRpdGxlJztcbiAgICAgICAgICBjb25zdCBub3RlSW5wdXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0ZXh0YXJlYScpO1xuICAgICAgICAgIG5vdGVJbnB1dC5jbGFzc05hbWUgPSAnaW5wdXQnO1xuICAgICAgICAgIG5vdGVJbnB1dC5uYW1lID0gJ25vdGUnO1xuICAgICAgICAgIG5vdGVJbnB1dC5yb3dzID0gMztcbiAgICAgICAgICBub3RlSW5wdXQudmFsdWUgPSBpdGVtLnNvdXJjZT8ubm90ZSB8fCAnJztcbiAgICAgICAgICBub3RlSW5wdXQucGxhY2Vob2xkZXIgPSAnVGltZXN0YW1wIG5vdGUnO1xuICAgICAgICAgIGNvbnN0IHNhdmUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICAgICAgICBzYXZlLnR5cGUgPSAnc3VibWl0JztcbiAgICAgICAgICBzYXZlLmNsYXNzTmFtZSA9ICdidG4gYnRuLXByaW1hcnkgYnRuLXNtJztcbiAgICAgICAgICBzYXZlLmRhdGFzZXQuc2F2ZVRpbWVzdGFtcEVkaXQgPSBTdHJpbmcoaXRlbS5pZCk7XG4gICAgICAgICAgc2F2ZS50ZXh0Q29udGVudCA9ICdTYXZlJztcbiAgICAgICAgICBjb25zdCBjYW5jZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICAgICAgICBjYW5jZWwudHlwZSA9ICdidXR0b24nO1xuICAgICAgICAgIGNhbmNlbC5jbGFzc05hbWUgPSAnYnRuIGJ0bi1naG9zdCBidG4tc20nO1xuICAgICAgICAgIGNhbmNlbC5kYXRhc2V0LmNhbmNlbFRpbWVzdGFtcEVkaXQgPSBTdHJpbmcoaXRlbS5pZCk7XG4gICAgICAgICAgY2FuY2VsLnRleHRDb250ZW50ID0gJ0NhbmNlbCc7XG4gICAgICAgICAgZm9ybS5hcHBlbmQoXG4gICAgICAgICAgICB0aXRsZUlucHV0LFxuICAgICAgICAgICAgbm90ZUlucHV0LFxuICAgICAgICAgICAgY3JlYXRlRWxlbWVudCgnZGl2JywgeyBjbGFzczogJ2J1dHRvbi1yb3cnIH0sIHNhdmUsIGNhbmNlbClcbiAgICAgICAgICApO1xuICAgICAgICAgIGJvZHkuYXBwZW5kQ2hpbGQoZm9ybSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNvbnN0IGFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgIGFjdGlvbnMuY2xhc3NOYW1lID0gJ2J1dHRvbi1yb3cnO1xuICAgICAgYWN0aW9ucy5hcHBlbmRDaGlsZChsaW5rKTtcbiAgICAgIGlmIChpdGVtLnR5cGUgPT09ICdUaW1lc3RhbXAnICYmIGl0ZW0uaWQgJiYgd2luZG93LkRCPy5zYXZlVGltZXN0YW1wKSB7XG4gICAgICAgIGNvbnN0IGVkaXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICAgICAgZWRpdC50eXBlID0gJ2J1dHRvbic7XG4gICAgICAgIGVkaXQuY2xhc3NOYW1lID0gJ2J0biBidG4tZ2hvc3QgYnRuLXNtJztcbiAgICAgICAgZWRpdC5kYXRhc2V0LmVkaXRUaW1lc3RhbXAgPSBTdHJpbmcoaXRlbS5pZCk7XG4gICAgICAgIGVkaXQudGV4dENvbnRlbnQgPSAnRWRpdCc7XG4gICAgICAgIGFjdGlvbnMuYXBwZW5kQ2hpbGQoZWRpdCk7XG4gICAgICB9XG4gICAgICBpZiAoaXRlbS50eXBlID09PSAnVGltZXN0YW1wJyAmJiBpdGVtLmlkICYmIHdpbmRvdy5EQj8uZGVsZXRlVGltZXN0YW1wKSB7XG4gICAgICAgIGNvbnN0IGRlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICAgICAgICBkZWwudHlwZSA9ICdidXR0b24nO1xuICAgICAgICBkZWwuY2xhc3NOYW1lID0gJ2J0biBidG4tZ2hvc3QgYnRuLXNtJztcbiAgICAgICAgZGVsLmRhdGFzZXQuZGVsZXRlVGltZXN0YW1wID0gU3RyaW5nKGl0ZW0uaWQpO1xuICAgICAgICBkZWwudGV4dENvbnRlbnQgPSAnRGVsZXRlJztcbiAgICAgICAgYWN0aW9ucy5hcHBlbmRDaGlsZChkZWwpO1xuICAgICAgfVxuICAgICAgYm9keS5hcHBlbmRDaGlsZChhY3Rpb25zKTtcbiAgICAgIGNhcmQuYXBwZW5kQ2hpbGQoYm9keSk7XG4gICAgICBsaXN0Um9vdC5hcHBlbmRDaGlsZChjYXJkKTtcbiAgICB9KTtcblxuICAgIGlmIChmaWx0ZXJzUm9vdCAmJiAhZmlsdGVyc1Jvb3QuZGF0YXNldC5ib3VuZCkge1xuICAgICAgZmlsdGVyc1Jvb3QuZGF0YXNldC5ib3VuZCA9ICd0cnVlJztcbiAgICAgIGZpbHRlcnNSb290LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGV2ZW50KSA9PiB7XG4gICAgICAgIGNvbnN0IGJ1dHRvbiA9IGV2ZW50LnRhcmdldD8uY2xvc2VzdD8uKCdbZGF0YS1ib29rbWFyay1maWx0ZXJdJyk7XG4gICAgICAgIGlmICghYnV0dG9uKSByZXR1cm47XG4gICAgICAgIGZpbHRlcnNSb290LmRhdGFzZXQuYWN0aXZlRmlsdGVyID0gYnV0dG9uLmRhdGFzZXQuYm9va21hcmtGaWx0ZXIgfHwgJ2FsbCc7XG4gICAgICAgIGZpbHRlcnNSb290LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWJvb2ttYXJrLWZpbHRlcl0nKS5mb3JFYWNoKChidG4pID0+IHtcbiAgICAgICAgICBjb25zdCBhY3RpdmUgPSBidG4gPT09IGJ1dHRvbjtcbiAgICAgICAgICBidG4uY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgYWN0aXZlKTtcbiAgICAgICAgICBidG4uc2V0QXR0cmlidXRlKCdhcmlhLXByZXNzZWQnLCBhY3RpdmUgPyAndHJ1ZScgOiAnZmFsc2UnKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJlbmRlckJvb2ttYXJrcygpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgbGlzdFJvb3Qub25jbGljayA9IGFzeW5jIChldmVudCkgPT4ge1xuICAgICAgY29uc3QgZWRpdEJ1dHRvbiA9IGV2ZW50LnRhcmdldD8uY2xvc2VzdD8uKCdbZGF0YS1lZGl0LXRpbWVzdGFtcF0nKTtcbiAgICAgIGlmIChlZGl0QnV0dG9uKSB7XG4gICAgICAgIGxpc3RSb290LmRhdGFzZXQuZWRpdGluZ1RpbWVzdGFtcCA9IGVkaXRCdXR0b24uZGF0YXNldC5lZGl0VGltZXN0YW1wO1xuICAgICAgICByZW5kZXJCb29rbWFya3MoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgY2FuY2VsQnV0dG9uID0gZXZlbnQudGFyZ2V0Py5jbG9zZXN0Py4oJ1tkYXRhLWNhbmNlbC10aW1lc3RhbXAtZWRpdF0nKTtcbiAgICAgIGlmIChjYW5jZWxCdXR0b24pIHtcbiAgICAgICAgZGVsZXRlIGxpc3RSb290LmRhdGFzZXQuZWRpdGluZ1RpbWVzdGFtcDtcbiAgICAgICAgcmVuZGVyQm9va21hcmtzKCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGRlbGV0ZUJ1dHRvbiA9IGV2ZW50LnRhcmdldD8uY2xvc2VzdD8uKCdbZGF0YS1kZWxldGUtdGltZXN0YW1wXScpO1xuICAgICAgaWYgKGRlbGV0ZUJ1dHRvbikge1xuICAgICAgICBjb25zdCBvayA9IGF3YWl0IHdpbmRvdy5QbGFzbWFEZWNrPy5VST8uY29uZmlybT8uKCdEZWxldGUgdGhpcyB0aW1lc3RhbXAgYm9va21hcms/Jyk7XG4gICAgICAgIGlmICghb2spIHJldHVybjtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCB3aW5kb3cuREI/LmRlbGV0ZVRpbWVzdGFtcD8uKGRlbGV0ZUJ1dHRvbi5kYXRhc2V0LmRlbGV0ZVRpbWVzdGFtcCk7XG4gICAgICAgICAgZGVsZXRlIGxpc3RSb290LmRhdGFzZXQuZWRpdGluZ1RpbWVzdGFtcDtcbiAgICAgICAgICBUb2FzdC5zdWNjZXNzKCdUaW1lc3RhbXAgZGVsZXRlZCcpO1xuICAgICAgICAgIHJlbmRlckJvb2ttYXJrcygpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICBUb2FzdC5lcnJvcignVGltZXN0YW1wIGRlbGV0ZSBmYWlsZWQnKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG4gICAgbGlzdFJvb3Qub25zdWJtaXQgPSBhc3luYyAoZXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IGZvcm0gPSBldmVudC50YXJnZXQ/LmNsb3Nlc3Q/LignW2RhdGEtdGltZXN0YW1wLWVkaXQtZm9ybV0nKTtcbiAgICAgIGlmICghZm9ybSkgcmV0dXJuO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGNvbnN0IG9yaWdpbmFsID0gdGltZXN0YW1wcy5maW5kKGl0ZW0gPT4gU3RyaW5nKGl0ZW0uaWQgfHwgaXRlbS50b3BpY0lkKSA9PT0gU3RyaW5nKGZvcm0uZGF0YXNldC50aW1lc3RhbXBFZGl0Rm9ybSkpO1xuICAgICAgaWYgKCFvcmlnaW5hbCB8fCAhd2luZG93LkRCPy5zYXZlVGltZXN0YW1wKSByZXR1cm47XG4gICAgICBjb25zdCB0aXRsZSA9IGZvcm0uZWxlbWVudHMudGl0bGU/LnZhbHVlPy50cmltKCk7XG4gICAgICBjb25zdCBub3RlID0gZm9ybS5lbGVtZW50cy5ub3RlPy52YWx1ZT8udHJpbSgpO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgd2luZG93LkRCLnNhdmVUaW1lc3RhbXAoe1xuICAgICAgICAgIC4uLm9yaWdpbmFsLFxuICAgICAgICAgIGlkOiBvcmlnaW5hbC5pZCB8fCBmb3JtLmRhdGFzZXQudGltZXN0YW1wRWRpdEZvcm0sXG4gICAgICAgICAgdGl0bGU6IHRpdGxlIHx8IG9yaWdpbmFsLnRpdGxlIHx8IG9yaWdpbmFsLnRvcGljVGl0bGUgfHwgJ1ZpZGVvIHRpbWVzdGFtcCcsXG4gICAgICAgICAgbm90ZTogbm90ZSB8fCAnJyxcbiAgICAgICAgICB1cGRhdGVkQXQ6IERhdGUubm93KCksXG4gICAgICAgIH0pO1xuICAgICAgICBkZWxldGUgbGlzdFJvb3QuZGF0YXNldC5lZGl0aW5nVGltZXN0YW1wO1xuICAgICAgICBUb2FzdC5zdWNjZXNzKCdUaW1lc3RhbXAgdXBkYXRlZCcpO1xuICAgICAgICByZW5kZXJCb29rbWFya3MoKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICBUb2FzdC5lcnJvcignVGltZXN0YW1wIHVwZGF0ZSBmYWlsZWQnKTtcbiAgICAgIH1cbiAgICB9O1xuICB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQU8sU0FBUyxtQkFBbUIsT0FBTyxDQUFDLEdBQUc7QUFDNUMsUUFBTTtBQUFBLElBQ0o7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0EsUUFBUSxPQUFPLFlBQVk7QUFBQSxJQUMzQjtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRixJQUFJO0FBRUosVUFBUTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FB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
