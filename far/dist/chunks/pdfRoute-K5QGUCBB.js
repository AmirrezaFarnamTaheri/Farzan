// src/views/pdfRoute.js
function escapeHtmlText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}
function sanitizePdfRouteHtml(html) {
  const purify = window.DOMPurify;
  if (purify?.sanitize) {
    return purify.sanitize(String(html ?? ""), {
      ADD_TAGS: ["canvas"],
      ADD_ATTR: ["tabindex", "role", "aria-label", "aria-hidden", "aria-live", "aria-atomic"],
      FORBID_TAGS: ["template"]
    });
  }
  const template = document.createElement("template");
  template.innerHTML = String(html ?? "");
  template.content.querySelectorAll("script, style, meta, link, iframe, object, embed, form, template").forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = String(attr.value || "").trim();
      if (name.startsWith("on") || name === "srcdoc") {
        node.removeAttribute(attr.name);
        return;
      }
      if ((name === "href" || name === "src" || name === "action") && /^(?:javascript|vbscript|data:text\/html)/i.test(value)) {
        node.removeAttribute(attr.name);
      }
    });
  });
  return template.innerHTML;
}
function setView(html) {
  const el = document.getElementById("view-container");
  if (!el) return null;
  el.innerHTML = sanitizePdfRouteHtml(html);
  return el;
}
function mountPdfView() {
  setView(`
    <section class="view view-pdf">
      <div class="page-header">
        <h1 class="page-title">PDF</h1>
        <p class="page-subtitle">Drop a PDF here or load via file picker.</p>
      </div>

      <div class="pdf-shell">
        <aside class="pdf-sidebar" data-pdf-thumbnails></aside>
        <div class="pdf-main">
          <div class="pdf-toolbar">
            <input class="input" data-pdf-search-input placeholder="Search..." />
            <div data-pdf-search-results class="pdf-search-results"></div>
            <div class="pdf-toolbar-row">
              <button class="btn btn-ghost" data-pdf-action="prev" data-pdf-prev>Prev</button>
              <input class="input input-sm" data-pdf-current-page value="1" style="width:80px" />
              <span>/ <span data-pdf-total-pages>0</span></span>
              <button class="btn btn-ghost" data-pdf-action="next" data-pdf-next>Next</button>
              <span class="pdf-zoom" data-pdf-zoom>100%</span>
            </div>
            <div class="pdf-toolbar-row" style="gap:8px;flex-wrap:wrap;margin-top:8px">
              <input type="file" data-pdf-open style="display:none" />
              <button class="btn btn-ghost" data-pdf-action="open">Open</button>
              <button class="btn btn-ghost" data-pdf-action="zoom-out">-</button>
              <button class="btn btn-ghost" data-pdf-action="zoom-in">+</button>
              <button class="btn btn-ghost" data-pdf-action="fit-width">Fit width</button>
              <button class="btn btn-ghost" data-pdf-action="fit-page">Fit page</button>
              <button class="btn btn-ghost" data-pdf-action="rotate-ccw">CCW</button>
              <button class="btn btn-ghost" data-pdf-action="rotate-cw">CW</button>
              <button class="btn btn-ghost" data-pdf-action="download">Download</button>
              <button class="btn btn-ghost" type="button" data-pdf-save-selection>Save selection</button>
              <button class="btn btn-ghost" type="button" data-pdf-ai-summary hidden>Summarize PDF</button>
              <button class="btn btn-ghost" type="button" data-pdf-export-annotations>Export annotations</button>
            </div>
            <div class="pdf-page-note" data-pdf-page-note>
              <textarea class="input" data-pdf-page-note-input rows="2" placeholder="Note for this PDF page"></textarea>
              <div class="button-row">
                <button class="btn btn-primary btn-sm" type="button" data-pdf-save-page-note>Save page note</button>
                <span class="text-sm" data-pdf-page-note-status aria-live="polite"></span>
              </div>
            </div>
          </div>

          <div class="pdf-viewer-wrap">
            <div class="pdf-viewer" data-pdf-viewer tabindex="0"></div>
            <div class="pdf-loading" data-pdf-loading hidden>
              <div class="pdf-progress"><div data-pdf-progress class="pdf-progress-bar"></div></div>
            </div>
            <div class="pdf-error" data-pdf-error hidden></div>
          </div>
        </div>
      </div>
    </section>
  `);
  const PlasmaDeck = window.PlasmaDeck ?? {};
  const Toast = PlasmaDeck.Toast ?? { success() {
  }, error() {
  } };
  try {
    window.PlasmaPDFInit?.();
  } catch (e) {
    console.warn("[PDF view] init failed", e);
  }
  const saveButton = document.querySelector("[data-pdf-save-page-note]");
  const selectionButton = document.querySelector("[data-pdf-save-selection]");
  const aiSummaryButton = document.querySelector("[data-pdf-ai-summary]");
  const exportButton = document.querySelector("[data-pdf-export-annotations]");
  const noteInput = document.querySelector("[data-pdf-page-note-input]");
  const noteStatus = document.querySelector("[data-pdf-page-note-status]");
  const setNoteStatus = (message) => {
    if (noteStatus) noteStatus.textContent = message;
  };
  const onSavePageNote = async () => {
    const text = String(noteInput?.value || "").trim();
    if (!text) {
      setNoteStatus("Add a note first");
      return;
    }
    const snapshot = window.PlasmaPDFViewer?.getSnapshot?.() ?? window.PlasmaPDFState ?? {};
    const docId = snapshot.docId || snapshot.annotationDocId || "global";
    const page = Math.max(1, Number(snapshot.page || snapshot.currentPage || 1));
    const now = Date.now();
    try {
      await window.DB?.saveNote?.({
        id: `pdf-note-${now}-${Math.random().toString(36).slice(2, 7)}`,
        title: `PDF page ${page} note`,
        content: `<p>${escapeHtmlText(text)}</p><p><strong>Source:</strong> PDF page ${page}</p>`,
        sourceType: "pdf",
        docId,
        pdfDocId: docId,
        page,
        pdfPage: page,
        tags: ["pdf", "page-note"],
        createdAt: now,
        updatedAt: now
      });
      noteInput.value = "";
      setNoteStatus(`Saved page ${page}`);
      Toast.success("PDF page note saved");
    } catch {
      setNoteStatus("Save failed");
      Toast.error("PDF page note save failed");
    }
  };
  const onExportAnnotations = async () => {
    if (typeof window.PlasmaPDFViewer?.exportAnnotationsToNotes !== "function") {
      setNoteStatus("Annotation export unavailable");
      Toast.error("PDF annotation export unavailable");
      return;
    }
    try {
      const result = await window.PlasmaPDFViewer.exportAnnotationsToNotes();
      const created = Number(result?.created || 0);
      const errors = Number(result?.errors || 0);
      if (created > 0) {
        const suffix = errors ? `, ${errors} failed` : "";
        setNoteStatus(`Exported ${created} annotations${suffix}`);
        Toast.success(`Exported ${created} PDF annotations`);
        return;
      }
      setNoteStatus(errors ? `Export failed for ${errors} annotations` : "No annotations to export");
      if (errors) Toast.error("PDF annotation export failed");
    } catch {
      setNoteStatus("Annotation export failed");
      Toast.error("PDF annotation export failed");
    }
  };
  const onSaveSelection = async () => {
    if (typeof window.PlasmaPDFViewer?.saveSelectionToNote !== "function") {
      setNoteStatus("Selection save unavailable");
      Toast.error("PDF selection save unavailable");
      return;
    }
    try {
      const result = await window.PlasmaPDFViewer.saveSelectionToNote();
      if (result?.saved) {
        setNoteStatus(`Saved selection from page ${result.page || 1}`);
        Toast.success("PDF selection saved");
        return;
      }
      setNoteStatus(result?.reason === "empty-selection" ? "Select PDF text first" : "Selection save unavailable");
    } catch {
      setNoteStatus("Selection save failed");
      Toast.error("PDF selection save failed");
    }
  };
  const refreshAIControls = async () => {
    if (!aiSummaryButton) return;
    try {
      const status = await window.PlasmaDeck?.AI?.status?.();
      aiSummaryButton.hidden = !status?.available;
    } catch {
      aiSummaryButton.hidden = true;
    }
  };
  const onAISummary = async () => {
    const ai = window.PlasmaDeck?.AI;
    if (!ai?.summarizeText || typeof window.PlasmaPDFViewer?.extractTextForSummary !== "function") {
      setNoteStatus("AI summary unavailable");
      Toast.error("PDF AI summary unavailable");
      return;
    }
    aiSummaryButton.disabled = true;
    const previousText = aiSummaryButton.textContent;
    aiSummaryButton.textContent = "Summarizing...";
    try {
      const extracted = await window.PlasmaPDFViewer.extractTextForSummary({ maxPages: 6, maxChars: 14e3 });
      if (!extracted.text) {
        setNoteStatus("Open a searchable PDF first");
        return;
      }
      const result = await ai.summarizeText(extracted.text, { bullets: 5 });
      if (!result?.ok || !result.text) {
        setNoteStatus("AI summary unavailable");
        Toast.error("PDF AI summary unavailable");
        return;
      }
      const docId = extracted.docId || "global";
      await ai.saveSummaryNote?.({
        summary: result.text,
        title: `PDF AI summary (${extracted.pages || 1} page${extracted.pages === 1 ? "" : "s"})`,
        sourceLabel: `${docId}, first ${extracted.pages || 1} page${extracted.pages === 1 ? "" : "s"}`,
        note: {
          sourceType: "pdf",
          docId,
          pdfDocId: docId,
          page: 1,
          pdfPage: 1,
          tags: ["pdf", "ai-summary"]
        }
      });
      setNoteStatus(`AI summary saved from ${extracted.pages || 1} page${extracted.pages === 1 ? "" : "s"}`);
      Toast.success("PDF AI summary saved");
    } catch {
      setNoteStatus("AI summary failed");
      Toast.error("PDF AI summary failed");
    } finally {
      aiSummaryButton.disabled = false;
      aiSummaryButton.textContent = previousText;
    }
  };
  const onPdfSyncMessage = async (payload = {}) => {
    if (payload.kind !== "annotation" && payload.kind !== "data") return;
    const snapshot = window.PlasmaPDFViewer?.getSnapshot?.() ?? window.PlasmaPDFState ?? {};
    const currentDoc = snapshot.docId || snapshot.annotationDocId || "global";
    const changedDoc = payload.record?.docId;
    if (changedDoc && changedDoc !== currentDoc) return;
    if (typeof window.PlasmaPDFViewer?.refreshAnnotationsFromStorage !== "function") return;
    try {
      const annotations = await window.PlasmaPDFViewer.refreshAnnotationsFromStorage();
      setNoteStatus(`Annotations refreshed (${annotations.length})`);
      PlasmaDeck.bus?.emit?.("pdf:sync-refresh", { docId: currentDoc, annotations: annotations.length });
    } catch {
      setNoteStatus("Annotation refresh failed");
    }
  };
  saveButton?.addEventListener("click", onSavePageNote);
  selectionButton?.addEventListener("click", onSaveSelection);
  aiSummaryButton?.addEventListener("click", onAISummary);
  exportButton?.addEventListener("click", onExportAnnotations);
  PlasmaDeck.bus?.on?.("sync:message", onPdfSyncMessage);
  refreshAIControls();
  return {
    unmount() {
      saveButton?.removeEventListener("click", onSavePageNote);
      selectionButton?.removeEventListener("click", onSaveSelection);
      aiSummaryButton?.removeEventListener("click", onAISummary);
      exportButton?.removeEventListener("click", onExportAnnotations);
      PlasmaDeck.bus?.off?.("sync:message", onPdfSyncMessage);
      try {
        window.PlasmaPDFDestroy?.();
      } catch {
      }
    }
  };
}
export {
  mountPdfView,
  sanitizePdfRouteHtml
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3ZpZXdzL3BkZlJvdXRlLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJmdW5jdGlvbiBlc2NhcGVIdG1sVGV4dCh2YWx1ZSkge1xuICByZXR1cm4gU3RyaW5nKHZhbHVlID8/ICcnKS5yZXBsYWNlKC9bJjw+XCInXS9nLCAoY2hhcikgPT4gKHtcbiAgICAnJic6ICcmYW1wOycsXG4gICAgJzwnOiAnJmx0OycsXG4gICAgJz4nOiAnJmd0OycsXG4gICAgJ1wiJzogJyZxdW90OycsXG4gICAgXCInXCI6ICcmIzM5OycsXG4gIH1bY2hhcl0pKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhbml0aXplUGRmUm91dGVIdG1sKGh0bWwpIHtcbiAgY29uc3QgcHVyaWZ5ID0gd2luZG93LkRPTVB1cmlmeTtcbiAgaWYgKHB1cmlmeT8uc2FuaXRpemUpIHtcbiAgICByZXR1cm4gcHVyaWZ5LnNhbml0aXplKFN0cmluZyhodG1sID8/ICcnKSwge1xuICAgICAgQUREX1RBR1M6IFsnY2FudmFzJ10sXG4gICAgICBBRERfQVRUUjogWyd0YWJpbmRleCcsICdyb2xlJywgJ2FyaWEtbGFiZWwnLCAnYXJpYS1oaWRkZW4nLCAnYXJpYS1saXZlJywgJ2FyaWEtYXRvbWljJ10sXG4gICAgICBGT1JCSURfVEFHUzogWyd0ZW1wbGF0ZSddLFxuICAgIH0pO1xuICB9XG5cbiAgY29uc3QgdGVtcGxhdGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0ZW1wbGF0ZScpO1xuICB0ZW1wbGF0ZS5pbm5lckhUTUwgPSBTdHJpbmcoaHRtbCA/PyAnJyk7XG4gIHRlbXBsYXRlLmNvbnRlbnRcbiAgICAucXVlcnlTZWxlY3RvckFsbCgnc2NyaXB0LCBzdHlsZSwgbWV0YSwgbGluaywgaWZyYW1lLCBvYmplY3QsIGVtYmVkLCBmb3JtLCB0ZW1wbGF0ZScpXG4gICAgLmZvckVhY2gobm9kZSA9PiBub2RlLnJlbW92ZSgpKTtcbiAgdGVtcGxhdGUuY29udGVudC5xdWVyeVNlbGVjdG9yQWxsKCcqJykuZm9yRWFjaCgobm9kZSkgPT4ge1xuICAgIFsuLi5ub2RlLmF0dHJpYnV0ZXNdLmZvckVhY2goKGF0dHIpID0+IHtcbiAgICAgIGNvbnN0IG5hbWUgPSBhdHRyLm5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgIGNvbnN0IHZhbHVlID0gU3RyaW5nKGF0dHIudmFsdWUgfHwgJycpLnRyaW0oKTtcbiAgICAgIGlmIChuYW1lLnN0YXJ0c1dpdGgoJ29uJykgfHwgbmFtZSA9PT0gJ3NyY2RvYycpIHtcbiAgICAgICAgbm9kZS5yZW1vdmVBdHRyaWJ1dGUoYXR0ci5uYW1lKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICAobmFtZSA9PT0gJ2hyZWYnIHx8IG5hbWUgPT09ICdzcmMnIHx8IG5hbWUgPT09ICdhY3Rpb24nKVxuICAgICAgICAmJiAvXig/OmphdmFzY3JpcHR8dmJzY3JpcHR8ZGF0YTp0ZXh0XFwvaHRtbCkvaS50ZXN0KHZhbHVlKVxuICAgICAgKSB7XG4gICAgICAgIG5vZGUucmVtb3ZlQXR0cmlidXRlKGF0dHIubmFtZSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pO1xuICByZXR1cm4gdGVtcGxhdGUuaW5uZXJIVE1MO1xufVxuXG5mdW5jdGlvbiBzZXRWaWV3KGh0bWwpIHtcbiAgY29uc3QgZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndmlldy1jb250YWluZXInKTtcbiAgaWYgKCFlbCkgcmV0dXJuIG51bGw7XG4gIGVsLmlubmVySFRNTCA9IHNhbml0aXplUGRmUm91dGVIdG1sKGh0bWwpO1xuICByZXR1cm4gZWw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3VudFBkZlZpZXcoKSB7XG4gIHNldFZpZXcoYFxuICAgIDxzZWN0aW9uIGNsYXNzPVwidmlldyB2aWV3LXBkZlwiPlxuICAgICAgPGRpdiBjbGFzcz1cInBhZ2UtaGVhZGVyXCI+XG4gICAgICAgIDxoMSBjbGFzcz1cInBhZ2UtdGl0bGVcIj5QREY8L2gxPlxuICAgICAgICA8cCBjbGFzcz1cInBhZ2Utc3VidGl0bGVcIj5Ecm9wIGEgUERGIGhlcmUgb3IgbG9hZCB2aWEgZmlsZSBwaWNrZXIuPC9wPlxuICAgICAgPC9kaXY+XG5cbiAgICAgIDxkaXYgY2xhc3M9XCJwZGYtc2hlbGxcIj5cbiAgICAgICAgPGFzaWRlIGNsYXNzPVwicGRmLXNpZGViYXJcIiBkYXRhLXBkZi10aHVtYm5haWxzPjwvYXNpZGU+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJwZGYtbWFpblwiPlxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJwZGYtdG9vbGJhclwiPlxuICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiaW5wdXRcIiBkYXRhLXBkZi1zZWFyY2gtaW5wdXQgcGxhY2Vob2xkZXI9XCJTZWFyY2guLi5cIiAvPlxuICAgICAgICAgICAgPGRpdiBkYXRhLXBkZi1zZWFyY2gtcmVzdWx0cyBjbGFzcz1cInBkZi1zZWFyY2gtcmVzdWx0c1wiPjwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInBkZi10b29sYmFyLXJvd1wiPlxuICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdFwiIGRhdGEtcGRmLWFjdGlvbj1cInByZXZcIiBkYXRhLXBkZi1wcmV2PlByZXY8L2J1dHRvbj5cbiAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiaW5wdXQgaW5wdXQtc21cIiBkYXRhLXBkZi1jdXJyZW50LXBhZ2UgdmFsdWU9XCIxXCIgc3R5bGU9XCJ3aWR0aDo4MHB4XCIgLz5cbiAgICAgICAgICAgICAgPHNwYW4+LyA8c3BhbiBkYXRhLXBkZi10b3RhbC1wYWdlcz4wPC9zcGFuPjwvc3Bhbj5cbiAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBkYXRhLXBkZi1hY3Rpb249XCJuZXh0XCIgZGF0YS1wZGYtbmV4dD5OZXh0PC9idXR0b24+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwicGRmLXpvb21cIiBkYXRhLXBkZi16b29tPjEwMCU8L3NwYW4+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJwZGYtdG9vbGJhci1yb3dcIiBzdHlsZT1cImdhcDo4cHg7ZmxleC13cmFwOndyYXA7bWFyZ2luLXRvcDo4cHhcIj5cbiAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJmaWxlXCIgZGF0YS1wZGYtb3BlbiBzdHlsZT1cImRpc3BsYXk6bm9uZVwiIC8+XG4gICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0XCIgZGF0YS1wZGYtYWN0aW9uPVwib3BlblwiPk9wZW48L2J1dHRvbj5cbiAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBkYXRhLXBkZi1hY3Rpb249XCJ6b29tLW91dFwiPi08L2J1dHRvbj5cbiAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBkYXRhLXBkZi1hY3Rpb249XCJ6b29tLWluXCI+KzwvYnV0dG9uPlxuICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdFwiIGRhdGEtcGRmLWFjdGlvbj1cImZpdC13aWR0aFwiPkZpdCB3aWR0aDwvYnV0dG9uPlxuICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdFwiIGRhdGEtcGRmLWFjdGlvbj1cImZpdC1wYWdlXCI+Rml0IHBhZ2U8L2J1dHRvbj5cbiAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBkYXRhLXBkZi1hY3Rpb249XCJyb3RhdGUtY2N3XCI+Q0NXPC9idXR0b24+XG4gICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0XCIgZGF0YS1wZGYtYWN0aW9uPVwicm90YXRlLWN3XCI+Q1c8L2J1dHRvbj5cbiAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBkYXRhLXBkZi1hY3Rpb249XCJkb3dubG9hZFwiPkRvd25sb2FkPC9idXR0b24+XG4gICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0XCIgdHlwZT1cImJ1dHRvblwiIGRhdGEtcGRmLXNhdmUtc2VsZWN0aW9uPlNhdmUgc2VsZWN0aW9uPC9idXR0b24+XG4gICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0XCIgdHlwZT1cImJ1dHRvblwiIGRhdGEtcGRmLWFpLXN1bW1hcnkgaGlkZGVuPlN1bW1hcml6ZSBQREY8L2J1dHRvbj5cbiAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1wZGYtZXhwb3J0LWFubm90YXRpb25zPkV4cG9ydCBhbm5vdGF0aW9uczwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwicGRmLXBhZ2Utbm90ZVwiIGRhdGEtcGRmLXBhZ2Utbm90ZT5cbiAgICAgICAgICAgICAgPHRleHRhcmVhIGNsYXNzPVwiaW5wdXRcIiBkYXRhLXBkZi1wYWdlLW5vdGUtaW5wdXQgcm93cz1cIjJcIiBwbGFjZWhvbGRlcj1cIk5vdGUgZm9yIHRoaXMgUERGIHBhZ2VcIj48L3RleHRhcmVhPlxuICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYnV0dG9uLXJvd1wiPlxuICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLXByaW1hcnkgYnRuLXNtXCIgdHlwZT1cImJ1dHRvblwiIGRhdGEtcGRmLXNhdmUtcGFnZS1ub3RlPlNhdmUgcGFnZSBub3RlPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJ0ZXh0LXNtXCIgZGF0YS1wZGYtcGFnZS1ub3RlLXN0YXR1cyBhcmlhLWxpdmU9XCJwb2xpdGVcIj48L3NwYW4+XG4gICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICA8ZGl2IGNsYXNzPVwicGRmLXZpZXdlci13cmFwXCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwicGRmLXZpZXdlclwiIGRhdGEtcGRmLXZpZXdlciB0YWJpbmRleD1cIjBcIj48L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJwZGYtbG9hZGluZ1wiIGRhdGEtcGRmLWxvYWRpbmcgaGlkZGVuPlxuICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwicGRmLXByb2dyZXNzXCI+PGRpdiBkYXRhLXBkZi1wcm9ncmVzcyBjbGFzcz1cInBkZi1wcm9ncmVzcy1iYXJcIj48L2Rpdj48L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInBkZi1lcnJvclwiIGRhdGEtcGRmLWVycm9yIGhpZGRlbj48L2Rpdj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L2Rpdj5cbiAgICA8L3NlY3Rpb24+XG4gIGApO1xuXG4gIGNvbnN0IFBsYXNtYURlY2sgPSB3aW5kb3cuUGxhc21hRGVjayA/PyB7fTtcbiAgY29uc3QgVG9hc3QgPSBQbGFzbWFEZWNrLlRvYXN0ID8/IHsgc3VjY2VzcygpIHt9LCBlcnJvcigpIHt9IH07XG4gIHRyeSB7IHdpbmRvdy5QbGFzbWFQREZJbml0Py4oKTsgfSBjYXRjaCAoZSkgeyBjb25zb2xlLndhcm4oJ1tQREYgdmlld10gaW5pdCBmYWlsZWQnLCBlKTsgfVxuICBjb25zdCBzYXZlQnV0dG9uID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtcGRmLXNhdmUtcGFnZS1ub3RlXScpO1xuICBjb25zdCBzZWxlY3Rpb25CdXR0b24gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1wZGYtc2F2ZS1zZWxlY3Rpb25dJyk7XG4gIGNvbnN0IGFpU3VtbWFyeUJ1dHRvbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXBkZi1haS1zdW1tYXJ5XScpO1xuICBjb25zdCBleHBvcnRCdXR0b24gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1wZGYtZXhwb3J0LWFubm90YXRpb25zXScpO1xuICBjb25zdCBub3RlSW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1wZGYtcGFnZS1ub3RlLWlucHV0XScpO1xuICBjb25zdCBub3RlU3RhdHVzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtcGRmLXBhZ2Utbm90ZS1zdGF0dXNdJyk7XG4gIGNvbnN0IHNldE5vdGVTdGF0dXMgPSAobWVzc2FnZSkgPT4ge1xuICAgIGlmIChub3RlU3RhdHVzKSBub3RlU3RhdHVzLnRleHRDb250ZW50ID0gbWVzc2FnZTtcbiAgfTtcbiAgY29uc3Qgb25TYXZlUGFnZU5vdGUgPSBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgdGV4dCA9IFN0cmluZyhub3RlSW5wdXQ/LnZhbHVlIHx8ICcnKS50cmltKCk7XG4gICAgaWYgKCF0ZXh0KSB7XG4gICAgICBzZXROb3RlU3RhdHVzKCdBZGQgYSBub3RlIGZpcnN0Jyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHNuYXBzaG90ID0gd2luZG93LlBsYXNtYVBERlZpZXdlcj8uZ2V0U25hcHNob3Q/LigpID8/IHdpbmRvdy5QbGFzbWFQREZTdGF0ZSA/PyB7fTtcbiAgICBjb25zdCBkb2NJZCA9IHNuYXBzaG90LmRvY0lkIHx8IHNuYXBzaG90LmFubm90YXRpb25Eb2NJZCB8fCAnZ2xvYmFsJztcbiAgICBjb25zdCBwYWdlID0gTWF0aC5tYXgoMSwgTnVtYmVyKHNuYXBzaG90LnBhZ2UgfHwgc25hcHNob3QuY3VycmVudFBhZ2UgfHwgMSkpO1xuICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHdpbmRvdy5EQj8uc2F2ZU5vdGU/Lih7XG4gICAgICAgIGlkOiBgcGRmLW5vdGUtJHtub3d9LSR7TWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMiwgNyl9YCxcbiAgICAgICAgdGl0bGU6IGBQREYgcGFnZSAke3BhZ2V9IG5vdGVgLFxuICAgICAgICBjb250ZW50OiBgPHA+JHtlc2NhcGVIdG1sVGV4dCh0ZXh0KX08L3A+PHA+PHN0cm9uZz5Tb3VyY2U6PC9zdHJvbmc+IFBERiBwYWdlICR7cGFnZX08L3A+YCxcbiAgICAgICAgc291cmNlVHlwZTogJ3BkZicsXG4gICAgICAgIGRvY0lkLFxuICAgICAgICBwZGZEb2NJZDogZG9jSWQsXG4gICAgICAgIHBhZ2UsXG4gICAgICAgIHBkZlBhZ2U6IHBhZ2UsXG4gICAgICAgIHRhZ3M6IFsncGRmJywgJ3BhZ2Utbm90ZSddLFxuICAgICAgICBjcmVhdGVkQXQ6IG5vdyxcbiAgICAgICAgdXBkYXRlZEF0OiBub3csXG4gICAgICB9KTtcbiAgICAgIG5vdGVJbnB1dC52YWx1ZSA9ICcnO1xuICAgICAgc2V0Tm90ZVN0YXR1cyhgU2F2ZWQgcGFnZSAke3BhZ2V9YCk7XG4gICAgICBUb2FzdC5zdWNjZXNzKCdQREYgcGFnZSBub3RlIHNhdmVkJyk7XG4gICAgfSBjYXRjaCB7XG4gICAgICBzZXROb3RlU3RhdHVzKCdTYXZlIGZhaWxlZCcpO1xuICAgICAgVG9hc3QuZXJyb3IoJ1BERiBwYWdlIG5vdGUgc2F2ZSBmYWlsZWQnKTtcbiAgICB9XG4gIH07XG4gIGNvbnN0IG9uRXhwb3J0QW5ub3RhdGlvbnMgPSBhc3luYyAoKSA9PiB7XG4gICAgaWYgKHR5cGVvZiB3aW5kb3cuUGxhc21hUERGVmlld2VyPy5leHBvcnRBbm5vdGF0aW9uc1RvTm90ZXMgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHNldE5vdGVTdGF0dXMoJ0Fubm90YXRpb24gZXhwb3J0IHVuYXZhaWxhYmxlJyk7XG4gICAgICBUb2FzdC5lcnJvcignUERGIGFubm90YXRpb24gZXhwb3J0IHVuYXZhaWxhYmxlJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB3aW5kb3cuUGxhc21hUERGVmlld2VyLmV4cG9ydEFubm90YXRpb25zVG9Ob3RlcygpO1xuICAgICAgY29uc3QgY3JlYXRlZCA9IE51bWJlcihyZXN1bHQ/LmNyZWF0ZWQgfHwgMCk7XG4gICAgICBjb25zdCBlcnJvcnMgPSBOdW1iZXIocmVzdWx0Py5lcnJvcnMgfHwgMCk7XG4gICAgICBpZiAoY3JlYXRlZCA+IDApIHtcbiAgICAgICAgY29uc3Qgc3VmZml4ID0gZXJyb3JzID8gYCwgJHtlcnJvcnN9IGZhaWxlZGAgOiAnJztcbiAgICAgICAgc2V0Tm90ZVN0YXR1cyhgRXhwb3J0ZWQgJHtjcmVhdGVkfSBhbm5vdGF0aW9ucyR7c3VmZml4fWApO1xuICAgICAgICBUb2FzdC5zdWNjZXNzKGBFeHBvcnRlZCAke2NyZWF0ZWR9IFBERiBhbm5vdGF0aW9uc2ApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBzZXROb3RlU3RhdHVzKGVycm9ycyA/IGBFeHBvcnQgZmFpbGVkIGZvciAke2Vycm9yc30gYW5ub3RhdGlvbnNgIDogJ05vIGFubm90YXRpb25zIHRvIGV4cG9ydCcpO1xuICAgICAgaWYgKGVycm9ycykgVG9hc3QuZXJyb3IoJ1BERiBhbm5vdGF0aW9uIGV4cG9ydCBmYWlsZWQnKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHNldE5vdGVTdGF0dXMoJ0Fubm90YXRpb24gZXhwb3J0IGZhaWxlZCcpO1xuICAgICAgVG9hc3QuZXJyb3IoJ1BERiBhbm5vdGF0aW9uIGV4cG9ydCBmYWlsZWQnKTtcbiAgICB9XG4gIH07XG4gIGNvbnN0IG9uU2F2ZVNlbGVjdGlvbiA9IGFzeW5jICgpID0+IHtcbiAgICBpZiAodHlwZW9mIHdpbmRvdy5QbGFzbWFQREZWaWV3ZXI/LnNhdmVTZWxlY3Rpb25Ub05vdGUgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHNldE5vdGVTdGF0dXMoJ1NlbGVjdGlvbiBzYXZlIHVuYXZhaWxhYmxlJyk7XG4gICAgICBUb2FzdC5lcnJvcignUERGIHNlbGVjdGlvbiBzYXZlIHVuYXZhaWxhYmxlJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB3aW5kb3cuUGxhc21hUERGVmlld2VyLnNhdmVTZWxlY3Rpb25Ub05vdGUoKTtcbiAgICAgIGlmIChyZXN1bHQ/LnNhdmVkKSB7XG4gICAgICAgIHNldE5vdGVTdGF0dXMoYFNhdmVkIHNlbGVjdGlvbiBmcm9tIHBhZ2UgJHtyZXN1bHQucGFnZSB8fCAxfWApO1xuICAgICAgICBUb2FzdC5zdWNjZXNzKCdQREYgc2VsZWN0aW9uIHNhdmVkJyk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHNldE5vdGVTdGF0dXMocmVzdWx0Py5yZWFzb24gPT09ICdlbXB0eS1zZWxlY3Rpb24nID8gJ1NlbGVjdCBQREYgdGV4dCBmaXJzdCcgOiAnU2VsZWN0aW9uIHNhdmUgdW5hdmFpbGFibGUnKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHNldE5vdGVTdGF0dXMoJ1NlbGVjdGlvbiBzYXZlIGZhaWxlZCcpO1xuICAgICAgVG9hc3QuZXJyb3IoJ1BERiBzZWxlY3Rpb24gc2F2ZSBmYWlsZWQnKTtcbiAgICB9XG4gIH07XG4gIGNvbnN0IHJlZnJlc2hBSUNvbnRyb2xzID0gYXN5bmMgKCkgPT4ge1xuICAgIGlmICghYWlTdW1tYXJ5QnV0dG9uKSByZXR1cm47XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHN0YXR1cyA9IGF3YWl0IHdpbmRvdy5QbGFzbWFEZWNrPy5BST8uc3RhdHVzPy4oKTtcbiAgICAgIGFpU3VtbWFyeUJ1dHRvbi5oaWRkZW4gPSAhc3RhdHVzPy5hdmFpbGFibGU7XG4gICAgfSBjYXRjaCB7XG4gICAgICBhaVN1bW1hcnlCdXR0b24uaGlkZGVuID0gdHJ1ZTtcbiAgICB9XG4gIH07XG4gIGNvbnN0IG9uQUlTdW1tYXJ5ID0gYXN5bmMgKCkgPT4ge1xuICAgIGNvbnN0IGFpID0gd2luZG93LlBsYXNtYURlY2s/LkFJO1xuICAgIGlmICghYWk/LnN1bW1hcml6ZVRleHQgfHwgdHlwZW9mIHdpbmRvdy5QbGFzbWFQREZWaWV3ZXI/LmV4dHJhY3RUZXh0Rm9yU3VtbWFyeSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgc2V0Tm90ZVN0YXR1cygnQUkgc3VtbWFyeSB1bmF2YWlsYWJsZScpO1xuICAgICAgVG9hc3QuZXJyb3IoJ1BERiBBSSBzdW1tYXJ5IHVuYXZhaWxhYmxlJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGFpU3VtbWFyeUJ1dHRvbi5kaXNhYmxlZCA9IHRydWU7XG4gICAgY29uc3QgcHJldmlvdXNUZXh0ID0gYWlTdW1tYXJ5QnV0dG9uLnRleHRDb250ZW50O1xuICAgIGFpU3VtbWFyeUJ1dHRvbi50ZXh0Q29udGVudCA9ICdTdW1tYXJpemluZy4uLic7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGV4dHJhY3RlZCA9IGF3YWl0IHdpbmRvdy5QbGFzbWFQREZWaWV3ZXIuZXh0cmFjdFRleHRGb3JTdW1tYXJ5KHsgbWF4UGFnZXM6IDYsIG1heENoYXJzOiAxNDAwMCB9KTtcbiAgICAgIGlmICghZXh0cmFjdGVkLnRleHQpIHtcbiAgICAgICAgc2V0Tm90ZVN0YXR1cygnT3BlbiBhIHNlYXJjaGFibGUgUERGIGZpcnN0Jyk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFpLnN1bW1hcml6ZVRleHQoZXh0cmFjdGVkLnRleHQsIHsgYnVsbGV0czogNSB9KTtcbiAgICAgIGlmICghcmVzdWx0Py5vayB8fCAhcmVzdWx0LnRleHQpIHtcbiAgICAgICAgc2V0Tm90ZVN0YXR1cygnQUkgc3VtbWFyeSB1bmF2YWlsYWJsZScpO1xuICAgICAgICBUb2FzdC5lcnJvcignUERGIEFJIHN1bW1hcnkgdW5hdmFpbGFibGUnKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgZG9jSWQgPSBleHRyYWN0ZWQuZG9jSWQgfHwgJ2dsb2JhbCc7XG4gICAgICBhd2FpdCBhaS5zYXZlU3VtbWFyeU5vdGU/Lih7XG4gICAgICAgIHN1bW1hcnk6IHJlc3VsdC50ZXh0LFxuICAgICAgICB0aXRsZTogYFBERiBBSSBzdW1tYXJ5ICgke2V4dHJhY3RlZC5wYWdlcyB8fCAxfSBwYWdlJHtleHRyYWN0ZWQucGFnZXMgPT09IDEgPyAnJyA6ICdzJ30pYCxcbiAgICAgICAgc291cmNlTGFiZWw6IGAke2RvY0lkfSwgZmlyc3QgJHtleHRyYWN0ZWQucGFnZXMgfHwgMX0gcGFnZSR7ZXh0cmFjdGVkLnBhZ2VzID09PSAxID8gJycgOiAncyd9YCxcbiAgICAgICAgbm90ZToge1xuICAgICAgICAgIHNvdXJjZVR5cGU6ICdwZGYnLFxuICAgICAgICAgIGRvY0lkLFxuICAgICAgICAgIHBkZkRvY0lkOiBkb2NJZCxcbiAgICAgICAgICBwYWdlOiAxLFxuICAgICAgICAgIHBkZlBhZ2U6IDEsXG4gICAgICAgICAgdGFnczogWydwZGYnLCAnYWktc3VtbWFyeSddLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgICBzZXROb3RlU3RhdHVzKGBBSSBzdW1tYXJ5IHNhdmVkIGZyb20gJHtleHRyYWN0ZWQucGFnZXMgfHwgMX0gcGFnZSR7ZXh0cmFjdGVkLnBhZ2VzID09PSAxID8gJycgOiAncyd9YCk7XG4gICAgICBUb2FzdC5zdWNjZXNzKCdQREYgQUkgc3VtbWFyeSBzYXZlZCcpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgc2V0Tm90ZVN0YXR1cygnQUkgc3VtbWFyeSBmYWlsZWQnKTtcbiAgICAgIFRvYXN0LmVycm9yKCdQREYgQUkgc3VtbWFyeSBmYWlsZWQnKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgYWlTdW1tYXJ5QnV0dG9uLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICBhaVN1bW1hcnlCdXR0b24udGV4dENvbnRlbnQgPSBwcmV2aW91c1RleHQ7XG4gICAgfVxuICB9O1xuICBjb25zdCBvblBkZlN5bmNNZXNzYWdlID0gYXN5bmMgKHBheWxvYWQgPSB7fSkgPT4ge1xuICAgIGlmIChwYXlsb2FkLmtpbmQgIT09ICdhbm5vdGF0aW9uJyAmJiBwYXlsb2FkLmtpbmQgIT09ICdkYXRhJykgcmV0dXJuO1xuICAgIGNvbnN0IHNuYXBzaG90ID0gd2luZG93LlBsYXNtYVBERlZpZXdlcj8uZ2V0U25hcHNob3Q/LigpID8/IHdpbmRvdy5QbGFzbWFQREZTdGF0ZSA/PyB7fTtcbiAgICBjb25zdCBjdXJyZW50RG9jID0gc25hcHNob3QuZG9jSWQgfHwgc25hcHNob3QuYW5ub3RhdGlvbkRvY0lkIHx8ICdnbG9iYWwnO1xuICAgIGNvbnN0IGNoYW5nZWREb2MgPSBwYXlsb2FkLnJlY29yZD8uZG9jSWQ7XG4gICAgaWYgKGNoYW5nZWREb2MgJiYgY2hhbmdlZERvYyAhPT0gY3VycmVudERvYykgcmV0dXJuO1xuICAgIGlmICh0eXBlb2Ygd2luZG93LlBsYXNtYVBERlZpZXdlcj8ucmVmcmVzaEFubm90YXRpb25zRnJvbVN0b3JhZ2UgIT09ICdmdW5jdGlvbicpIHJldHVybjtcbiAgICB0cnkge1xuICAgICAgY29uc3QgYW5ub3RhdGlvbnMgPSBhd2FpdCB3aW5kb3cuUGxhc21hUERGVmlld2VyLnJlZnJlc2hBbm5vdGF0aW9uc0Zyb21TdG9yYWdlKCk7XG4gICAgICBzZXROb3RlU3RhdHVzKGBBbm5vdGF0aW9ucyByZWZyZXNoZWQgKCR7YW5ub3RhdGlvbnMubGVuZ3RofSlgKTtcbiAgICAgIFBsYXNtYURlY2suYnVzPy5lbWl0Py4oJ3BkZjpzeW5jLXJlZnJlc2gnLCB7IGRvY0lkOiBjdXJyZW50RG9jLCBhbm5vdGF0aW9uczogYW5ub3RhdGlvbnMubGVuZ3RoIH0pO1xuICAgIH0gY2F0Y2gge1xuICAgICAgc2V0Tm90ZVN0YXR1cygnQW5ub3RhdGlvbiByZWZyZXNoIGZhaWxlZCcpO1xuICAgIH1cbiAgfTtcbiAgc2F2ZUJ1dHRvbj8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBvblNhdmVQYWdlTm90ZSk7XG4gIHNlbGVjdGlvbkJ1dHRvbj8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBvblNhdmVTZWxlY3Rpb24pO1xuICBhaVN1bW1hcnlCdXR0b24/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgb25BSVN1bW1hcnkpO1xuICBleHBvcnRCdXR0b24/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgb25FeHBvcnRBbm5vdGF0aW9ucyk7XG4gIFBsYXNtYURlY2suYnVzPy5vbj8uKCdzeW5jOm1lc3NhZ2UnLCBvblBkZlN5bmNNZXNzYWdlKTtcbiAgcmVmcmVzaEFJQ29udHJvbHMoKTtcbiAgcmV0dXJuIHtcbiAgICB1bm1vdW50KCkge1xuICAgICAgc2F2ZUJ1dHRvbj8ucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2xpY2snLCBvblNhdmVQYWdlTm90ZSk7XG4gICAgICBzZWxlY3Rpb25CdXR0b24/LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgb25TYXZlU2VsZWN0aW9uKTtcbiAgICAgIGFpU3VtbWFyeUJ1dHRvbj8ucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2xpY2snLCBvbkFJU3VtbWFyeSk7XG4gICAgICBleHBvcnRCdXR0b24/LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgb25FeHBvcnRBbm5vdGF0aW9ucyk7XG4gICAgICBQbGFzbWFEZWNrLmJ1cz8ub2ZmPy4oJ3N5bmM6bWVzc2FnZScsIG9uUGRmU3luY01lc3NhZ2UpO1xuICAgICAgdHJ5IHsgd2luZG93LlBsYXNtYVBERkRlc3Ryb3k/LigpOyB9IGNhdGNoIHt9XG4gICAgfSxcbiAgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBQSxTQUFTLGVBQWUsT0FBTztBQUM3QixTQUFPLE9BQU8sU0FBUyxFQUFFLEVBQUUsUUFBUSxZQUFZLENBQUMsVUFBVTtBQUFBLElBQ3hELEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxFQUNQLEdBQUUsSUFBSSxDQUFFO0FBQ1Y7QUFFTyxTQUFTLHFCQUFxQixNQUFNO0FBQ3pDLFFBQU0s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
