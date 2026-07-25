function escapeHtmlText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

export function sanitizePdfRouteHtml(html) {
  const purify = window.DOMPurify;
  if (purify?.sanitize) {
    return purify.sanitize(String(html ?? ''), {
      ADD_TAGS: ['canvas'],
      ADD_ATTR: ['tabindex', 'role', 'aria-label', 'aria-hidden', 'aria-live', 'aria-atomic'],
      FORBID_TAGS: ['template'],
    });
  }

  const template = document.createElement('template');
  template.innerHTML = String(html ?? '');
  template.content
    .querySelectorAll('script, style, meta, link, iframe, object, embed, form, template')
    .forEach(node => node.remove());
  template.content.querySelectorAll('*').forEach((node) => {
    [...node.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = String(attr.value || '').trim();
      if (name.startsWith('on') || name === 'srcdoc') {
        node.removeAttribute(attr.name);
        return;
      }
      if (
        (name === 'href' || name === 'src' || name === 'action')
        && /^(?:javascript|vbscript|data:text\/html)/i.test(value)
      ) {
        node.removeAttribute(attr.name);
      }
    });
  });
  return template.innerHTML;
}

function setView(html) {
  const el = document.getElementById('view-container');
  if (!el) return null;
  el.innerHTML = sanitizePdfRouteHtml(html);
  return el;
}

export function mountPdfView() {
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

  const OpenCourseDeck = window.OpenCourseDeck ?? {};
  const Toast = OpenCourseDeck.Toast ?? { success() {}, error() {} };
  try { window.PlasmaPDFInit?.(); } catch (e) { console.warn('[PDF view] init failed', e); }
  const saveButton = document.querySelector('[data-pdf-save-page-note]');
  const selectionButton = document.querySelector('[data-pdf-save-selection]');
  const aiSummaryButton = document.querySelector('[data-pdf-ai-summary]');
  const exportButton = document.querySelector('[data-pdf-export-annotations]');
  const noteInput = document.querySelector('[data-pdf-page-note-input]');
  const noteStatus = document.querySelector('[data-pdf-page-note-status]');
  const setNoteStatus = (message) => {
    if (noteStatus) noteStatus.textContent = message;
  };
  const onSavePageNote = async () => {
    const text = String(noteInput?.value || '').trim();
    if (!text) {
      setNoteStatus('Add a note first');
      return;
    }
    const snapshot = window.PlasmaPDFViewer?.getSnapshot?.() ?? window.PlasmaPDFState ?? {};
    const docId = snapshot.docId || snapshot.annotationDocId || 'global';
    const page = Math.max(1, Number(snapshot.page || snapshot.currentPage || 1));
    const now = Date.now();
    try {
      await window.DB?.saveNote?.({
        id: `pdf-note-${now}-${Math.random().toString(36).slice(2, 7)}`,
        title: `PDF page ${page} note`,
        content: `<p>${escapeHtmlText(text)}</p><p><strong>Source:</strong> PDF page ${page}</p>`,
        sourceType: 'pdf',
        docId,
        pdfDocId: docId,
        page,
        pdfPage: page,
        tags: ['pdf', 'page-note'],
        createdAt: now,
        updatedAt: now,
      });
      noteInput.value = '';
      setNoteStatus(`Saved page ${page}`);
      Toast.success('PDF page note saved');
    } catch {
      setNoteStatus('Save failed');
      Toast.error('PDF page note save failed');
    }
  };
  const onExportAnnotations = async () => {
    if (typeof window.PlasmaPDFViewer?.exportAnnotationsToNotes !== 'function') {
      setNoteStatus('Annotation export unavailable');
      Toast.error('PDF annotation export unavailable');
      return;
    }
    try {
      const result = await window.PlasmaPDFViewer.exportAnnotationsToNotes();
      const created = Number(result?.created || 0);
      const errors = Number(result?.errors || 0);
      if (created > 0) {
        const suffix = errors ? `, ${errors} failed` : '';
        setNoteStatus(`Exported ${created} annotations${suffix}`);
        Toast.success(`Exported ${created} PDF annotations`);
        return;
      }
      setNoteStatus(errors ? `Export failed for ${errors} annotations` : 'No annotations to export');
      if (errors) Toast.error('PDF annotation export failed');
    } catch {
      setNoteStatus('Annotation export failed');
      Toast.error('PDF annotation export failed');
    }
  };
  const onSaveSelection = async () => {
    if (typeof window.PlasmaPDFViewer?.saveSelectionToNote !== 'function') {
      setNoteStatus('Selection save unavailable');
      Toast.error('PDF selection save unavailable');
      return;
    }
    try {
      const result = await window.PlasmaPDFViewer.saveSelectionToNote();
      if (result?.saved) {
        setNoteStatus(`Saved selection from page ${result.page || 1}`);
        Toast.success('PDF selection saved');
        return;
      }
      setNoteStatus(result?.reason === 'empty-selection' ? 'Select PDF text first' : 'Selection save unavailable');
    } catch {
      setNoteStatus('Selection save failed');
      Toast.error('PDF selection save failed');
    }
  };
  const refreshAIControls = async () => {
    if (!aiSummaryButton) return;
    try {
      const status = await window.OpenCourseDeck?.AI?.status?.();
      aiSummaryButton.hidden = !status?.available;
    } catch {
      aiSummaryButton.hidden = true;
    }
  };
  const onAISummary = async () => {
    const ai = window.OpenCourseDeck?.AI;
    if (!ai?.summarizeText || typeof window.PlasmaPDFViewer?.extractTextForSummary !== 'function') {
      setNoteStatus('AI summary unavailable');
      Toast.error('PDF AI summary unavailable');
      return;
    }
    aiSummaryButton.disabled = true;
    const previousText = aiSummaryButton.textContent;
    aiSummaryButton.textContent = 'Summarizing...';
    try {
      const extracted = await window.PlasmaPDFViewer.extractTextForSummary({ maxPages: 6, maxChars: 14000 });
      if (!extracted.text) {
        setNoteStatus('Open a searchable PDF first');
        return;
      }
      const result = await ai.summarizeText(extracted.text, { bullets: 5 });
      if (!result?.ok || !result.text) {
        setNoteStatus('AI summary unavailable');
        Toast.error('PDF AI summary unavailable');
        return;
      }
      const docId = extracted.docId || 'global';
      await ai.saveSummaryNote?.({
        summary: result.text,
        title: `PDF AI summary (${extracted.pages || 1} page${extracted.pages === 1 ? '' : 's'})`,
        sourceLabel: `${docId}, first ${extracted.pages || 1} page${extracted.pages === 1 ? '' : 's'}`,
        note: {
          sourceType: 'pdf',
          docId,
          pdfDocId: docId,
          page: 1,
          pdfPage: 1,
          tags: ['pdf', 'ai-summary'],
        },
      });
      setNoteStatus(`AI summary saved from ${extracted.pages || 1} page${extracted.pages === 1 ? '' : 's'}`);
      Toast.success('PDF AI summary saved');
    } catch {
      setNoteStatus('AI summary failed');
      Toast.error('PDF AI summary failed');
    } finally {
      aiSummaryButton.disabled = false;
      aiSummaryButton.textContent = previousText;
    }
  };
  const onPdfSyncMessage = async (payload = {}) => {
    if (payload.kind !== 'annotation' && payload.kind !== 'data') return;
    const snapshot = window.PlasmaPDFViewer?.getSnapshot?.() ?? window.PlasmaPDFState ?? {};
    const currentDoc = snapshot.docId || snapshot.annotationDocId || 'global';
    const changedDoc = payload.record?.docId;
    if (changedDoc && changedDoc !== currentDoc) return;
    if (typeof window.PlasmaPDFViewer?.refreshAnnotationsFromStorage !== 'function') return;
    try {
      const annotations = await window.PlasmaPDFViewer.refreshAnnotationsFromStorage();
      setNoteStatus(`Annotations refreshed (${annotations.length})`);
      OpenCourseDeck.bus?.emit?.('pdf:sync-refresh', { docId: currentDoc, annotations: annotations.length });
    } catch {
      setNoteStatus('Annotation refresh failed');
    }
  };
  saveButton?.addEventListener('click', onSavePageNote);
  selectionButton?.addEventListener('click', onSaveSelection);
  aiSummaryButton?.addEventListener('click', onAISummary);
  exportButton?.addEventListener('click', onExportAnnotations);
  OpenCourseDeck.bus?.on?.('sync:message', onPdfSyncMessage);
  refreshAIControls();
  return {
    unmount() {
      saveButton?.removeEventListener('click', onSavePageNote);
      selectionButton?.removeEventListener('click', onSaveSelection);
      aiSummaryButton?.removeEventListener('click', onAISummary);
      exportButton?.removeEventListener('click', onExportAnnotations);
      OpenCourseDeck.bus?.off?.('sync:message', onPdfSyncMessage);
      try { window.PlasmaPDFDestroy?.(); } catch {}
    },
  };
}
