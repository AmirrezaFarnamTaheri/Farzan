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
  } = deps;

  setView(`
    <section class="view view-studio">
      <div class="page-header studio-header">
        <div>
          <span class="eyebrow">Interactive Canvas</span>
          <h1 class="page-title">Studio</h1>
          <p class="page-subtitle">Whiteboard canvas with portable board storage, Cornell templates, and vector shapes.</p>
        </div>
        <div class="studio-status-pill" aria-live="polite">
          <span data-studio-status>Ready</span>
        </div>
      </div>

      <div class="card card-filled studio-toolbar-panel">
        <div class="studio-toolbar-clusters">
          <div class="studio-tool-group" role="group" aria-label="Canvas tools">
            <button class="btn btn-ghost btn-sm" data-studio-tool="select" aria-pressed="false" title="Select Tool">
              <i class="fa-solid fa-arrow-pointer" aria-hidden="true"></i>
              <span>Select</span>
            </button>
            <button class="btn btn-ghost btn-sm" data-studio-tool="pen" aria-pressed="true" title="Pen Tool">
              <i class="fa-solid fa-pen" aria-hidden="true"></i>
              <span>Pen</span>
            </button>
          </div>

          <div class="studio-tool-group" role="group" aria-label="Notes and cards">
            <input class="input input-sm" data-studio-text placeholder="Board note..." style="width:160px" aria-label="Board note text" />
            <button class="btn btn-primary btn-sm" data-studio-add-text title="Add Note">
              <i class="fa-solid fa-plus" aria-hidden="true"></i>
              <span>Note</span>
            </button>
            <button class="btn btn-ghost btn-sm" data-studio-add-card title="Add Card">
              <i class="fa-solid fa-clone" aria-hidden="true"></i>
              <span>Card</span>
            </button>
          </div>

          <div class="studio-tool-group" role="group" aria-label="Geometric shapes">
            <button class="btn btn-ghost btn-sm" data-studio-add-rect title="Rectangle">
              <i class="fa-regular fa-square" aria-hidden="true"></i>
              <span>Rect</span>
            </button>
            <button class="btn btn-ghost btn-sm" data-studio-add-circle title="Circle">
              <i class="fa-regular fa-circle" aria-hidden="true"></i>
              <span>Circle</span>
            </button>
            <button class="btn btn-ghost btn-sm" data-studio-add-arrow title="Arrow">
              <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
              <span>Arrow</span>
            </button>
          </div>

          <div class="studio-tool-group" role="group" aria-label="Media and templates">
            <input class="input input-sm" data-studio-image-url placeholder="Image URL..." style="width:140px" aria-label="Image URL" />
            <button class="btn btn-ghost btn-sm" data-studio-add-image title="Add Image">
              <i class="fa-solid fa-image" aria-hidden="true"></i>
            </button>
            <select class="select input-sm" data-studio-template aria-label="Studio template">
              <option value="study-map">Study map</option>
              <option value="cornell">Cornell notes</option>
            </select>
            <button class="btn btn-ghost btn-sm" data-studio-apply-template title="Apply Template">Apply</button>
          </div>

          <div class="studio-tool-group" role="group" aria-label="Board management">
            <button class="btn btn-primary btn-sm" data-studio-save title="Save Board">
              <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>
              <span>Save</span>
            </button>
            <button class="btn btn-ghost btn-sm" data-studio-load title="Load Saved Board">Load</button>
            <button class="btn btn-ghost btn-sm" data-studio-clear title="Clear Board">Clear</button>
            <button class="btn btn-ghost btn-sm" data-studio-export-pdf title="Export PDF">
              <i class="fa-solid fa-file-pdf" aria-hidden="true"></i>
              <span>PDF</span>
            </button>
            <button class="btn btn-ghost btn-sm" data-studio-export-png title="Export PNG">PNG</button>
            <button class="btn btn-ghost btn-sm" data-studio-export-svg title="Export SVG">SVG</button>
            <button class="btn btn-ghost btn-sm" data-studio-export-json title="Export JSON">JSON</button>
            <button class="btn btn-ghost btn-sm" data-studio-import-json title="Import JSON">Import</button>
            <input type="file" data-studio-import-file accept=".json,application/json" hidden />
          </div>
        </div>
      </div>

      <div class="studio-workspace-grid">
        <div class="studio-canvas-card">
          <div class="studio-shell">
            <canvas id="studio-canvas" class="studio-canvas"></canvas>
          </div>
        </div>

        <div class="card card-filled studio-sidebar-card">
          <div>
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
              <input class="input input-sm" data-studio-layer-name placeholder="New layer name" style="flex:1" aria-label="New layer name" />
              <button class="btn btn-ghost btn-sm" data-studio-add-layer>Add layer</button>
            </div>
            <h3 style="margin:0 0 8px;font-size:var(--text-sm);color:var(--text-secondary)">Layers</h3>
            <div data-studio-layers class="stack-sm"></div>
          </div>

          <div style="border-top:1px solid var(--glass-border);padding-top:12px">
            <h3 style="margin:0 0 8px;font-size:var(--text-sm);color:var(--text-secondary)">Elements & Properties</h3>
            <div data-studio-elements class="stack-sm"></div>
            <div data-studio-properties style="margin-top:12px"></div>
          </div>
        </div>
      </div>
    </section>
  `);

  const routeListeners = [];
  const on = (target, type, handler, options) => {
    if (!target) return;
    target.addEventListener(type, handler, options);
    routeListeners.push({ target, type, handler, options });
  };
  const status = document.querySelector('[data-studio-status]');
  const setStatus = (message) => {
    if (status) status.textContent = message;
  };
  const boardKey = 'ocd_studio_board';
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
    // Give it a size; canvas.js reads offsetWidth/Height
    canvas.style.width = '100%';
    canvas.style.height = '70vh';
    try { window.OpenCourseDeck?.Canvas?.init?.(canvas); } catch (e) { console.warn('[Studio view] init failed', e); }
  }
  const loadSavedBoard = async (quiet = false) => {
    try {
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
      if (!board || !window.DB?.saveSetting) throw new Error('Studio storage unavailable');
      await window.DB.saveSetting(boardKey, board);
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
      if (board && window.DB?.saveSetting) await window.DB.saveSetting(boardKey, board);
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
    if (interactiveSaveTimer) {
      setStatus('Studio sync deferred while local changes save');
      return { refreshed: false, reason: 'pending-local-change' };
    }
    try {
      const board = await window.DB?.getSetting?.(boardKey);
      if (!board || typeof board !== 'object' || Array.isArray(board)) {
        return { refreshed: false, reason: 'missing-board' };
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
  document.querySelectorAll('[data-studio-tool]').forEach((button) => {
    on(button, 'click', () => {
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
    try {
      const text = await file.text();
      const board = JSON.parse(text);
      if (!board || typeof board !== 'object' || Array.isArray(board)) throw new Error('Invalid Studio board');
      const loaded = window.OpenCourseDeck?.Canvas?.loadState?.(board);
      if (!loaded) throw new Error('Studio import unavailable');
      if (window.DB?.saveSetting) await window.DB.saveSetting(boardKey, loaded);
      setStatus('JSON imported');
      renderInspector();
      Toast.success('Studio board imported');
    } catch {
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
      unbindSyncRefresh();
      clearTimeout(interactiveSaveTimer);
      routeListeners.forEach(({ target, type, handler, options }) => {
        try { target.removeEventListener(type, handler, options); } catch {}
      });
      try { window.OpenCourseDeck?.Canvas?.destroy?.(); } catch {}
    },
  };
}



