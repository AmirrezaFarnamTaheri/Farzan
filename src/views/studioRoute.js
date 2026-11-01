import { SpatialKnowledgeGraph } from '../features/spatialKnowledgeGraph.js';

export function mountStudioView(deps = {}) {
  const {
setView,
safeFetchUrl,
safeMediaUrl,
safeFrameUrl,
setPendingCourseMedia,
Router,
// Fall back to no-ops: Toast may be unregistered during partial init or in
// test harnesses, and a bare Toast.success() then threw mid-handler,
// skipping the post-mutation UI refresh.
Toast = window.OpenCourseDeck?.Toast ?? { success() {}, error() {}, info() {}, warning() {} },
downloadTextFile,
downloadDataUrl,
printStudioBoardPdf,
loadKonvaDraft = () => import('../features/studioKonvaDraftWorkspace.js'),
  } = deps;

  setView(`
    <section class="view view-studio">
      <div class="page-header studio-header">
        <div>
          <h1 class="page-title">Studio</h1>
          <p class="page-subtitle">Draw on a canvas, take Cornell notes, or build a concept map.</p>
        </div>
        <div class="studio-status-pill" aria-live="polite">
          <span data-studio-status>Ready</span>
        </div>
      </div>

      <div class="studio-workspace-grid">
      <div class="card card-filled studio-toolbar-panel">
        <div class="studio-toolbar-clusters">
          <div class="studio-tool-group" role="group" aria-label="Canvas tools">
            <button class="btn btn-ghost btn-sm" data-studio-tool="select" aria-pressed="false" title="Select Tool">
              <svg class="icon" aria-hidden="true"><use href="#i-cursor"/></svg>
              <span>Select</span>
            </button>
            <button class="btn btn-ghost btn-sm" data-studio-tool="pen" aria-pressed="true" title="Pen Tool">
              <svg class="icon" aria-hidden="true"><use href="#i-pen"/></svg>
              <span>Pen</span>
            </button>

          </div>

          <div class="studio-tool-group" role="group" aria-label="Notes and cards">
            <input class="input input-sm w-40" data-studio-text placeholder="Board note..." aria-label="Board note text" />
            <button class="btn btn-ghost btn-sm" data-studio-add-text title="Add Note">
              <svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg>
              <span>Note</span>
            </button>
            <button class="btn btn-ghost btn-sm" data-studio-add-card title="Add Card">
              <svg class="icon" aria-hidden="true"><use href="#i-clone"/></svg>
              <span>Card</span>
            </button>
          </div>


          <div class="studio-tool-group studio-primary-save" role="group" aria-label="Save board">
            <button class="btn btn-primary btn-sm" data-studio-save title="Save Board">
              <svg class="icon" aria-hidden="true"><use href="#i-save"/></svg>
              <span>Save</span>
            </button>
          </div>

          <button class="btn btn-ghost btn-sm studio-inspector-toggle" type="button"
            data-studio-toggle-inspector aria-controls="studio-inspector" aria-expanded="true">
            <svg class="icon" aria-hidden="true"><use href="#i-layers"/></svg>
            <span data-studio-inspector-label>Hide layers</span>
          </button>

          <details class="studio-more-tools" data-studio-more-tools>
            <summary>More tools &amp; export</summary>
            <div class="studio-more-tools-content">
              <div class="studio-tool-group" role="group" aria-label="Knowledge graph">
            <button class="btn btn-ghost btn-sm" data-studio-mode="3d" aria-pressed="false" title="3D Spatial Knowledge Graph">
              <svg class="icon" aria-hidden="true"><use href="#i-canvas"/></svg>
              <span>3D Graph</span>
            </button>
              </div>
          <div class="studio-tool-group" role="group" aria-label="Experimental editor">
            <button type="button" class="btn btn-ghost btn-sm" data-studio-konva-open
              title="Try Konva in a separate saved draft; does not replace your Studio board">Konva draft lab</button>
          </div>
          <div class="studio-tool-group" role="group" aria-label="Geometric shapes">
            <button class="btn btn-ghost btn-sm" data-studio-add-rect title="Rectangle">
              <svg class="icon" aria-hidden="true"><use href="#i-square"/></svg>
              <span>Rect</span>
            </button>
            <button class="btn btn-ghost btn-sm" data-studio-add-circle title="Circle">
              <svg class="icon" aria-hidden="true"><use href="#i-circle"/></svg>
              <span>Circle</span>
            </button>
            <button class="btn btn-ghost btn-sm" data-studio-add-arrow title="Arrow">
              <svg class="icon" aria-hidden="true"><use href="#i-arrow-right"/></svg>
              <span>Arrow</span>
            </button>
          </div>

          <div class="studio-tool-group" role="group" aria-label="Media and templates">
            <input class="input input-sm w-32" data-studio-image-url placeholder="Image URL..." aria-label="Image URL" />
            <button class="btn btn-ghost btn-sm" data-studio-add-image title="Add Image">
              <svg class="icon" aria-hidden="true"><use href="#i-image"/></svg>
            </button>
            <select class="select input-sm" data-studio-template aria-label="Studio template">
              <option value="study-map">Study map</option>
              <option value="cornell">Cornell notes</option>
            </select>
            <button class="btn btn-ghost btn-sm" data-studio-apply-template title="Apply Template">Apply</button>
          </div>

          <div class="studio-tool-group" role="group" aria-label="Board management">

            <button class="btn btn-ghost btn-sm" data-studio-load title="Load Saved Board">Load</button>
            <button class="btn btn-ghost btn-sm" data-studio-clear title="Clear Board">Clear</button>
            <button class="btn btn-ghost btn-sm" data-studio-export-pdf title="Export PDF">
              <svg class="icon" aria-hidden="true"><use href="#i-file-pdf"/></svg>
              <span>PDF</span>
            </button>
            <button class="btn btn-ghost btn-sm" data-studio-export-png title="Export PNG">PNG</button>
            <button class="btn btn-ghost btn-sm" data-studio-export-svg title="Export SVG">SVG</button>
            <button class="btn btn-ghost btn-sm" data-studio-export-json title="Export JSON">JSON</button>
            <button class="btn btn-ghost btn-sm" data-studio-import-json title="Import JSON">Import</button>
            <input type="file" data-studio-import-file accept=".json,application/json" hidden />
          </div>
            </div>
          </details>
        </div>
      </div>


        <div class="studio-canvas-card">
          <div class="studio-shell">
            <canvas id="studio-canvas" class="studio-canvas" aria-label="Editable Studio canvas"></canvas>
            <div class="studio-empty-hint" data-studio-empty-hint aria-live="polite">
              <strong>Start creating on your board</strong>
              <span>Choose Pen to draw, type a board note and select Note, or add a card.</span>
            </div>
          </div>
        </div>

        <aside class="card card-filled studio-sidebar-card" id="studio-inspector" data-studio-inspector aria-label="Studio layers and properties">
          <div>
            <div class="button-row mb-3">
              <input class="input input-sm flex-1" data-studio-layer-name placeholder="New layer name" aria-label="New layer name" />
              <button class="btn btn-ghost btn-sm" data-studio-add-layer>Add layer</button>
            </div>
            <h3 class="studio-panel-heading">Layers</h3>
            <div data-studio-layers class="stack-sm"></div>
          </div>

          <div class="border-t-strong pt-3">
            <h3 class="studio-panel-heading">Elements & Properties</h3>
            <div data-studio-elements class="stack-sm"></div>
            <div data-studio-properties class="mt-3"></div>
          </div>
        </aside>
      </div>
      <dialog class="studio-konva-dialog" data-studio-konva-dialog aria-label="Experimental Konva draft editor">
        <div class="studio-konva-dialog-body">
          <div class="studio-konva-heading">
            <div>
              <h2>Experimental Konva draft editor</h2>
              <p>Changes are saved separately and are not applied to your Studio board.
                Select and move supported shapes, resize rectangles and cards, or use Pen to draw.
                Other editing tools remain in the classic Studio canvas.</p>
            </div>
            <button type="button" class="btn btn-ghost" data-studio-konva-close>Close draft</button>
          </div>
          <div class="studio-konva-actions" role="group" aria-label="Konva draft editing controls">
            <button type="button" class="btn btn-ghost btn-sm active" data-studio-konva-mode="select" aria-pressed="true">Select</button>
            <button type="button" class="btn btn-ghost btn-sm" data-studio-konva-mode="pen" aria-pressed="false">Pen</button>
            <button type="button" class="btn btn-ghost btn-sm" data-studio-konva-add="rect" aria-label="Add rectangle to Konva draft">Add rectangle</button>
            <button type="button" class="btn btn-ghost btn-sm" data-studio-konva-add="circle" aria-label="Add circle to Konva draft">Add circle</button>
            <label for="studio-konva-object">Object</label>
            <select id="studio-konva-object" class="select input-sm" data-studio-konva-object></select>
            <div class="studio-konva-text-edit">
              <label for="studio-konva-text">Text</label>
              <textarea id="studio-konva-text" class="input input-sm" rows="2" data-studio-konva-text
                aria-label="Selected draft text" dir="auto" disabled></textarea>
              <button type="button" class="btn btn-ghost btn-sm" data-studio-konva-text-save disabled>Save text</button>
            </div>
            <button type="button" class="btn btn-ghost btn-sm" data-studio-konva-nudge="left" title="Move left">Left</button>
            <button type="button" class="btn btn-ghost btn-sm" data-studio-konva-nudge="up" title="Move up">Up</button>
            <button type="button" class="btn btn-ghost btn-sm" data-studio-konva-nudge="down" title="Move down">Down</button>
            <button type="button" class="btn btn-ghost btn-sm" data-studio-konva-nudge="right" title="Move right">Right</button>
            <button type="button" class="btn btn-ghost btn-sm" data-studio-konva-reorder="backward"
              aria-label="Send selected draft shape one layer step backward" disabled>Send backward</button>
            <button type="button" class="btn btn-ghost btn-sm" data-studio-konva-reorder="forward"
              aria-label="Bring selected draft shape one layer step forward" disabled>Bring forward</button>
            <button type="button" class="btn btn-ghost btn-sm" data-studio-konva-undo>Undo</button>
            <button type="button" class="btn btn-ghost btn-sm" data-studio-konva-redo>Redo</button>
            <button type="button" class="btn btn-ghost btn-sm" data-studio-konva-export>Download draft JSON</button>
            <button type="button" class="btn btn-ghost btn-sm" data-studio-konva-export-png>Download draft viewport PNG (preview)</button>
            <button type="button" class="btn btn-ghost btn-sm" data-studio-konva-import-trigger>Import draft JSON</button>
            <input type="file" hidden accept=".json,application/json" data-studio-konva-import aria-label="Import isolated Konva draft JSON" />
            <button type="button" class="btn btn-ghost btn-sm" data-studio-konva-reset>Start fresh from Studio</button>
          </div>
          <div class="studio-konva-stage" data-studio-konva-stage tabindex="0" role="group"
            aria-label="Interactive experimental Konva draft canvas: arrow keys move selection; Shift adds ten-pixel steps"
            aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Control+z Control+Shift+z Escape"></div>
          <p data-studio-konva-status role="status" aria-live="polite">Move or resize a supported shape; changes save only to this draft.</p>
        </div>
      </dialog>
    </section>
  `);

  const routeListeners = [];
  const on = (target, type, handler, options) => {
    if (!target) return;
    target.addEventListener(type, handler, options);
    routeListeners.push({ target, type, handler, options });
  };
  const inspectorRoot = document.querySelector('[data-studio-inspector]');
  const inspectorToggle = document.querySelector('[data-studio-toggle-inspector]');
  const setInspectorOpen = (open) => {
    if (!inspectorRoot || !inspectorToggle) return;
    inspectorRoot.hidden = !open;
    inspectorToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    const label = inspectorToggle.querySelector('[data-studio-inspector-label]');
    if (label) label.textContent = open ? 'Hide layers' : 'Show layers';
  };
  setInspectorOpen(!window.matchMedia?.('(max-width: 900px)')?.matches);
  on(inspectorToggle, 'click', () => setInspectorOpen(inspectorRoot?.hidden));

  const status = document.querySelector('[data-studio-status]');
  const setStatus = (message) => {
    if (status) status.textContent = message;
  };
  const boardKey = 'ocd_studio_board';
  // Canonical DB.saveSetting returns either the stored value or an explicit
  // true receipt. Anything else cannot establish durable Studio persistence.
  const acknowledgedStudioWrite = (receipt, expected) => receipt === true
    || (receipt != null && typeof receipt === 'object'
      && !Array.isArray(receipt) && JSON.stringify(receipt) === JSON.stringify(expected));
  let inspectedElementId = null;
  let interactiveSaveTimer = null;
  let studioLinkOptions = [];
  let syncHandler = null;
  const openStudioLink = (element = {}) => {
    const type = String(element.linkType || '').trim();
    const target = String(element.linkTarget || '').trim();
    if (!type && !target) {
      setStatus('No link on selected object');
      return false;
    }
    if (type === 'url') {
      const url = safeFetchUrl(target) || safeMediaUrl(target) || safeFrameUrl(target);
      if (!url) {
        setStatus('Linked URL rejected');
        Toast.error('Studio link rejected');
        return false;
      }
      window.open?.(url, '_blank', 'noopener,noreferrer');
      setStatus('Linked URL opened');
      return true;
    }
    if (type === 'course') {
      Router.navigate('#/courses');
      setStatus('Opening linked course');
      return true;
    }
    if (type === 'timestamp') {
      if (target) {
        setPendingCourseMedia(target);
      }
      Router.navigate('#/courses');
      setStatus('Opening linked timestamp');
      return true;
    }
    if (type === 'pdf') {
      Router.navigate('#/pdf');
      setStatus('Opening linked PDF');
      return true;
    }
    if (type === 'note') {
      Router.navigate('#/notes');
      setStatus('Opening linked note');
      return true;
    }
    setStatus('Unsupported Studio link');
    return false;
  };
  const loadStudioLinkOptions = async () => {
    const [catalog, notes, timestamps, annotations] = await Promise.all([
      (async () => {
        try {
          await window.DataStore?.init?.();
          return {
            courses: window.DataStore?.allCourses?.() ?? [],
            topics: window.DataStore?.allTopics?.() ?? [],
          };
        } catch {
          return { courses: [], topics: [] };
        }
      })(),
      (async () => { try { return await window.DB?.getAllNotes?.() ?? []; } catch { return []; } })(),
      (async () => { try { return await window.DB?.getAllTimestamps?.() ?? []; } catch { return []; } })(),
      (async () => { try { return await window.DB?.getAllAnnotations?.() ?? []; } catch { return []; } })(),
    ]);
    const options = [];
    (catalog.courses || []).slice(0, 200).forEach((course) => {
      if (!course?.id) return;
      options.push({ type: 'course', target: String(course.id), label: String(course.title || course.name || course.id) });
    });
    (catalog.topics || []).slice(0, 300).forEach((topic) => {
      if (!topic?.topicId) return;
      const title = String(topic.title || topic.topicTitle || topic.topicId);
      const pdfs = Array.isArray(topic.pdfs) ? topic.pdfs : [];
      if (pdfs.length) options.push({ type: 'pdf', target: String(topic.topicId), label: title });
      options.push({ type: 'timestamp', target: String(topic.topicId), label: title });
    });
    (notes || []).slice(0, 200).forEach((note) => {
      if (!note?.id) return;
      options.push({ type: 'note', target: String(note.id), label: String(note.title || note.id) });
    });
    (timestamps || []).slice(0, 200).forEach((timestamp) => {
      const target = timestamp?.topicId || timestamp?.id;
      if (!target) return;
      options.push({ type: 'timestamp', target: String(target), label: String(timestamp.title || timestamp.topicTitle || timestamp.topicId || target) });
    });
    (annotations || []).slice(0, 200).forEach((annotation) => {
      const target = annotation?.id || annotation?.docId;
      if (!target) return;
      options.push({ type: 'pdf', target: String(target), label: `PDF ${annotation.docId || target}${annotation.page ? ` p.${annotation.page}` : ''}` });
    });
    studioLinkOptions = options;
    renderInspector();
  };
  const renderInspector = () => {
    const board = window.OpenCourseDeck?.Canvas?.serialize?.();
    const layersRoot = document.querySelector('[data-studio-layers]');
    const elementsRoot = document.querySelector('[data-studio-elements]');
    const propertiesRoot = document.querySelector('[data-studio-properties]');
    if (!board || !layersRoot || !elementsRoot || !propertiesRoot) return;
    const layers = Array.isArray(board.layers) ? board.layers : [];
    const activeLayerIdx = Number.isFinite(Number(board.activeLayerIdx)) ? Number(board.activeLayerIdx) : 0;
    const layerNodes = layers.map((layer, index) => {
      const row = document.createElement('div');
      row.className = 'card card-flat';
      row.dataset.layerId = layer.id;
      row.style.padding = '10px';
      row.style.display = 'flex';
      row.style.gap = '8px';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      const label = document.createElement('button');
      label.type = 'button';
      label.className = index === activeLayerIdx ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
      label.dataset.setLayer = String(index);
      label.textContent = `${layer.name || `Layer ${index + 1}`} (${layer.elements?.length || 0})`;
      row.appendChild(label);
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn-ghost btn-sm';
      del.dataset.deleteLayer = layer.id;
      del.disabled = layers.length <= 1;
      del.textContent = 'Delete';
      row.appendChild(del);
      return row;
    });
    layersRoot.replaceChildren(...(layerNodes.length ? layerNodes : [document.createTextNode('No layers')]));
    const elements = layers.flatMap((layer) => (Array.isArray(layer.elements) ? layer.elements : []).map((element) => ({ ...element, layerName: layer.name })));
    const emptyHint = document.querySelector('[data-studio-empty-hint]');
    if (emptyHint) emptyHint.hidden = elements.length > 0;
    const elementNodes = elements.map((element) => {
      const row = document.createElement('div');
      row.className = 'card card-flat';
      row.style.padding = '10px';
      row.style.display = 'flex';
      row.style.gap = '8px';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      const meta = document.createElement('span');
      meta.className = 'text-sm';
      const linkText = element.linkType || element.linkTarget ? ` · links ${element.linkType || 'resource'}${element.linkLabel ? `: ${element.linkLabel}` : ''}` : '';
      meta.textContent = `${element.type || 'element'} · ${element.text || element.id || 'Untitled'} · ${element.layerName || 'Layer'}${linkText}`;
      row.appendChild(meta);
      const inspect = document.createElement('button');
      inspect.type = 'button';
      inspect.className = element.id === inspectedElementId ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
      inspect.dataset.inspectElement = element.id;
      inspect.textContent = 'Inspect';
      row.appendChild(inspect);
      if (element.linkType || element.linkTarget) {
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'btn btn-ghost btn-sm';
        open.dataset.openStudioLink = element.id;
        open.textContent = 'Open';
        row.appendChild(open);
      }
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn-ghost btn-sm';
      del.dataset.deleteElement = element.id;
      del.textContent = 'Delete';
      row.appendChild(del);
      return row;
    });
    elementsRoot.replaceChildren(...(elementNodes.length ? elementNodes : [document.createTextNode('No elements')]));
    const inspected = elements.find((element) => element.id === inspectedElementId);
    if (!inspected) {
      if (inspectedElementId) inspectedElementId = null;
      propertiesRoot.replaceChildren(document.createTextNode('Select an element to edit its properties.'));
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'card card-flat';
    wrap.style.padding = '10px';
    wrap.style.display = 'grid';
    wrap.style.gap = '8px';
    const title = document.createElement('strong');
    title.textContent = `Inspecting ${inspected.type || 'element'}`;
    wrap.appendChild(title);
    const textInput = document.createElement('input');
    textInput.className = 'input input-sm';
    textInput.dataset.studioPropText = '';
    textInput.placeholder = 'Text';
    textInput.value = inspected.text || '';
    wrap.appendChild(textInput);
    const linkRow = document.createElement('div');
    linkRow.style.display = 'flex';
    linkRow.style.gap = '8px';
    linkRow.style.flexWrap = 'wrap';
    const linkType = document.createElement('select');
    linkType.className = 'select input-sm';
    linkType.dataset.studioPropLinkType = '';
    [
      ['', 'No link'],
      ['course', 'Course'],
      ['pdf', 'PDF'],
      ['note', 'Note'],
      ['timestamp', 'Timestamp'],
      ['url', 'URL'],
    ].forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      if ((inspected.linkType || '') === value) option.selected = true;
      linkType.appendChild(option);
    });
    linkRow.appendChild(linkType);
    [
      ['Link target', 'studioPropLinkTarget', inspected.linkTarget || ''],
      ['Link label', 'studioPropLinkLabel', inspected.linkLabel || ''],
    ].forEach(([labelText, key, value]) => {
      const input = document.createElement('input');
      input.className = 'input input-sm';
      input.dataset[key] = '';
      input.placeholder = labelText;
      input.value = String(value ?? '');
      input.style.minWidth = '180px';
      if (key === 'studioPropLinkTarget') input.setAttribute('list', 'studio-link-target-options');
      linkRow.appendChild(input);
    });
    const linkOptions = document.createElement('datalist');
    linkOptions.id = 'studio-link-target-options';
    const selectedType = inspected.linkType || '';
    studioLinkOptions
      .filter((option) => !selectedType || option.type === selectedType)
      .slice(0, 120)
      .forEach((option) => {
        const item = document.createElement('option');
        item.value = option.target;
        item.label = `${option.label} (${option.type})`;
        linkOptions.appendChild(item);
      });
    linkRow.appendChild(linkOptions);
    wrap.appendChild(linkRow);
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.flexWrap = 'wrap';
    [
      ['X', 'studioPropX', inspected.x ?? ''],
      ['Y', 'studioPropY', inspected.y ?? ''],
      ['Fill', 'studioPropFill', inspected.fill || 'transparent'],
      ['Stroke', 'studioPropStroke', inspected.stroke || inspected.color || '#6366f1'],
      ['Width', 'studioPropWidth', inspected.width ?? ''],
      ['Height', 'studioPropHeight', inspected.height ?? ''],
      ['Stroke width', 'studioPropStrokeWidth', inspected.strokeWidth ?? ''],
      ['Font size', 'studioPropFontSize', inspected.fontSize ?? ''],
    ].forEach(([labelText, key, value]) => {
      const input = document.createElement('input');
      input.className = 'input input-sm';
      input.dataset[key] = '';
      input.placeholder = labelText;
      input.value = String(value ?? '');
      input.style.maxWidth = '130px';
      row.appendChild(input);
    });
    wrap.appendChild(row);
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'btn btn-primary btn-sm';
    apply.dataset.studioApplyProps = inspected.id;
    apply.textContent = 'Apply properties';
    wrap.appendChild(apply);
    if (inspected.linkType || inspected.linkTarget) {
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'btn btn-ghost btn-sm';
      open.dataset.openStudioLink = inspected.id;
      open.textContent = 'Open linked resource';
      wrap.appendChild(open);
    }
    propertiesRoot.replaceChildren(wrap);
  };
  const canvas = document.getElementById('studio-canvas');
  if (canvas) {
    // A first stroke should immediately remove the empty-board hint.
    // The hint never intercepts pointers, and inspector refresh handles
    // notes, cards, imported and restored board content.
    on(canvas, 'pointerdown', () => {
      const hint = document.querySelector('[data-studio-empty-hint]');
      if (hint) hint.hidden = true;
    });
    // Canvas drawing coordinates must match the actual shell at every viewport.
    // A fixed 70vh canvas overflowed its 55/60/66vh parent and clipped strokes.
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    try { window.OpenCourseDeck?.Canvas?.init?.(canvas); } catch (e) { console.warn('[Studio view] init failed', e); }
  }
  const loadSavedBoard = async (quiet = false) => {
    try {
      // The canvas owns the canonical restore of ocd_studio_board: it applies
      // the saved viewport and drops a snapshot whose read raced with a newer
      // change. Reading the key here as well would duplicate the fetch and
      // reintroduce the dual-restore race on mount (two readers of the same
      // key, last writer wins).
      const canvasApi = window.OpenCourseDeck?.Canvas;
      if (canvasApi?.restoreBoard) {
        const restored = await canvasApi.restoreBoard();
        if (restored) {
          setStatus('Saved board loaded');
          renderInspector();
        } else if (!quiet) {
          setStatus('No saved board yet');
        }
        return;
      }
      const board = await window.DB?.getSetting?.(boardKey);
      if (board && typeof board === 'object') {
        window.OpenCourseDeck?.Canvas?.loadState?.(board);
        setStatus('Saved board loaded');
        renderInspector();
      } else if (!quiet) {
        setStatus('No saved board yet');
      }
    } catch {
      setStatus('Load failed');
    }
  };
  const saveBoard = async () => {
    try {
      const board = window.OpenCourseDeck?.Canvas?.serialize?.();
      if (!board || typeof window.DB?.saveSetting !== 'function') throw new Error('Studio storage unavailable');
      const receipt = await window.DB.saveSetting(boardKey, board);
      if (!acknowledgedStudioWrite(receipt, board)) throw new Error('Studio save was not acknowledged');
      setStatus(`Saved ${new Date().toLocaleTimeString()}`);
      Toast.success('Studio board saved');
    } catch {
      setStatus('Save failed');
      Toast.error('Studio save failed');
    }
  };
  const persistBoardChange = async (statusText) => {
    try {
      const board = window.OpenCourseDeck?.Canvas?.serialize?.();
      if (!board || typeof window.DB?.saveSetting !== 'function') throw new Error('Studio storage unavailable');
      const receipt = await window.DB.saveSetting(boardKey, board);
      if (!acknowledgedStudioWrite(receipt, board)) throw new Error('Studio autosave was not acknowledged');
      setStatus(statusText);
      renderInspector();
    } catch {
      setStatus('Autosave failed');
      Toast.error('Studio autosave failed');
    }
  };
  const boardHasElement = (board, elementId) => {
    if (!elementId) return false;
    return (board?.layers || []).some((layer) =>
      (Array.isArray(layer.elements) ? layer.elements : []).some((element) => element?.id === elementId)
    );
  };
  const refreshFromSync = async (payload = {}) => {
    if (payload?.kind !== 'setting' || payload?.record?.key !== boardKey) {
      return { refreshed: false, reason: 'ignored-kind' };
    }
    // Defer while local changes are unsaved — the route's save debounce or the
    // canvas's own autosave debounce. Applying the remote board inside the
    // canvas window would be clobbered by that pending write, so wait for the
    // next sync message.
    const epochRef = window.OpenCourseDeck?.Canvas?.boardEpoch;
    const epochBefore = epochRef ? epochRef() : null;
    if (interactiveSaveTimer || window.OpenCourseDeck?.Canvas?.hasPendingAutosave?.()) {
      setStatus('Studio sync deferred while local changes save');
      return { refreshed: false, reason: 'pending-local-change' };
    }
    try {
      const board = await window.DB?.getSetting?.(boardKey);
      if (!board || typeof board !== 'object' || Array.isArray(board)) {
        return { refreshed: false, reason: 'missing-board' };
      }
      if (epochRef && epochRef() !== epochBefore) {
        // A newer board is already live in the canvas — a local edit or
        // another load won while this read was in flight. Applying this
        // snapshot now would clobber it.
        setStatus('Studio sync deferred while board changed');
        return { refreshed: false, reason: 'board-changed-during-sync' };
      }
      const loaded = window.OpenCourseDeck?.Canvas?.loadState?.(board, {
        preserveSelection: true,
        preserveTool: true,
        preserveViewport: true,
      });
      if (!loaded) return { refreshed: false, reason: 'load-unavailable' };
      if (!boardHasElement(loaded, inspectedElementId)) inspectedElementId = null;
      renderInspector();
      updateToolButtons();
      setStatus('Studio board synced');
      const selectedIds = window.OpenCourseDeck?.Canvas?.getState?.()?.selectedIds || [];
      const result = {
        refreshed: true,
        key: boardKey,
        selectedIds,
        inspectedElementId,
      };
      window.OpenCourseDeck?.bus?.emit?.('studio:sync-refresh', result);
      return result;
    } catch {
      setStatus('Studio sync failed');
      return { refreshed: false, reason: 'load-failed' };
    }
  };
  const bindSyncRefresh = () => {
    const bus = window.OpenCourseDeck?.bus;
    if (!bus?.on || syncHandler) return;
    syncHandler = (payload) => {
      refreshFromSync(payload).catch?.(() => {});
    };
    bus.on('sync:message', syncHandler);
  };
  const unbindSyncRefresh = () => {
    if (syncHandler) window.OpenCourseDeck?.bus?.off?.('sync:message', syncHandler);
    syncHandler = null;
  };
  const readDroppedImageFile = (file) => new Promise((resolve, reject) => {
    if (!file || !/^image\//i.test(file.type || '')) {
      reject(new Error('Dropped file is not an image'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Dropped image could not be read'));
    reader.readAsDataURL(file);
  });
  const getDropImageSource = async (event) => {
    const files = Array.from(event.dataTransfer?.files || []);
    const imageFile = files.find((file) => /^image\//i.test(file.type || ''));
    if (imageFile) return readDroppedImageFile(imageFile);
    const uri = event.dataTransfer?.getData?.('text/uri-list') || '';
    const text = event.dataTransfer?.getData?.('text/plain') || '';
    return String(uri || text || '').split(/\r?\n/).find((line) => line.trim() && !line.trim().startsWith('#'))?.trim() || '';
  };
  const updateToolButtons = () => {
    const tool = window.OpenCourseDeck?.Canvas?.getState?.()?.tool || 'pen';
    document.querySelectorAll('[data-studio-tool]').forEach((button) => {
      const active = button.dataset.studioTool === tool;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  };
  on(canvas, 'ocd:studio-board-change', () => {
    renderInspector();
    clearTimeout(interactiveSaveTimer);
    interactiveSaveTimer = setTimeout(() => {
      // Reset before persisting: refreshFromSync treats a truthy timer id
      // as "local change pending" and would otherwise drop every future
      // cross-tab sync message for this board.
      interactiveSaveTimer = null;
      persistBoardChange('Board updated');
    }, 120);
  });
  let spatialGraphInstance = null;
  // Set by unmount() so async work started while the route was alive (the 3D
  // graph's note fetch) can bail out instead of mounting into detached DOM.
  let unmounted = false;
  const konvaDialog = document.querySelector('[data-studio-konva-dialog]');
  const konvaOpen = document.querySelector('[data-studio-konva-open]');
  const konvaSelect = document.querySelector('[data-studio-konva-object]');
  const konvaTextInput = document.querySelector('[data-studio-konva-text]');
  const konvaTextSave = document.querySelector('[data-studio-konva-text-save]');
  const konvaStage = document.querySelector('[data-studio-konva-stage]');
  const konvaStatus = document.querySelector('[data-studio-konva-status]');
  let konvaWorkspace = null;
  // Durable snapshot last observed by this editor. Reset and import must use
  // this exact opened revision, not freshly read another tab's newer board.
  let persistedKonvaDraft = null;
  let konvaModule = null;
  let konvaOpening = false;
  let konvaClosing = false;
  let konvaResetting = false;
  let konvaImporting = false;
  let konvaTextSaving = false;
  let konvaKeyboardBusy = false;
  let konvaTextIdentity = '';
  let konvaTextBaseline = '';
  let focusBeforeKonva = null;
  const setKonvaStatus = message => {
    if (konvaStatus) konvaStatus.textContent = message;
  };
  const selectedKonvaText = () => {
    const id = konvaSelect?.value;
    if (!id || !konvaWorkspace || konvaWorkspace.getMode?.() === 'pen') return null;
    const board = konvaWorkspace.getBoard();
    for (const layer of board.layers || []) {
      if (layer.locked || layer.visible === false) continue;
      const element = (layer.elements || []).find(item => String(item.id) === id);
      if (element) return element.type === 'text' ? element : null;
    }
    return null;
  };
  const refreshKonvaControls = () => {
    const selected = konvaSelect?.value || '';
    const mode = konvaWorkspace?.getMode?.() || 'select';
    const textElement = selectedKonvaText();
    const identity = textElement ? selected : '';
    const canonicalText = textElement ? String(textElement.text ?? '') : '';
    if (konvaTextInput) {
      // Preserve unsaved input across a redraw of the same object; sync
      // canonical text after undo/redo when the input is not dirty.
      if (identity !== konvaTextIdentity
        || (konvaTextInput.value === konvaTextBaseline && konvaTextBaseline !== canonicalText)) {
        konvaTextInput.value = canonicalText;
      }
      konvaTextIdentity = identity;
      konvaTextBaseline = canonicalText;
      const writable = Boolean(textElement) && !konvaTextSaving && !konvaKeyboardBusy && !konvaClosing
        && !konvaResetting && !konvaImporting;
      konvaTextInput.disabled = !writable;
      if (konvaTextSave) konvaTextSave.disabled = !writable || konvaTextInput.value === canonicalText;
    }
    document.querySelectorAll('[data-studio-konva-mode]').forEach(button => {
      const active = button.dataset.studioKonvaMode === mode;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.classList.toggle('active', active);
    });
    if (konvaSelect) konvaSelect.disabled = mode === 'pen' || konvaTextSaving || konvaKeyboardBusy;
    document.querySelectorAll('[data-studio-konva-add]').forEach(button => {
      const board = konvaWorkspace?.getBoard?.();
      const layer = board?.layers?.[board.activeLayerIdx ?? 0];
      button.disabled = !konvaWorkspace?.addShape || !layer || layer.locked === true
        || layer.visible === false || konvaTextSaving || konvaKeyboardBusy
        || konvaClosing || konvaResetting || konvaImporting;
    });
    document.querySelectorAll('[data-studio-konva-nudge]').forEach(button => {
      button.disabled = !selected || mode === 'pen' || konvaTextSaving || konvaKeyboardBusy;
    });
    document.querySelectorAll('[data-studio-konva-reorder]').forEach(button => {
      let allowed = false;
      if (selected && mode !== 'pen' && !konvaTextSaving && !konvaKeyboardBusy
          && !konvaClosing && !konvaResetting && !konvaImporting
          && typeof konvaWorkspace?.reorder === 'function') {
        const board = konvaWorkspace.getBoard();
        for (const layer of board.layers || []) {
          if (layer.locked || layer.visible === false) continue;
          const index = (layer.elements || []).findIndex(element => String(element.id) === selected);
          if (index < 0) continue;
          allowed = button.dataset.studioKonvaReorder === 'forward'
            ? index < layer.elements.length - 1 : index > 0;
          break;
        }
      }
      button.disabled = !allowed;
    });
    const undo = document.querySelector('[data-studio-konva-undo]');
    const redo = document.querySelector('[data-studio-konva-redo]');
    if (undo) undo.disabled = !konvaWorkspace?.canUndo?.();
    if (redo) redo.disabled = !konvaWorkspace?.canRedo?.();
  };
  const populateKonvaObjects = () => {
    if (!konvaSelect || !konvaWorkspace) return;
    const board = konvaWorkspace.getBoard();
    const options = [];
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select an object';
    options.push(placeholder);
    for (const layer of board.layers || []) {
      if (layer.locked || layer.visible === false) continue;
      for (const element of layer.elements || []) {
        const option = document.createElement('option');
        option.value = String(element.id);
        option.textContent = String(element.type || 'Shape') + ': ' + String(element.id);
        options.push(option);
      }
    }
    const previous = konvaSelect.value;
    konvaSelect.replaceChildren(...options);
    konvaSelect.value = options.some(option => option.value === previous) ? previous : '';
    refreshKonvaControls();
  };
  const disposeKonva = ({ restoreFocus = true } = {}) => {
    konvaWorkspace?.destroy?.();
    konvaWorkspace = null;
    persistedKonvaDraft = null;
    if (konvaDialog?.open) {
      if (typeof konvaDialog.close === 'function') konvaDialog.close();
      else konvaDialog.removeAttribute('open');
    }
    if (restoreFocus) focusBeforeKonva?.focus?.();
  };
  const closeKonvaDraft = async () => {
    if (konvaClosing) return;
    konvaClosing = true;
    try {
      // Never reopen a snapshot while the previous session still has an
      // unresolved write to the same isolated draft key.
      await konvaWorkspace?.flush?.();
    } catch {
      setKonvaStatus('An experimental draft edit did not save');
    } finally {
      disposeKonva();
      konvaClosing = false;
    }
  };
  const createKonvaWorkspace = (source, loaded, { persistedDraft = source } = {}) => {
    const db = window.DB;
    const previousWorkspace = konvaWorkspace;
    // Null means the user opted into a fresh lab copy of the live Canvas2D
    // board. This does not yet exist under the isolated draft storage key.
    let lastSavedDraft = persistedDraft == null ? null : structuredClone(persistedDraft);
    const sameBoard = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const candidate = loaded.createStudioKonvaDraftWorkspace({
      container: konvaStage,
      board: source,
      // Only this experimental key is writable here. The live canvas owns
      // ocd_studio_board and its independent autosave/restore epoch.
      saveDraft: async changed => {
        if (typeof db?.getSetting !== 'function' || typeof db?.saveSetting !== 'function') {
          throw new Error('Canonical draft storage unavailable');
        }
        if (typeof db.compareAndSwapSetting === 'function') {
          const accepted = await db.compareAndSwapSetting(loaded.DRAFT_KEY, lastSavedDraft, changed);
          if (!accepted) throw new Error('Konva draft changed in another tab. Reopen the draft before editing.');
          lastSavedDraft = structuredClone(changed);
          persistedKonvaDraft = structuredClone(changed);
          return true;
        }
        // Compatibility path for test facades without transactional support.
        // Production uses the canonical CAS above, never this unlocked path.
        const before = await db.getSetting(loaded.DRAFT_KEY);
        if (!sameBoard(before, lastSavedDraft)) {
          throw new Error('Konva draft changed in another tab. Reopen the draft before editing.');
        }
        const receipt = await db.saveSetting(loaded.DRAFT_KEY, changed);
        if (!acknowledgedStudioWrite(receipt, changed)) {
          throw new Error('Konva draft write was not acknowledged');
        }
        const verified = await db.getSetting(loaded.DRAFT_KEY);
        if (!sameBoard(verified, changed)) {
          throw new Error('Konva draft was not saved durably: canonical readback differed');
        }
        lastSavedDraft = structuredClone(verified);
        persistedKonvaDraft = structuredClone(verified);
        return true;
      },
      onSelect: id => {
        if (konvaSelect) konvaSelect.value = id || '';
        refreshKonvaControls();
      },
      onStatus: message => {
        setKonvaStatus(message);
        populateKonvaObjects();
        refreshKonvaControls();
      },
      onError: () => setKonvaStatus('Experimental draft save failed; earlier draft retained'),
    });
    // Do not destroy the currently editable board until the new renderer has
    // passed its own validation and mounted successfully.
    previousWorkspace?.destroy?.();
    konvaWorkspace = candidate;
    persistedKonvaDraft = lastSavedDraft == null ? null : structuredClone(lastSavedDraft);
    populateKonvaObjects();
    return konvaWorkspace;
  };
  const openKonvaDraft = async () => {
    if (unmounted || konvaOpening || konvaClosing || konvaWorkspace) return;
    konvaOpening = true;
    focusBeforeKonva = document.activeElement;
    try {
      const loaded = await loadKonvaDraft();
      if (unmounted) return;
      if (!window.DB?.getSetting || !window.DB?.saveSetting) {
        throw new Error('Experimental draft storage unavailable');
      }
      const savedDraft = await window.DB.getSetting(loaded.DRAFT_KEY);
      if (unmounted) return;
      const source = savedDraft ?? window.OpenCourseDeck?.Canvas?.serialize?.();
      if (!source) throw new Error('Studio board unavailable');
      konvaModule = loaded;
      if (typeof konvaDialog?.showModal === 'function') konvaDialog.showModal();
      else konvaDialog?.setAttribute('open', '');
      createKonvaWorkspace(source, loaded, { persistedDraft: savedDraft });
      setKonvaStatus(savedDraft
        ? 'Resumed separately saved Konva draft'
        : 'Copied Studio board into an isolated draft; Studio remains unchanged');
    } catch {
      if (!unmounted) {
        disposeKonva();
        setStatus('Konva draft unavailable (incompatible board or storage)');
      }
    } finally {
      konvaOpening = false;
    }
  };
  on(konvaOpen, 'click', () => { openKonvaDraft().catch(() => {}); });
  on(document.querySelector('[data-studio-konva-close]'), 'click', () => { closeKonvaDraft().catch(() => {}); });
  on(konvaDialog, 'cancel', event => {
    event.preventDefault();
    closeKonvaDraft().catch(() => {});
  });
  on(konvaDialog, 'close', () => disposeKonva());
  on(konvaSelect, 'change', () => {
    konvaWorkspace?.select?.(konvaSelect.value || null);
    refreshKonvaControls();
  });
  const konvaArrowMoves = Object.freeze({
    ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    ArrowUp: [0, -1], ArrowDown: [0, 1],
  });
  // Only focused, accessible draft stage shortcuts are intercepted. Text
  // inputs, selects and the main Canvas2D editor retain native keyboard use.
  on(konvaStage, 'keydown', async event => {
    if (event.target !== konvaStage || unmounted || !konvaWorkspace || konvaClosing
        || konvaResetting || konvaImporting || konvaTextSaving) return;
    const previous = konvaWorkspace;
    const selected = konvaSelect?.value || '';
    if (event.key === 'Escape' && selected) {
      event.preventDefault();
      konvaSelect.value = '';
      previous.select(null);
      refreshKonvaControls();
      return;
    }

    const shortcut = (event.ctrlKey || event.metaKey) && !event.altKey;
    const key = String(event.key).toLowerCase();
    const historyAction = shortcut
      ? (key === 'z' ? (event.shiftKey ? 'redo' : 'undo')
        : key === 'y' ? 'redo' : null)
      : null;
    const move = !event.altKey && !event.ctrlKey && !event.metaKey
      && previous.getMode?.() === 'select' && selected
      ? konvaArrowMoves[event.key] : null;
    if (!historyAction && !move) return;
    event.preventDefault();
    if (konvaKeyboardBusy) return;
    if (historyAction) {
      const allowed = historyAction === 'undo' ? previous.canUndo?.() : previous.canRedo?.();
      if (!allowed) return;
    }
    konvaKeyboardBusy = true;
    refreshKonvaControls();
    try {
      if (historyAction) {
        await previous[historyAction]();
        if (!unmounted && konvaWorkspace === previous) populateKonvaObjects();
      } else {
        const pixels = event.shiftKey ? 10 : 1;
        await previous.move(selected, move[0] * pixels, move[1] * pixels);
      }
      if (!unmounted && konvaWorkspace === previous) {
        setKonvaStatus('Experimental draft keyboard edit saved; Studio board unchanged');
      }
    } catch {
      if (!unmounted && konvaWorkspace === previous) {
        setKonvaStatus('Experimental draft keyboard edit not saved');
      }
    } finally {
      konvaKeyboardBusy = false;
      if (!unmounted && konvaWorkspace === previous) refreshKonvaControls();
    }
  });
  on(konvaTextInput, 'input', refreshKonvaControls);
  on(konvaTextSave, 'click', async () => {
    const textElement = selectedKonvaText();
    if (!textElement || !konvaWorkspace?.updateText || konvaTextSaving
      || konvaClosing || konvaResetting || konvaImporting) return;
    const currentWorkspace = konvaWorkspace;
    const id = konvaSelect?.value;
    const content = konvaTextInput.value;
    if (content === String(textElement.text ?? '')) return;
    konvaTextSaving = true;
    refreshKonvaControls();
    try {
      await currentWorkspace.updateText(id, content);
      if (unmounted || konvaWorkspace !== currentWorkspace) return;
      populateKonvaObjects();
      setKonvaStatus('Experimental draft text saved; Studio board unchanged');
    } catch {
      if (!unmounted && konvaWorkspace === currentWorkspace) {
        setKonvaStatus('Experimental draft text not saved; unsaved edits retained');
      }
    } finally {
      konvaTextSaving = false;
      if (!unmounted) refreshKonvaControls();
    }
  });
  const konvaImportInput = document.querySelector('[data-studio-konva-import]');
  on(document.querySelector('[data-studio-konva-import-trigger]'), 'click', () => {
    if (!unmounted && konvaWorkspace && !konvaClosing && !konvaResetting && !konvaImporting) {
      konvaImportInput?.click();
    }
  });
  on(document.querySelector('[data-studio-konva-export]'), 'click', async () => {
    if (unmounted || !konvaWorkspace || !konvaModule || konvaClosing || konvaResetting || konvaImporting) return;
    const previous = konvaWorkspace;
    try {
      await previous.flush();
      if (unmounted || konvaWorkspace !== previous) return;
      const json = konvaModule.exportKonvaV1DraftJSON(previous.getBoard());
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const href = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = href;
        link.download = 'farzan-konva-draft-v1.json';
        document.body.appendChild(link);
        try { link.click(); } finally { link.remove(); }
      } finally {
        // Revoke after the browser has had an opportunity to start the save.
        const revoke = URL.revokeObjectURL?.bind(URL);
        setTimeout(() => { try { revoke?.(href); } catch {} }, 1000);
      }
      setKonvaStatus('Experimental draft JSON download started; Studio board unchanged');
    } catch {
      if (!unmounted) setKonvaStatus('Draft JSON export failed; saved board unchanged');
    }
  });
  on(document.querySelector('[data-studio-konva-export-png]'), 'click', async () => {
    if (unmounted || !konvaWorkspace || konvaClosing || konvaResetting || konvaImporting) return;
    const previous = konvaWorkspace;
    try {
      const png = await previous.exportPreviewPng();
      if (unmounted || konvaWorkspace !== previous) return;
      if (typeof downloadDataUrl !== 'function'
        || !downloadDataUrl(png, 'farzan-konva-draft-viewport-preview.png')) {
        throw new Error('Draft PNG download unavailable');
      }
      setKonvaStatus('Experimental draft viewport PNG downloaded; Studio board unchanged');
    } catch {
      if (!unmounted && konvaWorkspace === previous) {
        setKonvaStatus('Draft PNG preview export failed; saved Studio board unchanged');
      }
    }
  });
  on(konvaImportInput, 'change', async () => {
    const file = konvaImportInput?.files?.[0];
    if (konvaImportInput) konvaImportInput.value = '';
    if (!file || unmounted || !konvaWorkspace || !konvaModule
      || konvaClosing || konvaResetting || konvaImporting) return;
    const previous = konvaWorkspace;
    const loaded = konvaModule;
    konvaImporting = true;
    if (konvaStage) konvaStage.inert = true;
    let saved = false;
    try {
      if (file.size > (loaded.MAX_KONVA_DRAFT_JSON_CHARS || 8 * 1024 * 1024)) {
        throw new RangeError('Draft import exceeds JSON size limit');
      }
      const confirmImport = window.OpenCourseDeck?.UI?.confirm || window.confirm;
      const approved = typeof confirmImport === 'function'
        ? await confirmImport('Replace the experimental Konva draft with this JSON file? The main Studio board is unchanged. Download a draft backup first if needed.')
        : false;
      if (!approved) {
        setKonvaStatus('Experimental draft import cancelled');
        return;
      }
      if (unmounted || konvaClosing || konvaWorkspace !== previous) return;
      const contents = await file.text();
      if (unmounted || konvaClosing || konvaWorkspace !== previous) return;
      const imported = loaded.importKonvaV1DraftJSON(contents);
      await previous.flush();
      if (unmounted || konvaClosing || konvaWorkspace !== previous) return;
      const candidate = structuredClone(imported);
      const expected = persistedKonvaDraft;
      // Imported drafts must not overwrite a concurrent edit after confirmation.
      const receipt = typeof window.DB.compareAndSwapSetting === 'function'
        ? await window.DB.compareAndSwapSetting(loaded.DRAFT_KEY, expected, candidate)
        : await window.DB?.saveSetting?.(loaded.DRAFT_KEY, candidate);
      // The canonical bridge resolves saveSetting with the saved value, not
      // necessarily a literal true. Refuse false/null/undefined or unrelated
      // acknowledgments; accept the exact returned board or its JSON clone.
      let valueReceipt = false;
      if (receipt && typeof receipt === 'object' && !Array.isArray(receipt)) {
        try { valueReceipt = JSON.stringify(receipt) === JSON.stringify(candidate); }
        catch { valueReceipt = false; }
      }
      if (receipt !== true && !valueReceipt) throw new Error('Draft import not acknowledged');
      saved = true;
      if (unmounted || konvaClosing || konvaWorkspace !== previous) return;
      createKonvaWorkspace(imported, loaded);
      setKonvaStatus('Imported isolated Konva draft JSON; main Studio board unchanged');
    } catch {
      if (!unmounted) {
        if (saved) {
          // The imported board was durably acknowledged, but its preview
          // failed to mount; do not keep an obsolete writer alive.
          disposeKonva();
          setStatus('Imported draft saved, but preview unavailable. Reopen Konva draft lab.');
        } else {
          setKonvaStatus('Draft JSON import failed; previous draft unchanged');
        }
      }
    } finally {
      konvaImporting = false;
      if (konvaStage) konvaStage.inert = false;
    }
  });
  document.querySelectorAll('[data-studio-konva-mode]').forEach(button => {
    on(button, 'click', () => {
      if (!konvaWorkspace || konvaClosing || konvaResetting || konvaImporting) return;
      try {
        const mode = konvaWorkspace.setMode(button.dataset.studioKonvaMode);
        setKonvaStatus(mode === 'pen'
          ? 'Pen active — draw with one pointer; changes save only to this draft'
          : 'Select active — drag shapes or use resize handles');
        refreshKonvaControls();
      } catch {
        setKonvaStatus('Experimental draft tool unavailable');
      }
    });
  });
  // Shape creation lives on the actual Konva stage. The stage viewport group
  // owns pan/zoom; always transform the visible center back into canonical
  // board-v1 world coordinates before writing a shape.
  document.querySelectorAll('[data-studio-konva-add]').forEach(button => {
    on(button, 'click', async () => {
      const workspace = konvaWorkspace;
      if (unmounted || !workspace?.addShape || button.disabled || konvaKeyboardBusy
        || konvaClosing || konvaResetting || konvaImporting || konvaTextSaving) return;
      konvaKeyboardBusy = true;
      refreshKonvaControls();
      try {
        const board = workspace.getBoard();
        const scale = Number(board.viewport?.zoom ?? 1);
        const offsetX = Number(board.viewport?.offsetX ?? 0);
        const offsetY = Number(board.viewport?.offsetY ?? 0);
        if (![scale, offsetX, offsetY].every(Number.isFinite) || scale <= 0) {
          throw new TypeError('Invalid Konva draft viewport');
        }
        const stageWidth = Math.max(320, Math.floor(konvaStage?.clientWidth || 640));
        const stageHeight = Math.max(280, Math.floor(konvaStage?.clientHeight || 440));
        const x = (stageWidth / 2 - offsetX) / scale;
        const y = (stageHeight / 2 - offsetY) / scale;
        const kind = button.dataset.studioKonvaAdd;
        const shape = kind === 'rect'
          ? { type: 'rect', x: x - 60, y: y - 40, width: 120, height: 80 }
          : kind === 'circle'
            ? { type: 'circle', x, y, radius: 40 } : null;
        if (!shape) throw new TypeError('Unsupported shape tool');
        workspace.setMode('select');
        const result = await workspace.addShape(shape);
        if (unmounted || workspace !== konvaWorkspace || !result) return;
        populateKonvaObjects();
        const added = result.layers?.[result.activeLayerIdx ?? 0]?.elements?.at(-1);
        if (added?.id && konvaSelect) {
          konvaSelect.value = added.id;
          workspace.select(added.id);
        }
        setKonvaStatus('New ' + shape.type + ' saved to isolated Konva draft');
      } catch {
        if (!unmounted && workspace === konvaWorkspace) {
          setKonvaStatus('Konva shape creation failed; previous saved draft retained');
        }
      } finally {
        konvaKeyboardBusy = false;
        if (!unmounted && workspace === konvaWorkspace) refreshKonvaControls();
      }
    });
  });

  const nudge = Object.freeze({
    left: [-10, 0], right: [10, 0], up: [0, -10], down: [0, 10],
  });
  document.querySelectorAll('[data-studio-konva-nudge]').forEach(button => {
    on(button, 'click', async () => {
      const id = konvaSelect?.value;
      if (!id || !konvaWorkspace || konvaImporting) return;
      const [dx, dy] = nudge[button.dataset.studioKonvaNudge] || [0, 0];
      try {
        await konvaWorkspace.move(id, dx, dy);
        refreshKonvaControls();
      } catch { setKonvaStatus('Experimental draft edit not saved'); }
    });
  });
  document.querySelectorAll('[data-studio-konva-reorder]').forEach(button => {
    on(button, 'click', async () => {
      const id = konvaSelect?.value;
      const workspace = konvaWorkspace;
      if (!id || !workspace?.reorder || button.disabled || konvaImporting
          || konvaClosing || konvaResetting || konvaKeyboardBusy || konvaTextSaving) return;
      konvaKeyboardBusy = true;
      refreshKonvaControls();
      try {
        await workspace.reorder(id, button.dataset.studioKonvaReorder);
        if (!unmounted && workspace === konvaWorkspace) {
          populateKonvaObjects();
          refreshKonvaControls();
        }
      } catch {
        setKonvaStatus('Experimental draft stacking change not saved');
      } finally {
        konvaKeyboardBusy = false;
        if (!unmounted && workspace === konvaWorkspace) refreshKonvaControls();
      }
    });
  });
  for (const action of ['undo', 'redo']) {
    on(document.querySelector('[data-studio-konva-' + action + ']'), 'click', async () => {
      if (!konvaWorkspace || konvaImporting) return;
      try {
        await konvaWorkspace[action]();
        populateKonvaObjects();
        refreshKonvaControls();
      } catch { setKonvaStatus('Experimental draft history change not saved'); }
    });
  }
  on(document.querySelector('[data-studio-konva-reset]'), 'click', async () => {
    if (!konvaWorkspace || !konvaModule || konvaResetting || konvaClosing || konvaImporting) return;
    const confirmReset = window.OpenCourseDeck?.UI?.confirm || window.confirm;
    let approved;
    try { approved = typeof confirmReset === 'function'
      ? await confirmReset('Replace the experimental Konva draft with a new copy of the Studio board?') : false; }
    catch { return; }
    if (!approved) return;
    const source = window.OpenCourseDeck?.Canvas?.serialize?.();
    if (!source || !konvaModule.isKonvaDraftCompatible?.(source)) {
      setKonvaStatus('Current Studio board is not supported by this experimental editor');
      return;
    }
    konvaResetting = true;
    if (konvaStage) konvaStage.inert = true;
    try {
      const previous = konvaWorkspace;
      await previous.flush();
      if (unmounted || konvaWorkspace !== previous) return;
      const expected = persistedKonvaDraft;
      const receipt = typeof window.DB.compareAndSwapSetting === 'function'
        ? await window.DB.compareAndSwapSetting(konvaModule.DRAFT_KEY, expected, structuredClone(source))
        : await window.DB.saveSetting(konvaModule.DRAFT_KEY, structuredClone(source));
      if (!receipt) throw new Error('Draft reset not acknowledged');
      if (unmounted || konvaWorkspace !== previous) return;
      createKonvaWorkspace(source, konvaModule);
      setKonvaStatus('New isolated Konva draft copied from Studio');
    } catch { setKonvaStatus('Draft reset failed; saved Studio board untouched'); }
    finally {
      konvaResetting = false;
      if (konvaStage) konvaStage.inert = false;
    }
  });
  const toggle3DGraph = async () => {
    const shell = document.querySelector('.studio-shell');
    const btn3D = document.querySelector('[data-studio-mode="3d"]');
    if (!shell) return;

    if (spatialGraphInstance) {
      spatialGraphInstance.dispose();
      spatialGraphInstance = null;
      if (canvas) canvas.style.display = 'block';
      const existingGraph = shell.querySelector('.spatial-graph-wrapper');
      if (existingGraph) existingGraph.remove();

      if (btn3D) {
        btn3D.classList.remove('active', 'btn-primary');
        btn3D.classList.add('btn-ghost');
        btn3D.setAttribute('aria-pressed', 'false');
      }
      setStatus('Returned to 2D Whiteboard');
    } else {
      if (canvas) canvas.style.display = 'none';
      const graphWrap = document.createElement('div');
      graphWrap.className = 'spatial-graph-wrapper';
      graphWrap.style.width = '100%';
      graphWrap.style.height = '100%';
      graphWrap.style.minHeight = '500px';
      shell.appendChild(graphWrap);

      let notes = [];
      try {
        notes = await window.DB?.getAllNotes?.() ?? [];
      } catch {}
      // The await above can outlive the route: if unmount() already disposed the
      // graph and tore the view down, mounting now would start a RAF loop and
      // window-level listeners against detached DOM that nothing ever cleans up.
      if (unmounted) return;
      if (!shell.isConnected) return;

      spatialGraphInstance = new SpatialKnowledgeGraph();
      spatialGraphInstance.mount(graphWrap, notes);
      spatialGraphInstance.on('node:select', (item) => {
        setStatus(`3D Node selected: ${item.title || item.id}`);
      });

      if (btn3D) {
        btn3D.classList.add('active', 'btn-primary');
        btn3D.classList.remove('btn-ghost');
        btn3D.setAttribute('aria-pressed', 'true');
      }
      setStatus('3D Spatial Graph active (drag to rotate)');
    }
  };

  const btn3D = document.querySelector('[data-studio-mode="3d"]');
  if (btn3D) {
    on(btn3D, 'click', () => {
      toggle3DGraph().catch(() => {});
    });
  }

  document.querySelectorAll('[data-studio-tool]').forEach((button) => {
    on(button, 'click', () => {
      if (spatialGraphInstance) {
        toggle3DGraph().catch(() => {});
      }
      const selected = window.OpenCourseDeck?.Canvas?.setTool?.(button.dataset.studioTool);
      setStatus(`${selected === 'pen' ? 'Pen' : 'Select'} tool active`);
      updateToolButtons();
    });
  });
  on(canvas, 'dragover', (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });
  on(canvas, 'drop', async (event) => {
    event.preventDefault();
    try {
      const source = await getDropImageSource(event);
      const point = window.OpenCourseDeck?.Canvas?.screenToWorld?.(event.clientX, event.clientY) || { x: 120, y: 120 };
      const element = window.OpenCourseDeck?.Canvas?.addImage?.(source, {
        x: Math.max(0, point.x - 140),
        y: Math.max(0, point.y - 80),
      });
      if (!element) throw new Error('Dropped media was rejected');
      await persistBoardChange('Dropped image added');
    } catch {
      setStatus('Drop failed');
      Toast.error('Studio drop rejected');
    }
  });
  updateToolButtons();
  on(document.querySelector('[data-studio-add-text]'), 'click', async () => {
    const input = document.querySelector('[data-studio-text]');
    const text = String(input?.value || 'New note').trim() || 'New note';
    const element = window.OpenCourseDeck?.Canvas?.addText?.(text);
    if (!element) {
      setStatus('Add note failed');
      return;
    }
    if (input) input.value = '';
    await persistBoardChange('Note added');
  });
  on(document.querySelector('[data-studio-add-card]'), 'click', async () => {
    const element = window.OpenCourseDeck?.Canvas?.addCard?.();
    if (!element) {
      setStatus('Add card failed');
      return;
    }
    await persistBoardChange('Card added');
  });
  on(document.querySelector('[data-studio-add-rect]'), 'click', async () => {
    const element = window.OpenCourseDeck?.Canvas?.addRectangle?.();
    if (!element) {
      setStatus('Add rectangle failed');
      return;
    }
    await persistBoardChange('Rectangle added');
  });
  on(document.querySelector('[data-studio-add-circle]'), 'click', async () => {
    const element = window.OpenCourseDeck?.Canvas?.addCircle?.();
    if (!element) {
      setStatus('Add circle failed');
      return;
    }
    await persistBoardChange('Circle added');
  });
  on(document.querySelector('[data-studio-add-arrow]'), 'click', async () => {
    const element = window.OpenCourseDeck?.Canvas?.addArrow?.();
    if (!element) {
      setStatus('Add arrow failed');
      return;
    }
    await persistBoardChange('Arrow added');
  });
  on(document.querySelector('[data-studio-add-image]'), 'click', async () => {
    const input = document.querySelector('[data-studio-image-url]');
    const src = String(input?.value || '').trim();
    const element = window.OpenCourseDeck?.Canvas?.addImage?.(src);
    if (!element) {
      setStatus('Add image failed');
      Toast.error('Studio image URL rejected');
      return;
    }
    if (input) input.value = '';
    await persistBoardChange('Image added');
  });
  on(document.querySelector('[data-studio-apply-template]'), 'click', async () => {
    const value = document.querySelector('[data-studio-template]')?.value || 'study-map';
    const ok = await window.OpenCourseDeck?.UI?.confirm?.('Replace the current Studio board with this template?');
    if (!ok) return;
    const board = window.OpenCourseDeck?.Canvas?.applyTemplate?.(value);
    if (!board) {
      setStatus('Template failed');
      return;
    }
    if (window.DB?.saveSetting) await window.DB.saveSetting(boardKey, board);
    inspectedElementId = null;
    setStatus('Template applied');
    renderInspector();
  });
  on(document.querySelector('[data-studio-clear]'), 'click', async () => {
    const ok = await window.OpenCourseDeck?.UI?.confirm?.('Clear the current Studio board?');
    if (!ok) return;
    const board = window.OpenCourseDeck?.Canvas?.clearBoard?.();
    if (!board) {
      setStatus('Clear failed');
      return;
    }
    if (window.DB?.saveSetting) await window.DB.saveSetting(boardKey, board);
    setStatus('Board cleared');
    renderInspector();
  });
  on(document.querySelector('[data-studio-add-layer]'), 'click', async () => {
    const input = document.querySelector('[data-studio-layer-name]');
    const name = String(input?.value || '').trim();
    const layer = window.OpenCourseDeck?.Canvas?.addLayer?.(name);
    if (!layer) {
      setStatus('Add layer failed');
      return;
    }
    if (input) input.value = '';
    await persistBoardChange('Layer added');
  });
  on(document.querySelector('[data-studio-layers]'), 'click', async (event) => {
    const target = event.target?.closest?.('button');
    if (!target) return;
    if (target.dataset.setLayer != null) {
      window.OpenCourseDeck?.Canvas?.setActiveLayer?.(Number(target.dataset.setLayer));
      await persistBoardChange('Active layer changed');
    } else if (target.dataset.deleteLayer) {
      const removed = window.OpenCourseDeck?.Canvas?.removeLayer?.(target.dataset.deleteLayer);
      if (removed) await persistBoardChange('Layer deleted');
    }
  });
  on(document.querySelector('[data-studio-elements]'), 'click', async (event) => {
    const inspectTarget = event.target?.closest?.('[data-inspect-element]');
    if (inspectTarget) {
      inspectedElementId = inspectTarget.dataset.inspectElement;
      renderInspector();
      return;
    }
    const openTarget = event.target?.closest?.('[data-open-studio-link]');
    if (openTarget) {
      const board = window.OpenCourseDeck?.Canvas?.serialize?.();
      const element = (board?.layers || [])
        .flatMap((layer) => Array.isArray(layer.elements) ? layer.elements : [])
        .find((item) => item?.id === openTarget.dataset.openStudioLink);
      openStudioLink(element);
      return;
    }
    const target = event.target?.closest?.('[data-delete-element]');
    if (!target) return;
    const removed = window.OpenCourseDeck?.Canvas?.removeElement?.(target.dataset.deleteElement);
    if (removed) {
      if (inspectedElementId === target.dataset.deleteElement) inspectedElementId = null;
      await persistBoardChange('Element deleted');
    }
  });
  on(document.querySelector('[data-studio-properties]'), 'click', async (event) => {
    const openTarget = event.target?.closest?.('[data-open-studio-link]');
    if (openTarget) {
      const board = window.OpenCourseDeck?.Canvas?.serialize?.();
      const element = (board?.layers || [])
        .flatMap((layer) => Array.isArray(layer.elements) ? layer.elements : [])
        .find((item) => item?.id === openTarget.dataset.openStudioLink);
      openStudioLink(element);
      return;
    }
    const target = event.target?.closest?.('[data-studio-apply-props]');
    if (!target) return;
    const root = document.querySelector('[data-studio-properties]');
    const patch = {
      text: root?.querySelector?.('[data-studio-prop-text]')?.value ?? '',
      x: root?.querySelector?.('[data-studio-prop-x]')?.value ?? '',
      y: root?.querySelector?.('[data-studio-prop-y]')?.value ?? '',
      fill: root?.querySelector?.('[data-studio-prop-fill]')?.value ?? '',
      stroke: root?.querySelector?.('[data-studio-prop-stroke]')?.value ?? '',
      width: root?.querySelector?.('[data-studio-prop-width]')?.value ?? '',
      height: root?.querySelector?.('[data-studio-prop-height]')?.value ?? '',
      strokeWidth: root?.querySelector?.('[data-studio-prop-stroke-width]')?.value ?? '',
      fontSize: root?.querySelector?.('[data-studio-prop-font-size]')?.value ?? '',
      linkType: root?.querySelector?.('[data-studio-prop-link-type]')?.value ?? '',
      linkTarget: root?.querySelector?.('[data-studio-prop-link-target]')?.value ?? '',
      linkLabel: root?.querySelector?.('[data-studio-prop-link-label]')?.value ?? '',
    };
    const updated = window.OpenCourseDeck?.Canvas?.updateElement?.(target.dataset.studioApplyProps, patch);
    if (updated) await persistBoardChange('Properties updated');
  });
  on(document.querySelector('[data-studio-save]'), 'click', saveBoard);
  on(document.querySelector('[data-studio-load]'), 'click', () => loadSavedBoard(false));
  const importInput = document.querySelector('[data-studio-import-file]');
  on(document.querySelector('[data-studio-import-json]'), 'click', () => importInput?.click?.());
  on(importInput, 'change', async () => {
    const file = importInput?.files?.[0];
    if (!file) return;
    const canvasApi = window.OpenCourseDeck?.Canvas;
    let previous = null;
    let importedEpoch = null;
    let importApplied = false;
    try {
      if (!canvasApi?.loadState || !canvasApi?.serialize
        || typeof window.DB?.saveSetting !== 'function') {
        throw new Error('Studio import storage is unavailable');
      }
      const text = await file.text();
      const board = JSON.parse(text);
      if (!board || typeof board !== 'object' || Array.isArray(board)) throw new Error('Invalid Studio board');
      previous = canvasApi.serialize();
      if (!previous) throw new Error('Studio rollback snapshot unavailable');
      // Restore the current display if durable import fails, but never
      // overwrite a newer local edit that arrived during the async write.
      const loaded = canvasApi.loadState(board);
      if (!loaded) throw new Error('Studio import unavailable');
      importApplied = true;
      importedEpoch = canvasApi.boardEpoch?.() ?? null;
      const receipt = await window.DB.saveSetting(boardKey, loaded);
      if (!acknowledgedStudioWrite(receipt, loaded)) {
        throw new Error('Studio import was not acknowledged');
      }
      if (importedEpoch != null && canvasApi.boardEpoch?.() !== importedEpoch) {
        setStatus('Studio changed during import; verify current board');
        return;
      }
      setStatus('JSON imported');
      renderInspector();
      Toast.success('Studio board imported');
    } catch {
      if (importApplied && previous &&
        (importedEpoch == null || canvasApi?.boardEpoch?.() === importedEpoch)) {
        try { canvasApi.loadState(previous); } catch { /* Keep original error feedback. */ }
      }
      setStatus('JSON import failed');
      Toast.error('Studio JSON import failed');
    } finally {
      if (importInput) importInput.value = '';
    }
  });
  on(document.querySelector('[data-studio-export-json]'), 'click', () => {
    try {
      const board = window.OpenCourseDeck?.Canvas?.serialize?.();
      if (!board) throw new Error('Studio export unavailable');
      downloadTextFile(JSON.stringify(board, null, 2), `opencoursedeck-studio-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
      setStatus('JSON exported');
    } catch {
      setStatus('JSON export failed');
      Toast.error('Studio JSON export failed');
    }
  });
  on(document.querySelector('[data-studio-export-svg]'), 'click', () => {
    try {
      const svg = window.OpenCourseDeck?.Canvas?.exportSVG?.();
      if (!svg) throw new Error('Studio SVG export unavailable');
      downloadTextFile(svg, `opencoursedeck-studio-${new Date().toISOString().slice(0, 10)}.svg`, 'image/svg+xml');
      setStatus('SVG exported');
    } catch {
      setStatus('SVG export failed');
      Toast.error('Studio SVG export failed');
    }
  });
  on(document.querySelector('[data-studio-export-png]'), 'click', () => {
    try {
      const dataUrl = window.OpenCourseDeck?.Canvas?.exportPNG?.();
      if (!downloadDataUrl(dataUrl, `opencoursedeck-studio-${new Date().toISOString().slice(0, 10)}.png`)) throw new Error('Studio PNG export unavailable');
      setStatus('PNG exported');
    } catch {
      setStatus('PNG export failed');
      Toast.error('Studio PNG export failed');
    }
  });
  on(document.querySelector('[data-studio-export-pdf]'), 'click', () => {
    try {
      const svg = window.OpenCourseDeck?.Canvas?.exportSVG?.();
      const png = svg ? '' : window.OpenCourseDeck?.Canvas?.exportPNG?.();
      if (!printStudioBoardPdf({ svg, png })) throw new Error('Studio PDF export unavailable');
      setStatus('PDF export opened');
    } catch {
      setStatus('PDF export failed');
      Toast.error('Studio PDF export failed');
    }
  });
  loadSavedBoard(true);
  loadStudioLinkOptions();
  renderInspector();
  bindSyncRefresh();
  return {
    refreshFromSync,
    unmount() {
      unmounted = true;
      disposeKonva({ restoreFocus: false });
      unbindSyncRefresh();
      clearTimeout(interactiveSaveTimer);
      routeListeners.forEach(({ target, type, handler, options }) => {
        try { target.removeEventListener(type, handler, options); } catch {}
      });
      try { spatialGraphInstance?.dispose?.(); } catch {}
      try { window.OpenCourseDeck?.Canvas?.destroy?.(); } catch {}
    },
  };
}



