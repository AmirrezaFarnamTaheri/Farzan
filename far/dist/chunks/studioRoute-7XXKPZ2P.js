// src/views/studioRoute.js
function mountStudioView(deps = {}) {
  const {
    setView,
    safeFetchUrl,
    safeMediaUrl,
    safeFrameUrl,
    setPendingCourseMedia,
    Router,
    Toast = window.PlasmaDeck?.Toast,
    downloadTextFile,
    downloadDataUrl,
    printStudioBoardPdf
  } = deps;
  setView(`
    <section class="view view-studio">
      <div class="page-header">
        <h1 class="page-title">Studio</h1>
        <p class="page-subtitle">Whiteboard canvas with portable board storage, templates, and drag/drop media.</p>
      </div>
      <div class="card card-filled">
        <div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <input class="input input-sm" data-studio-text placeholder="Board note" style="min-width:220px" />
          <button class="btn btn-ghost" data-studio-tool="select" aria-pressed="false">Select</button>
          <button class="btn btn-ghost" data-studio-tool="pen" aria-pressed="true">Pen</button>
          <button class="btn btn-primary" data-studio-add-text>Add note</button>
          <button class="btn btn-ghost" data-studio-add-card>Add card</button>
          <button class="btn btn-ghost" data-studio-add-rect>Add rectangle</button>
          <button class="btn btn-ghost" data-studio-add-circle>Add circle</button>
          <button class="btn btn-ghost" data-studio-add-arrow>Add arrow</button>
          <input class="input input-sm" data-studio-image-url placeholder="Image URL" style="min-width:220px" />
          <button class="btn btn-ghost" data-studio-add-image>Add image</button>
          <select class="select input-sm" data-studio-template aria-label="Studio template">
            <option value="study-map">Study map</option>
            <option value="cornell">Cornell notes</option>
          </select>
          <button class="btn btn-ghost" data-studio-apply-template>Apply template</button>
          <button class="btn btn-ghost" data-studio-clear>Clear board</button>
          <button class="btn btn-primary" data-studio-save>Save board</button>
          <button class="btn btn-ghost" data-studio-load>Load saved board</button>
          <button class="btn btn-ghost" data-studio-import-json>Import JSON</button>
          <button class="btn btn-ghost" data-studio-export-json>Export JSON</button>
          <button class="btn btn-ghost" data-studio-export-svg>Export SVG</button>
          <button class="btn btn-ghost" data-studio-export-png>Export PNG</button>
          <button class="btn btn-ghost" data-studio-export-pdf>Export PDF</button>
          <input type="file" data-studio-import-file accept=".json,application/json" hidden />
          <span class="text-sm" data-studio-status aria-live="polite" style="opacity:.72">Ready</span>
        </div>
      </div>
      <div class="card card-filled">
        <div class="card-body" style="display:grid;gap:14px">
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <input class="input input-sm" data-studio-layer-name placeholder="Layer name" style="min-width:220px" />
            <button class="btn btn-ghost" data-studio-add-layer>Add layer</button>
          </div>
          <div class="grid grid-2" style="gap:14px">
            <div>
              <h3 style="margin:0 0 8px;font-size:var(--text-sm)">Layers</h3>
              <div data-studio-layers class="stack-sm"></div>
            </div>
            <div>
              <h3 style="margin:0 0 8px;font-size:var(--text-sm)">Elements</h3>
              <div data-studio-elements class="stack-sm"></div>
              <div data-studio-properties style="margin-top:12px"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="studio-shell">
        <canvas id="studio-canvas" class="studio-canvas"></canvas>
      </div>
    </section>
  `);
  const routeListeners = [];
  const on = (target, type, handler, options) => {
    if (!target) return;
    target.addEventListener(type, handler, options);
    routeListeners.push({ target, type, handler, options });
  };
  const status = document.querySelector("[data-studio-status]");
  const setStatus = (message) => {
    if (status) status.textContent = message;
  };
  const boardKey = "plasma-studio-board";
  let inspectedElementId = null;
  let interactiveSaveTimer = null;
  let studioLinkOptions = [];
  let syncHandler = null;
  const openStudioLink = (element = {}) => {
    const type = String(element.linkType || "").trim();
    const target = String(element.linkTarget || "").trim();
    if (!type && !target) {
      setStatus("No link on selected object");
      return false;
    }
    if (type === "url") {
      const url = safeFetchUrl(target) || safeMediaUrl(target) || safeFrameUrl(target);
      if (!url) {
        setStatus("Linked URL rejected");
        Toast.error("Studio link rejected");
        return false;
      }
      window.open?.(url, "_blank", "noopener,noreferrer");
      setStatus("Linked URL opened");
      return true;
    }
    if (type === "course") {
      Router.navigate("#/courses");
      setStatus("Opening linked course");
      return true;
    }
    if (type === "timestamp") {
      if (target) {
        setPendingCourseMedia(target);
      }
      Router.navigate("#/courses");
      setStatus("Opening linked timestamp");
      return true;
    }
    if (type === "pdf") {
      Router.navigate("#/pdf");
      setStatus("Opening linked PDF");
      return true;
    }
    if (type === "note") {
      Router.navigate("#/notes");
      setStatus("Opening linked note");
      return true;
    }
    setStatus("Unsupported Studio link");
    return false;
  };
  const loadStudioLinkOptions = async () => {
    const [catalog, notes, timestamps, annotations] = await Promise.all([
      (async () => {
        try {
          await window.DataStore?.init?.();
          return {
            courses: window.DataStore?.allCourses?.() ?? [],
            topics: window.DataStore?.allTopics?.() ?? []
          };
        } catch {
          return { courses: [], topics: [] };
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
          return await window.DB?.getAllTimestamps?.() ?? [];
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
    const options = [];
    (catalog.courses || []).slice(0, 200).forEach((course) => {
      if (!course?.id) return;
      options.push({ type: "course", target: String(course.id), label: String(course.title || course.name || course.id) });
    });
    (catalog.topics || []).slice(0, 300).forEach((topic) => {
      if (!topic?.topicId) return;
      const title = String(topic.title || topic.topicTitle || topic.topicId);
      const pdfs = Array.isArray(topic.pdfs) ? topic.pdfs : [];
      if (pdfs.length) options.push({ type: "pdf", target: String(topic.topicId), label: title });
      options.push({ type: "timestamp", target: String(topic.topicId), label: title });
    });
    (notes || []).slice(0, 200).forEach((note) => {
      if (!note?.id) return;
      options.push({ type: "note", target: String(note.id), label: String(note.title || note.id) });
    });
    (timestamps || []).slice(0, 200).forEach((timestamp) => {
      const target = timestamp?.topicId || timestamp?.id;
      if (!target) return;
      options.push({ type: "timestamp", target: String(target), label: String(timestamp.title || timestamp.topicTitle || timestamp.topicId || target) });
    });
    (annotations || []).slice(0, 200).forEach((annotation) => {
      const target = annotation?.id || annotation?.docId;
      if (!target) return;
      options.push({ type: "pdf", target: String(target), label: `PDF ${annotation.docId || target}${annotation.page ? ` p.${annotation.page}` : ""}` });
    });
    studioLinkOptions = options;
    renderInspector();
  };
  const renderInspector = () => {
    const board = window.PlasmaDeck?.Canvas?.serialize?.();
    const layersRoot = document.querySelector("[data-studio-layers]");
    const elementsRoot = document.querySelector("[data-studio-elements]");
    const propertiesRoot = document.querySelector("[data-studio-properties]");
    if (!board || !layersRoot || !elementsRoot || !propertiesRoot) return;
    const layers = Array.isArray(board.layers) ? board.layers : [];
    const activeLayerIdx = Number.isFinite(Number(board.activeLayerIdx)) ? Number(board.activeLayerIdx) : 0;
    const layerNodes = layers.map((layer, index) => {
      const row2 = document.createElement("div");
      row2.className = "card card-flat";
      row2.dataset.layerId = layer.id;
      row2.style.padding = "10px";
      row2.style.display = "flex";
      row2.style.gap = "8px";
      row2.style.alignItems = "center";
      row2.style.justifyContent = "space-between";
      const label = document.createElement("button");
      label.type = "button";
      label.className = index === activeLayerIdx ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm";
      label.dataset.setLayer = String(index);
      label.textContent = `${layer.name || `Layer ${index + 1}`} (${layer.elements?.length || 0})`;
      row2.appendChild(label);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-ghost btn-sm";
      del.dataset.deleteLayer = layer.id;
      del.disabled = layers.length <= 1;
      del.textContent = "Delete";
      row2.appendChild(del);
      return row2;
    });
    layersRoot.replaceChildren(...layerNodes.length ? layerNodes : [document.createTextNode("No layers")]);
    const elements = layers.flatMap((layer) => (Array.isArray(layer.elements) ? layer.elements : []).map((element) => ({ ...element, layerName: layer.name })));
    const elementNodes = elements.map((element) => {
      const row2 = document.createElement("div");
      row2.className = "card card-flat";
      row2.style.padding = "10px";
      row2.style.display = "flex";
      row2.style.gap = "8px";
      row2.style.alignItems = "center";
      row2.style.justifyContent = "space-between";
      const meta = document.createElement("span");
      meta.className = "text-sm";
      const linkText = element.linkType || element.linkTarget ? ` \xB7 links ${element.linkType || "resource"}${element.linkLabel ? `: ${element.linkLabel}` : ""}` : "";
      meta.textContent = `${element.type || "element"} \xB7 ${element.text || element.id || "Untitled"} \xB7 ${element.layerName || "Layer"}${linkText}`;
      row2.appendChild(meta);
      const inspect = document.createElement("button");
      inspect.type = "button";
      inspect.className = element.id === inspectedElementId ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm";
      inspect.dataset.inspectElement = element.id;
      inspect.textContent = "Inspect";
      row2.appendChild(inspect);
      if (element.linkType || element.linkTarget) {
        const open = document.createElement("button");
        open.type = "button";
        open.className = "btn btn-ghost btn-sm";
        open.dataset.openStudioLink = element.id;
        open.textContent = "Open";
        row2.appendChild(open);
      }
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-ghost btn-sm";
      del.dataset.deleteElement = element.id;
      del.textContent = "Delete";
      row2.appendChild(del);
      return row2;
    });
    elementsRoot.replaceChildren(...elementNodes.length ? elementNodes : [document.createTextNode("No elements")]);
    const inspected = elements.find((element) => element.id === inspectedElementId);
    if (!inspected) {
      if (inspectedElementId) inspectedElementId = null;
      propertiesRoot.replaceChildren(document.createTextNode("Select an element to edit its properties."));
      return;
    }
    const wrap = document.createElement("div");
    wrap.className = "card card-flat";
    wrap.style.padding = "10px";
    wrap.style.display = "grid";
    wrap.style.gap = "8px";
    const title = document.createElement("strong");
    title.textContent = `Inspecting ${inspected.type || "element"}`;
    wrap.appendChild(title);
    const textInput = document.createElement("input");
    textInput.className = "input input-sm";
    textInput.dataset.studioPropText = "";
    textInput.placeholder = "Text";
    textInput.value = inspected.text || "";
    wrap.appendChild(textInput);
    const linkRow = document.createElement("div");
    linkRow.style.display = "flex";
    linkRow.style.gap = "8px";
    linkRow.style.flexWrap = "wrap";
    const linkType = document.createElement("select");
    linkType.className = "select input-sm";
    linkType.dataset.studioPropLinkType = "";
    [
      ["", "No link"],
      ["course", "Course"],
      ["pdf", "PDF"],
      ["note", "Note"],
      ["timestamp", "Timestamp"],
      ["url", "URL"]
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      if ((inspected.linkType || "") === value) option.selected = true;
      linkType.appendChild(option);
    });
    linkRow.appendChild(linkType);
    [
      ["Link target", "studioPropLinkTarget", inspected.linkTarget || ""],
      ["Link label", "studioPropLinkLabel", inspected.linkLabel || ""]
    ].forEach(([labelText, key, value]) => {
      const input = document.createElement("input");
      input.className = "input input-sm";
      input.dataset[key] = "";
      input.placeholder = labelText;
      input.value = String(value ?? "");
      input.style.minWidth = "180px";
      if (key === "studioPropLinkTarget") input.setAttribute("list", "studio-link-target-options");
      linkRow.appendChild(input);
    });
    const linkOptions = document.createElement("datalist");
    linkOptions.id = "studio-link-target-options";
    const selectedType = inspected.linkType || "";
    studioLinkOptions.filter((option) => !selectedType || option.type === selectedType).slice(0, 120).forEach((option) => {
      const item = document.createElement("option");
      item.value = option.target;
      item.label = `${option.label} (${option.type})`;
      linkOptions.appendChild(item);
    });
    linkRow.appendChild(linkOptions);
    wrap.appendChild(linkRow);
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "8px";
    row.style.flexWrap = "wrap";
    [
      ["X", "studioPropX", inspected.x ?? ""],
      ["Y", "studioPropY", inspected.y ?? ""],
      ["Fill", "studioPropFill", inspected.fill || "transparent"],
      ["Stroke", "studioPropStroke", inspected.stroke || inspected.color || "#6366f1"],
      ["Width", "studioPropWidth", inspected.width ?? ""],
      ["Height", "studioPropHeight", inspected.height ?? ""],
      ["Stroke width", "studioPropStrokeWidth", inspected.strokeWidth ?? ""],
      ["Font size", "studioPropFontSize", inspected.fontSize ?? ""]
    ].forEach(([labelText, key, value]) => {
      const input = document.createElement("input");
      input.className = "input input-sm";
      input.dataset[key] = "";
      input.placeholder = labelText;
      input.value = String(value ?? "");
      input.style.maxWidth = "130px";
      row.appendChild(input);
    });
    wrap.appendChild(row);
    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "btn btn-primary btn-sm";
    apply.dataset.studioApplyProps = inspected.id;
    apply.textContent = "Apply properties";
    wrap.appendChild(apply);
    if (inspected.linkType || inspected.linkTarget) {
      const open = document.createElement("button");
      open.type = "button";
      open.className = "btn btn-ghost btn-sm";
      open.dataset.openStudioLink = inspected.id;
      open.textContent = "Open linked resource";
      wrap.appendChild(open);
    }
    propertiesRoot.replaceChildren(wrap);
  };
  const canvas = document.getElementById("studio-canvas");
  if (canvas) {
    canvas.style.width = "100%";
    canvas.style.height = "70vh";
    try {
      window.PlasmaDeck?.Canvas?.init?.(canvas);
    } catch (e) {
      console.warn("[Studio view] init failed", e);
    }
  }
  const loadSavedBoard = async (quiet = false) => {
    try {
      const board = await window.DB?.getSetting?.(boardKey);
      if (board && typeof board === "object") {
        window.PlasmaDeck?.Canvas?.loadState?.(board);
        setStatus("Saved board loaded");
        renderInspector();
      } else if (!quiet) {
        setStatus("No saved board yet");
      }
    } catch {
      setStatus("Load failed");
    }
  };
  const saveBoard = async () => {
    try {
      const board = window.PlasmaDeck?.Canvas?.serialize?.();
      if (!board || !window.DB?.saveSetting) throw new Error("Studio storage unavailable");
      await window.DB.saveSetting(boardKey, board);
      setStatus(`Saved ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}`);
      Toast.success("Studio board saved");
    } catch {
      setStatus("Save failed");
      Toast.error("Studio save failed");
    }
  };
  const persistBoardChange = async (statusText) => {
    try {
      const board = window.PlasmaDeck?.Canvas?.serialize?.();
      if (board && window.DB?.saveSetting) await window.DB.saveSetting(boardKey, board);
      setStatus(statusText);
      renderInspector();
    } catch {
      setStatus("Autosave failed");
      Toast.error("Studio autosave failed");
    }
  };
  const boardHasElement = (board, elementId) => {
    if (!elementId) return false;
    return (board?.layers || []).some(
      (layer) => (Array.isArray(layer.elements) ? layer.elements : []).some((element) => element?.id === elementId)
    );
  };
  const refreshFromSync = async (payload = {}) => {
    if (payload?.kind !== "setting" || payload?.record?.key !== boardKey) {
      return { refreshed: false, reason: "ignored-kind" };
    }
    if (interactiveSaveTimer) {
      setStatus("Studio sync deferred while local changes save");
      return { refreshed: false, reason: "pending-local-change" };
    }
    try {
      const board = await window.DB?.getSetting?.(boardKey);
      if (!board || typeof board !== "object" || Array.isArray(board)) {
        return { refreshed: false, reason: "missing-board" };
      }
      const loaded = window.PlasmaDeck?.Canvas?.loadState?.(board, {
        preserveSelection: true,
        preserveTool: true,
        preserveViewport: true
      });
      if (!loaded) return { refreshed: false, reason: "load-unavailable" };
      if (!boardHasElement(loaded, inspectedElementId)) inspectedElementId = null;
      renderInspector();
      updateToolButtons();
      setStatus("Studio board synced");
      const selectedIds = window.PlasmaDeck?.Canvas?.getState?.()?.selectedIds || [];
      const result = {
        refreshed: true,
        key: boardKey,
        selectedIds,
        inspectedElementId
      };
      window.PlasmaDeck?.bus?.emit?.("studio:sync-refresh", result);
      return result;
    } catch {
      setStatus("Studio sync failed");
      return { refreshed: false, reason: "load-failed" };
    }
  };
  const bindSyncRefresh = () => {
    const bus = window.PlasmaDeck?.bus;
    if (!bus?.on || syncHandler) return;
    syncHandler = (payload) => {
      refreshFromSync(payload).catch?.(() => {
      });
    };
    bus.on("sync:message", syncHandler);
  };
  const unbindSyncRefresh = () => {
    if (syncHandler) window.PlasmaDeck?.bus?.off?.("sync:message", syncHandler);
    syncHandler = null;
  };
  const readDroppedImageFile = (file) => new Promise((resolve, reject) => {
    if (!file || !/^image\//i.test(file.type || "")) {
      reject(new Error("Dropped file is not an image"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Dropped image could not be read"));
    reader.readAsDataURL(file);
  });
  const getDropImageSource = async (event) => {
    const files = Array.from(event.dataTransfer?.files || []);
    const imageFile = files.find((file) => /^image\//i.test(file.type || ""));
    if (imageFile) return readDroppedImageFile(imageFile);
    const uri = event.dataTransfer?.getData?.("text/uri-list") || "";
    const text = event.dataTransfer?.getData?.("text/plain") || "";
    return String(uri || text || "").split(/\r?\n/).find((line) => line.trim() && !line.trim().startsWith("#"))?.trim() || "";
  };
  const updateToolButtons = () => {
    const tool = window.PlasmaDeck?.Canvas?.getState?.()?.tool || "pen";
    document.querySelectorAll("[data-studio-tool]").forEach((button) => {
      const active = button.dataset.studioTool === tool;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  };
  on(canvas, "plasma:studio-board-change", () => {
    renderInspector();
    clearTimeout(interactiveSaveTimer);
    interactiveSaveTimer = setTimeout(() => {
      persistBoardChange("Board updated");
    }, 120);
  });
  document.querySelectorAll("[data-studio-tool]").forEach((button) => {
    on(button, "click", () => {
      const selected = window.PlasmaDeck?.Canvas?.setTool?.(button.dataset.studioTool);
      setStatus(`${selected === "pen" ? "Pen" : "Select"} tool active`);
      updateToolButtons();
    });
  });
  on(canvas, "dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });
  on(canvas, "drop", async (event) => {
    event.preventDefault();
    try {
      const source = await getDropImageSource(event);
      const point = window.PlasmaDeck?.Canvas?.screenToWorld?.(event.clientX, event.clientY) || { x: 120, y: 120 };
      const element = window.PlasmaDeck?.Canvas?.addImage?.(source, {
        x: Math.max(0, point.x - 140),
        y: Math.max(0, point.y - 80)
      });
      if (!element) throw new Error("Dropped media was rejected");
      await persistBoardChange("Dropped image added");
    } catch {
      setStatus("Drop failed");
      Toast.error("Studio drop rejected");
    }
  });
  updateToolButtons();
  on(document.querySelector("[data-studio-add-text]"), "click", async () => {
    const input = document.querySelector("[data-studio-text]");
    const text = String(input?.value || "New note").trim() || "New note";
    const element = window.PlasmaDeck?.Canvas?.addText?.(text);
    if (!element) {
      setStatus("Add note failed");
      return;
    }
    if (input) input.value = "";
    await persistBoardChange("Note added");
  });
  on(document.querySelector("[data-studio-add-card]"), "click", async () => {
    const element = window.PlasmaDeck?.Canvas?.addCard?.();
    if (!element) {
      setStatus("Add card failed");
      return;
    }
    await persistBoardChange("Card added");
  });
  on(document.querySelector("[data-studio-add-rect]"), "click", async () => {
    const element = window.PlasmaDeck?.Canvas?.addRectangle?.();
    if (!element) {
      setStatus("Add rectangle failed");
      return;
    }
    await persistBoardChange("Rectangle added");
  });
  on(document.querySelector("[data-studio-add-circle]"), "click", async () => {
    const element = window.PlasmaDeck?.Canvas?.addCircle?.();
    if (!element) {
      setStatus("Add circle failed");
      return;
    }
    await persistBoardChange("Circle added");
  });
  on(document.querySelector("[data-studio-add-arrow]"), "click", async () => {
    const element = window.PlasmaDeck?.Canvas?.addArrow?.();
    if (!element) {
      setStatus("Add arrow failed");
      return;
    }
    await persistBoardChange("Arrow added");
  });
  on(document.querySelector("[data-studio-add-image]"), "click", async () => {
    const input = document.querySelector("[data-studio-image-url]");
    const src = String(input?.value || "").trim();
    const element = window.PlasmaDeck?.Canvas?.addImage?.(src);
    if (!element) {
      setStatus("Add image failed");
      Toast.error("Studio image URL rejected");
      return;
    }
    if (input) input.value = "";
    await persistBoardChange("Image added");
  });
  on(document.querySelector("[data-studio-apply-template]"), "click", async () => {
    const value = document.querySelector("[data-studio-template]")?.value || "study-map";
    const ok = await window.PlasmaDeck?.UI?.confirm?.("Replace the current Studio board with this template?");
    if (!ok) return;
    const board = window.PlasmaDeck?.Canvas?.applyTemplate?.(value);
    if (!board) {
      setStatus("Template failed");
      return;
    }
    if (window.DB?.saveSetting) await window.DB.saveSetting(boardKey, board);
    inspectedElementId = null;
    setStatus("Template applied");
    renderInspector();
  });
  on(document.querySelector("[data-studio-clear]"), "click", async () => {
    const ok = await window.PlasmaDeck?.UI?.confirm?.("Clear the current Studio board?");
    if (!ok) return;
    const board = window.PlasmaDeck?.Canvas?.clearBoard?.();
    if (!board) {
      setStatus("Clear failed");
      return;
    }
    if (window.DB?.saveSetting) await window.DB.saveSetting(boardKey, board);
    setStatus("Board cleared");
    renderInspector();
  });
  on(document.querySelector("[data-studio-add-layer]"), "click", async () => {
    const input = document.querySelector("[data-studio-layer-name]");
    const name = String(input?.value || "").trim();
    const layer = window.PlasmaDeck?.Canvas?.addLayer?.(name);
    if (!layer) {
      setStatus("Add layer failed");
      return;
    }
    if (input) input.value = "";
    await persistBoardChange("Layer added");
  });
  on(document.querySelector("[data-studio-layers]"), "click", async (event) => {
    const target = event.target?.closest?.("button");
    if (!target) return;
    if (target.dataset.setLayer != null) {
      window.PlasmaDeck?.Canvas?.setActiveLayer?.(Number(target.dataset.setLayer));
      await persistBoardChange("Active layer changed");
    } else if (target.dataset.deleteLayer) {
      const removed = window.PlasmaDeck?.Canvas?.removeLayer?.(target.dataset.deleteLayer);
      if (removed) await persistBoardChange("Layer deleted");
    }
  });
  on(document.querySelector("[data-studio-elements]"), "click", async (event) => {
    const inspectTarget = event.target?.closest?.("[data-inspect-element]");
    if (inspectTarget) {
      inspectedElementId = inspectTarget.dataset.inspectElement;
      renderInspector();
      return;
    }
    const openTarget = event.target?.closest?.("[data-open-studio-link]");
    if (openTarget) {
      const board = window.PlasmaDeck?.Canvas?.serialize?.();
      const element = (board?.layers || []).flatMap((layer) => Array.isArray(layer.elements) ? layer.elements : []).find((item) => item?.id === openTarget.dataset.openStudioLink);
      openStudioLink(element);
      return;
    }
    const target = event.target?.closest?.("[data-delete-element]");
    if (!target) return;
    const removed = window.PlasmaDeck?.Canvas?.removeElement?.(target.dataset.deleteElement);
    if (removed) {
      if (inspectedElementId === target.dataset.deleteElement) inspectedElementId = null;
      await persistBoardChange("Element deleted");
    }
  });
  on(document.querySelector("[data-studio-properties]"), "click", async (event) => {
    const openTarget = event.target?.closest?.("[data-open-studio-link]");
    if (openTarget) {
      const board = window.PlasmaDeck?.Canvas?.serialize?.();
      const element = (board?.layers || []).flatMap((layer) => Array.isArray(layer.elements) ? layer.elements : []).find((item) => item?.id === openTarget.dataset.openStudioLink);
      openStudioLink(element);
      return;
    }
    const target = event.target?.closest?.("[data-studio-apply-props]");
    if (!target) return;
    const root = document.querySelector("[data-studio-properties]");
    const patch = {
      text: root?.querySelector?.("[data-studio-prop-text]")?.value ?? "",
      x: root?.querySelector?.("[data-studio-prop-x]")?.value ?? "",
      y: root?.querySelector?.("[data-studio-prop-y]")?.value ?? "",
      fill: root?.querySelector?.("[data-studio-prop-fill]")?.value ?? "",
      stroke: root?.querySelector?.("[data-studio-prop-stroke]")?.value ?? "",
      width: root?.querySelector?.("[data-studio-prop-width]")?.value ?? "",
      height: root?.querySelector?.("[data-studio-prop-height]")?.value ?? "",
      strokeWidth: root?.querySelector?.("[data-studio-prop-stroke-width]")?.value ?? "",
      fontSize: root?.querySelector?.("[data-studio-prop-font-size]")?.value ?? "",
      linkType: root?.querySelector?.("[data-studio-prop-link-type]")?.value ?? "",
      linkTarget: root?.querySelector?.("[data-studio-prop-link-target]")?.value ?? "",
      linkLabel: root?.querySelector?.("[data-studio-prop-link-label]")?.value ?? ""
    };
    const updated = window.PlasmaDeck?.Canvas?.updateElement?.(target.dataset.studioApplyProps, patch);
    if (updated) await persistBoardChange("Properties updated");
  });
  on(document.querySelector("[data-studio-save]"), "click", saveBoard);
  on(document.querySelector("[data-studio-load]"), "click", () => loadSavedBoard(false));
  const importInput = document.querySelector("[data-studio-import-file]");
  on(document.querySelector("[data-studio-import-json]"), "click", () => importInput?.click?.());
  on(importInput, "change", async () => {
    const file = importInput?.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const board = JSON.parse(text);
      if (!board || typeof board !== "object" || Array.isArray(board)) throw new Error("Invalid Studio board");
      const loaded = window.PlasmaDeck?.Canvas?.loadState?.(board);
      if (!loaded) throw new Error("Studio import unavailable");
      if (window.DB?.saveSetting) await window.DB.saveSetting(boardKey, loaded);
      setStatus("JSON imported");
      renderInspector();
      Toast.success("Studio board imported");
    } catch {
      setStatus("JSON import failed");
      Toast.error("Studio JSON import failed");
    } finally {
      if (importInput) importInput.value = "";
    }
  });
  on(document.querySelector("[data-studio-export-json]"), "click", () => {
    try {
      const board = window.PlasmaDeck?.Canvas?.serialize?.();
      if (!board) throw new Error("Studio export unavailable");
      downloadTextFile(JSON.stringify(board, null, 2), `plasmadeck-studio-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`, "application/json");
      setStatus("JSON exported");
    } catch {
      setStatus("JSON export failed");
      Toast.error("Studio JSON export failed");
    }
  });
  on(document.querySelector("[data-studio-export-svg]"), "click", () => {
    try {
      const svg = window.PlasmaDeck?.Canvas?.exportSVG?.();
      if (!svg) throw new Error("Studio SVG export unavailable");
      downloadTextFile(svg, `plasmadeck-studio-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.svg`, "image/svg+xml");
      setStatus("SVG exported");
    } catch {
      setStatus("SVG export failed");
      Toast.error("Studio SVG export failed");
    }
  });
  on(document.querySelector("[data-studio-export-png]"), "click", () => {
    try {
      const dataUrl = window.PlasmaDeck?.Canvas?.exportPNG?.();
      if (!downloadDataUrl(dataUrl, `plasmadeck-studio-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.png`)) throw new Error("Studio PNG export unavailable");
      setStatus("PNG exported");
    } catch {
      setStatus("PNG export failed");
      Toast.error("Studio PNG export failed");
    }
  });
  on(document.querySelector("[data-studio-export-pdf]"), "click", () => {
    try {
      const svg = window.PlasmaDeck?.Canvas?.exportSVG?.();
      const png = svg ? "" : window.PlasmaDeck?.Canvas?.exportPNG?.();
      if (!printStudioBoardPdf({ svg, png })) throw new Error("Studio PDF export unavailable");
      setStatus("PDF export opened");
    } catch {
      setStatus("PDF export failed");
      Toast.error("Studio PDF export failed");
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
        try {
          target.removeEventListener(type, handler, options);
        } catch {
        }
      });
      try {
        window.PlasmaDeck?.Canvas?.destroy?.();
      } catch {
      }
    }
  };
}
export {
  mountStudioView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3ZpZXdzL3N0dWRpb1JvdXRlLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJleHBvcnQgZnVuY3Rpb24gbW91bnRTdHVkaW9WaWV3KGRlcHMgPSB7fSkge1xuICBjb25zdCB7XG5zZXRWaWV3LFxuc2FmZUZldGNoVXJsLFxuc2FmZU1lZGlhVXJsLFxuc2FmZUZyYW1lVXJsLFxuc2V0UGVuZGluZ0NvdXJzZU1lZGlhLFxuUm91dGVyLFxuVG9hc3QgPSB3aW5kb3cuUGxhc21hRGVjaz8uVG9hc3QsXG5kb3dubG9hZFRleHRGaWxlLFxuZG93bmxvYWREYXRhVXJsLFxucHJpbnRTdHVkaW9Cb2FyZFBkZixcbiAgfSA9IGRlcHM7XG5cbiAgc2V0VmlldyhgXG4gICAgPHNlY3Rpb24gY2xhc3M9XCJ2aWV3IHZpZXctc3R1ZGlvXCI+XG4gICAgICA8ZGl2IGNsYXNzPVwicGFnZS1oZWFkZXJcIj5cbiAgICAgICAgPGgxIGNsYXNzPVwicGFnZS10aXRsZVwiPlN0dWRpbzwvaDE+XG4gICAgICAgIDxwIGNsYXNzPVwicGFnZS1zdWJ0aXRsZVwiPldoaXRlYm9hcmQgY2FudmFzIHdpdGggcG9ydGFibGUgYm9hcmQgc3RvcmFnZSwgdGVtcGxhdGVzLCBhbmQgZHJhZy9kcm9wIG1lZGlhLjwvcD5cbiAgICAgIDwvZGl2PlxuICAgICAgPGRpdiBjbGFzcz1cImNhcmQgY2FyZC1maWxsZWRcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQtYm9keVwiIHN0eWxlPVwiZGlzcGxheTpmbGV4O2dhcDoxMHB4O2ZsZXgtd3JhcDp3cmFwO2FsaWduLWl0ZW1zOmNlbnRlclwiPlxuICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImlucHV0IGlucHV0LXNtXCIgZGF0YS1zdHVkaW8tdGV4dCBwbGFjZWhvbGRlcj1cIkJvYXJkIG5vdGVcIiBzdHlsZT1cIm1pbi13aWR0aDoyMjBweFwiIC8+XG4gICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBkYXRhLXN0dWRpby10b29sPVwic2VsZWN0XCIgYXJpYS1wcmVzc2VkPVwiZmFsc2VcIj5TZWxlY3Q8L2J1dHRvbj5cbiAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdFwiIGRhdGEtc3R1ZGlvLXRvb2w9XCJwZW5cIiBhcmlhLXByZXNzZWQ9XCJ0cnVlXCI+UGVuPC9idXR0b24+XG4gICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeVwiIGRhdGEtc3R1ZGlvLWFkZC10ZXh0PkFkZCBub3RlPC9idXR0b24+XG4gICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBkYXRhLXN0dWRpby1hZGQtY2FyZD5BZGQgY2FyZDwvYnV0dG9uPlxuICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0XCIgZGF0YS1zdHVkaW8tYWRkLXJlY3Q+QWRkIHJlY3RhbmdsZTwvYnV0dG9uPlxuICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0XCIgZGF0YS1zdHVkaW8tYWRkLWNpcmNsZT5BZGQgY2lyY2xlPC9idXR0b24+XG4gICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBkYXRhLXN0dWRpby1hZGQtYXJyb3c+QWRkIGFycm93PC9idXR0b24+XG4gICAgICAgICAgPGlucHV0IGNsYXNzPVwiaW5wdXQgaW5wdXQtc21cIiBkYXRhLXN0dWRpby1pbWFnZS11cmwgcGxhY2Vob2xkZXI9XCJJbWFnZSBVUkxcIiBzdHlsZT1cIm1pbi13aWR0aDoyMjBweFwiIC8+XG4gICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBkYXRhLXN0dWRpby1hZGQtaW1hZ2U+QWRkIGltYWdlPC9idXR0b24+XG4gICAgICAgICAgPHNlbGVjdCBjbGFzcz1cInNlbGVjdCBpbnB1dC1zbVwiIGRhdGEtc3R1ZGlvLXRlbXBsYXRlIGFyaWEtbGFiZWw9XCJTdHVkaW8gdGVtcGxhdGVcIj5cbiAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzdHVkeS1tYXBcIj5TdHVkeSBtYXA8L29wdGlvbj5cbiAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb3JuZWxsXCI+Q29ybmVsbCBub3Rlczwvb3B0aW9uPlxuICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0XCIgZGF0YS1zdHVkaW8tYXBwbHktdGVtcGxhdGU+QXBwbHkgdGVtcGxhdGU8L2J1dHRvbj5cbiAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdFwiIGRhdGEtc3R1ZGlvLWNsZWFyPkNsZWFyIGJvYXJkPC9idXR0b24+XG4gICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeVwiIGRhdGEtc3R1ZGlvLXNhdmU+U2F2ZSBib2FyZDwvYnV0dG9uPlxuICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0XCIgZGF0YS1zdHVkaW8tbG9hZD5Mb2FkIHNhdmVkIGJvYXJkPC9idXR0b24+XG4gICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBkYXRhLXN0dWRpby1pbXBvcnQtanNvbj5JbXBvcnQgSlNPTjwvYnV0dG9uPlxuICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0XCIgZGF0YS1zdHVkaW8tZXhwb3J0LWpzb24+RXhwb3J0IEpTT048L2J1dHRvbj5cbiAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdFwiIGRhdGEtc3R1ZGlvLWV4cG9ydC1zdmc+RXhwb3J0IFNWRzwvYnV0dG9uPlxuICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0XCIgZGF0YS1zdHVkaW8tZXhwb3J0LXBuZz5FeHBvcnQgUE5HPC9idXR0b24+XG4gICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBkYXRhLXN0dWRpby1leHBvcnQtcGRmPkV4cG9ydCBQREY8L2J1dHRvbj5cbiAgICAgICAgICA8aW5wdXQgdHlwZT1cImZpbGVcIiBkYXRhLXN0dWRpby1pbXBvcnQtZmlsZSBhY2NlcHQ9XCIuanNvbixhcHBsaWNhdGlvbi9qc29uXCIgaGlkZGVuIC8+XG4gICAgICAgICAgPHNwYW4gY2xhc3M9XCJ0ZXh0LXNtXCIgZGF0YS1zdHVkaW8tc3RhdHVzIGFyaWEtbGl2ZT1cInBvbGl0ZVwiIHN0eWxlPVwib3BhY2l0eTouNzJcIj5SZWFkeTwvc3Bhbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L2Rpdj5cbiAgICAgIDxkaXYgY2xhc3M9XCJjYXJkIGNhcmQtZmlsbGVkXCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLWJvZHlcIiBzdHlsZT1cImRpc3BsYXk6Z3JpZDtnYXA6MTRweFwiPlxuICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OmZsZXg7Z2FwOjEwcHg7ZmxleC13cmFwOndyYXA7YWxpZ24taXRlbXM6Y2VudGVyXCI+XG4gICAgICAgICAgICA8aW5wdXQgY2xhc3M9XCJpbnB1dCBpbnB1dC1zbVwiIGRhdGEtc3R1ZGlvLWxheWVyLW5hbWUgcGxhY2Vob2xkZXI9XCJMYXllciBuYW1lXCIgc3R5bGU9XCJtaW4td2lkdGg6MjIwcHhcIiAvPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBkYXRhLXN0dWRpby1hZGQtbGF5ZXI+QWRkIGxheWVyPC9idXR0b24+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPGRpdiBjbGFzcz1cImdyaWQgZ3JpZC0yXCIgc3R5bGU9XCJnYXA6MTRweFwiPlxuICAgICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgICAgPGgzIHN0eWxlPVwibWFyZ2luOjAgMCA4cHg7Zm9udC1zaXplOnZhcigtLXRleHQtc20pXCI+TGF5ZXJzPC9oMz5cbiAgICAgICAgICAgICAgPGRpdiBkYXRhLXN0dWRpby1sYXllcnMgY2xhc3M9XCJzdGFjay1zbVwiPjwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICA8aDMgc3R5bGU9XCJtYXJnaW46MCAwIDhweDtmb250LXNpemU6dmFyKC0tdGV4dC1zbSlcIj5FbGVtZW50czwvaDM+XG4gICAgICAgICAgICAgIDxkaXYgZGF0YS1zdHVkaW8tZWxlbWVudHMgY2xhc3M9XCJzdGFjay1zbVwiPjwvZGl2PlxuICAgICAgICAgICAgICA8ZGl2IGRhdGEtc3R1ZGlvLXByb3BlcnRpZXMgc3R5bGU9XCJtYXJnaW4tdG9wOjEycHhcIj48L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgICAgPGRpdiBjbGFzcz1cInN0dWRpby1zaGVsbFwiPlxuICAgICAgICA8Y2FudmFzIGlkPVwic3R1ZGlvLWNhbnZhc1wiIGNsYXNzPVwic3R1ZGlvLWNhbnZhc1wiPjwvY2FudmFzPlxuICAgICAgPC9kaXY+XG4gICAgPC9zZWN0aW9uPlxuICBgKTtcblxuICBjb25zdCByb3V0ZUxpc3RlbmVycyA9IFtdO1xuICBjb25zdCBvbiA9ICh0YXJnZXQsIHR5cGUsIGhhbmRsZXIsIG9wdGlvbnMpID0+IHtcbiAgICBpZiAoIXRhcmdldCkgcmV0dXJuO1xuICAgIHRhcmdldC5hZGRFdmVudExpc3RlbmVyKHR5cGUsIGhhbmRsZXIsIG9wdGlvbnMpO1xuICAgIHJvdXRlTGlzdGVuZXJzLnB1c2goeyB0YXJnZXQsIHR5cGUsIGhhbmRsZXIsIG9wdGlvbnMgfSk7XG4gIH07XG4gIGNvbnN0IHN0YXR1cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXN0dWRpby1zdGF0dXNdJyk7XG4gIGNvbnN0IHNldFN0YXR1cyA9IChtZXNzYWdlKSA9PiB7XG4gICAgaWYgKHN0YXR1cykgc3RhdHVzLnRleHRDb250ZW50ID0gbWVzc2FnZTtcbiAgfTtcbiAgY29uc3QgYm9hcmRLZXkgPSAncGxhc21hLXN0dWRpby1ib2FyZCc7XG4gIGxldCBpbnNwZWN0ZWRFbGVtZW50SWQgPSBudWxsO1xuICBsZXQgaW50ZXJhY3RpdmVTYXZlVGltZXIgPSBudWxsO1xuICBsZXQgc3R1ZGlvTGlua09wdGlvbnMgPSBbXTtcbiAgbGV0IHN5bmNIYW5kbGVyID0gbnVsbDtcbiAgY29uc3Qgb3BlblN0dWRpb0xpbmsgPSAoZWxlbWVudCA9IHt9KSA9PiB7XG4gICAgY29uc3QgdHlwZSA9IFN0cmluZyhlbGVtZW50LmxpbmtUeXBlIHx8ICcnKS50cmltKCk7XG4gICAgY29uc3QgdGFyZ2V0ID0gU3RyaW5nKGVsZW1lbnQubGlua1RhcmdldCB8fCAnJykudHJpbSgpO1xuICAgIGlmICghdHlwZSAmJiAhdGFyZ2V0KSB7XG4gICAgICBzZXRTdGF0dXMoJ05vIGxpbmsgb24gc2VsZWN0ZWQgb2JqZWN0Jyk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGlmICh0eXBlID09PSAndXJsJykge1xuICAgICAgY29uc3QgdXJsID0gc2FmZUZldGNoVXJsKHRhcmdldCkgfHwgc2FmZU1lZGlhVXJsKHRhcmdldCkgfHwgc2FmZUZyYW1lVXJsKHRhcmdldCk7XG4gICAgICBpZiAoIXVybCkge1xuICAgICAgICBzZXRTdGF0dXMoJ0xpbmtlZCBVUkwgcmVqZWN0ZWQnKTtcbiAgICAgICAgVG9hc3QuZXJyb3IoJ1N0dWRpbyBsaW5rIHJlamVjdGVkJyk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHdpbmRvdy5vcGVuPy4odXJsLCAnX2JsYW5rJywgJ25vb3BlbmVyLG5vcmVmZXJyZXInKTtcbiAgICAgIHNldFN0YXR1cygnTGlua2VkIFVSTCBvcGVuZWQnKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBpZiAodHlwZSA9PT0gJ2NvdXJzZScpIHtcbiAgICAgIFJvdXRlci5uYXZpZ2F0ZSgnIy9jb3Vyc2VzJyk7XG4gICAgICBzZXRTdGF0dXMoJ09wZW5pbmcgbGlua2VkIGNvdXJzZScpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGlmICh0eXBlID09PSAndGltZXN0YW1wJykge1xuICAgICAgaWYgKHRhcmdldCkge1xuICAgICAgICBzZXRQZW5kaW5nQ291cnNlTWVkaWEodGFyZ2V0KTtcbiAgICAgIH1cbiAgICAgIFJvdXRlci5uYXZpZ2F0ZSgnIy9jb3Vyc2VzJyk7XG4gICAgICBzZXRTdGF0dXMoJ09wZW5pbmcgbGlua2VkIHRpbWVzdGFtcCcpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGlmICh0eXBlID09PSAncGRmJykge1xuICAgICAgUm91dGVyLm5hdmlnYXRlKCcjL3BkZicpO1xuICAgICAgc2V0U3RhdHVzKCdPcGVuaW5nIGxpbmtlZCBQREYnKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBpZiAodHlwZSA9PT0gJ25vdGUnKSB7XG4gICAgICBSb3V0ZXIubmF2aWdhdGUoJyMvbm90ZXMnKTtcbiAgICAgIHNldFN0YXR1cygnT3BlbmluZyBsaW5rZWQgbm90ZScpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHNldFN0YXR1cygnVW5zdXBwb3J0ZWQgU3R1ZGlvIGxpbmsnKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH07XG4gIGNvbnN0IGxvYWRTdHVkaW9MaW5rT3B0aW9ucyA9IGFzeW5jICgpID0+IHtcbiAgICBjb25zdCBbY2F0YWxvZywgbm90ZXMsIHRpbWVzdGFtcHMsIGFubm90YXRpb25zXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgIChhc3luYyAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgd2luZG93LkRhdGFTdG9yZT8uaW5pdD8uKCk7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGNvdXJzZXM6IHdpbmRvdy5EYXRhU3RvcmU/LmFsbENvdXJzZXM/LigpID8/IFtdLFxuICAgICAgICAgICAgdG9waWNzOiB3aW5kb3cuRGF0YVN0b3JlPy5hbGxUb3BpY3M/LigpID8/IFtdLFxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIHJldHVybiB7IGNvdXJzZXM6IFtdLCB0b3BpY3M6IFtdIH07XG4gICAgICAgIH1cbiAgICAgIH0pKCksXG4gICAgICAoYXN5bmMgKCkgPT4geyB0cnkgeyByZXR1cm4gYXdhaXQgd2luZG93LkRCPy5nZXRBbGxOb3Rlcz8uKCkgPz8gW107IH0gY2F0Y2ggeyByZXR1cm4gW107IH0gfSkoKSxcbiAgICAgIChhc3luYyAoKSA9PiB7IHRyeSB7IHJldHVybiBhd2FpdCB3aW5kb3cuREI/LmdldEFsbFRpbWVzdGFtcHM/LigpID8/IFtdOyB9IGNhdGNoIHsgcmV0dXJuIFtdOyB9IH0pKCksXG4gICAgICAoYXN5bmMgKCkgPT4geyB0cnkgeyByZXR1cm4gYXdhaXQgd2luZG93LkRCPy5nZXRBbGxBbm5vdGF0aW9ucz8uKCkgPz8gW107IH0gY2F0Y2ggeyByZXR1cm4gW107IH0gfSkoKSxcbiAgICBdKTtcbiAgICBjb25zdCBvcHRpb25zID0gW107XG4gICAgKGNhdGFsb2cuY291cnNlcyB8fCBbXSkuc2xpY2UoMCwgMjAwKS5mb3JFYWNoKChjb3Vyc2UpID0+IHtcbiAgICAgIGlmICghY291cnNlPy5pZCkgcmV0dXJuO1xuICAgICAgb3B0aW9ucy5wdXNoKHsgdHlwZTogJ2NvdXJzZScsIHRhcmdldDogU3RyaW5nKGNvdXJzZS5pZCksIGxhYmVsOiBTdHJpbmcoY291cnNlLnRpdGxlIHx8IGNvdXJzZS5uYW1lIHx8IGNvdXJzZS5pZCkgfSk7XG4gICAgfSk7XG4gICAgKGNhdGFsb2cudG9waWNzIHx8IFtdKS5zbGljZSgwLCAzMDApLmZvckVhY2goKHRvcGljKSA9PiB7XG4gICAgICBpZiAoIXRvcGljPy50b3BpY0lkKSByZXR1cm47XG4gICAgICBjb25zdCB0aXRsZSA9IFN0cmluZyh0b3BpYy50aXRsZSB8fCB0b3BpYy50b3BpY1RpdGxlIHx8IHRvcGljLnRvcGljSWQpO1xuICAgICAgY29uc3QgcGRmcyA9IEFycmF5LmlzQXJyYXkodG9waWMucGRmcykgPyB0b3BpYy5wZGZzIDogW107XG4gICAgICBpZiAocGRmcy5sZW5ndGgpIG9wdGlvbnMucHVzaCh7IHR5cGU6ICdwZGYnLCB0YXJnZXQ6IFN0cmluZyh0b3BpYy50b3BpY0lkKSwgbGFiZWw6IHRpdGxlIH0pO1xuICAgICAgb3B0aW9ucy5wdXNoKHsgdHlwZTogJ3RpbWVzdGFtcCcsIHRhcmdldDogU3RyaW5nKHRvcGljLnRvcGljSWQpLCBsYWJlbDogdGl0bGUgfSk7XG4gICAgfSk7XG4gICAgKG5vdGVzIHx8IFtdKS5zbGljZSgwLCAyMDApLmZvckVhY2goKG5vdGUpID0+IHtcbiAgICAgIGlmICghbm90ZT8uaWQpIHJldHVybjtcbiAgICAgIG9wdGlvbnMucHVzaCh7IHR5cGU6ICdub3RlJywgdGFyZ2V0OiBTdHJpbmcobm90ZS5pZCksIGxhYmVsOiBTdHJpbmcobm90ZS50aXRsZSB8fCBub3RlLmlkKSB9KTtcbiAgICB9KTtcbiAgICAodGltZXN0YW1wcyB8fCBbXSkuc2xpY2UoMCwgMjAwKS5mb3JFYWNoKCh0aW1lc3RhbXApID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IHRpbWVzdGFtcD8udG9waWNJZCB8fCB0aW1lc3RhbXA/LmlkO1xuICAgICAgaWYgKCF0YXJnZXQpIHJldHVybjtcbiAgICAgIG9wdGlvbnMucHVzaCh7IHR5cGU6ICd0aW1lc3RhbXAnLCB0YXJnZXQ6IFN0cmluZyh0YXJnZXQpLCBsYWJlbDogU3RyaW5nKHRpbWVzdGFtcC50aXRsZSB8fCB0aW1lc3RhbXAudG9waWNUaXRsZSB8fCB0aW1lc3RhbXAudG9waWNJZCB8fCB0YXJnZXQpIH0pO1xuICAgIH0pO1xuICAgIChhbm5vdGF0aW9ucyB8fCBbXSkuc2xpY2UoMCwgMjAwKS5mb3JFYWNoKChhbm5vdGF0aW9uKSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBhbm5vdGF0aW9uPy5pZCB8fCBhbm5vdGF0aW9uPy5kb2NJZDtcbiAgICAgIGlmICghdGFyZ2V0KSByZXR1cm47XG4gICAgICBvcHRpb25zLnB1c2goeyB0eXBlOiAncGRmJywgdGFyZ2V0OiBTdHJpbmcodGFyZ2V0KSwgbGFiZWw6IGBQREYgJHthbm5vdGF0aW9uLmRvY0lkIHx8IHRhcmdldH0ke2Fubm90YXRpb24ucGFnZSA/IGAgcC4ke2Fubm90YXRpb24ucGFnZX1gIDogJyd9YCB9KTtcbiAgICB9KTtcbiAgICBzdHVkaW9MaW5rT3B0aW9ucyA9IG9wdGlvbnM7XG4gICAgcmVuZGVySW5zcGVjdG9yKCk7XG4gIH07XG4gIGNvbnN0IHJlbmRlckluc3BlY3RvciA9ICgpID0+IHtcbiAgICBjb25zdCBib2FyZCA9IHdpbmRvdy5QbGFzbWFEZWNrPy5DYW52YXM/LnNlcmlhbGl6ZT8uKCk7XG4gICAgY29uc3QgbGF5ZXJzUm9vdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXN0dWRpby1sYXllcnNdJyk7XG4gICAgY29uc3QgZWxlbWVudHNSb290ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtc3R1ZGlvLWVsZW1lbnRzXScpO1xuICAgIGNvbnN0IHByb3BlcnRpZXNSb290ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtc3R1ZGlvLXByb3BlcnRpZXNdJyk7XG4gICAgaWYgKCFib2FyZCB8fCAhbGF5ZXJzUm9vdCB8fCAhZWxlbWVudHNSb290IHx8ICFwcm9wZXJ0aWVzUm9vdCkgcmV0dXJuO1xuICAgIGNvbnN0IGxheWVycyA9IEFycmF5LmlzQXJyYXkoYm9hcmQubGF5ZXJzKSA/IGJvYXJkLmxheWVycyA6IFtdO1xuICAgIGNvbnN0IGFjdGl2ZUxheWVySWR4ID0gTnVtYmVyLmlzRmluaXRlKE51bWJlcihib2FyZC5hY3RpdmVMYXllcklkeCkpID8gTnVtYmVyKGJvYXJkLmFjdGl2ZUxheWVySWR4KSA6IDA7XG4gICAgY29uc3QgbGF5ZXJOb2RlcyA9IGxheWVycy5tYXAoKGxheWVyLCBpbmRleCkgPT4ge1xuICAgICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICByb3cuY2xhc3NOYW1lID0gJ2NhcmQgY2FyZC1mbGF0JztcbiAgICAgIHJvdy5kYXRhc2V0LmxheWVySWQgPSBsYXllci5pZDtcbiAgICAgIHJvdy5zdHlsZS5wYWRkaW5nID0gJzEwcHgnO1xuICAgICAgcm93LnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG4gICAgICByb3cuc3R5bGUuZ2FwID0gJzhweCc7XG4gICAgICByb3cuc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xuICAgICAgcm93LnN0eWxlLmp1c3RpZnlDb250ZW50ID0gJ3NwYWNlLWJldHdlZW4nO1xuICAgICAgY29uc3QgbGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICAgIGxhYmVsLnR5cGUgPSAnYnV0dG9uJztcbiAgICAgIGxhYmVsLmNsYXNzTmFtZSA9IGluZGV4ID09PSBhY3RpdmVMYXllcklkeCA/ICdidG4gYnRuLXByaW1hcnkgYnRuLXNtJyA6ICdidG4gYnRuLWdob3N0IGJ0bi1zbSc7XG4gICAgICBsYWJlbC5kYXRhc2V0LnNldExheWVyID0gU3RyaW5nKGluZGV4KTtcbiAgICAgIGxhYmVsLnRleHRDb250ZW50ID0gYCR7bGF5ZXIubmFtZSB8fCBgTGF5ZXIgJHtpbmRleCArIDF9YH0gKCR7bGF5ZXIuZWxlbWVudHM/Lmxlbmd0aCB8fCAwfSlgO1xuICAgICAgcm93LmFwcGVuZENoaWxkKGxhYmVsKTtcbiAgICAgIGNvbnN0IGRlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICAgICAgZGVsLnR5cGUgPSAnYnV0dG9uJztcbiAgICAgIGRlbC5jbGFzc05hbWUgPSAnYnRuIGJ0bi1naG9zdCBidG4tc20nO1xuICAgICAgZGVsLmRhdGFzZXQuZGVsZXRlTGF5ZXIgPSBsYXllci5pZDtcbiAgICAgIGRlbC5kaXNhYmxlZCA9IGxheWVycy5sZW5ndGggPD0gMTtcbiAgICAgIGRlbC50ZXh0Q29udGVudCA9ICdEZWxldGUnO1xuICAgICAgcm93LmFwcGVuZENoaWxkKGRlbCk7XG4gICAgICByZXR1cm4gcm93O1xuICAgIH0pO1xuICAgIGxheWVyc1Jvb3QucmVwbGFjZUNoaWxkcmVuKC4uLihsYXllck5vZGVzLmxlbmd0aCA/IGxheWVyTm9kZXMgOiBbZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoJ05vIGxheWVycycpXSkpO1xuICAgIGNvbnN0IGVsZW1lbnRzID0gbGF5ZXJzLmZsYXRNYXAoKGxheWVyKSA9PiAoQXJyYXkuaXNBcnJheShsYXllci5lbGVtZW50cykgPyBsYXllci5lbGVtZW50cyA6IFtdKS5tYXAoKGVsZW1lbnQpID0+ICh7IC4uLmVsZW1lbnQsIGxheWVyTmFtZTogbGF5ZXIubmFtZSB9KSkpO1xuICAgIGNvbnN0IGVsZW1lbnROb2RlcyA9IGVsZW1lbnRzLm1hcCgoZWxlbWVudCkgPT4ge1xuICAgICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICByb3cuY2xhc3NOYW1lID0gJ2NhcmQgY2FyZC1mbGF0JztcbiAgICAgIHJvdy5zdHlsZS5wYWRkaW5nID0gJzEwcHgnO1xuICAgICAgcm93LnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG4gICAgICByb3cuc3R5bGUuZ2FwID0gJzhweCc7XG4gICAgICByb3cuc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xuICAgICAgcm93LnN0eWxlLmp1c3RpZnlDb250ZW50ID0gJ3NwYWNlLWJldHdlZW4nO1xuICAgICAgY29uc3QgbWV0YSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICAgIG1ldGEuY2xhc3NOYW1lID0gJ3RleHQtc20nO1xuICAgICAgY29uc3QgbGlua1RleHQgPSBlbGVtZW50LmxpbmtUeXBlIHx8IGVsZW1lbnQubGlua1RhcmdldCA/IGAgXHUwMEI3IGxpbmtzICR7ZWxlbWVudC5saW5rVHlwZSB8fCAncmVzb3VyY2UnfSR7ZWxlbWVudC5saW5rTGFiZWwgPyBgOiAke2VsZW1lbnQubGlua0xhYmVsfWAgOiAnJ31gIDogJyc7XG4gICAgICBtZXRhLnRleHRDb250ZW50ID0gYCR7ZWxlbWVudC50eXBlIHx8ICdlbGVtZW50J30gXHUwMEI3ICR7ZWxlbWVudC50ZXh0IHx8IGVsZW1lbnQuaWQgfHwgJ1VudGl0bGVkJ30gXHUwMEI3ICR7ZWxlbWVudC5sYXllck5hbWUgfHwgJ0xheWVyJ30ke2xpbmtUZXh0fWA7XG4gICAgICByb3cuYXBwZW5kQ2hpbGQobWV0YSk7XG4gICAgICBjb25zdCBpbnNwZWN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgICBpbnNwZWN0LnR5cGUgPSAnYnV0dG9uJztcbiAgICAgIGluc3BlY3QuY2xhc3NOYW1lID0gZWxlbWVudC5pZCA9PT0gaW5zcGVjdGVkRWxlbWVudElkID8gJ2J0biBidG4tcHJpbWFyeSBidG4tc20nIDogJ2J0biBidG4tZ2hvc3QgYnRuLXNtJztcbiAgICAgIGluc3BlY3QuZGF0YXNldC5pbnNwZWN0RWxlbWVudCA9IGVsZW1lbnQuaWQ7XG4gICAgICBpbnNwZWN0LnRleHRDb250ZW50ID0gJ0luc3BlY3QnO1xuICAgICAgcm93LmFwcGVuZENoaWxkKGluc3BlY3QpO1xuICAgICAgaWYgKGVsZW1lbnQubGlua1R5cGUgfHwgZWxlbWVudC5saW5rVGFyZ2V0KSB7XG4gICAgICAgIGNvbnN0IG9wZW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICAgICAgb3Blbi50eXBlID0gJ2J1dHRvbic7XG4gICAgICAgIG9wZW4uY2xhc3NOYW1lID0gJ2J0biBidG4tZ2hvc3QgYnRuLXNtJztcbiAgICAgICAgb3Blbi5kYXRhc2V0Lm9wZW5TdHVkaW9MaW5rID0gZWxlbWVudC5pZDtcbiAgICAgICAgb3Blbi50ZXh0Q29udGVudCA9ICdPcGVuJztcbiAgICAgICAgcm93LmFwcGVuZENoaWxkKG9wZW4pO1xuICAgICAgfVxuICAgICAgY29uc3QgZGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgICBkZWwudHlwZSA9ICdidXR0b24nO1xuICAgICAgZGVsLmNsYXNzTmFtZSA9ICdidG4gYnRuLWdob3N0IGJ0bi1zbSc7XG4gICAgICBkZWwuZGF0YXNldC5kZWxldGVFbGVtZW50ID0gZWxlbWVudC5pZDtcbiAgICAgIGRlbC50ZXh0Q29udGVudCA9ICdEZWxldGUnO1xuICAgICAgcm93LmFwcGVuZENoaWxkKGRlbCk7XG4gICAgICByZXR1cm4gcm93O1xuICAgIH0pO1xuICAgIGVsZW1lbnRzUm9vdC5yZXBsYWNlQ2hpbGRyZW4oLi4uKGVsZW1lbnROb2Rlcy5sZW5ndGggPyBlbGVtZW50Tm9kZXMgOiBbZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoJ05vIGVsZW1lbnRzJyldKSk7XG4gICAgY29uc3QgaW5zcGVjdGVkID0gZWxlbWVudHMuZmluZCgoZWxlbWVudCkgPT4gZWxlbWVudC5pZCA9PT0gaW5zcGVjdGVkRWxlbWVudElkKTtcbiAgICBpZiAoIWluc3BlY3RlZCkge1xuICAgICAgaWYgKGluc3BlY3RlZEVsZW1lbnRJZCkgaW5zcGVjdGVkRWxlbWVudElkID0gbnVsbDtcbiAgICAgIHByb3BlcnRpZXNSb290LnJlcGxhY2VDaGlsZHJlbihkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnU2VsZWN0IGFuIGVsZW1lbnQgdG8gZWRpdCBpdHMgcHJvcGVydGllcy4nKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHdyYXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICB3cmFwLmNsYXNzTmFtZSA9ICdjYXJkIGNhcmQtZmxhdCc7XG4gICAgd3JhcC5zdHlsZS5wYWRkaW5nID0gJzEwcHgnO1xuICAgIHdyYXAuc3R5bGUuZGlzcGxheSA9ICdncmlkJztcbiAgICB3cmFwLnN0eWxlLmdhcCA9ICc4cHgnO1xuICAgIGNvbnN0IHRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3Ryb25nJyk7XG4gICAgdGl0bGUudGV4dENvbnRlbnQgPSBgSW5zcGVjdGluZyAke2luc3BlY3RlZC50eXBlIHx8ICdlbGVtZW50J31gO1xuICAgIHdyYXAuYXBwZW5kQ2hpbGQodGl0bGUpO1xuICAgIGNvbnN0IHRleHRJbnB1dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lucHV0Jyk7XG4gICAgdGV4dElucHV0LmNsYXNzTmFtZSA9ICdpbnB1dCBpbnB1dC1zbSc7XG4gICAgdGV4dElucHV0LmRhdGFzZXQuc3R1ZGlvUHJvcFRleHQgPSAnJztcbiAgICB0ZXh0SW5wdXQucGxhY2Vob2xkZXIgPSAnVGV4dCc7XG4gICAgdGV4dElucHV0LnZhbHVlID0gaW5zcGVjdGVkLnRleHQgfHwgJyc7XG4gICAgd3JhcC5hcHBlbmRDaGlsZCh0ZXh0SW5wdXQpO1xuICAgIGNvbnN0IGxpbmtSb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBsaW5rUm93LnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG4gICAgbGlua1Jvdy5zdHlsZS5nYXAgPSAnOHB4JztcbiAgICBsaW5rUm93LnN0eWxlLmZsZXhXcmFwID0gJ3dyYXAnO1xuICAgIGNvbnN0IGxpbmtUeXBlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2VsZWN0Jyk7XG4gICAgbGlua1R5cGUuY2xhc3NOYW1lID0gJ3NlbGVjdCBpbnB1dC1zbSc7XG4gICAgbGlua1R5cGUuZGF0YXNldC5zdHVkaW9Qcm9wTGlua1R5cGUgPSAnJztcbiAgICBbXG4gICAgICBbJycsICdObyBsaW5rJ10sXG4gICAgICBbJ2NvdXJzZScsICdDb3Vyc2UnXSxcbiAgICAgIFsncGRmJywgJ1BERiddLFxuICAgICAgWydub3RlJywgJ05vdGUnXSxcbiAgICAgIFsndGltZXN0YW1wJywgJ1RpbWVzdGFtcCddLFxuICAgICAgWyd1cmwnLCAnVVJMJ10sXG4gICAgXS5mb3JFYWNoKChbdmFsdWUsIGxhYmVsXSkgPT4ge1xuICAgICAgY29uc3Qgb3B0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnb3B0aW9uJyk7XG4gICAgICBvcHRpb24udmFsdWUgPSB2YWx1ZTtcbiAgICAgIG9wdGlvbi50ZXh0Q29udGVudCA9IGxhYmVsO1xuICAgICAgaWYgKChpbnNwZWN0ZWQubGlua1R5cGUgfHwgJycpID09PSB2YWx1ZSkgb3B0aW9uLnNlbGVjdGVkID0gdHJ1ZTtcbiAgICAgIGxpbmtUeXBlLmFwcGVuZENoaWxkKG9wdGlvbik7XG4gICAgfSk7XG4gICAgbGlua1Jvdy5hcHBlbmRDaGlsZChsaW5rVHlwZSk7XG4gICAgW1xuICAgICAgWydMaW5rIHRhcmdldCcsICdzdHVkaW9Qcm9wTGlua1RhcmdldCcsIGluc3BlY3RlZC5saW5rVGFyZ2V0IHx8ICcnXSxcbiAgICAgIFsnTGluayBsYWJlbCcsICdzdHVkaW9Qcm9wTGlua0xhYmVsJywgaW5zcGVjdGVkLmxpbmtMYWJlbCB8fCAnJ10sXG4gICAgXS5mb3JFYWNoKChbbGFiZWxUZXh0LCBrZXksIHZhbHVlXSkgPT4ge1xuICAgICAgY29uc3QgaW5wdXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpbnB1dCcpO1xuICAgICAgaW5wdXQuY2xhc3NOYW1lID0gJ2lucHV0IGlucHV0LXNtJztcbiAgICAgIGlucHV0LmRhdGFzZXRba2V5XSA9ICcnO1xuICAgICAgaW5wdXQucGxhY2Vob2xkZXIgPSBsYWJlbFRleHQ7XG4gICAgICBpbnB1dC52YWx1ZSA9IFN0cmluZyh2YWx1ZSA/PyAnJyk7XG4gICAgICBpbnB1dC5zdHlsZS5taW5XaWR0aCA9ICcxODBweCc7XG4gICAgICBpZiAoa2V5ID09PSAnc3R1ZGlvUHJvcExpbmtUYXJnZXQnKSBpbnB1dC5zZXRBdHRyaWJ1dGUoJ2xpc3QnLCAnc3R1ZGlvLWxpbmstdGFyZ2V0LW9wdGlvbnMnKTtcbiAgICAgIGxpbmtSb3cuYXBwZW5kQ2hpbGQoaW5wdXQpO1xuICAgIH0pO1xuICAgIGNvbnN0IGxpbmtPcHRpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGF0YWxpc3QnKTtcbiAgICBsaW5rT3B0aW9ucy5pZCA9ICdzdHVkaW8tbGluay10YXJnZXQtb3B0aW9ucyc7XG4gICAgY29uc3Qgc2VsZWN0ZWRUeXBlID0gaW5zcGVjdGVkLmxpbmtUeXBlIHx8ICcnO1xuICAgIHN0dWRpb0xpbmtPcHRpb25zXG4gICAgICAuZmlsdGVyKChvcHRpb24pID0+ICFzZWxlY3RlZFR5cGUgfHwgb3B0aW9uLnR5cGUgPT09IHNlbGVjdGVkVHlwZSlcbiAgICAgIC5zbGljZSgwLCAxMjApXG4gICAgICAuZm9yRWFjaCgob3B0aW9uKSA9PiB7XG4gICAgICAgIGNvbnN0IGl0ZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvcHRpb24nKTtcbiAgICAgICAgaXRlbS52YWx1ZSA9IG9wdGlvbi50YXJnZXQ7XG4gICAgICAgIGl0ZW0ubGFiZWwgPSBgJHtvcHRpb24ubGFiZWx9ICgke29wdGlvbi50eXBlfSlgO1xuICAgICAgICBsaW5rT3B0aW9ucy5hcHBlbmRDaGlsZChpdGVtKTtcbiAgICAgIH0pO1xuICAgIGxpbmtSb3cuYXBwZW5kQ2hpbGQobGlua09wdGlvbnMpO1xuICAgIHdyYXAuYXBwZW5kQ2hpbGQobGlua1Jvdyk7XG4gICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgcm93LnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG4gICAgcm93LnN0eWxlLmdhcCA9ICc4cHgnO1xuICAgIHJvdy5zdHlsZS5mbGV4V3JhcCA9ICd3cmFwJztcbiAgICBbXG4gICAgICBbJ1gnLCAnc3R1ZGlvUHJvcFgnLCBpbnNwZWN0ZWQueCA/PyAnJ10sXG4gICAgICBbJ1knLCAnc3R1ZGlvUHJvcFknLCBpbnNwZWN0ZWQueSA/PyAnJ10sXG4gICAgICBbJ0ZpbGwnLCAnc3R1ZGlvUHJvcEZpbGwnLCBpbnNwZWN0ZWQuZmlsbCB8fCAndHJhbnNwYXJlbnQnXSxcbiAgICAgIFsnU3Ryb2tlJywgJ3N0dWRpb1Byb3BTdHJva2UnLCBpbnNwZWN0ZWQuc3Ryb2tlIHx8IGluc3BlY3RlZC5jb2xvciB8fCAnIzYzNjZmMSddLFxuICAgICAgWydXaWR0aCcsICdzdHVkaW9Qcm9wV2lkdGgnLCBpbnNwZWN0ZWQud2lkdGggPz8gJyddLFxuICAgICAgWydIZWlnaHQnLCAnc3R1ZGlvUHJvcEhlaWdodCcsIGluc3BlY3RlZC5oZWlnaHQgPz8gJyddLFxuICAgICAgWydTdHJva2Ugd2lkdGgnLCAnc3R1ZGlvUHJvcFN0cm9rZVdpZHRoJywgaW5zcGVjdGVkLnN0cm9rZVdpZHRoID8/ICcnXSxcbiAgICAgIFsnRm9udCBzaXplJywgJ3N0dWRpb1Byb3BGb250U2l6ZScsIGluc3BlY3RlZC5mb250U2l6ZSA/PyAnJ10sXG4gICAgXS5mb3JFYWNoKChbbGFiZWxUZXh0LCBrZXksIHZhbHVlXSkgPT4ge1xuICAgICAgY29uc3QgaW5wdXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpbnB1dCcpO1xuICAgICAgaW5wdXQuY2xhc3NOYW1lID0gJ2lucHV0IGlucHV0LXNtJztcbiAgICAgIGlucHV0LmRhdGFzZXRba2V5XSA9ICcnO1xuICAgICAgaW5wdXQucGxhY2Vob2xkZXIgPSBsYWJlbFRleHQ7XG4gICAgICBpbnB1dC52YWx1ZSA9IFN0cmluZyh2YWx1ZSA/PyAnJyk7XG4gICAgICBpbnB1dC5zdHlsZS5tYXhXaWR0aCA9ICcxMzBweCc7XG4gICAgICByb3cuYXBwZW5kQ2hpbGQoaW5wdXQpO1xuICAgIH0pO1xuICAgIHdyYXAuYXBwZW5kQ2hpbGQocm93KTtcbiAgICBjb25zdCBhcHBseSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICAgIGFwcGx5LnR5cGUgPSAnYnV0dG9uJztcbiAgICBhcHBseS5jbGFzc05hbWUgPSAnYnRuIGJ0bi1wcmltYXJ5IGJ0bi1zbSc7XG4gICAgYXBwbHkuZGF0YXNldC5zdHVkaW9BcHBseVByb3BzID0gaW5zcGVjdGVkLmlkO1xuICAgIGFwcGx5LnRleHRDb250ZW50ID0gJ0FwcGx5IHByb3BlcnRpZXMnO1xuICAgIHdyYXAuYXBwZW5kQ2hpbGQoYXBwbHkpO1xuICAgIGlmIChpbnNwZWN0ZWQubGlua1R5cGUgfHwgaW5zcGVjdGVkLmxpbmtUYXJnZXQpIHtcbiAgICAgIGNvbnN0IG9wZW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICAgIG9wZW4udHlwZSA9ICdidXR0b24nO1xuICAgICAgb3Blbi5jbGFzc05hbWUgPSAnYnRuIGJ0bi1naG9zdCBidG4tc20nO1xuICAgICAgb3Blbi5kYXRhc2V0Lm9wZW5TdHVkaW9MaW5rID0gaW5zcGVjdGVkLmlkO1xuICAgICAgb3Blbi50ZXh0Q29udGVudCA9ICdPcGVuIGxpbmtlZCByZXNvdXJjZSc7XG4gICAgICB3cmFwLmFwcGVuZENoaWxkKG9wZW4pO1xuICAgIH1cbiAgICBwcm9wZXJ0aWVzUm9vdC5yZXBsYWNlQ2hpbGRyZW4od3JhcCk7XG4gIH07XG4gIGNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHVkaW8tY2FudmFzJyk7XG4gIGlmIChjYW52YXMpIHtcbiAgICAvLyBHaXZlIGl0IGEgc2l6ZTsgY2FudmFzLmpzIHJlYWRzIG9mZnNldFdpZHRoL0hlaWdodFxuICAgIGNhbnZhcy5zdHlsZS53aWR0aCA9ICcxMDAlJztcbiAgICBjYW52YXMuc3R5bGUuaGVpZ2h0ID0gJzcwdmgnO1xuICAgIHRyeSB7IHdpbmRvdy5QbGFzbWFEZWNrPy5DYW52YXM/LmluaXQ/LihjYW52YXMpOyB9IGNhdGNoIChlKSB7IGNvbnNvbGUud2FybignW1N0dWRpbyB2aWV3XSBpbml0IGZhaWxlZCcsIGUpOyB9XG4gIH1cbiAgY29uc3QgbG9hZFNhdmVkQm9hcmQgPSBhc3luYyAocXVpZXQgPSBmYWxzZSkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBib2FyZCA9IGF3YWl0IHdpbmRvdy5EQj8uZ2V0U2V0dGluZz8uKGJvYXJkS2V5KTtcbiAgICAgIGlmIChib2FyZCAmJiB0eXBlb2YgYm9hcmQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIHdpbmRvdy5QbGFzbWFEZWNrPy5DYW52YXM/LmxvYWRTdGF0ZT8uKGJvYXJkKTtcbiAgICAgICAgc2V0U3RhdHVzKCdTYXZlZCBib2FyZCBsb2FkZWQnKTtcbiAgICAgICAgcmVuZGVySW5zcGVjdG9yKCk7XG4gICAgICB9IGVsc2UgaWYgKCFxdWlldCkge1xuICAgICAgICBzZXRTdGF0dXMoJ05vIHNhdmVkIGJvYXJkIHlldCcpO1xuICAgICAgfVxuICAgIH0gY2F0Y2gge1xuICAgICAgc2V0U3RhdHVzKCdMb2FkIGZhaWxlZCcpO1xuICAgIH1cbiAgfTtcbiAgY29uc3Qgc2F2ZUJvYXJkID0gYXN5bmMgKCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBib2FyZCA9IHdpbmRvdy5QbGFzbWFEZWNrPy5DYW52YXM/LnNlcmlhbGl6ZT8uKCk7XG4gICAgICBpZiAoIWJvYXJkIHx8ICF3aW5kb3cuREI/LnNhdmVTZXR0aW5nKSB0aHJvdyBuZXcgRXJyb3IoJ1N0dWRpbyBzdG9yYWdlIHVuYXZhaWxhYmxlJyk7XG4gICAgICBhd2FpdCB3aW5kb3cuREIuc2F2ZVNldHRpbmcoYm9hcmRLZXksIGJvYXJkKTtcbiAgICAgIHNldFN0YXR1cyhgU2F2ZWQgJHtuZXcgRGF0ZSgpLnRvTG9jYWxlVGltZVN0cmluZygpfWApO1xuICAgICAgVG9hc3Quc3VjY2VzcygnU3R1ZGlvIGJvYXJkIHNhdmVkJyk7XG4gICAgfSBjYXRjaCB7XG4gICAgICBzZXRTdGF0dXMoJ1NhdmUgZmFpbGVkJyk7XG4gICAgICBUb2FzdC5lcnJvcignU3R1ZGlvIHNhdmUgZmFpbGVkJyk7XG4gICAgfVxuICB9O1xuICBjb25zdCBwZXJzaXN0Qm9hcmRDaGFuZ2UgPSBhc3luYyAoc3RhdHVzVGV4dCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBib2FyZCA9IHdpbmRvdy5QbGFzbWFEZWNrPy5DYW52YXM/LnNlcmlhbGl6ZT8uKCk7XG4gICAgICBpZiAoYm9hcmQgJiYgd2luZG93LkRCPy5zYXZlU2V0dGluZykgYXdhaXQgd2luZG93LkRCLnNhdmVTZXR0aW5nKGJvYXJkS2V5LCBib2FyZCk7XG4gICAgICBzZXRTdGF0dXMoc3RhdHVzVGV4dCk7XG4gICAgICByZW5kZXJJbnNwZWN0b3IoKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHNldFN0YXR1cygnQXV0b3NhdmUgZmFpbGVkJyk7XG4gICAgICBUb2FzdC5lcnJvcignU3R1ZGlvIGF1dG9zYXZlIGZhaWxlZCcpO1xuICAgIH1cbiAgfTtcbiAgY29uc3QgYm9hcmRIYXNFbGVtZW50ID0gKGJvYXJkLCBlbGVtZW50SWQpID0+IHtcbiAgICBpZiAoIWVsZW1lbnRJZCkgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiAoYm9hcmQ/LmxheWVycyB8fCBbXSkuc29tZSgobGF5ZXIpID0+XG4gICAgICAoQXJyYXkuaXNBcnJheShsYXllci5lbGVtZW50cykgPyBsYXllci5lbGVtZW50cyA6IFtdKS5zb21lKChlbGVtZW50KSA9PiBlbGVtZW50Py5pZCA9PT0gZWxlbWVudElkKVxuICAgICk7XG4gIH07XG4gIGNvbnN0IHJlZnJlc2hGcm9tU3luYyA9IGFzeW5jIChwYXlsb2FkID0ge30pID0+IHtcbiAgICBpZiAocGF5bG9hZD8ua2luZCAhPT0gJ3NldHRpbmcnIHx8IHBheWxvYWQ/LnJlY29yZD8ua2V5ICE9PSBib2FyZEtleSkge1xuICAgICAgcmV0dXJuIHsgcmVmcmVzaGVkOiBmYWxzZSwgcmVhc29uOiAnaWdub3JlZC1raW5kJyB9O1xuICAgIH1cbiAgICBpZiAoaW50ZXJhY3RpdmVTYXZlVGltZXIpIHtcbiAgICAgIHNldFN0YXR1cygnU3R1ZGlvIHN5bmMgZGVmZXJyZWQgd2hpbGUgbG9jYWwgY2hhbmdlcyBzYXZlJyk7XG4gICAgICByZXR1cm4geyByZWZyZXNoZWQ6IGZhbHNlLCByZWFzb246ICdwZW5kaW5nLWxvY2FsLWNoYW5nZScgfTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGJvYXJkID0gYXdhaXQgd2luZG93LkRCPy5nZXRTZXR0aW5nPy4oYm9hcmRLZXkpO1xuICAgICAgaWYgKCFib2FyZCB8fCB0eXBlb2YgYm9hcmQgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkoYm9hcmQpKSB7XG4gICAgICAgIHJldHVybiB7IHJlZnJlc2hlZDogZmFsc2UsIHJlYXNvbjogJ21pc3NpbmctYm9hcmQnIH07XG4gICAgICB9XG4gICAgICBjb25zdCBsb2FkZWQgPSB3aW5kb3cuUGxhc21hRGVjaz8uQ2FudmFzPy5sb2FkU3RhdGU/Lihib2FyZCwge1xuICAgICAgICBwcmVzZXJ2ZVNlbGVjdGlvbjogdHJ1ZSxcbiAgICAgICAgcHJlc2VydmVUb29sOiB0cnVlLFxuICAgICAgICBwcmVzZXJ2ZVZpZXdwb3J0OiB0cnVlLFxuICAgICAgfSk7XG4gICAgICBpZiAoIWxvYWRlZCkgcmV0dXJuIHsgcmVmcmVzaGVkOiBmYWxzZSwgcmVhc29uOiAnbG9hZC11bmF2YWlsYWJsZScgfTtcbiAgICAgIGlmICghYm9hcmRIYXNFbGVtZW50KGxvYWRlZCwgaW5zcGVjdGVkRWxlbWVudElkKSkgaW5zcGVjdGVkRWxlbWVudElkID0gbnVsbDtcbiAgICAgIHJlbmRlckluc3BlY3RvcigpO1xuICAgICAgdXBkYXRlVG9vbEJ1dHRvbnMoKTtcbiAgICAgIHNldFN0YXR1cygnU3R1ZGlvIGJvYXJkIHN5bmNlZCcpO1xuICAgICAgY29uc3Qgc2VsZWN0ZWRJZHMgPSB3aW5kb3cuUGxhc21hRGVjaz8uQ2FudmFzPy5nZXRTdGF0ZT8uKCk/LnNlbGVjdGVkSWRzIHx8IFtdO1xuICAgICAgY29uc3QgcmVzdWx0ID0ge1xuICAgICAgICByZWZyZXNoZWQ6IHRydWUsXG4gICAgICAgIGtleTogYm9hcmRLZXksXG4gICAgICAgIHNlbGVjdGVkSWRzLFxuICAgICAgICBpbnNwZWN0ZWRFbGVtZW50SWQsXG4gICAgICB9O1xuICAgICAgd2luZG93LlBsYXNtYURlY2s/LmJ1cz8uZW1pdD8uKCdzdHVkaW86c3luYy1yZWZyZXNoJywgcmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBjYXRjaCB7XG4gICAgICBzZXRTdGF0dXMoJ1N0dWRpbyBzeW5jIGZhaWxlZCcpO1xuICAgICAgcmV0dXJuIHsgcmVmcmVzaGVkOiBmYWxzZSwgcmVhc29uOiAnbG9hZC1mYWlsZWQnIH07XG4gICAgfVxuICB9O1xuICBjb25zdCBiaW5kU3luY1JlZnJlc2ggPSAoKSA9PiB7XG4gICAgY29uc3QgYnVzID0gd2luZG93LlBsYXNtYURlY2s/LmJ1cztcbiAgICBpZiAoIWJ1cz8ub24gfHwgc3luY0hhbmRsZXIpIHJldHVybjtcbiAgICBzeW5jSGFuZGxlciA9IChwYXlsb2FkKSA9PiB7XG4gICAgICByZWZyZXNoRnJvbVN5bmMocGF5bG9hZCkuY2F0Y2g/LigoKSA9PiB7fSk7XG4gICAgfTtcbiAgICBidXMub24oJ3N5bmM6bWVzc2FnZScsIHN5bmNIYW5kbGVyKTtcbiAgfTtcbiAgY29uc3QgdW5iaW5kU3luY1JlZnJlc2ggPSAoKSA9PiB7XG4gICAgaWYgKHN5bmNIYW5kbGVyKSB3aW5kb3cuUGxhc21hRGVjaz8uYnVzPy5vZmY/Lignc3luYzptZXNzYWdlJywgc3luY0hhbmRsZXIpO1xuICAgIHN5bmNIYW5kbGVyID0gbnVsbDtcbiAgfTtcbiAgY29uc3QgcmVhZERyb3BwZWRJbWFnZUZpbGUgPSAoZmlsZSkgPT4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGlmICghZmlsZSB8fCAhL15pbWFnZVxcLy9pLnRlc3QoZmlsZS50eXBlIHx8ICcnKSkge1xuICAgICAgcmVqZWN0KG5ldyBFcnJvcignRHJvcHBlZCBmaWxlIGlzIG5vdCBhbiBpbWFnZScpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTtcbiAgICByZWFkZXIub25sb2FkID0gKCkgPT4gcmVzb2x2ZShTdHJpbmcocmVhZGVyLnJlc3VsdCB8fCAnJykpO1xuICAgIHJlYWRlci5vbmVycm9yID0gKCkgPT4gcmVqZWN0KG5ldyBFcnJvcignRHJvcHBlZCBpbWFnZSBjb3VsZCBub3QgYmUgcmVhZCcpKTtcbiAgICByZWFkZXIucmVhZEFzRGF0YVVSTChmaWxlKTtcbiAgfSk7XG4gIGNvbnN0IGdldERyb3BJbWFnZVNvdXJjZSA9IGFzeW5jIChldmVudCkgPT4ge1xuICAgIGNvbnN0IGZpbGVzID0gQXJyYXkuZnJvbShldmVudC5kYXRhVHJhbnNmZXI/LmZpbGVzIHx8IFtdKTtcbiAgICBjb25zdCBpbWFnZUZpbGUgPSBmaWxlcy5maW5kKChmaWxlKSA9PiAvXmltYWdlXFwvL2kudGVzdChmaWxlLnR5cGUgfHwgJycpKTtcbiAgICBpZiAoaW1hZ2VGaWxlKSByZXR1cm4gcmVhZERyb3BwZWRJbWFnZUZpbGUoaW1hZ2VGaWxlKTtcbiAgICBjb25zdCB1cmkgPSBldmVudC5kYXRhVHJhbnNmZXI/LmdldERhdGE/LigndGV4dC91cmktbGlzdCcpIHx8ICcnO1xuICAgIGNvbnN0IHRleHQgPSBldmVudC5kYXRhVHJhbnNmZXI/LmdldERhdGE/LigndGV4dC9wbGFpbicpIHx8ICcnO1xuICAgIHJldHVybiBTdHJpbmcodXJpIHx8IHRleHQgfHwgJycpLnNwbGl0KC9cXHI/XFxuLykuZmluZCgobGluZSkgPT4gbGluZS50cmltKCkgJiYgIWxpbmUudHJpbSgpLnN0YXJ0c1dpdGgoJyMnKSk/LnRyaW0oKSB8fCAnJztcbiAgfTtcbiAgY29uc3QgdXBkYXRlVG9vbEJ1dHRvbnMgPSAoKSA9PiB7XG4gICAgY29uc3QgdG9vbCA9IHdpbmRvdy5QbGFzbWFEZWNrPy5DYW52YXM/LmdldFN0YXRlPy4oKT8udG9vbCB8fCAncGVuJztcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1zdHVkaW8tdG9vbF0nKS5mb3JFYWNoKChidXR0b24pID0+IHtcbiAgICAgIGNvbnN0IGFjdGl2ZSA9IGJ1dHRvbi5kYXRhc2V0LnN0dWRpb1Rvb2wgPT09IHRvb2w7XG4gICAgICBidXR0b24uY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgYWN0aXZlKTtcbiAgICAgIGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtcHJlc3NlZCcsIGFjdGl2ZSA/ICd0cnVlJyA6ICdmYWxzZScpO1xuICAgIH0pO1xuICB9O1xuICBvbihjYW52YXMsICdwbGFzbWE6c3R1ZGlvLWJvYXJkLWNoYW5nZScsICgpID0+IHtcbiAgICByZW5kZXJJbnNwZWN0b3IoKTtcbiAgICBjbGVhclRpbWVvdXQoaW50ZXJhY3RpdmVTYXZlVGltZXIpO1xuICAgIGludGVyYWN0aXZlU2F2ZVRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBwZXJzaXN0Qm9hcmRDaGFuZ2UoJ0JvYXJkIHVwZGF0ZWQnKTtcbiAgICB9LCAxMjApO1xuICB9KTtcbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtc3R1ZGlvLXRvb2xdJykuZm9yRWFjaCgoYnV0dG9uKSA9PiB7XG4gICAgb24oYnV0dG9uLCAnY2xpY2snLCAoKSA9PiB7XG4gICAgICBjb25zdCBzZWxlY3RlZCA9IHdpbmRvdy5QbGFzbWFEZWNrPy5DYW52YXM/LnNldFRvb2w/LihidXR0b24uZGF0YXNldC5zdHVkaW9Ub29sKTtcbiAgICAgIHNldFN0YXR1cyhgJHtzZWxlY3RlZCA9PT0gJ3BlbicgPyAnUGVuJyA6ICdTZWxlY3QnfSB0b29sIGFjdGl2ZWApO1xuICAgICAgdXBkYXRlVG9vbEJ1dHRvbnMoKTtcbiAgICB9KTtcbiAgfSk7XG4gIG9uKGNhbnZhcywgJ2RyYWdvdmVyJywgKGV2ZW50KSA9PiB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBpZiAoZXZlbnQuZGF0YVRyYW5zZmVyKSBldmVudC5kYXRhVHJhbnNmZXIuZHJvcEVmZmVjdCA9ICdjb3B5JztcbiAgfSk7XG4gIG9uKGNhbnZhcywgJ2Ryb3AnLCBhc3luYyAoZXZlbnQpID0+IHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBzb3VyY2UgPSBhd2FpdCBnZXREcm9wSW1hZ2VTb3VyY2UoZXZlbnQpO1xuICAgICAgY29uc3QgcG9pbnQgPSB3aW5kb3cuUGxhc21hRGVjaz8uQ2FudmFzPy5zY3JlZW5Ub1dvcmxkPy4oZXZlbnQuY2xpZW50WCwgZXZlbnQuY2xpZW50WSkgfHwgeyB4OiAxMjAsIHk6IDEyMCB9O1xuICAgICAgY29uc3QgZWxlbWVudCA9IHdpbmRvdy5QbGFzbWFEZWNrPy5DYW52YXM/LmFkZEltYWdlPy4oc291cmNlLCB7XG4gICAgICAgIHg6IE1hdGgubWF4KDAsIHBvaW50LnggLSAxNDApLFxuICAgICAgICB5OiBNYXRoLm1heCgwLCBwb2ludC55IC0gODApLFxuICAgICAgfSk7XG4gICAgICBpZiAoIWVsZW1lbnQpIHRocm93IG5ldyBFcnJvcignRHJvcHBlZCBtZWRpYSB3YXMgcmVqZWN0ZWQnKTtcbiAgICAgIGF3YWl0IHBlcnNpc3RCb2FyZENoYW5nZSgnRHJvcHBlZCBpbWFnZSBhZGRlZCcpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgc2V0U3RhdHVzKCdEcm9wIGZhaWxlZCcpO1xuICAgICAgVG9hc3QuZXJyb3IoJ1N0dWRpbyBkcm9wIHJlamVjdGVkJyk7XG4gICAgfVxuICB9KTtcbiAgdXBkYXRlVG9vbEJ1dHRvbnMoKTtcbiAgb24oZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtc3R1ZGlvLWFkZC10ZXh0XScpLCAnY2xpY2snLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgaW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1zdHVkaW8tdGV4dF0nKTtcbiAgICBjb25zdCB0ZXh0ID0gU3RyaW5nKGlucHV0Py52YWx1ZSB8fCAnTmV3IG5vdGUnKS50cmltKCkgfHwgJ05ldyBub3RlJztcbiAgICBjb25zdCBlbGVtZW50ID0gd2luZG93LlBsYXNtYURlY2s/LkNhbnZhcz8uYWRkVGV4dD8uKHRleHQpO1xuICAgIGlmICghZWxlbWVudCkge1xuICAgICAgc2V0U3RhdHVzKCdBZGQgbm90ZSBmYWlsZWQnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGlucHV0KSBpbnB1dC52YWx1ZSA9ICcnO1xuICAgIGF3YWl0IHBlcnNpc3RCb2FyZENoYW5nZSgnTm90ZSBhZGRlZCcpO1xuICB9KTtcbiAgb24oZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtc3R1ZGlvLWFkZC1jYXJkXScpLCAnY2xpY2snLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgZWxlbWVudCA9IHdpbmRvdy5QbGFzbWFEZWNrPy5DYW52YXM/LmFkZENhcmQ/LigpO1xuICAgIGlmICghZWxlbWVudCkge1xuICAgICAgc2V0U3RhdHVzKCdBZGQgY2FyZCBmYWlsZWQnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgYXdhaXQgcGVyc2lzdEJvYXJkQ2hhbmdlKCdDYXJkIGFkZGVkJyk7XG4gIH0pO1xuICBvbihkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1zdHVkaW8tYWRkLXJlY3RdJyksICdjbGljaycsIGFzeW5jICgpID0+IHtcbiAgICBjb25zdCBlbGVtZW50ID0gd2luZG93LlBsYXNtYURlY2s/LkNhbnZhcz8uYWRkUmVjdGFuZ2xlPy4oKTtcbiAgICBpZiAoIWVsZW1lbnQpIHtcbiAgICAgIHNldFN0YXR1cygnQWRkIHJlY3RhbmdsZSBmYWlsZWQnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgYXdhaXQgcGVyc2lzdEJvYXJkQ2hhbmdlKCdSZWN0YW5nbGUgYWRkZWQnKTtcbiAgfSk7XG4gIG9uKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXN0dWRpby1hZGQtY2lyY2xlXScpLCAnY2xpY2snLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgZWxlbWVudCA9IHdpbmRvdy5QbGFzbWFEZWNrPy5DYW52YXM/LmFkZENpcmNsZT8uKCk7XG4gICAgaWYgKCFlbGVtZW50KSB7XG4gICAgICBzZXRTdGF0dXMoJ0FkZCBjaXJjbGUgZmFpbGVkJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGF3YWl0IHBlcnNpc3RCb2FyZENoYW5nZSgnQ2lyY2xlIGFkZGVkJyk7XG4gIH0pO1xuICBvbihkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1zdHVkaW8tYWRkLWFycm93XScpLCAnY2xpY2snLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgZWxlbWVudCA9IHdpbmRvdy5QbGFzbWFEZWNrPy5DYW52YXM/LmFkZEFycm93Py4oKTtcbiAgICBpZiAoIWVsZW1lbnQpIHtcbiAgICAgIHNldFN0YXR1cygnQWRkIGFycm93IGZhaWxlZCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBhd2FpdCBwZXJzaXN0Qm9hcmRDaGFuZ2UoJ0Fycm93IGFkZGVkJyk7XG4gIH0pO1xuICBvbihkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1zdHVkaW8tYWRkLWltYWdlXScpLCAnY2xpY2snLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgaW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1zdHVkaW8taW1hZ2UtdXJsXScpO1xuICAgIGNvbnN0IHNyYyA9IFN0cmluZyhpbnB1dD8udmFsdWUgfHwgJycpLnRyaW0oKTtcbiAgICBjb25zdCBlbGVtZW50ID0gd2luZG93LlBsYXNtYURlY2s/LkNhbnZhcz8uYWRkSW1hZ2U/LihzcmMpO1xuICAgIGlmICghZWxlbWVudCkge1xuICAgICAgc2V0U3RhdHVzKCdBZGQgaW1hZ2UgZmFpbGVkJyk7XG4gICAgICBUb2FzdC5lcnJvcignU3R1ZGlvIGltYWdlIFVSTCByZWplY3RlZCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoaW5wdXQpIGlucHV0LnZhbHVlID0gJyc7XG4gICAgYXdhaXQgcGVyc2lzdEJvYXJkQ2hhbmdlKCdJbWFnZSBhZGRlZCcpO1xuICB9KTtcbiAgb24oZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtc3R1ZGlvLWFwcGx5LXRlbXBsYXRlXScpLCAnY2xpY2snLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1zdHVkaW8tdGVtcGxhdGVdJyk/LnZhbHVlIHx8ICdzdHVkeS1tYXAnO1xuICAgIGNvbnN0IG9rID0gYXdhaXQgd2luZG93LlBsYXNtYURlY2s/LlVJPy5jb25maXJtPy4oJ1JlcGxhY2UgdGhlIGN1cnJlbnQgU3R1ZGlvIGJvYXJkIHdpdGggdGhpcyB0ZW1wbGF0ZT8nKTtcbiAgICBpZiAoIW9rKSByZXR1cm47XG4gICAgY29uc3QgYm9hcmQgPSB3aW5kb3cuUGxhc21hRGVjaz8uQ2FudmFzPy5hcHBseVRlbXBsYXRlPy4odmFsdWUpO1xuICAgIGlmICghYm9hcmQpIHtcbiAgICAgIHNldFN0YXR1cygnVGVtcGxhdGUgZmFpbGVkJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICh3aW5kb3cuREI/LnNhdmVTZXR0aW5nKSBhd2FpdCB3aW5kb3cuREIuc2F2ZVNldHRpbmcoYm9hcmRLZXksIGJvYXJkKTtcbiAgICBpbnNwZWN0ZWRFbGVtZW50SWQgPSBudWxsO1xuICAgIHNldFN0YXR1cygnVGVtcGxhdGUgYXBwbGllZCcpO1xuICAgIHJlbmRlckluc3BlY3RvcigpO1xuICB9KTtcbiAgb24oZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtc3R1ZGlvLWNsZWFyXScpLCAnY2xpY2snLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3Qgb2sgPSBhd2FpdCB3aW5kb3cuUGxhc21hRGVjaz8uVUk/LmNvbmZpcm0/LignQ2xlYXIgdGhlIGN1cnJlbnQgU3R1ZGlvIGJvYXJkPycpO1xuICAgIGlmICghb2spIHJldHVybjtcbiAgICBjb25zdCBib2FyZCA9IHdpbmRvdy5QbGFzbWFEZWNrPy5DYW52YXM/LmNsZWFyQm9hcmQ/LigpO1xuICAgIGlmICghYm9hcmQpIHtcbiAgICAgIHNldFN0YXR1cygnQ2xlYXIgZmFpbGVkJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICh3aW5kb3cuREI/LnNhdmVTZXR0aW5nKSBhd2FpdCB3aW5kb3cuREIuc2F2ZVNldHRpbmcoYm9hcmRLZXksIGJvYXJkKTtcbiAgICBzZXRTdGF0dXMoJ0JvYXJkIGNsZWFyZWQnKTtcbiAgICByZW5kZXJJbnNwZWN0b3IoKTtcbiAgfSk7XG4gIG9uKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXN0dWRpby1hZGQtbGF5ZXJdJyksICdjbGljaycsIGFzeW5jICgpID0+IHtcbiAgICBjb25zdCBpbnB1dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXN0dWRpby1sYXllci1uYW1lXScpO1xuICAgIGNvbnN0IG5hbWUgPSBTdHJpbmcoaW5wdXQ/LnZhbHVlIHx8ICcnKS50cmltKCk7XG4gICAgY29uc3QgbGF5ZXIgPSB3aW5kb3cuUGxhc21hRGVjaz8uQ2FudmFzPy5hZGRMYXllcj8uKG5hbWUpO1xuICAgIGlmICghbGF5ZXIpIHtcbiAgICAgIHNldFN0YXR1cygnQWRkIGxheWVyIGZhaWxlZCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoaW5wdXQpIGlucHV0LnZhbHVlID0gJyc7XG4gICAgYXdhaXQgcGVyc2lzdEJvYXJkQ2hhbmdlKCdMYXllciBhZGRlZCcpO1xuICB9KTtcbiAgb24oZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtc3R1ZGlvLWxheWVyc10nKSwgJ2NsaWNrJywgYXN5bmMgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgdGFyZ2V0ID0gZXZlbnQudGFyZ2V0Py5jbG9zZXN0Py4oJ2J1dHRvbicpO1xuICAgIGlmICghdGFyZ2V0KSByZXR1cm47XG4gICAgaWYgKHRhcmdldC5kYXRhc2V0LnNldExheWVyICE9IG51bGwpIHtcbiAgICAgIHdpbmRvdy5QbGFzbWFEZWNrPy5DYW52YXM/LnNldEFjdGl2ZUxheWVyPy4oTnVtYmVyKHRhcmdldC5kYXRhc2V0LnNldExheWVyKSk7XG4gICAgICBhd2FpdCBwZXJzaXN0Qm9hcmRDaGFuZ2UoJ0FjdGl2ZSBsYXllciBjaGFuZ2VkJyk7XG4gICAgfSBlbHNlIGlmICh0YXJnZXQuZGF0YXNldC5kZWxldGVMYXllcikge1xuICAgICAgY29uc3QgcmVtb3ZlZCA9IHdpbmRvdy5QbGFzbWFEZWNrPy5DYW52YXM/LnJlbW92ZUxheWVyPy4odGFyZ2V0LmRhdGFzZXQuZGVsZXRlTGF5ZXIpO1xuICAgICAgaWYgKHJlbW92ZWQpIGF3YWl0IHBlcnNpc3RCb2FyZENoYW5nZSgnTGF5ZXIgZGVsZXRlZCcpO1xuICAgIH1cbiAgfSk7XG4gIG9uKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXN0dWRpby1lbGVtZW50c10nKSwgJ2NsaWNrJywgYXN5bmMgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgaW5zcGVjdFRhcmdldCA9IGV2ZW50LnRhcmdldD8uY2xvc2VzdD8uKCdbZGF0YS1pbnNwZWN0LWVsZW1lbnRdJyk7XG4gICAgaWYgKGluc3BlY3RUYXJnZXQpIHtcbiAgICAgIGluc3BlY3RlZEVsZW1lbnRJZCA9IGluc3BlY3RUYXJnZXQuZGF0YXNldC5pbnNwZWN0RWxlbWVudDtcbiAgICAgIHJlbmRlckluc3BlY3RvcigpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBvcGVuVGFyZ2V0ID0gZXZlbnQudGFyZ2V0Py5jbG9zZXN0Py4oJ1tkYXRhLW9wZW4tc3R1ZGlvLWxpbmtdJyk7XG4gICAgaWYgKG9wZW5UYXJnZXQpIHtcbiAgICAgIGNvbnN0IGJvYXJkID0gd2luZG93LlBsYXNtYURlY2s/LkNhbnZhcz8uc2VyaWFsaXplPy4oKTtcbiAgICAgIGNvbnN0IGVsZW1lbnQgPSAoYm9hcmQ/LmxheWVycyB8fCBbXSlcbiAgICAgICAgLmZsYXRNYXAoKGxheWVyKSA9PiBBcnJheS5pc0FycmF5KGxheWVyLmVsZW1lbnRzKSA/IGxheWVyLmVsZW1lbnRzIDogW10pXG4gICAgICAgIC5maW5kKChpdGVtKSA9PiBpdGVtPy5pZCA9PT0gb3BlblRhcmdldC5kYXRhc2V0Lm9wZW5TdHVkaW9MaW5rKTtcbiAgICAgIG9wZW5TdHVkaW9MaW5rKGVsZW1lbnQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQ/LmNsb3Nlc3Q/LignW2RhdGEtZGVsZXRlLWVsZW1lbnRdJyk7XG4gICAgaWYgKCF0YXJnZXQpIHJldHVybjtcbiAgICBjb25zdCByZW1vdmVkID0gd2luZG93LlBsYXNtYURlY2s/LkNhbnZhcz8ucmVtb3ZlRWxlbWVudD8uKHRhcmdldC5kYXRhc2V0LmRlbGV0ZUVsZW1lbnQpO1xuICAgIGlmIChyZW1vdmVkKSB7XG4gICAgICBpZiAoaW5zcGVjdGVkRWxlbWVudElkID09PSB0YXJnZXQuZGF0YXNldC5kZWxldGVFbGVtZW50KSBpbnNwZWN0ZWRFbGVtZW50SWQgPSBudWxsO1xuICAgICAgYXdhaXQgcGVyc2lzdEJvYXJkQ2hhbmdlKCdFbGVtZW50IGRlbGV0ZWQnKTtcbiAgICB9XG4gIH0pO1xuICBvbihkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1zdHVkaW8tcHJvcGVydGllc10nKSwgJ2NsaWNrJywgYXN5bmMgKGV2ZW50KSA9PiB7XG4gICAgY29uc3Qgb3BlblRhcmdldCA9IGV2ZW50LnRhcmdldD8uY2xvc2VzdD8uKCdbZGF0YS1vcGVuLXN0dWRpby1saW5rXScpO1xuICAgIGlmIChvcGVuVGFyZ2V0KSB7XG4gICAgICBjb25zdCBib2FyZCA9IHdpbmRvdy5QbGFzbWFEZWNrPy5DYW52YXM/LnNlcmlhbGl6ZT8uKCk7XG4gICAgICBjb25zdCBlbGVtZW50ID0gKGJvYXJkPy5sYXllcnMgfHwgW10pXG4gICAgICAgIC5mbGF0TWFwKChsYXllcikgPT4gQXJyYXkuaXNBcnJheShsYXllci5lbGVtZW50cykgPyBsYXllci5lbGVtZW50cyA6IFtdKVxuICAgICAgICAuZmluZCgoaXRlbSkgPT4gaXRlbT8uaWQgPT09IG9wZW5UYXJnZXQuZGF0YXNldC5vcGVuU3R1ZGlvTGluayk7XG4gICAgICBvcGVuU3R1ZGlvTGluayhlbGVtZW50KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgdGFyZ2V0ID0gZXZlbnQudGFyZ2V0Py5jbG9zZXN0Py4oJ1tkYXRhLXN0dWRpby1hcHBseS1wcm9wc10nKTtcbiAgICBpZiAoIXRhcmdldCkgcmV0dXJuO1xuICAgIGNvbnN0IHJvb3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1zdHVkaW8tcHJvcGVydGllc10nKTtcbiAgICBjb25zdCBwYXRjaCA9IHtcbiAgICAgIHRleHQ6IHJvb3Q/LnF1ZXJ5U2VsZWN0b3I/LignW2RhdGEtc3R1ZGlvLXByb3AtdGV4dF0nKT8udmFsdWUgPz8gJycsXG4gICAgICB4OiByb290Py5xdWVyeVNlbGVjdG9yPy4oJ1tkYXRhLXN0dWRpby1wcm9wLXhdJyk/LnZhbHVlID8/ICcnLFxuICAgICAgeTogcm9vdD8ucXVlcnlTZWxlY3Rvcj8uKCdbZGF0YS1zdHVkaW8tcHJvcC15XScpPy52YWx1ZSA/PyAnJyxcbiAgICAgIGZpbGw6IHJvb3Q/LnF1ZXJ5U2VsZWN0b3I/LignW2RhdGEtc3R1ZGlvLXByb3AtZmlsbF0nKT8udmFsdWUgPz8gJycsXG4gICAgICBzdHJva2U6IHJvb3Q/LnF1ZXJ5U2VsZWN0b3I/LignW2RhdGEtc3R1ZGlvLXByb3Atc3Ryb2tlXScpPy52YWx1ZSA/PyAnJyxcbiAgICAgIHdpZHRoOiByb290Py5xdWVyeVNlbGVjdG9yPy4oJ1tkYXRhLXN0dWRpby1wcm9wLXdpZHRoXScpPy52YWx1ZSA/PyAnJyxcbiAgICAgIGhlaWdodDogcm9vdD8ucXVlcnlTZWxlY3Rvcj8uKCdbZGF0YS1zdHVkaW8tcHJvcC1oZWlnaHRdJyk/LnZhbHVlID8/ICcnLFxuICAgICAgc3Ryb2tlV2lkdGg6IHJvb3Q/LnF1ZXJ5U2VsZWN0b3I/LignW2RhdGEtc3R1ZGlvLXByb3Atc3Ryb2tlLXdpZHRoXScpPy52YWx1ZSA/PyAnJyxcbiAgICAgIGZvbnRTaXplOiByb290Py5xdWVyeVNlbGVjdG9yPy4oJ1tkYXRhLXN0dWRpby1wcm9wLWZvbnQtc2l6ZV0nKT8udmFsdWUgPz8gJycsXG4gICAgICBsaW5rVHlwZTogcm9vdD8ucXVlcnlTZWxlY3Rvcj8uKCdbZGF0YS1zdHVkaW8tcHJvcC1saW5rLXR5cGVdJyk/LnZhbHVlID8/ICcnLFxuICAgICAgbGlua1RhcmdldDogcm9vdD8ucXVlcnlTZWxlY3Rvcj8uKCdbZGF0YS1zdHVkaW8tcHJvcC1saW5rLXRhcmdldF0nKT8udmFsdWUgPz8gJycsXG4gICAgICBsaW5rTGFiZWw6IHJvb3Q/LnF1ZXJ5U2VsZWN0b3I/LignW2RhdGEtc3R1ZGlvLXByb3AtbGluay1sYWJlbF0nKT8udmFsdWUgPz8gJycsXG4gICAgfTtcbiAgICBjb25zdCB1cGRhdGVkID0gd2luZG93LlBsYXNtYURlY2s/LkNhbnZhcz8udXBkYXRlRWxlbWVudD8uKHRhcmdldC5kYXRhc2V0LnN0dWRpb0FwcGx5UHJvcHMsIHBhdGNoKTtcbiAgICBpZiAodXBkYXRlZCkgYXdhaXQgcGVyc2lzdEJvYXJkQ2hhbmdlKCdQcm9wZXJ0aWVzIHVwZGF0ZWQnKTtcbiAgfSk7XG4gIG9uKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXN0dWRpby1zYXZlXScpLCAnY2xpY2snLCBzYXZlQm9hcmQpO1xuICBvbihkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1zdHVkaW8tbG9hZF0nKSwgJ2NsaWNrJywgKCkgPT4gbG9hZFNhdmVkQm9hcmQoZmFsc2UpKTtcbiAgY29uc3QgaW1wb3J0SW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1zdHVkaW8taW1wb3J0LWZpbGVdJyk7XG4gIG9uKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXN0dWRpby1pbXBvcnQtanNvbl0nKSwgJ2NsaWNrJywgKCkgPT4gaW1wb3J0SW5wdXQ/LmNsaWNrPy4oKSk7XG4gIG9uKGltcG9ydElucHV0LCAnY2hhbmdlJywgYXN5bmMgKCkgPT4ge1xuICAgIGNvbnN0IGZpbGUgPSBpbXBvcnRJbnB1dD8uZmlsZXM/LlswXTtcbiAgICBpZiAoIWZpbGUpIHJldHVybjtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdGV4dCA9IGF3YWl0IGZpbGUudGV4dCgpO1xuICAgICAgY29uc3QgYm9hcmQgPSBKU09OLnBhcnNlKHRleHQpO1xuICAgICAgaWYgKCFib2FyZCB8fCB0eXBlb2YgYm9hcmQgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkoYm9hcmQpKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgU3R1ZGlvIGJvYXJkJyk7XG4gICAgICBjb25zdCBsb2FkZWQgPSB3aW5kb3cuUGxhc21hRGVjaz8uQ2FudmFzPy5sb2FkU3RhdGU/Lihib2FyZCk7XG4gICAgICBpZiAoIWxvYWRlZCkgdGhyb3cgbmV3IEVycm9yKCdTdHVkaW8gaW1wb3J0IHVuYXZhaWxhYmxlJyk7XG4gICAgICBpZiAod2luZG93LkRCPy5zYXZlU2V0dGluZykgYXdhaXQgd2luZG93LkRCLnNhdmVTZXR0aW5nKGJvYXJkS2V5LCBsb2FkZWQpO1xuICAgICAgc2V0U3RhdHVzKCdKU09OIGltcG9ydGVkJyk7XG4gICAgICByZW5kZXJJbnNwZWN0b3IoKTtcbiAgICAgIFRvYXN0LnN1Y2Nlc3MoJ1N0dWRpbyBib2FyZCBpbXBvcnRlZCcpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgc2V0U3RhdHVzKCdKU09OIGltcG9ydCBmYWlsZWQnKTtcbiAgICAgIFRvYXN0LmVycm9yKCdTdHVkaW8gSlNPTiBpbXBvcnQgZmFpbGVkJyk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGlmIChpbXBvcnRJbnB1dCkgaW1wb3J0SW5wdXQudmFsdWUgPSAnJztcbiAgICB9XG4gIH0pO1xuICBvbihkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1zdHVkaW8tZXhwb3J0LWpzb25dJyksICdjbGljaycsICgpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgYm9hcmQgPSB3aW5kb3cuUGxhc21hRGVjaz8uQ2FudmFzPy5zZXJpYWxpemU/LigpO1xuICAgICAgaWYgKCFib2FyZCkgdGhyb3cgbmV3IEVycm9yKCdTdHVkaW8gZXhwb3J0IHVuYXZhaWxhYmxlJyk7XG4gICAgICBkb3dubG9hZFRleHRGaWxlKEpTT04uc3RyaW5naWZ5KGJvYXJkLCBudWxsLCAyKSwgYHBsYXNtYWRlY2stc3R1ZGlvLSR7bmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKX0uanNvbmAsICdhcHBsaWNhdGlvbi9qc29uJyk7XG4gICAgICBzZXRTdGF0dXMoJ0pTT04gZXhwb3J0ZWQnKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHNldFN0YXR1cygnSlNPTiBleHBvcnQgZmFpbGVkJyk7XG4gICAgICBUb2FzdC5lcnJvcignU3R1ZGlvIEpTT04gZXhwb3J0IGZhaWxlZCcpO1xuICAgIH1cbiAgfSk7XG4gIG9uKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXN0dWRpby1leHBvcnQtc3ZnXScpLCAnY2xpY2snLCAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHN2ZyA9IHdpbmRvdy5QbGFzbWFEZWNrPy5DYW52YXM/LmV4cG9ydFNWRz8uKCk7XG4gICAgICBpZiAoIXN2ZykgdGhyb3cgbmV3IEVycm9yKCdTdHVkaW8gU1ZHIGV4cG9ydCB1bmF2YWlsYWJsZScpO1xuICAgICAgZG93bmxvYWRUZXh0RmlsZShzdmcsIGBwbGFzbWFkZWNrLXN0dWRpby0ke25ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCl9LnN2Z2AsICdpbWFnZS9zdmcreG1sJyk7XG4gICAgICBzZXRTdGF0dXMoJ1NWRyBleHBvcnRlZCcpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgc2V0U3RhdHVzKCdTVkcgZXhwb3J0IGZhaWxlZCcpO1xuICAgICAgVG9hc3QuZXJyb3IoJ1N0dWRpbyBTVkcgZXhwb3J0IGZhaWxlZCcpO1xuICAgIH1cbiAgfSk7XG4gIG9uKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXN0dWRpby1leHBvcnQtcG5nXScpLCAnY2xpY2snLCAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGRhdGFVcmwgPSB3aW5kb3cuUGxhc21hRGVjaz8uQ2FudmFzPy5leHBvcnRQTkc/LigpO1xuICAgICAgaWYgKCFkb3dubG9hZERhdGFVcmwoZGF0YVVybCwgYHBsYXNtYWRlY2stc3R1ZGlvLSR7bmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKX0ucG5nYCkpIHRocm93IG5ldyBFcnJvcignU3R1ZGlvIFBORyBleHBvcnQgdW5hdmFpbGFibGUnKTtcbiAgICAgIHNldFN0YXR1cygnUE5HIGV4cG9ydGVkJyk7XG4gICAgfSBjYXRjaCB7XG4gICAgICBzZXRTdGF0dXMoJ1BORyBleHBvcnQgZmFpbGVkJyk7XG4gICAgICBUb2FzdC5lcnJvcignU3R1ZGlvIFBORyBleHBvcnQgZmFpbGVkJyk7XG4gICAgfVxuICB9KTtcbiAgb24oZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtc3R1ZGlvLWV4cG9ydC1wZGZdJyksICdjbGljaycsICgpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgc3ZnID0gd2luZG93LlBsYXNtYURlY2s/LkNhbnZhcz8uZXhwb3J0U1ZHPy4oKTtcbiAgICAgIGNvbnN0IHBuZyA9IHN2ZyA/ICcnIDogd2luZG93LlBsYXNtYURlY2s/LkNhbnZhcz8uZXhwb3J0UE5HPy4oKTtcbiAgICAgIGlmICghcHJpbnRTdHVkaW9Cb2FyZFBkZih7IHN2ZywgcG5nIH0pKSB0aHJvdyBuZXcgRXJyb3IoJ1N0dWRpbyBQREYgZXhwb3J0IHVuYXZhaWxhYmxlJyk7XG4gICAgICBzZXRTdGF0dXMoJ1BERiBleHBvcnQgb3BlbmVkJyk7XG4gICAgfSBjYXRjaCB7XG4gICAgICBzZXRTdGF0dXMoJ1BERiBleHBvcnQgZmFpbGVkJyk7XG4gICAgICBUb2FzdC5lcnJvcignU3R1ZGlvIFBERiBleHBvcnQgZmFpbGVkJyk7XG4gICAgfVxuICB9KTtcbiAgbG9hZFNhdmVkQm9hcmQodHJ1ZSk7XG4gIGxvYWRTdHVkaW9MaW5rT3B0aW9ucygpO1xuICByZW5kZXJJbnNwZWN0b3IoKTtcbiAgYmluZFN5bmNSZWZyZXNoKCk7XG4gIHJldHVybiB7XG4gICAgcmVmcmVzaEZyb21TeW5jLFxuICAgIHVubW91bnQoKSB7XG4gICAgICB1bmJpbmRTeW5jUmVmcmVzaCgpO1xuICAgICAgY2xlYXJUaW1lb3V0KGludGVyYWN0aXZlU2F2ZVRpbWVyKTtcbiAgICAgIHJvdXRlTGlzdGVuZXJzLmZvckVhY2goKHsgdGFyZ2V0LCB0eXBlLCBoYW5kbGVyLCBvcHRpb25zIH0pID0+IHtcbiAgICAgICAgdHJ5IHsgdGFyZ2V0LnJlbW92ZUV2ZW50TGlzdGVuZXIodHlwZSwgaGFuZGxlciwgb3B0aW9ucyk7IH0gY2F0Y2gge31cbiAgICAgIH0pO1xuICAgICAgdHJ5IHsgd2luZG93LlBsYXNtYURlY2s/LkNhbnZhcz8uZGVzdHJveT8uKCk7IH0gY2F0Y2gge31cbiAgICB9LFxuICB9O1xufVxuXG5cblxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFPLFNBQVMsZ0JBQWdCLE9BQU8sQ0FBQyxHQUFHO0FBQ3pDLFFBQU07QUFBQSxJQUNSO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBLFFBQVEsT0FBTyxZQUFZO0FBQUEsSUFDM0I7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0UsSUFBSTtBQUVKLFVBQVE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxHQTBEUDtBQUVELFFBQU0saUJBQWlCLENBQUM7QUFDeEIsUUFBTSxL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QUFNLCtCQUErQjtBQUN6RCx1QkFBaUIsS0FBSyxzQkFBcUIsb0JBQUksS0FBSyxHQUFFLFlBQVksRUFBRSxNQUFNLEdBQUcsRUFBRSxDQUFDLFFBQVEsZUFBZTtBQUN2RyxnQkFBVSxjQUFjO0FBQUEsSUFDMUIsUUFBUTtBQUNOLGdCQUFVLG1CQUFtQjtBQUM3QixZQUFNLE1BQU0sMEJBQTBCO0FBQUEsSUFDeEM7QUFBQSxFQUNGLENBQUM7QUFDRCxLQUFHLFNBQVMsY0FBYywwQkFBMEIsR0FBRyxTQUFTLE1BQU07QUFDcEUsUUFBSTtBQUNGLFlBQU0sVUFBVSxPQUFPLFlBQVksUUFBUSxZQUFZO0FBQ3ZELFVBQUksQ0FBQyxnQkFBZ0IsU0FBUyxzQkFBcUIsb0JBQUksS0FBSyxHQUFFLFlBQVksRUFBRSxNQUFNLEdBQUcsRUFBRSxDQUFDLE1BQU0sRUFBRyxPQUFNLElBQUksTUFBTSwrQkFBK0I7QUFDaEosZ0JBQVUsY0FBYztBQUFBLElBQzFCLFFBQVE7QUFDTixnQkFBVSxtQkFBbUI7QUFDN0IsWUFBTSxNQUFNLDBCQUEwQjtBQUFBLElBQ3hDO0FBQUEsRUFDRixDQUFDO0FBQ0QsS0FBRyxTQUFTLGNBQWMsMEJBQTBCLEdBQUcsU0FBUyxNQUFNO0FBQ3BFLFFBQUk7QUFDRixZQUFNLE1BQU0sT0FBTyxZQUFZLFFBQVEsWUFBWTtBQUNuRCxZQUFNLE1BQU0sTUFBTSxLQUFLLE9BQU8sWUFBWSxRQUFRLFlBQVk7QUFDOUQsVUFBSSxDQUFDLG9CQUFvQixFQUFFLEtBQUssSUFBSSxDQUFDLEVBQUcsT0FBTSxJQUFJLE1BQU0sK0JBQStCO0FBQ3ZGLGdCQUFVLG1CQUFtQjtBQUFBLElBQy9CLFFBQVE7QUFDTixnQkFBVSxtQkFBbUI7QUFDN0IsWUFBTSxNQUFNLDBCQUEwQjtBQUFBLElBQ3hDO0FBQUEsRUFDRixDQUFDO0FBQ0QsaUJBQWUsSUFBSTtBQUNuQix3QkFBc0I7QUFDdEIsa0JBQWdCO0FBQ2hCLGtCQUFnQjtBQUNoQixTQUFPO0FBQUEsSUFDTDtBQUFBLElBQ0EsVUFBVTtBQUNSLHdCQUFrQjtBQUNsQixtQkFBYSxvQkFBb0I7QUFDakMscUJBQWUsUUFBUSxDQUFDLEVBQUUsUUFBUSxNQUFNLFNBQVMsUUFBUSxNQUFNO0FBQzdELFlBQUk7QUFBRSxpQkFBTyxvQkFBb0IsTUFBTSxTQUFTLE9BQU87QUFBQSxRQUFHLFFBQVE7QUFBQSxRQUFDO0FBQUEsTUFDckUsQ0FBQztBQUNELFVBQUk7QUFBRSxlQUFPLFlBQVksUUFBUSxVQUFVO0FBQUEsTUFBRyxRQUFRO0FBQUEsTUFBQztBQUFBLElBQ3pEO0FBQUEsRUFDRjtBQUNGOyIsCiAgIm5hbWVzIjogWyJyb3ciXQp9Cg==
