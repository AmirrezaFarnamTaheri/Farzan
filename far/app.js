// ============================================================
// OpenCourseDeck UI — app.js
// Complete JavaScript Interaction Layer
// Version 1.1.2 (keep aligned with package.json)
// ============================================================

import { Prefs, FontScale } from './src/core/prefs.js';
import { ThemeManager } from './src/core/themeManager.js';
import {
  $,
  $$,
  debounce,
  eventTargetEl,
  restoreFocus,
  setAppInert,
  throttle,
  trapFocus,
  uid,
} from './src/lib/dom.js';
import { createRouter } from './src/router/router.js';
import { mountNotFoundView } from './src/views/notFoundRoute.js';
import { chartArc as ArcPlugin } from './src/features/chartPlugins/arc.js';
import { chartGauge as GaugePlugin } from './src/features/chartPlugins/gauge.js';
import { chartHeatmap as HeatmapPlugin } from './src/features/chartPlugins/heatmap.js';
import { chartSparkline as SparklinePlugin } from './src/features/chartPlugins/sparkline.js';
import { CanvasAreaChart } from './src/features/canvasCharts/area.js';
import { CanvasGauge } from './src/features/canvasCharts/gauge.js';
import { CanvasHeatmap } from './src/features/canvasCharts/heatmap.js';
import { CanvasTreemap } from './src/features/canvasCharts/treemap.js';
import { CanvasZoom } from './src/features/canvasZoom.js';
import './src/features/canvasTools/index.js';
import { CourseGraph } from './src/features/courseGraph.js';
import { KnowledgeGraph } from './src/features/knowledgeGraph.js';
import * as ContextMenu from './src/ui/contextMenu.js';
import * as CanvasExport from './src/lib/canvasExport.js';
import { Clipboard as ClipboardBridge } from './src/lib/clipboard.js';
import { Pointer } from './src/lib/pointer.js';

(() => {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // 0. NAMESPACE & GLOBAL STATE
  // ──────────────────────────────────────────────────────────
  // IMPORTANT: merge into any existing window.OpenCourseDeck so earlier modules
  // (e.g. data.js, db.js) are not clobbered.
  const OpenCourseDeck = window.OpenCourseDeck ?? {};

  const defaultState = {
    theme: 'dark',           // 'dark' | 'light' | 'system'
    sidebarCollapsed: false,
    activeToasts: [],
    toastCounter: 0,
    openModals: [],
    openDropdowns: new Set(),
    openAccordions: new Set(),
    activeTab: null,
    rippleEnabled: true,
  };

  const defaultConfig = {
    toastDuration:     4000,   // ms auto-dismiss
    toastMaxStack:     5,      // max visible toasts
    animationDuration: 250,    // ms general transitions
    breakpoints: {
      sm:  640,
      md:  768,
      lg:  1024,
      xl:  1280,
      '2xl': 1536,
    },
  };

  OpenCourseDeck.version = OpenCourseDeck.version ?? '1.1.2';
  OpenCourseDeck.state = {
    ...defaultState,
    ...(OpenCourseDeck.state ?? {}),
    // Keep Set instances if they already exist
    openDropdowns: OpenCourseDeck.state?.openDropdowns instanceof Set ? OpenCourseDeck.state.openDropdowns : defaultState.openDropdowns,
    openAccordions: OpenCourseDeck.state?.openAccordions instanceof Set ? OpenCourseDeck.state.openAccordions : defaultState.openAccordions,
  };
  OpenCourseDeck.config = {
    ...defaultConfig,
    ...(OpenCourseDeck.config ?? {}),
    breakpoints: {
      ...defaultConfig.breakpoints,
      ...((OpenCourseDeck.config ?? {}).breakpoints ?? {}),
    },
  };
  OpenCourseDeck.plugins = OpenCourseDeck.plugins ?? {};
  OpenCourseDeck.dom = {
    $,
    $$,
    debounce,
    eventTargetEl,
    restoreFocus,
    setAppInert,
    throttle,
    trapFocus,
    uid,
  };

  // Expose globally (without clobbering)
  window.OpenCourseDeck = OpenCourseDeck;


  // ──────────────────────────────────────────────────────────
  // 1. UTILITIES
  // ──────────────────────────────────────────────────────────

  /**
   * Create element with optional attributes and children
   * @param {string} tag
   * @param {Object} attrs
   * @param {...(string|Node)} children
   * @returns {HTMLElement}
   */
  function createElement(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') {
        el.className = v;
      } else if (k.startsWith('data-')) {
        el.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
      } else if (k === 'style' && typeof v === 'object') {
        Object.assign(el.style, v);
      } else {
        el.setAttribute(k, v);
      }
    }
    const appendChild = (child) => {
      if (Array.isArray(child)) {
        child.forEach(appendChild);
      } else if (child != null) {
        el.append(typeof child === 'string' ? document.createTextNode(child) : child);
      }
    };
    children.forEach(appendChild);
    return el;
  }

  function appendContent(parent, content) {
    if (content == null) return;
    const append = (item) => {
      if (item == null) return;
      if (item instanceof Node) parent.appendChild(item);
      else parent.appendChild(document.createTextNode(String(item)));
    };
    if (Array.isArray(content)) content.forEach(append);
    else append(content);
  }

  function safeExternalUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(String(value), document.baseURI);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function safeNavigationUrl(value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (raw.startsWith('#/')) return raw;
    try {
      const url = new URL(raw, document.baseURI);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function safeMediaUrl(value) {
    if (!value) return null;
    try {
      const raw = String(value).trim();
      const url = new URL(raw, document.baseURI);
      if (url.protocol === 'data:') return /^data:(?:video|audio|application\/pdf)\//i.test(raw) ? url.href : null;
      return ['http:', 'https:', 'blob:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function safeImageUrl(value) {
    if (!value) return null;
    try {
      const raw = String(value).trim();
      const url = new URL(raw, document.baseURI);
      if (url.protocol === 'data:') return /^data:image\//i.test(raw) ? url.href : null;
      return ['http:', 'https:', 'blob:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function safeFrameUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(String(value).trim(), document.baseURI);
      return ['http:', 'https:', 'blob:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function formatBytes(value) {
    if (!Number.isFinite(Number(value))) return '—';
    const bytes = Math.max(0, Number(value));
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    const precision = unitIndex === 0 ? 0 : size >= 10 ? 1 : 2;
    return `${size.toFixed(precision)} ${units[unitIndex]}`;
  }

  function formatMediaClock(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  function setPendingCourseMedia(topicId, position = null) {
    if (!topicId) return;
    try {
      sessionStorage.setItem('plasma_pending_topic', String(topicId));
      if (Number.isFinite(Number(position)) && Number(position) > 0) {
        sessionStorage.setItem('plasma_pending_position', String(Math.max(0, Number(position))));
      } else {
        sessionStorage.removeItem('plasma_pending_position');
      }
    } catch {}
  }

  function setPendingCourseSession(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    try {
      const queue = Array.isArray(snapshot.queue) ? snapshot.queue.filter(Boolean) : [];
      if (!queue.length) {
        sessionStorage.removeItem('plasma_pending_course_session');
        return;
      }
      sessionStorage.setItem('plasma_pending_course_session', JSON.stringify({
        queue,
        queueIndex: Math.max(0, Number(snapshot.queueIndex) || 0),
        currentTime: Math.max(0, Number(snapshot.currentTime) || 0),
        duration: Math.max(0, Number(snapshot.duration) || 0),
        playing: Boolean(snapshot.playing),
        volume: Number(snapshot.volume),
        muted: Boolean(snapshot.muted),
        shuffle: Boolean(snapshot.shuffle),
        repeat: typeof snapshot.repeat === 'string' ? snapshot.repeat : 'none',
        playbackRate: Math.max(0, Number(snapshot.playbackRate) || 1),
        track: snapshot.track && typeof snapshot.track === 'object' ? { ...snapshot.track } : null,
      }));
    } catch {}
  }

  function consumePendingCourseSession() {
    try {
      const raw = sessionStorage.getItem('plasma_pending_course_session');
      if (!raw) return null;
      sessionStorage.removeItem('plasma_pending_course_session');
      const snapshot = JSON.parse(raw);
      if (!snapshot || typeof snapshot !== 'object') return null;
      const queue = Array.isArray(snapshot.queue) ? snapshot.queue.filter(Boolean) : [];
      if (!queue.length) return null;
      return {
        ...snapshot,
        queue,
        queueIndex: Math.max(0, Number(snapshot.queueIndex) || 0),
        currentTime: Math.max(0, Number(snapshot.currentTime) || 0),
        duration: Math.max(0, Number(snapshot.duration) || 0),
        playing: Boolean(snapshot.playing),
        volume: Number(snapshot.volume),
        muted: Boolean(snapshot.muted),
        shuffle: Boolean(snapshot.shuffle),
        repeat: typeof snapshot.repeat === 'string' ? snapshot.repeat : 'none',
        playbackRate: Math.max(0, Number(snapshot.playbackRate) || 1),
        track: snapshot.track && typeof snapshot.track === 'object' ? { ...snapshot.track } : null,
      };
    } catch {
      try { sessionStorage.removeItem('plasma_pending_course_session'); } catch {}
      return null;
    }
  }

  function setPendingPdfPage(docId, page = null) {
    try {
      if (docId) sessionStorage.setItem('plasma_pending_pdf_doc', String(docId));
      if (Number.isFinite(Number(page)) && Number(page) > 0) {
        sessionStorage.setItem('plasma_pending_pdf_page', String(Math.max(1, Math.floor(Number(page)))));
      } else {
        sessionStorage.removeItem('plasma_pending_pdf_page');
      }
    } catch {}
  }

  function escapeHtmlText(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  const MiniPlayer = (() => {
    let currentSnapshot = null;
    let node = null;
    let livePlayerEl = null;
    let liveDispose = null;

    const normalize = (snapshot) => {
      if (!snapshot || typeof snapshot !== 'object') return null;
      const queue = Array.isArray(snapshot.queue) ? snapshot.queue.filter(Boolean) : [];
      const track = snapshot.track || queue[Math.max(0, Number(snapshot.queueIndex) || 0)] || null;
      if (!track && queue.length === 0) return null;
      const duration = Math.max(0, Number(snapshot.duration) || 0);
      const currentTime = Math.max(0, Math.min(duration || Infinity, Number(snapshot.currentTime) || 0));
      return {
        ...snapshot,
        queue,
        queueIndex: Math.max(0, Number(snapshot.queueIndex) || 0),
        currentTime,
        duration,
        playing: Boolean(snapshot.playing),
        track: track ? { ...track } : null,
      };
    };

    const hide = () => {
      try { liveDispose?.(); } catch {}
      liveDispose = null;
      if (livePlayerEl?.isConnected) {
        try { livePlayerEl._pdPlayer?.destroy?.(); } catch {}
        livePlayerEl.remove();
      }
      livePlayerEl = null;
      node?.remove();
      node = null;
      currentSnapshot = null;
    };

    const resume = () => {
      const track = currentSnapshot?.track;
      setPendingCourseSession(currentSnapshot);
      if (track?.topicId) setPendingCourseMedia(track.topicId, currentSnapshot?.currentTime);
      Router.navigate('#/courses');
      if (!livePlayerEl) hide();
    };

    const refreshFromLive = () => {
      const next = normalize(livePlayerEl?._pdPlayer?.snapshot?.());
      if (next) currentSnapshot = next;
      return next;
    };

    const liveAction = (action) => {
      const inst = livePlayerEl?._pdPlayer;
      if (!inst) return;
      try {
        if (action === 'prev') inst.prev?.();
        if (action === 'next') inst.next?.();
        if (action === 'play') inst.toggle?.();
        if (action === 'queue') {
          const panel = livePlayerEl.querySelector?.('.pd-queue-panel');
          if (panel?.hidden === false) inst.hideQueue?.();
          else inst.showQueue?.();
        }
      } catch {}
      setTimeout(() => {
        refreshFromLive();
        render();
      }, 0);
    };

    const render = () => {
      const snapshot = currentSnapshot;
      if (!snapshot) return hide();
      const track = snapshot.track || {};
      const title = String(track.title || 'Current lesson');
      const meta = String(track.artist || track.courseTitle || track.courseId || 'Course media');
      const percent = snapshot.duration > 0 ? Math.min(100, (snapshot.currentTime / snapshot.duration) * 100) : 0;

      if (!node) {
        node = createElement('aside', {
          class: 'global-mini-player',
          'data-mini-player': '',
          role: 'status',
          'aria-live': 'polite',
        });
        document.body.appendChild(node);
      }
      node.classList.toggle('has-live-player', Boolean(livePlayerEl));

      node.replaceChildren(
        createElement('div', { class: 'global-mini-player__body' },
          createElement('div', { class: 'global-mini-player__eyebrow' }, snapshot.playing ? 'Playing' : 'Ready to resume'),
          createElement('div', { class: 'global-mini-player__title' }, title),
          createElement('div', { class: 'global-mini-player__meta' }, meta),
          createElement('div', {
            class: 'global-mini-player__progress',
            role: 'progressbar',
            'aria-valuemin': '0',
            'aria-valuemax': '100',
            'aria-valuenow': String(Math.round(percent)),
          }, createElement('span', { style: { width: `${percent}%` } })),
          createElement('div', { class: 'global-mini-player__time' },
            `${formatMediaClock(snapshot.currentTime)} / ${snapshot.duration ? formatMediaClock(snapshot.duration) : '--:--'}`
          )
        ),
        createElement('div', { class: 'global-mini-player__actions' },
          ...(livePlayerEl ? [
            createElement('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-mini-prev': '', 'aria-label': 'Previous track' }, 'Prev'),
            createElement('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-mini-play': '', 'aria-label': snapshot.playing ? 'Pause' : 'Play' }, snapshot.playing ? 'Pause' : 'Play'),
            createElement('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-mini-next': '', 'aria-label': 'Next track' }, 'Next'),
            createElement('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-mini-queue': '', 'aria-label': 'Toggle queue' }, 'Queue'),
          ] : []),
          createElement('button', { class: 'btn btn-primary btn-sm', type: 'button', 'data-mini-resume': '' }, 'Resume'),
          createElement('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-mini-close': '', 'aria-label': 'Close mini player' }, 'Close')
        )
      );
      if (livePlayerEl) {
        const liveSlot = createElement('div', { class: 'global-mini-player__live', 'data-mini-player-live': '' });
        liveSlot.appendChild(livePlayerEl);
        node.insertBefore(liveSlot, node.firstChild);
      }
      node.querySelector('[data-mini-prev]')?.addEventListener('click', () => liveAction('prev'));
      node.querySelector('[data-mini-play]')?.addEventListener('click', () => liveAction('play'));
      node.querySelector('[data-mini-next]')?.addEventListener('click', () => liveAction('next'));
      node.querySelector('[data-mini-queue]')?.addEventListener('click', () => liveAction('queue'));
      node.querySelector('[data-mini-resume]')?.addEventListener('click', resume, { once: true });
      node.querySelector('[data-mini-close]')?.addEventListener('click', hide, { once: true });
      return node;
    };

    return {
      show(snapshot) {
        const next = normalize(snapshot);
        if (!next) return hide();
        currentSnapshot = next;
        return render();
      },
      adoptPlayer(el, snapshot, { dispose } = {}) {
        if (!el?._pdPlayer) return this.show(snapshot);
        const next = normalize(snapshot || el._pdPlayer?.snapshot?.());
        if (!next) return hide();
        if (livePlayerEl && livePlayerEl !== el) {
          try { livePlayerEl._pdPlayer?.destroy?.(); } catch {}
          livePlayerEl.remove();
        }
        livePlayerEl = el;
        liveDispose = typeof dispose === 'function' ? dispose : null;
        currentSnapshot = next;
        el.classList.add('pd-live-mini-player');
        return render();
      },
      restorePlayer(placeholder) {
        if (!placeholder || !livePlayerEl) return placeholder;
        const restored = livePlayerEl;
        try { liveDispose?.(); } catch {}
        restored.classList.remove('pd-live-mini-player');
        delete restored.dataset.pdProgressBound;
        livePlayerEl = null;
        liveDispose = null;
        placeholder.replaceWith(restored);
        node?.remove();
        node = null;
        return restored;
      },
      hide,
      getSnapshot() {
        return currentSnapshot
          ? { ...currentSnapshot, queue: [...currentSnapshot.queue], track: currentSnapshot.track ? { ...currentSnapshot.track } : null }
          : null;
      },
    };
  })();

  OpenCourseDeck.MiniPlayer = MiniPlayer;

  function localStorageFootprint() {
    try {
      let total = 0;
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        total += new Blob([key, localStorage.getItem(key) ?? '']).size;
      }
      return total;
    } catch {
      return null;
    }
  }

  function downloadTextFile(text, filename, mime = 'text/plain') {
    const blob = new Blob([String(text ?? '')], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    // See progress.js _downloadBlob: the anchor must be in the document and
    // the object URL must outlive the download fetch, or Firefox/Safari
    // silently produce no file.
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  }

  function downloadDataUrl(dataUrl, filename) {
    if (!dataUrl) return false;
    const link = document.createElement('a');
    link.href = String(dataUrl);
    link.download = filename;
    link.click();
    return true;
  }

  function printStudioBoardPdf({ title = 'OpenCourseDeck Studio board', svg = '', png = '' } = {}) {
    const media = svg || (png ? `<img src="${String(png).replace(/"/g, '&quot;')}" alt="Studio board" />` : '');
    if (!media) return false;
    // window.open with the `noopener` feature returns null per spec, so a
    // popup shell cannot be written to. Print through a hidden same-origin
    // iframe instead (same approach as the PDF viewer's print path).
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) {
      frame.remove();
      return false;
    }
    doc.open();
    doc.write([
      '<!doctype html><html><head><meta charset="utf-8">',
      `<title>${String(title).replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch])}</title>`,
      '<style>html,body{margin:0;background:#fff;color:#111;font:14px system-ui,sans-serif}main{padding:24px}svg,img{display:block;max-width:100%;height:auto;border:1px solid #ddd}@media print{main{padding:0}svg,img{border:0}}</style>',
      '</head><body><main>',
      media,
      '</main></body></html>',
    ].join(''));
    doc.close();
    const win = frame.contentWindow;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      frame.remove();
    };
    win?.addEventListener?.('afterprint', () => setTimeout(cleanup, 100), { once: true });
    setTimeout(cleanup, 60_000);
    try { win?.focus?.(); } catch {}
    try { win?.print?.(); } catch {}
    return true;
  }

  function safeFetchUrl(base, path) {
    try {
      const url = new URL(`${base ?? ''}${path ?? ''}`, document.baseURI);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  const SANITIZE_FORBIDDEN_TAGS = 'script, style, meta, link, base, iframe, object, embed, form, template, noscript';

  /**
   * Attributes that are dropped outright: they either execute script, load a
   * document, or beacon to a third party, and no value of theirs is needed by
   * any markup this fallback is asked to render.
   */
  const SANITIZE_DROP_ATTRS = new Set(['srcdoc', 'ping', 'srcset', 'sizes', 'http-equiv']);

  /**
   * Scrub one parsed fragment in place. Split out from fallbackSanitizeHtml so
   * the mutation-XSS re-parse check below can run the identical pass twice.
   * @param {DocumentFragment} fragment
   */
  function scrubFragment(fragment) {
    fragment.querySelectorAll(SANITIZE_FORBIDDEN_TAGS).forEach(node => node.remove());
    fragment.querySelectorAll('*').forEach(node => {
      const tag = node.tagName.toLowerCase();
      [...node.attributes].forEach(attr => {
        const name = attr.name.toLowerCase();
        const value = attr.value;
        // Event handlers, and the attributes above, are never salvageable.
        if (name.startsWith('on') || SANITIZE_DROP_ATTRS.has(name)) {
          node.removeAttribute(attr.name);
          return;
        }
        // `formaction` overrides a form's target and is a navigation sink in
        // its own right; `xlink:href` is the SVG navigation sink that the
        // plain `href` check misses entirely.
        if (['href', 'action', 'formaction'].includes(name) && !safeNavigationUrl(value)) {
          node.removeAttribute(attr.name);
          return;
        }
        if (name === 'xlink:href') {
          // Same-document references only. An external xlink:href on <use>
          // pulls in a foreign document fragment.
          if (!String(value).trim().startsWith('#')) node.removeAttribute(attr.name);
          return;
        }
        // Images and posters legitimately carry `data:image/` payloads -- that
        // is how a pasted screenshot survives a round trip. Routing them
        // through safeMediaUrl (which allows only video/audio/pdf data URIs)
        // silently deleted every inline image.
        if (name === 'background' || name === 'poster' || (name === 'src' && (tag === 'img' || tag === 'image'))) {
          if (!safeImageUrl(value)) node.removeAttribute(attr.name);
          return;
        }
        if (name === 'src' && !safeMediaUrl(value)) {
          node.removeAttribute(attr.name);
        }
      });
    });
  }

  function fallbackSanitizeHtml(html) {
    const template = document.createElement('template');
    // Intentional parser boundary: <template> content is inert, so nothing here
    // loads a resource or runs during parsing.
    template.innerHTML = String(html ?? '');
    scrubFragment(template.content);
    const once = template.innerHTML;

    // Mutation-XSS guard. Serializing a parsed tree and re-parsing it can yield
    // a DIFFERENT tree (foreign-content and table-scope confusion are the usual
    // culprits), which means markup that was safe when we inspected it can
    // become dangerous when the caller assigns our string to innerHTML. Run the
    // identical pass on the re-parsed form; if the result is not a fixed point,
    // the markup mutates under re-parsing and we refuse to emit it as HTML.
    const verify = document.createElement('template');
    verify.innerHTML = once;
    scrubFragment(verify.content);
    if (verify.innerHTML !== once) return escapeHtmlText(verify.content.textContent ?? '');
    return once;
  }

  const IMAGE_FALLBACK_SRC = './assets/og-cover.svg';
  function applyImageFallback(img) {
    if (!img || img.dataset.pdImageFallbackBound === 'true') return img;
    img.dataset.pdImageFallbackBound = 'true';
    img.addEventListener('error', () => {
      if (img.dataset.pdFallbackActive === 'true') return;
      img.dataset.pdFallbackActive = 'true';
      img.dataset.failedSrc = img.currentSrc || img.src || img.dataset.src || '';
      img.src = IMAGE_FALLBACK_SRC;
      img.classList.add('image-fallback');
      if (!img.alt) img.alt = 'Image unavailable';
    });
    return img;
  }

  /**
   * Simple event emitter
   */
  class EventEmitter {
    constructor() { this._events = {}; }
    on(event, fn) {
      (this._events[event] ??= []).push(fn);
      return this;
    }
    off(event, fn) {
      if (this._events[event]) {
        this._events[event] = this._events[event].filter(f => f !== fn && f.fn !== fn);
      }
      return this;
    }
    emit(event, ...args) {
      (this._events[event] ?? []).forEach(fn => fn(...args));
      return this;
    }
    once(event, fn) {
      const wrapper = (...args) => { fn(...args); this.off(event, wrapper); };
      wrapper.fn = fn;
      return this.on(event, wrapper);
    }
  }

  // Global event bus
  OpenCourseDeck.bus = new EventEmitter();

  /**
   * Animate element height from 0 → auto (or auto → 0)
   * @param {HTMLElement} el
   * @param {boolean} open   true = expand, false = collapse
   * @param {number} duration ms
   * @returns {Promise<void>}
   */
  function animateHeight(el, open, duration = OpenCourseDeck.config.animationDuration) {
    return new Promise(resolve => {
      const startHeight = open ? 0 : el.scrollHeight;
      const endHeight   = open ? el.scrollHeight : 0;

      el.style.overflow = 'hidden';
      el.style.height   = `${startHeight}px`;
      el.style.transition = `height ${duration}ms ease`;

      requestAnimationFrame(() => {
        el.style.height = `${endHeight}px`;
        setTimeout(() => {
          el.style.height   = open ? '' : '0px';
          el.style.overflow = open ? '' : 'hidden';
          el.style.transition = '';
          resolve();
        }, duration);
      });
    });
  }


  // ──────────────────────────────────────────────────────────
  // 2. THEME SYSTEM
  // ──────────────────────────────────────────────────────────
  // Extracted into `src/core/themeManager.js` and imported at file top.

  // ──────────────────────────────────────────────────────────
  // 2b. UI PREFERENCES (accent, density, font scale)
  // ──────────────────────────────────────────────────────────
  // Extracted into `src/core/prefs.js` and imported at file top.


  // ──────────────────────────────────────────────────────────
  // 3. SIDEBAR
  // ──────────────────────────────────────────────────────────

  const Sidebar = {
    // Keep in sync with storageMigrate + index pre-boot.
    STORAGE_KEY: 'plasma_sidebar_collapsed',
    el: null,
    mainContent: null,
    topbar: null,

    init() {
      this.el          = $('.sidebar');
      this.mainContent = $('.main-content');
      this.topbar      = $('.topbar');
      if (!this.el) return;

      // Restore collapsed state
      const collapsed = localStorage.getItem(this.STORAGE_KEY) === 'true';
      if (collapsed) this._setCollapsed(true);

      // Collapse toggle button
      document.addEventListener('click', e => {
        const target = eventTargetEl(e);
        if (!target) return;
        if (target.closest('[data-sidebar-toggle]') || target.closest('.sidebar-collapse-btn')) {
          this.toggle();
        }
        // Mobile: close on overlay click
        if (target.classList.contains('sidebar-overlay')) {
          this.closeMobile();
        }
        // Topbar menu button (mobile)
        if (target.closest('.topbar-menu-btn')) {
          this.openMobile();
        }
      });

      // Sub-nav toggle
      document.addEventListener('click', e => {
        const target = eventTargetEl(e);
        if (!target) return;
        const navItem = target.closest('.nav-item[data-has-sub]');
        if (!navItem) return;
        this._toggleSubNav(navItem);
      });

      // Mark active nav item from current URL
      this._setActiveFromURL();

      // Handle window resize
      window.addEventListener('resize', debounce(() => this._handleResize(), 200));
      this._handleResize();
    },

    toggle() {
      this._setCollapsed(!OpenCourseDeck.state.sidebarCollapsed);
    },

    _setCollapsed(collapsed) {
      OpenCourseDeck.state.sidebarCollapsed = collapsed;
      localStorage.setItem(this.STORAGE_KEY, String(collapsed));

      this.el.classList.toggle('sidebar-collapsed', collapsed);
      if (this.mainContent) this.mainContent.classList.toggle('sidebar-collapsed', collapsed);
      if (this.topbar)      this.topbar.classList.toggle('sidebar-collapsed', collapsed);

      // Chevron icons on collapse button
      $$('.sidebar-collapse-btn svg', this.el).forEach(svg => {
        svg.style.transform = collapsed ? 'rotate(180deg)' : '';
      });

      // Tooltip: show nav label when collapsed
      $$('.nav-item', this.el).forEach(item => {
        const label = $('.nav-label', item);
        if (label) {
          item.setAttribute('data-tip', collapsed ? label.textContent.trim() : '');
        }
      });

      OpenCourseDeck.bus.emit('sidebar:toggle', { collapsed });
    },

    openMobile() {
      this.el.classList.add('sidebar-mobile-open');
      // Overlay
      let overlay = $('.sidebar-overlay');
      if (!overlay) {
        overlay = createElement('div', { class: 'sidebar-overlay' });
        document.body.appendChild(overlay);
      }
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    },

    closeMobile() {
      this.el.classList.remove('sidebar-mobile-open');
      const overlay = $('.sidebar-overlay');
      if (overlay) overlay.classList.remove('active');
      document.body.style.overflow = '';
    },

    _toggleSubNav(navItem) {
      const subNav  = navItem.nextElementSibling;
      const chevron = $('.nav-chevron', navItem);
      if (!subNav?.classList.contains('sub-nav')) return;

      const isOpen = subNav.classList.contains('open');

      // Close all other sub-navs (accordion behaviour)
      $$('.sub-nav.open').forEach(openSub => {
        if (openSub !== subNav) {
          openSub.classList.remove('open');
          const sibling = openSub.previousElementSibling;
          if (sibling) {
            const sChevron = $('.nav-chevron', sibling);
            if (sChevron) sChevron.classList.remove('rotated');
          }
          animateHeight(openSub, false);
        }
      });

      if (isOpen) {
        subNav.classList.remove('open');
        if (chevron) chevron.classList.remove('rotated');
        animateHeight(subNav, false);
      } else {
        subNav.classList.add('open');
        if (chevron) chevron.classList.add('rotated');
        animateHeight(subNav, true);
      }
    },

    _setActiveFromURL() {
      const hash = window.location.hash || '#/';
      $$('.nav-item', this.el).forEach(item => {
        const href = item.getAttribute('href') || '';
        if (href && href === hash) {
          item.classList.add('active');
          // Expand parent sub-nav if in one
          const parentSubNav = item.closest('.sub-nav');
          if (parentSubNav) {
            parentSubNav.classList.add('open');
            const trigger = parentSubNav.previousElementSibling;
            if (trigger) {
              const ch = $('.nav-chevron', trigger);
              if (ch) ch.classList.add('rotated');
            }
          }
        } else {
          item.classList.remove('active');
        }
      });
    },

    _handleResize() {
      const w = window.innerWidth;
      if (w < OpenCourseDeck.config.breakpoints.lg) {
        // Mobile: remove desktop collapsed, use mobile open/close
        this.el.classList.remove('sidebar-collapsed');
      } else {
        this.closeMobile();
        if (OpenCourseDeck.state.sidebarCollapsed) {
          this.el.classList.add('sidebar-collapsed');
        }
      }
    },
  };


  // ──────────────────────────────────────────────────────────
  // 4. TOPBAR — SEARCH
  // ──────────────────────────────────────────────────────────

  const TopbarSearch = {
    input: null,
    resultsBox: null,
    _data: [],
    _universalData: null,
    _hasDataOverride: false,

    init() {
      this.input = $('.topbar-search input, .topbar-search [data-search-input]');
      if (!this.input) return;

      this.resultsBox = createElement('div', {
        class: 'search-results-dropdown',
        role: 'listbox',
        'aria-label': 'Search results',
      });
      this.input.parentElement.appendChild(this.resultsBox);

      this.input.addEventListener('input', debounce(e => this._onInput(e.target.value), 300));
      this.input.addEventListener('focus', () => {
        if (this.input.value.length > 1) this.resultsBox.classList.add('open');
      });
      this.input.addEventListener('keydown', e => this._onKeydown(e));
      document.addEventListener('click', e => {
        const target = eventTargetEl(e);
        if (!target) return;
        if (!target.closest('.topbar-search')) this._close();
      });

      // The universal index caches notes/timestamps/annotations; drop it
      // whenever any of them change so new content is searchable without a
      // reload. TopbarSearch is an app-lifetime singleton, so these
      // subscriptions intentionally live until the page unloads.
      const invalidate = () => { this._universalData = null; };
      const bus = OpenCourseDeck?.bus;
      for (const event of [
        'note:create', 'note:save', 'note:delete',
        'pdf:annotate', 'sync:message', 'sync:local-change',
        'storage:import-complete', 'data:loaded',
      ]) {
        bus?.on?.(event, invalidate);
      }
    },

    /**
     * Provide data for client-side search (optional — falls back to server fetch)
     */
    setData(data) {
      this._data = Array.isArray(data) ? data : [];
      this._universalData = null;
      this._hasDataOverride = true;
    },

    async _onInput(value) {
      if (value.trim().length < 2) { this._close(); return; }

      let results;
      if (this._hasDataOverride) {
        // Client-side filter
        const q = value.toLowerCase();
        results = this._data.filter(item =>
          item.label?.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q)
        ).slice(0, 8);
      } else {
        results = await this._queryUniversal(value);
      }

      this._render(results, value);
    },

    async _queryUniversal(value) {
      const q = String(value || '').trim().toLowerCase();
      if (!q) return [];
      const data = await this._loadUniversalData();
      const eventPayload = { value, setResults: r => { if (Array.isArray(r)) data.push(...r); } };
      OpenCourseDeck.bus.emit('search:query', eventPayload);
      const lexical = data
        .filter((item) => {
          const haystack = `${item.label || ''} ${item.description || ''} ${item.category || ''}`.toLowerCase();
          return haystack.includes(q);
        })
        .slice(0, 12);
      const semantic = await this._querySemanticNotes(value, data);
      const seen = new Set(lexical.map(item => item.id || `${item.category}:${item.label}`));
      return [
        ...lexical,
        ...semantic.filter(item => {
          const key = item.id || `${item.category}:${item.label}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }),
      ].slice(0, 12);
    },

    async _querySemanticNotes(value, data = []) {
      const ai = window.OpenCourseDeck?.AI;
      if (!ai?.upsertEmbedding || !ai?.searchEmbeddings) return [];
      const notes = data.filter(item => item.sourceType === 'note' && item.sourceId);
      if (!notes.length) return [];
      try {
        await Promise.all(notes.map(item => ai.upsertEmbedding({
          id: item.sourceId,
          text: `${item.label || ''}\n${item.searchText || item.description || ''}`,
          metadata: { type: 'note', title: item.label || '', href: item.href || '#/notes' },
        })));
        const hits = await ai.searchEmbeddings(value, { limit: 4 });
        const byId = new Map(notes.map(item => [item.sourceId, item]));
        return hits.map(hit => {
          const item = byId.get(hit.id);
          if (!item) return null;
          return {
            ...item,
            id: `semantic-note:${item.sourceId}`,
            icon: '🧠',
            category: 'Semantic note',
            description: `Semantic match${hit.score ? ` · ${Math.round(hit.score * 100)}%` : ''}`,
          };
        }).filter(Boolean);
      } catch {
        return [];
      }
    },

    async _loadUniversalData() {
      if (Array.isArray(this._universalData)) return [...this._universalData];
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
      const results = [];
      (catalog.courses || []).forEach((course) => {
        if (!course?.id) return;
        results.push({
          icon: '📚',
          label: String(course.title || course.name || course.id),
          description: 'Course',
          category: 'Course',
          href: '#/courses',
        });
      });
      (catalog.topics || []).forEach((topic) => {
        if (!topic?.topicId) return;
        const title = String(topic.title || topic.topicTitle || topic.topicId);
        const source = String(topic.sourceLabel || topic.courseTitle || topic.courseId || 'Catalog topic');
        results.push({
          icon: topic.pdfs?.length ? '📄' : topic.videos?.length ? '▶' : '🔎',
          label: title,
          description: source,
          category: topic.pdfs?.length ? 'PDF topic' : topic.videos?.length ? 'Video topic' : 'Topic',
          href: '#/courses',
          action: () => {
            setPendingCourseMedia(topic.topicId);
          },
        });
      });
      (notes || []).forEach((note) => {
        if (!note?.id) return;
        results.push({
          id: `note:${note.id}`,
          icon: '📝',
          label: String(note.title || 'Untitled note'),
          description: note.topicId ? `Linked to ${note.topicId}` : 'Note',
          searchText: this._plainText(note.content || note.text || ''),
          sourceType: 'note',
          sourceId: note.id,
          category: 'Note',
          href: '#/notes',
        });
      });
      (timestamps || []).forEach((timestamp) => {
        const target = timestamp?.topicId || timestamp?.id;
        if (!target) return;
        results.push({
          icon: '⏱',
          label: String(timestamp.title || timestamp.topicTitle || target),
          description: timestamp.position != null ? `Timestamp at ${this._formatDuration(timestamp.position)}` : 'Saved timestamp',
          category: 'Timestamp',
          href: '#/courses',
          action: () => {
            setPendingCourseMedia(target, timestamp.position);
          },
        });
      });
      (annotations || []).forEach((annotation) => {
        const target = annotation?.docId || annotation?.id;
        if (!target) return;
        results.push({
          icon: '✏',
          label: String(annotation.title || annotation.text || target),
          description: `PDF annotation${annotation.page ? ` · page ${annotation.page}` : ''}`,
          category: 'PDF annotation',
          href: '#/pdf',
        });
      });
      this._universalData = results;
      return [...results];
    },

    _formatDuration(seconds) {
      const total = Math.max(0, Math.floor(Number(seconds) || 0));
      const minutes = Math.floor(total / 60);
      const secs = total % 60;
      return `${minutes}:${String(secs).padStart(2, '0')}`;
    },

    _plainText(value) {
      // DOMParser, not innerHTML: assigning innerHTML — even on a detached
      // element — still triggers resource loads and inline handlers, so
      // indexing a note containing <img src=x onerror=...> would execute it.
      const source = String(value || '');
      if (!source.includes('<') && !source.includes('&')) {
        return source.replace(/\s+/g, ' ').trim();
      }
      try {
        const doc = new DOMParser().parseFromString(source, 'text/html');
        return (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
      } catch {
        return source.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    },

    _render(results, query) {
      this.resultsBox.replaceChildren();
      if (!results.length) {
        const empty = createElement('div', { class: 'search-no-results' }, 'No results for "');
        empty.appendChild(createElement('strong', {}, query));
        empty.appendChild(document.createTextNode('"'));
        this.resultsBox.appendChild(empty);
      } else {
        results.forEach((item, i) => {
          const el = createElement('div', {
            class: 'search-result-item',
            role: 'option',
            tabindex: '-1',
            'data-index': String(i),
          });
          const icon = createElement('span', { class: 'search-result-icon' }, item.icon ?? 'Search');
          const text = createElement('span', { class: 'search-result-text' });
          const label = createElement('span', { class: 'search-result-label' });
          this._appendHighlighted(label, item.label ?? '', query);
          text.appendChild(label);
          if (item.description) {
            text.appendChild(createElement('span', { class: 'search-result-desc' }, item.description));
          }
          el.append(icon, text);
          if (item.category) {
            el.appendChild(createElement('span', { class: 'search-result-cat' }, item.category));
          }
          el.addEventListener('click', () => {
            OpenCourseDeck.bus.emit('search:select', item);
            if (typeof item.action === 'function') {
              try { item.action(item); } catch (e) { console.warn('[TopbarSearch] select action failed', e); }
            }
            const href = safeNavigationUrl(item.href);
            if (href) window.location.href = href;
            this._close();
          });
          this.resultsBox.appendChild(el);
        });
      }
      this.resultsBox.classList.add('open');
    },

    _onKeydown(e) {
      const items = $$('.search-result-item', this.resultsBox);
      const current = this.resultsBox.querySelector('[aria-selected="true"]');
      let idx = current ? Number(current.dataset.index) : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        idx = Math.min(idx + 1, items.length - 1);
        this._selectItem(items, idx);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        idx = Math.max(idx - 1, 0);
        this._selectItem(items, idx);
      } else if (e.key === 'Enter' && current) {
        current.click();
      } else if (e.key === 'Escape') {
        this._close();
      }
    },

    _selectItem(items, idx) {
      items.forEach(el => el.removeAttribute('aria-selected'));
      if (items[idx]) {
        items[idx].setAttribute('aria-selected', 'true');
        items[idx].scrollIntoView({ block: 'nearest' });
      }
    },

    _close() {
      this.resultsBox.classList.remove('open');
      $$('.search-result-item', this.resultsBox).forEach(el => el.removeAttribute('aria-selected'));
    },

    _appendHighlighted(parent, text, query) {
      const source = String(text ?? '');
      const needle = String(query ?? '').trim();
      if (!needle) {
        parent.textContent = source;
        return;
      }
      const lower = source.toLowerCase();
      const q = needle.toLowerCase();
      let cursor = 0;
      while (cursor < source.length) {
        const idx = lower.indexOf(q, cursor);
        if (idx === -1) {
          parent.appendChild(document.createTextNode(source.slice(cursor)));
          break;
        }
        if (idx > cursor) parent.appendChild(document.createTextNode(source.slice(cursor, idx)));
        parent.appendChild(createElement('mark', { class: 'search-highlight' }, source.slice(idx, idx + q.length)));
        cursor = idx + q.length;
      }
    },

    _escHtml(str) {
      return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    },
  };


  // ──────────────────────────────────────────────────────────
  // 5. RIPPLE EFFECT (Buttons)
  // ──────────────────────────────────────────────────────────

  const Ripple = {
    init() {
      document.addEventListener('pointerdown', e => {
        if (!OpenCourseDeck.state.rippleEnabled) return;
        const target = eventTargetEl(e);
        if (!target) return;
        const btn = target.closest('.btn, [data-ripple]');
        if (!btn) return;
        this._spawn(btn, e);
      });
    },

    _spawn(el, e) {
      const rect   = el.getBoundingClientRect();
      const size   = Math.max(rect.width, rect.height) * 2;
      const x      = e.clientX - rect.left - size / 2;
      const y      = e.clientY - rect.top  - size / 2;

      const ripple = createElement('span', {
        class: 'ripple-wave',
        style: {
          width:  `${size}px`,
          height: `${size}px`,
          left:   `${x}px`,
          top:    `${y}px`,
        },
      });

      // Ensure el is position:relative
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';

      el.appendChild(ripple);
      // `.ripple-wave` previously had no stylesheet rule at all, so no
      // animation ran, animationend never fired, and one orphan <span> stayed
      // inside the button on every single click. The rule now exists in
      // components.css; the timeout remains because DOM cleanup must not
      // depend on a paint event firing.
      let removed = false;
      const drop = () => {
        if (removed) return;
        removed = true;
        clearTimeout(timer);
        ripple.remove();
      };
      const timer = setTimeout(drop, 1200);
      ripple.addEventListener('animationend', drop, { once: true });
    },
  };


  // ──────────────────────────────────────────────────────────
  // 6. MODALS & DRAWERS
  // ──────────────────────────────────────────────────────────

  const Modal = {
    _cleanupFns: new WeakMap(),
    _previousFocus: new WeakMap(),
    // Pending deferred-teardown timers from close(), keyed by modal, so a
    // reopen inside the animation window can cancel the one still in flight.
    _teardownTimers: new WeakMap(),

    /**
     * Open a modal by its ID or element reference
     * @param {string|HTMLElement} target
     * @param {Object} [opts]
     */
    open(target, opts = {}) {
      const modal = typeof target === 'string'
        ? document.getElementById(target)
        : target;
      if (!modal) return;
      if (modal.classList.contains('open')) return;

      // Cancel a teardown still pending from a close() moments ago. Without
      // this, reopening inside the animation window let the stale timer fire
      // against the newly-opened modal: it set `hidden` and removed the
      // backdrop, while openModals, body overflow and app inertness all stayed
      // in the open state. The result was an invisible dialog holding the page
      // inert and unscrollable, with no way out but a reload.
      const pendingTeardown = this._teardownTimers.get(modal);
      if (pendingTeardown !== undefined) {
        clearTimeout(pendingTeardown);
        this._teardownTimers.delete(modal);
      }

      // Backdrop
      let backdrop = modal.previousElementSibling;
      if (!backdrop?.classList.contains('modal-backdrop')) {
        backdrop = createElement('div', { class: 'modal-backdrop', 'aria-hidden': 'true' });
        modal.parentNode.insertBefore(backdrop, modal);
      }

      modal.removeAttribute('hidden');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('tabindex', '-1');

      requestAnimationFrame(() => {
        backdrop.classList.add('open');
        modal.classList.add('open');
      });

      document.body.style.overflow = 'hidden';
      OpenCourseDeck.state.openModals.push(modal);
      this._previousFocus.set(modal, document.activeElement);
      setAppInert(true);

      // Trap focus
      const cleanup = trapFocus(modal);
      this._cleanupFns.set(modal, cleanup);

      // Close on backdrop click
      backdrop.addEventListener('click', () => this.close(modal), { once: true });

      // Close on Escape. Only the topmost modal responds: every open modal
      // registers its own document-level handler, so without this guard one
      // Escape collapsed the entire stack at once.
      const onEsc = e => {
        if (e.key !== 'Escape') return;
        const stack = OpenCourseDeck.state.openModals;
        if (stack[stack.length - 1] !== modal) return;
        this.close(modal);
      };
      document.addEventListener('keydown', onEsc);
      this._cleanupFns.set(modal, () => {
        cleanup();
        document.removeEventListener('keydown', onEsc);
      });

      // Wire close buttons inside modal
      $$('[data-modal-close]', modal).forEach(btn => {
        btn.addEventListener('click', () => this.close(modal), { once: true });
      });

      OpenCourseDeck.bus.emit('modal:open', { modal, opts });
    },

    /**
     * Close a modal
     */
    close(target) {
      const modal = typeof target === 'string'
        ? document.getElementById(target)
        : target;
      if (!modal) return;
      if (!modal.classList.contains('open')) return;

      const backdrop = modal.previousElementSibling;
      modal.classList.remove('open');
      if (backdrop?.classList.contains('modal-backdrop')) {
        backdrop.classList.remove('open');
      }

      const teardown = setTimeout(() => {
        this._teardownTimers.delete(modal);
        // Re-check: open() cancels this timer, but a close/open/close sequence
        // can still land here with the modal legitimately open again.
        if (modal.classList.contains('open')) return;
        modal.setAttribute('hidden', '');
        modal.removeAttribute('aria-modal');
        if (backdrop?.classList.contains('modal-backdrop')) {
          backdrop.remove();
        }
      }, OpenCourseDeck.config.animationDuration);
      this._teardownTimers.set(modal, teardown);

      OpenCourseDeck.state.openModals = OpenCourseDeck.state.openModals.filter(m => m !== modal);

      if (!OpenCourseDeck.state.openModals.length) {
        document.body.style.overflow = '';
      }

      // Cleanup focus trap
      const cleanup = this._cleanupFns.get(modal);
      if (cleanup) { cleanup(); this._cleanupFns.delete(modal); }
      // setAppInert is depth-counted, not a boolean setter: `true` pushes a
      // level and `false` pops one, and the app stays inert while the depth is
      // above zero. So this must stay `false` even with modals still open --
      // passing a computed boolean here would push a second level on close and
      // the page could never become interactive again.
      setAppInert(false);
      restoreFocus(this._previousFocus.get(modal));
      this._previousFocus.delete(modal);

      modal.dispatchEvent(new CustomEvent('modal:close', { detail: { modal } }));
      OpenCourseDeck.bus.emit('modal:close', { modal });
    },

    /**
     * Create and open a modal programmatically
     */
    create({
      title    = '',
      body     = '',
      footer   = '',
      size     = '',          // 'sm' | 'lg' | 'xl' | 'fullscreen'
      onClose  = null,
      onConfirm = null,
    } = {}) {
      const id    = uid('modal');
      const sizeClass = size ? `modal-${size}` : '';

      const closeBtn = createElement('button', {
        class: 'modal-close-btn',
        'aria-label': 'Close dialog',
        'data-modal-close': '',
      }, '×');

      const header = title
        ? createElement('div', { class: 'modal-header' },
            createElement('h3', { class: 'modal-title' }, title),
            closeBtn)
        : closeBtn;

      const bodyEl = createElement('div', { class: 'modal-body' });
      appendContent(bodyEl, body);

      const children = [header, bodyEl];

      if (footer || onConfirm) {
        const footerEl = createElement('div', { class: 'modal-footer' });
        if (footer) {
          appendContent(footerEl, footer);
        } else if (onConfirm) {
          const cancelBtn = createElement('button', { class: 'btn btn-ghost', 'data-modal-close': '' }, 'Cancel');
          const confirmBtn = createElement('button', { class: 'btn btn-primary' }, 'Confirm');
          confirmBtn.addEventListener('click', () => {
            onConfirm();
            this.close(modal);
          });
          footerEl.append(cancelBtn, confirmBtn);
        }
        children.push(footerEl);
      }

      const modal = createElement('div',
        { id, class: `modal-container ${sizeClass}`, hidden: '' },
        ...children
      );

      if (onClose) modal.addEventListener('modal:close', onClose, { once: true });

      document.body.appendChild(modal);

      // Auto-remove from DOM after closing. Self-removing listener: a
      // permanent bus subscription per created modal would retain every
      // closed modal element for the page lifetime.
      const onModalClose = ({ modal: m }) => {
        if (m !== modal) return;
        OpenCourseDeck.bus.off('modal:close', onModalClose);
        setTimeout(() => modal.remove(), 400);
      };
      OpenCourseDeck.bus.on('modal:close', onModalClose);

      this.open(modal);
      return modal;
    },

    confirmAsync({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel' } = {}) {
      return new Promise((resolve) => {
        let settled = false;
        const settle = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        const modal = this.create({
          title,
          body: createElement('p', {}, String(message ?? '')),
          footer: '',
        });
        const footer = $('.modal-footer', modal) ?? createElement('div', { class: 'modal-footer' });
        if (!footer.isConnected) modal.appendChild(footer);
        footer.replaceChildren();
        const cancelBtn = createElement('button', { class: 'btn btn-ghost' }, cancelLabel);
        const confirmBtn = createElement('button', { class: 'btn btn-primary' }, confirmLabel);
        cancelBtn.addEventListener('click', () => {
          settle(false);
          this.close(modal);
        });
        confirmBtn.addEventListener('click', () => {
          settle(true);
          this.close(modal);
        });
        // Not bus.once(): once() is consumed by the FIRST modal:close of ANY
        // modal, which would strand this promise if an unrelated modal closes
        // before ours is dismissed via Escape/backdrop.
        const onAnyClose = ({ modal: closed }) => {
          if (closed !== modal) return;
          OpenCourseDeck.bus.off('modal:close', onAnyClose);
          settle(false);
        };
        OpenCourseDeck.bus.on('modal:close', onAnyClose);
        footer.append(cancelBtn, confirmBtn);
      });
    },

    /**
     * Init data-attribute driven modals
     */
    init() {
      document.addEventListener('click', e => {
        const target = eventTargetEl(e);
        if (!target) return;
        const trigger = target.closest('[data-modal-open]');
        if (trigger) {
          e.preventDefault();
          this.open(trigger.dataset.modalOpen);
        }
        const closeBtn = target.closest('[data-modal-close]');
        if (closeBtn) {
          const modal = closeBtn.closest('.modal-container, .drawer');
          if (modal) this.close(modal);
        }
      });
    },
  };


  // ──────────────────────────────────────────────────────────
  // 7. DRAWERS
  // ──────────────────────────────────────────────────────────

  const Drawer = {
    _cleanupFns: new WeakMap(),
    _previousFocus: new WeakMap(),

    open(target) {
      const drawer = typeof target === 'string'
        ? document.getElementById(target)
        : target;
      if (!drawer) return;
      if (drawer.classList.contains('open')) return;

      let backdrop = $('.drawer-backdrop');
      if (!backdrop) {
        backdrop = createElement('div', { class: 'drawer-backdrop' });
        document.body.appendChild(backdrop);
        backdrop.addEventListener('click', () => this.closeAll());
      }

      drawer.removeAttribute('hidden');
      drawer.setAttribute('aria-hidden', 'false');
      drawer.setAttribute('aria-modal', 'true');
      drawer.setAttribute('role', 'dialog');
      drawer.setAttribute('tabindex', '-1');
      requestAnimationFrame(() => {
        backdrop.classList.add('open');
        drawer.classList.add('open');
      });

      document.body.style.overflow = 'hidden';
      this._previousFocus.set(drawer, document.activeElement);
      setAppInert(true);
      this._cleanupFns.set(drawer, trapFocus(drawer));

      OpenCourseDeck.bus.emit('drawer:open', { drawer });
    },

    close(target) {
      const drawer = typeof target === 'string'
        ? document.getElementById(target)
        : target;
      if (!drawer) return;
      if (!drawer.classList.contains('open')) return;

      drawer.classList.remove('open');
      setTimeout(() => {
        drawer.setAttribute('hidden', '');
        drawer.setAttribute('aria-hidden', 'true');
        drawer.removeAttribute('aria-modal');
      }, OpenCourseDeck.config.animationDuration);

      const backdrop = $('.drawer-backdrop');
      if (backdrop) {
        backdrop.classList.remove('open');
        setTimeout(() => backdrop.remove(), OpenCourseDeck.config.animationDuration);
      }

      document.body.style.overflow = '';
      this._cleanupFns.get(drawer)?.();
      this._cleanupFns.delete(drawer);
      setAppInert(false);
      restoreFocus(this._previousFocus.get(drawer));
      this._previousFocus.delete(drawer);
      OpenCourseDeck.bus.emit('drawer:close', { drawer });
    },

    closeAll() {
      $$('.drawer.open').forEach(d => this.close(d));
    },

    init() {
      document.addEventListener('click', e => {
        const target = eventTargetEl(e);
        if (!target) return;
        const trigger = target.closest('[data-drawer-open]');
        if (trigger) { e.preventDefault(); this.open(trigger.dataset.drawerOpen); }

        const closeBtn = target.closest('[data-drawer-close]');
        if (closeBtn) {
          const drawer = closeBtn.closest('.drawer');
          if (drawer) this.close(drawer);
        }
      });

      // Close on Escape
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') this.closeAll();
      });
    },
  };


  // ──────────────────────────────────────────────────────────
  // 8. DROPDOWN MENUS
  // ──────────────────────────────────────────────────────────

  const Dropdown = {
    _active: null,

    init() {
      // Toggle on trigger click
      document.addEventListener('click', e => {
        const target = eventTargetEl(e);
        if (!target) return;
        const trigger = target.closest('[data-dropdown-trigger]');
        if (trigger) {
          e.stopPropagation();
          const targetId = trigger.dataset.dropdownTrigger;
          const menu     = targetId
            ? document.getElementById(targetId)
            : trigger.nextElementSibling?.classList.contains('dropdown-menu')
              ? trigger.nextElementSibling
              : null;
          if (menu) this.toggle(menu, trigger);
          return;
        }

        // Close on outside click
        if (!target.closest('.dropdown-menu')) {
          this.closeAll();
        }
      });

      // Keyboard navigation inside menu
      document.addEventListener('keydown', e => {
        const menu = this._active;
        if (!menu) return;

        const items = $$('.dropdown-item:not(.disabled)', menu);
        const focused = document.activeElement;
        const idx = items.indexOf(focused);

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          (items[idx + 1] ?? items[0])?.focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          (items[idx - 1] ?? items[items.length - 1])?.focus();
        } else if (e.key === 'Escape') {
          this.closeAll();
        } else if (e.key === 'Tab') {
          this.closeAll();
        }
      });
    },

    open(menu, trigger = null) {
      if (this._active && this._active !== menu) this.closeAll();

      menu.classList.add('open');
      menu.removeAttribute('hidden');
      menu.setAttribute('aria-hidden', 'false');
      if (trigger) trigger.setAttribute('aria-expanded', 'true');

      // Auto-flip if overflows viewport
      this._autoPosition(menu);

      this._active = menu;
      // Focus first item
      const firstItem = $('.dropdown-item:not(.disabled)', menu);
      firstItem?.focus();

      OpenCourseDeck.bus.emit('dropdown:open', { menu });
    },

    close(menu) {
      menu.classList.remove('open');
      menu.setAttribute('aria-hidden', 'true');

      const trigger = $(`[data-dropdown-trigger="${menu.id}"]`)
        ?? menu.previousElementSibling;
      if (trigger) trigger.setAttribute('aria-expanded', 'false');

      if (this._active === menu) this._active = null;

      OpenCourseDeck.bus.emit('dropdown:close', { menu });
    },

    closeAll() {
      $$('.dropdown-menu.open').forEach(m => this.close(m));
    },

    toggle(menu, trigger) {
      menu.classList.contains('open') ? this.close(menu) : this.open(menu, trigger);
    },

    _autoPosition(menu) {
      const rect = menu.getBoundingClientRect();
      const vpW  = window.innerWidth;
      const vpH  = window.innerHeight;

      menu.classList.remove('dropdown-left', 'dropdown-top');

      if (rect.right > vpW) menu.classList.add('dropdown-left');
      if (rect.bottom > vpH) menu.classList.add('dropdown-top');
    },
  };


  // ──────────────────────────────────────────────────────────
  // 9. TABS
  // ──────────────────────────────────────────────────────────

  const Tabs = {
    init() {
      // Activate default tabs
      $$('.tab-list').forEach(list => {
        const active = $('.tab-item[aria-selected="true"]', list)
          ?? $('.tab-item', list);
        if (active) this._activate(active);
      });

      // Click handler
      document.addEventListener('click', e => {
        const target = eventTargetEl(e);
        if (!target) return;
        const tab = target.closest('.tab-item');
        if (!tab) return;
        e.preventDefault();
        this._activate(tab);
      });

      // Keyboard nav
      document.addEventListener('keydown', e => {
        const target = eventTargetEl(e);
        if (!target) return;
        const tab = target.closest('.tab-item');
        if (!tab) return;

        const list  = tab.closest('.tab-list');
        const tabs  = $$('.tab-item:not([disabled])', list);
        const idx   = tabs.indexOf(tab);
        const isVert = list.classList.contains('tab-list-vertical');

        const prevKey = isVert ? 'ArrowUp'   : 'ArrowLeft';
        const nextKey = isVert ? 'ArrowDown'  : 'ArrowRight';

        if (e.key === nextKey) {
          e.preventDefault();
          (tabs[idx + 1] ?? tabs[0]).click();
        } else if (e.key === prevKey) {
          e.preventDefault();
          (tabs[idx - 1] ?? tabs[tabs.length - 1]).click();
        } else if (e.key === 'Home') {
          e.preventDefault();
          tabs[0].click();
        } else if (e.key === 'End') {
          e.preventDefault();
          tabs[tabs.length - 1].click();
        }
      });
    },

    _activate(tab) {
      const list  = tab.closest('.tab-list');
      const panel = tab.getAttribute('data-tab-target')
        ? document.getElementById(tab.getAttribute('data-tab-target'))
        : null;

      // Deactivate all in list
      $$('.tab-item', list).forEach(t => {
        t.setAttribute('aria-selected', 'false');
        t.removeAttribute('tabindex');
      });

      // Deactivate all panels in group
      const group = list.closest('.tabs-wrapper, [data-tab-group]');
      if (group) {
        $$('.tab-panel', group).forEach(p => {
          p.setAttribute('hidden', '');
          p.classList.remove('active');
        });
      }

      // Activate
      tab.setAttribute('aria-selected', 'true');
      tab.setAttribute('tabindex', '0');
      tab.focus();

      if (panel) {
        panel.removeAttribute('hidden');
        panel.classList.add('active');
      }

      OpenCourseDeck.bus.emit('tab:change', { tab, panel });
    },

    /**
     * Programmatically switch tab
     * @param {string} tabId - the tab-item's data-tab-target or id
     */
    switchTo(tabId) {
      const tab = $(`[data-tab-target="${tabId}"], .tab-item[aria-controls="${tabId}"]`);
      if (tab) this._activate(tab);
    },
  };


  // ──────────────────────────────────────────────────────────
  // 10. ACCORDION
  // ──────────────────────────────────────────────────────────

  const Accordion = {
    init() {
      document.addEventListener('click', e => {
        const target = eventTargetEl(e);
        if (!target) return;
        const trigger = target.closest('.accordion-trigger');
        if (!trigger) return;
        this.toggle(trigger);
      });

      // Keyboard support
      document.addEventListener('keydown', e => {
        const target = eventTargetEl(e);
        if (!target) return;
        const trigger = target.closest('.accordion-trigger');
        if (!trigger) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.toggle(trigger);
        }
      });
    },

    toggle(trigger) {
      const item      = trigger.closest('.accordion-item');
      const body      = item?.querySelector('.accordion-body');
      if (!item || !body) return;

      const isOpen    = item.classList.contains('open');
      const accordion = item.closest('[data-accordion]');
      const exclusive = accordion?.dataset.accordion === 'exclusive';

      // Close others in exclusive mode
      if (exclusive && !isOpen) {
        $$('.accordion-item.open', accordion).forEach(openItem => {
          if (openItem !== item) {
            const openBody = openItem.querySelector('.accordion-body');
            openItem.classList.remove('open');
            openItem.querySelector('.accordion-trigger')?.setAttribute('aria-expanded', 'false');
            if (openBody) animateHeight(openBody, false);
          }
        });
      }

      if (isOpen) {
        item.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
        animateHeight(body, false);
      } else {
        item.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        animateHeight(body, true);
      }

      OpenCourseDeck.bus.emit('accordion:toggle', { item, open: !isOpen });
    },
  };


  // ──────────────────────────────────────────────────────────
  // 11. TOAST NOTIFICATIONS
  // ──────────────────────────────────────────────────────────

  const Toast = {
    _containers: {},

    /**
     * Show a toast
     * @param {Object} opts
     * @param {string} opts.message
     * @param {'info'|'success'|'warning'|'error'} opts.type
     * @param {number} opts.duration  ms (0 = persistent)
     * @param {'top-right'|'top-left'|'top-center'|'bottom-right'|'bottom-left'|'bottom-center'} opts.position
     * @param {boolean} opts.dismissible
     * @param {string} opts.title
     * @param {string|Node|Node[]} opts.action  Action content rendered as text unless a Node is supplied
     * @returns {HTMLElement} the toast element
     */
    show({
      message     = '',
      type        = 'info',
      duration    = OpenCourseDeck.config.toastDuration,
      position    = 'top-right',
      dismissible = true,
      title       = '',
      action      = '',
    } = {}) {
      const container = this._getContainer(position);

      // Enforce max stack
      const stack = $$('.toast', container);
      if (stack.length >= OpenCourseDeck.config.toastMaxStack) {
        const oldest = stack[0];
        oldest.remove();
        OpenCourseDeck.state.activeToasts = OpenCourseDeck.state.activeToasts.filter(t => t !== oldest);
      }

      const id   = uid('toast');
      const icon = { info: 'i', success: 'OK', warning: '!', error: 'X' }[type] ?? 'i';

      const toast = createElement('div', {
        id,
        class: `toast toast-${type}`,
        role: type === 'error' ? 'alert' : 'status',
        'aria-live': type === 'error' ? 'assertive' : 'polite',
        'aria-atomic': 'true',
      });

      const iconEl = createElement('span', { class: 'toast-icon', 'aria-hidden': 'true' }, icon);
      const content = createElement('div', { class: 'toast-content' });
      if (title) content.appendChild(createElement('div', { class: 'toast-title' }, title));
      content.appendChild(createElement('div', { class: 'toast-message' }, message));
      this._appendAction(content, action);
      toast.append(iconEl, content);
      if (dismissible) {
        toast.appendChild(createElement('button', { class: 'toast-close', 'aria-label': 'Dismiss notification' }, '×'));
      }
      if (duration > 0) {
        toast.appendChild(createElement('div', { class: 'toast-timer' }));
      }

      // Close button
      const closeBtn = toast.querySelector('.toast-close');
      if (closeBtn) closeBtn.addEventListener('click', () => this.dismiss(toast));

      // Timer bar
      if (duration > 0) {
        const timerBar = toast.querySelector('.toast-timer');
        timerBar.style.animationDuration = `${duration}ms`;
        timerBar.classList.add('running');
      }

      // Pause on hover
      let dismissTimeout;
      const startDismiss = () => {
        if (duration > 0) {
          dismissTimeout = setTimeout(() => this.dismiss(toast), duration);
        }
      };
      toast.addEventListener('mouseenter', () => clearTimeout(dismissTimeout));
      toast.addEventListener('mouseleave', startDismiss);

      container.appendChild(toast);

      // Entrance animation
      requestAnimationFrame(() => toast.classList.add('show'));

      startDismiss();

      OpenCourseDeck.state.activeToasts.push(toast);
      OpenCourseDeck.bus.emit('toast:show', { toast, type, message });

      return toast;
    },

    dismiss(toast) {
      if (!toast || toast.dataset.pdDismissing === 'true') return;
      toast.dataset.pdDismissing = 'true';
      toast.classList.remove('show');
      // The exit class is `out` -- that is what components.css styles. This
      // used to add `hide`, which matches no rule, so no animation ever
      // started, `animationend` never fired, and the toast stayed in the DOM
      // and in activeToasts permanently. Every toast ever shown accumulated.
      toast.classList.add('out');

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        toast.remove();
        OpenCourseDeck.state.activeToasts = OpenCourseDeck.state.activeToasts.filter(t => t !== toast);
        OpenCourseDeck.bus.emit('toast:dismiss', { toast });
      };
      // animationend is not guaranteed: the stylesheet may not have loaded, the
      // toast may be display:none in a background tab, or a future restyle may
      // drop the animation. Removal must not depend on a paint event.
      const timer = setTimeout(finish, 1000);
      toast.addEventListener('animationend', finish, { once: true });
    },

    dismissAll() {
      [...OpenCourseDeck.state.activeToasts].forEach(t => this.dismiss(t));
    },

    // Convenience shortcuts
    info   (msg, opts = {}) { return this.show({ ...opts, message: msg, type: 'info' }); },
    success(msg, opts = {}) { return this.show({ ...opts, message: msg, type: 'success' }); },
    warning(msg, opts = {}) { return this.show({ ...opts, message: msg, type: 'warning' }); },
    error  (msg, opts = {}) { return this.show({ ...opts, message: msg, type: 'error', duration: 0 }); },

    _getContainer(position) {
      if (this._containers[position]) return this._containers[position];

      const container = createElement('div', {
        class:       `toast-container toast-${position}`,
        'aria-live': 'polite',
        'aria-relevant': 'additions',
      });
      document.body.appendChild(container);
      this._containers[position] = container;
      return container;
    },

    _escHtml(str) {
      return String(str).replace(/[&<>"']/g, m =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    },

    _appendAction(parent, action) {
      if (!action) return;
      const wrap = createElement('div', { class: 'toast-action' });
      const append = (item) => {
        if (!item) return;
        if (item instanceof Node) wrap.appendChild(item);
        else wrap.appendChild(document.createTextNode(String(item)));
      };
      if (Array.isArray(action)) action.forEach(append);
      else append(action);
      parent.appendChild(wrap);
    },

    init() {
      // Wire any static [data-toast] trigger buttons
      document.addEventListener('click', e => {
        const target = eventTargetEl(e);
        if (!target) return;
        const btn = target.closest('[data-toast]');
        if (!btn) return;
        this.show({
          message:  btn.dataset.toastMessage  ?? btn.textContent.trim(),
          type:     btn.dataset.toastType     ?? 'info',
          title:    btn.dataset.toastTitle    ?? '',
          position: btn.dataset.toastPosition ?? 'top-right',
        });
      });
    },
  };


  // ──────────────────────────────────────────────────────────
  // 12. FORMS — Validation, Inputs, Toggles, Range
  // ──────────────────────────────────────────────────────────

  const StorageAlerts = {
    _seen: new Set(),
    _dbVersionPrompted: false,

    init() {
      const keyFor = (detail = {}) => [
        detail.kind || 'unknown',
        detail.backend || 'storage',
        detail.error?.name || '',
        detail.error?.message || '',
        detail.error?.quota ? 'quota' : 'transient',
      ].join('|');

      const showSaveError = (detail = {}) => {
        if (!detail?.error?.quota) return;
        const key = keyFor(detail);
        if (this._seen.has(key)) return;
        this._seen.add(key);
        Toast.show({
          type: 'error',
          duration: 0,
          title: 'Storage full',
          message: 'OpenCourseDeck cannot save this change because browser storage is full. Export your data, then clear browser storage before continuing.',
        });
      };

      const showFallback = (detail = {}) => {
        if (detail?.error?.quota) return;
        const key = keyFor(detail);
        if (this._seen.has(key)) return;
        this._seen.add(key);
        Toast.show({
          type: 'warning',
          duration: 8000,
          title: 'Storage fallback used',
          message: 'IndexedDB did not accept a save, so OpenCourseDeck used the browser fallback. Export a backup soon if this repeats.',
        });
      };

      const showDbVersionChange = () => {
        if (this._dbVersionPrompted) return;
        this._dbVersionPrompted = true;
        const reloadWrap = createElement('div', { style: { marginTop: '8px' } });
        const reloadBtn = createElement('button', { class: 'btn btn-primary btn-sm', 'data-db-reload': '' }, 'Reload');
        reloadWrap.appendChild(reloadBtn);
        const toast = Toast.show({
          type: 'warning',
          duration: 0,
          title: 'Refresh required',
          message: 'Another OpenCourseDeck tab upgraded the local database. Reload this tab before saving more changes.',
          action: reloadWrap,
        });
        toast?.querySelector?.('[data-db-reload]')?.addEventListener?.('click', () => window.location.reload());
      };

      OpenCourseDeck.bus.on?.('storage:save-error', showSaveError);
      OpenCourseDeck.bus.on?.('storage:fallback', showFallback);
      OpenCourseDeck.bus.on?.('db:versionchange', showDbVersionChange);
      if (window.__pdDbVersionChangeHandler) {
        window.removeEventListener?.('plasma:db-versionchange', window.__pdDbVersionChangeHandler);
      }
      window.__pdDbVersionChangeHandler = showDbVersionChange;
      window.addEventListener?.('plasma:db-versionchange', showDbVersionChange);
      if (window.OpenCourseDeck?.lastStorageIssue) showSaveError(window.OpenCourseDeck.lastStorageIssue);
    },
  };

  const Forms = {
    init() {
      this._initValidation();
      this._initPasswordToggles();
      this._initRangeSliders();
      this._initCharCounters();
      this._initFileInputs();
    },

    // ── Inline validation ──────────────────────────────────
    _initValidation() {
      document.addEventListener('blur', e => {
        const target = eventTargetEl(e);
        if (!target) return;
        const input = target.closest('input, textarea, select');
        if (!input || !input.closest('[data-validate]')) return;
        this._validateField(input);
      }, true);

      document.addEventListener('submit', e => {
        const target = eventTargetEl(e);
        if (!target) return;
        const form = target.closest('form[data-validate]');
        if (!form) return;
        if (e.submitter?.formNoValidate) return;
        const valid = this._validateForm(form);
        if (!valid) e.preventDefault();
      });
    },

    _validateField(input) {
      const group = input.closest('.form-group') ?? input.parentElement;
      const error = group.querySelector('.form-error');

      input.classList.remove('is-valid', 'is-error');

      let message = '';

      if (input.validity.valueMissing) {
        message = input.dataset.errorRequired ?? 'This field is required.';
      } else if (input.validity.typeMismatch) {
        message = input.dataset.errorType ?? `Please enter a valid ${input.type}.`;
      } else if (input.validity.tooShort) {
        message = input.dataset.errorMin ?? `Minimum ${input.minLength} characters.`;
      } else if (input.validity.tooLong) {
        message = input.dataset.errorMax ?? `Maximum ${input.maxLength} characters.`;
      } else if (input.validity.patternMismatch) {
        message = input.dataset.errorPattern ?? 'Value does not match the required format.';
      } else if (input.validity.rangeUnderflow) {
        message = input.dataset.errorMin ?? `Minimum value is ${input.min}.`;
      } else if (input.validity.rangeOverflow) {
        message = input.dataset.errorMax ?? `Maximum value is ${input.max}.`;
      }

      if (message) {
        input.classList.add('is-error');
        if (error) error.textContent = message;
        group.classList.add('has-error');
        group.classList.remove('has-valid');
      } else {
        input.classList.add('is-valid');
        if (error) error.textContent = '';
        group.classList.remove('has-error');
        group.classList.add('has-valid');
      }

      return !message;
    },

    _validateForm(form) {
      const inputs = $$('input, textarea, select', form);
      return inputs.every(input => this._validateField(input));
    },

    // ── Password visibility toggle ────────────────────────
    _initPasswordToggles() {
      document.addEventListener('click', e => {
        const target = eventTargetEl(e);
        if (!target) return;
        const btn = target.closest('[data-password-toggle]');
        if (!btn) return;
        const targetId = btn.dataset.passwordToggle;
        const input    = targetId
          ? document.getElementById(targetId)
          : btn.previousElementSibling;
        if (!input) return;
        const isVisible = input.type === 'text';
        input.type = isVisible ? 'password' : 'text';
        btn.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
        const icon = btn.querySelector('[data-icon]');
        if (icon) icon.textContent = isVisible ? 'Show' : 'Hide';
      });
    },

    // ── Range sliders ─────────────────────────────────────
    _initRangeSliders() {
      $$('input[type="range"][data-range]').forEach(range => {
        const output = document.getElementById(range.dataset.output)
          ?? range.parentElement.querySelector('[data-range-output]');
        const update = () => {
          const pct = ((range.value - range.min) / (range.max - range.min)) * 100;
          range.style.setProperty('--range-pct', `${pct}%`);
          if (output) output.textContent = range.value;
        };
        range.addEventListener('input', update);
        update();
      });
    },

    // ── Character counters ────────────────────────────────
    _initCharCounters() {
      $$('[data-char-count]').forEach(input => {
        const max     = input.maxLength;
        const display = document.getElementById(input.dataset.charCount)
          ?? input.parentElement.querySelector('[data-counter]');
        if (!display || max <= 0) return;
        const update = () => {
          const remaining = max - input.value.length;
          display.textContent = `${input.value.length} / ${max}`;
          display.classList.toggle('counter-warn',  remaining <= Math.floor(max * 0.1));
          display.classList.toggle('counter-danger', remaining <= 0);
        };
        input.addEventListener('input', update);
        update();
      });
    },

    // ── Custom file inputs ────────────────────────────────
    _initFileInputs() {
      $$('[data-file-input]').forEach(wrapper => {
        const input   = $('input[type="file"]', wrapper);
        const label   = $('[data-file-label]', wrapper);
        if (!input) return;

        input.addEventListener('change', () => {
          const names = [...input.files].map(f => f.name).join(', ');
          if (label) label.textContent = names || 'No file chosen';
          wrapper.classList.toggle('has-file', input.files.length > 0);
          OpenCourseDeck.bus.emit('file:select', { files: [...input.files] });
        });

        // Drag & drop
        wrapper.addEventListener('dragover', e => {
          e.preventDefault();
          wrapper.classList.add('drag-over');
        });
        wrapper.addEventListener('dragleave', () => wrapper.classList.remove('drag-over'));
        wrapper.addEventListener('drop', e => {
          e.preventDefault();
          wrapper.classList.remove('drag-over');
          if (e.dataTransfer.files.length) {
            input.files = e.dataTransfer.files;
            input.dispatchEvent(new Event('change'));
          }
        });
      });
    },
  };


  // ──────────────────────────────────────────────────────────
  // 13. TABLES — Sorting, Selection, Pagination
  // ──────────────────────────────────────────────────────────

  const Tables = {
    init() {
      this._initSorting();
      this._initRowSelection();
      this._initPagination();
      this._initSearch();
    },

    // ── Column sorting ────────────────────────────────────
    _initSorting() {
      document.addEventListener('click', e => {
        const target = eventTargetEl(e);
        if (!target) return;
        const th = target.closest('th[data-sort]');
        if (!th) return;
        const table  = th.closest('table');
        const tbody  = table?.querySelector('tbody');
        if (!tbody) return;

        const col   = th.dataset.sort;
        const dir   = th.dataset.sortDir === 'asc' ? 'desc' : 'asc';

        // Reset all headers
        $$('th[data-sort]', table).forEach(t => {
          t.removeAttribute('data-sort-dir');
          t.setAttribute('aria-sort', 'none');
        });

        th.dataset.sortDir = dir;
        th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending');

        const rows    = [...tbody.querySelectorAll('tr')];
        const colIdx  = [...th.parentElement.children].indexOf(th);
        const numeric = th.dataset.sortType === 'number';

        rows.sort((a, b) => {
          const aCell = a.cells[colIdx];
          const bCell = b.cells[colIdx];
          const aVal  = aCell?.dataset.value ?? aCell?.textContent.trim() ?? '';
          const bVal  = bCell?.dataset.value ?? bCell?.textContent.trim() ?? '';

          if (numeric) {
            const aNum = parseFloat(aVal);
            const bNum = parseFloat(bVal);
            const aOk = Number.isFinite(aNum);
            const bOk = Number.isFinite(bNum);
            if (!aOk && !bOk) return 0;
            if (!aOk) return 1;
            if (!bOk) return -1;
            return dir === 'asc'
              ? aNum - bNum
              : bNum - aNum;
          }
          return dir === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        });

        rows.forEach(row => tbody.appendChild(row));
        OpenCourseDeck.bus.emit('table:sort', { col, dir });
      });
    },

    // ── Row selection ─────────────────────────────────────
    _initRowSelection() {
      document.addEventListener('change', e => {
        const target = eventTargetEl(e);
        if (!target) return;
        const checkbox = target.closest('input[type="checkbox"][data-row-select]');
        if (!checkbox) return;
        const table     = checkbox.closest('table');
        if (!table) return;

        if (checkbox.dataset.rowSelect === 'all') {
          // Select all
          $$('input[type="checkbox"][data-row-select]', table).forEach(cb => {
            cb.checked = checkbox.checked;
            cb.closest('tr')?.classList.toggle('row-selected', checkbox.checked);
          });
        } else {
          checkbox.closest('tr')?.classList.toggle('row-selected', checkbox.checked);
          // Update "select all" indeterminate state
          const allCb   = $('input[data-row-select="all"]', table);
          const rowCbs  = $$('input[data-row-select]:not([data-row-select="all"])', table);
          const checked = rowCbs.filter(c => c.checked).length;
          if (allCb) {
            allCb.indeterminate = checked > 0 && checked < rowCbs.length;
            allCb.checked       = checked === rowCbs.length;
          }
        }

        const selected = $$('tr.row-selected', table);
        OpenCourseDeck.bus.emit('table:select', { count: selected.length, rows: selected });
        this._updateBulkBar(table, selected.length);
      });
    },

    _updateBulkBar(table, count) {
      const bar = $(`[data-bulk-bar="${table.id ?? ''}"]`)
        ?? table.closest('.table-wrapper')?.querySelector('[data-bulk-bar]');
      if (!bar) return;
      bar.classList.toggle('active', count > 0);
      const countEl = bar.querySelector('[data-bulk-count]');
      if (countEl) countEl.textContent = count;
    },

    // ── Client-side pagination ────────────────────────────
    _initPagination() {
      $$('[data-pagination]').forEach(nav => {
        const tableId = nav.dataset.pagination;
        const table   = tableId ? document.getElementById(tableId) : nav.closest('.table-wrapper')?.querySelector('table');
        if (!table) return;

        const perPage  = parseInt(nav.dataset.perPage ?? '10', 10);
        const tbody    = table.querySelector('tbody');
        const rows     = $$('tr', tbody);
        const pages    = Math.ceil(rows.length / perPage);

        let current = 1;

        const render = page => {
          current = page;
          rows.forEach((row, i) => {
            row.hidden = i < (page - 1) * perPage || i >= page * perPage;
          });
          this._renderPageButtons(nav, pages, current, render);
          OpenCourseDeck.bus.emit('table:page', { page, pages });
        };

        render(1);
      });
    },

    _renderPageButtons(nav, pages, current, onPage) {
      const ul = nav.querySelector('.pagination-list') ?? nav;
      ul.replaceChildren();

      const mkBtn = (label, page, disabled = false, active = false) => {
        const li  = createElement('li', { class: 'page-item' + (active ? ' active' : '') + (disabled ? ' disabled' : '') });
        const btn = createElement('button', { class: 'page-btn', 'aria-current': active ? 'page' : '' }, String(label));
        if (disabled || active) btn.disabled = disabled;
        btn.addEventListener('click', () => { if (!disabled) onPage(page); });
        li.appendChild(btn);
        return li;
      };

      ul.appendChild(mkBtn('‹', current - 1, current === 1));

      // Ellipsis logic
      const range = this._pageRange(current, pages);
      let prev = null;
      range.forEach(p => {
        if (prev !== null && p - prev > 1) {
          ul.appendChild(createElement('li', { class: 'page-item page-ellipsis' },
            createElement('span', {}, '…')));
        }
        ul.appendChild(mkBtn(p, p, false, p === current));
        prev = p;
      });

      ul.appendChild(mkBtn('›', current + 1, current === pages));
    },

    _pageRange(current, total, delta = 2) {
      const range = [];
      for (let i = Math.max(1, current - delta); i <= Math.min(total, current + delta); i++) {
        range.push(i);
      }
      if (range[0] > 1) range.unshift(1);
      if (range[range.length - 1] < total) range.push(total);
      return range;
    },

    // ── Per-table search filter ───────────────────────────
    _initSearch() {
      $$('[data-table-search]').forEach(input => {
        const tableId = input.dataset.tableSearch;
        const table   = document.getElementById(tableId);
        if (!table) return;
        const tbody = table.querySelector('tbody');

        input.addEventListener('input', debounce(() => {
          const q = input.value.toLowerCase().trim();
          $$('tr', tbody).forEach(row => {
            row.hidden = q.length > 0 && !row.textContent.toLowerCase().includes(q);
          });

          // Empty state
          const visible = $$('tr:not([hidden])', tbody).length;
          let empty = tbody.querySelector('.empty-row');
          if (!visible && q) {
            if (!empty) {
              empty = createElement('tr', { class: 'empty-row' },
                createElement('td', { colspan: '100', class: 'table-empty-cell' },
                  `No results for "${this._escHtml(q)}".`));
              tbody.appendChild(empty);
            }
          } else {
            empty?.remove();
          }
        }, 300));
      });
    },

    _escHtml(str) {
      return str.replace(/[&<>"']/g, m =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    },
  };

  // ──────────────────────────────────────────────────────────
  // 13b. LIST PAGINATION (cards/lists, not tables)
  // ──────────────────────────────────────────────────────────

  const Paginator = {
    paginate(items, { page = 1, perPage = 50 } = {}) {
      const total = items.length;
      const pages = Math.max(1, Math.ceil(total / perPage));
      const p = Math.min(pages, Math.max(1, page));
      const start = (p - 1) * perPage;
      return { page: p, perPage, total, pages, slice: items.slice(start, start + perPage) };
    },
    renderControls(container, { page, pages, total, perPage, perPageOptions = [25, 50, 100, 200], onChange }) {
      if (!container) return;
      const mkBtn = (label, nextPage, disabled) => {
        const button = document.createElement('button');
        button.className = 'btn btn-ghost btn-sm';
        button.disabled = Boolean(disabled);
        button.dataset.page = String(nextPage);
        button.textContent = label;
        return button;
      };

      const card = document.createElement('div');
      card.className = 'card card-ghost';
      card.style.padding = '12px';

      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.gap = '12px';
      row.style.flexWrap = 'wrap';

      const summary = document.createElement('div');
      summary.className = 'text-sm';
      summary.style.opacity = '.8';
      summary.append(`${total.toLocaleString()} items • Page `);
      const currentPage = document.createElement('strong');
      currentPage.textContent = String(page);
      summary.append(currentPage, ` / ${pages}`);

      const controls = document.createElement('div');
      controls.style.display = 'flex';
      controls.style.alignItems = 'center';
      controls.style.gap = '8px';
      controls.style.flexWrap = 'wrap';

      const label = document.createElement('label');
      label.className = 'text-sm';
      label.style.opacity = '.75';
      label.textContent = 'Per page';

      const select = document.createElement('select');
      select.className = 'select input-sm';
      select.dataset.perPage = '';
      perPageOptions.forEach(n => {
        const option = document.createElement('option');
        option.value = String(n);
        option.selected = n === perPage;
        option.textContent = String(n);
        select.appendChild(option);
      });

      controls.append(
        label,
        select,
        mkBtn('‹ Prev', page - 1, page <= 1),
        mkBtn('Next ›', page + 1, page >= pages),
      );
      row.append(summary, controls);
      card.appendChild(row);
      container.replaceChildren(card);

      if (container.dataset.pdBound) return;
      container.dataset.pdBound = 'true';
      container.addEventListener('click', (e) => {
        const t = eventTargetEl(e);
        const btn = t?.closest?.('[data-page]');
        if (!btn) return;
        const next = parseInt(btn.dataset.page, 10);
        if (!Number.isFinite(next)) return;
        onChange?.({ page: next, perPage });
      });
      container.addEventListener('change', (e) => {
        const t = eventTargetEl(e);
        const sel = t?.closest?.('[data-per-page]');
        if (!sel) return;
        const nextPer = parseInt(sel.value, 10);
        if (!Number.isFinite(nextPer)) return;
        onChange?.({ page: 1, perPage: nextPer });
      });
    },
  };


  // ──────────────────────────────────────────────────────────
  // 14. TOOLTIPS
  // ──────────────────────────────────────────────────────────

  const Tooltips = {
    _current: null,
    _anchor: null,
    _observer: null,

    init() {
      // CSS-only tooltips use [data-tip] — we enhance with JS for dynamic content
      document.addEventListener('mouseenter', e => {
        const target = eventTargetEl(e);
        if (!target) return;
        const el = target.closest('[data-tip-js]');
        if (el) this._show(el);
      }, true);

      document.addEventListener('mouseleave', e => {
        const target = eventTargetEl(e);
        if (!target) return;
        const el = target.closest('[data-tip-js]');
        if (el) this._hide();
      }, true);

      document.addEventListener('focusin', e => {
        const target = eventTargetEl(e);
        if (!target) return;
        const el = target.closest('[data-tip-js]');
        if (el) this._show(el);
      });

      document.addEventListener('focusout', e => {
        const target = eventTargetEl(e);
        if (!target) return;
        const el = target.closest('[data-tip-js]');
        if (el) this._hide();
      });

      if (!this._observer && window.MutationObserver) {
        this._observer = new MutationObserver(() => {
          if (this._anchor && !this._anchor.isConnected) this._hide();
        });
        this._observer.observe(document.body, { childList: true, subtree: true });
      }
    },

    _show(el) {
      this._hide();
      const text = el.dataset.tipJs;
      if (!text) return;

      const tip = createElement('div', { class: 'tooltip tooltip-js', role: 'tooltip' }, text);
      document.body.appendChild(tip);
      this._current = tip;
      this._anchor = el;

      const rect  = el.getBoundingClientRect();
      const tRect = tip.getBoundingClientRect();
      const dir   = el.dataset.tipDir ?? 'top';
      const offset = 8;

      let top, left;
      if (dir === 'top') {
        top  = rect.top  - tRect.height - offset + window.scrollY;
        left = rect.left + (rect.width - tRect.width) / 2 + window.scrollX;
      } else if (dir === 'bottom') {
        top  = rect.bottom + offset + window.scrollY;
        left = rect.left + (rect.width - tRect.width) / 2 + window.scrollX;
      } else if (dir === 'left') {
        top  = rect.top + (rect.height - tRect.height) / 2 + window.scrollY;
        left = rect.left - tRect.width - offset + window.scrollX;
      } else { // right
        top  = rect.top + (rect.height - tRect.height) / 2 + window.scrollY;
        left = rect.right + offset + window.scrollX;
      }

      tip.style.top  = `${top}px`;
      tip.style.left = `${left}px`;

      requestAnimationFrame(() => tip.classList.add('visible'));
    },

    _hide() {
      if (!this._current) return;
      this._current.remove();
      this._current = null;
      this._anchor = null;
    },
  };


  // ──────────────────────────────────────────────────────────
  // 15. PROGRESS & LOADERS
  // ──────────────────────────────────────────────────────────

  const Progress = {
    /**
     * Set a progress bar's value (0-100)
     */
    set(bar, value) {
      const el = typeof bar === 'string' ? document.getElementById(bar) : bar;
      if (!el) return;
      const clamped = Math.min(100, Math.max(0, value));
      el.style.setProperty('--progress', `${clamped}%`);
      el.setAttribute('aria-valuenow', clamped);
      const label = el.querySelector('.progress-label');
      if (label) label.textContent = `${Math.round(clamped)}%`;
    },

    /**
     * Animate a progress bar to a target value
     */
    animate(bar, target, duration = 600) {
      const el = typeof bar === 'string' ? document.getElementById(bar) : bar;
      if (!el) return;
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
        this.set(el, target);
        return;
      }
      // getPropertyValue returns '' (never null) when unset, so `?? '0'`
      // would keep the empty string and parseFloat('') is NaN.
      const start    = parseFloat(el.style.getPropertyValue('--progress')) || 0;
      const startTs  = performance.now();

      const step = ts => {
        const elapsed = ts - startTs;
        const pct     = Math.min(elapsed / duration, 1);
        const current = start + (target - start) * this._ease(pct);
        this.set(el, current);
        if (pct < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },

    _ease: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,

    /**
     * Page-level loading bar (thin bar at top of viewport)
     */
    pageBar: {
      _el: null,
      _timer: null,

      start() {
        if (!this._el) {
          this._el = createElement('div', { class: 'page-progress-bar', role: 'progressbar', 'aria-hidden': 'true' });
          document.body.appendChild(this._el);
        }
        clearTimeout(this._timer);
        this._el.style.width = '0%';
        this._el.classList.add('active');
        this._el.style.transition = 'none';
        requestAnimationFrame(() => {
          this._el.style.transition = 'width 10s cubic-bezier(0.1, 0.5, 0.8, 0.9)';
          this._el.style.width = '85%';
        });
      },

      finish() {
        if (!this._el) return;
        this._el.style.transition = 'width 0.3s ease';
        this._el.style.width = '100%';
        this._timer = setTimeout(() => {
          this._el.classList.remove('active');
          this._el.style.width = '0%';
        }, 400);
      },

      fail() {
        if (!this._el) return;
        this._el.classList.add('error');
        this.finish();
      },
    },
  };


  // ──────────────────────────────────────────────────────────
  // 16. CHARTS (Thin wrappers — expects Chart.js or similar)
  // ──────────────────────────────────────────────────────────

  const Charts = {
    _instances: new Map(),
    _pluginsRegistered: false,

    plugins: {
      HeatmapPlugin,
      SparklinePlugin,
      ArcPlugin,
      GaugePlugin,
    },

    registerPlugins() {
      const Chart = window.Chart;
      if (!Chart || typeof Chart.register !== 'function' || this._pluginsRegistered) return false;
      const globalSet = Chart.__openCourseDeckRegisteredPlugins ??= new Set();
      const plugins = [HeatmapPlugin, SparklinePlugin, ArcPlugin, GaugePlugin].filter(plugin => plugin?.id && !globalSet.has(plugin.id));
      if (!plugins.length) {
        this._pluginsRegistered = true;
        return false;
      }
      Chart.register(...plugins);
      plugins.forEach(plugin => globalSet.add(plugin.id));
      this._pluginsRegistered = true;
      return true;
    },

    /**
     * Register a chart instance for later updates
     */
    register(id, instance) {
      this._instances.set(id, instance);
    },

    get(id) {
      return this._instances.get(id);
    },

    /**
     * Destroy all charts (e.g. before hot-reload)
     */
    destroyAll() {
      this._instances.forEach(chart => chart?.destroy?.());
      this._instances.clear();
    },

    /**
     * Update a chart's data
     */
    update(id, labels, datasets) {
      const chart = this.get(id);
      if (!chart) return;
      chart.data.labels   = labels;
      chart.data.datasets = datasets;
      chart.update();
    },

    /**
     * Base theme-aware options for Chart.js
     */
    themeOptions(override = {}) {
      const isDark = OpenCourseDeck.state.theme !== 'light';
      return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: isDark ? '#94a3b8' : '#475569' },
          },
          tooltip: {
            backgroundColor: isDark ? '#1e293b' : '#fff',
            titleColor:      isDark ? '#f1f5f9' : '#0f172a',
            bodyColor:       isDark ? '#94a3b8' : '#475569',
            borderColor:     isDark ? '#334155' : '#e2e8f0',
            borderWidth: 1,
          },
        },
        scales: {
          x: {
            ticks: { color: isDark ? '#64748b' : '#94a3b8' },
            grid:  { color: isDark ? '#1e293b' : '#f1f5f9' },
          },
          y: {
            ticks: { color: isDark ? '#64748b' : '#94a3b8' },
            grid:  { color: isDark ? '#1e293b' : '#f1f5f9' },
          },
        },
        ...override,
      };
    },

    _mergeOptions(target, source) {
      for (const [key, value] of Object.entries(source || {})) {
        const existing = target[key];
        if (
          value
          && typeof value === 'object'
          && !Array.isArray(value)
          && existing
          && typeof existing === 'object'
          && !Array.isArray(existing)
        ) {
          this._mergeOptions(existing, value);
        } else {
          target[key] = value;
        }
      }
      return target;
    },

    /**
     * Re-render all charts when theme changes
     */
    init() {
      this.registerPlugins();
      OpenCourseDeck.bus.on('theme:change', () => {
        this._instances.forEach(chart => {
          if (!chart?.options) return;
          this._mergeOptions(chart.options, this.themeOptions());
          chart.update();
        });
      });
    },
  };


  // ──────────────────────────────────────────────────────────
  // 17. STAT CARDS — Animated counters
  // ──────────────────────────────────────────────────────────

  const StatCards = {
    init() {
      // Intersection observer to trigger count-up when visible
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this._animateCounter(entry.target);
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.3 });

      $$('[data-counter]').forEach(el => observer.observe(el));
    },

    _animateCounter(el) {
      const end      = parseFloat(el.dataset.counter.replace(/,/g, ''));
      const duration = parseInt(el.dataset.counterDuration ?? '1500', 10);
      const decimals = parseInt(el.dataset.counterDecimals ?? '0', 10);
      const prefix   = el.dataset.counterPrefix ?? '';
      const suffix   = el.dataset.counterSuffix ?? '';
      const start    = 0;
      const startTs  = performance.now();

      const step = ts => {
        const elapsed = ts - startTs;
        const pct     = Math.min(elapsed / duration, 1);
        const val     = start + (end - start) * this._ease(pct);
        el.textContent = prefix + this._format(val, decimals) + suffix;
        if (pct < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },

    _format(val, decimals) {
      return val.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    },

    _ease: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  };


  // ──────────────────────────────────────────────────────────
  // 18. NOTIFICATIONS PANEL
  // ──────────────────────────────────────────────────────────

  const NotificationsPanel = {
    _badge: null,
    _count: 0,

    init() {
      this._badge = $('.topbar-notif-badge, [data-notif-badge]');

      const clearBtn = document.getElementById('notif-clear-all');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          const list = $('#notifications-panel .notif-list');
          if (list) list.replaceChildren();
          this.markAllRead();
        });
      }

      document.addEventListener('click', e => {
        const target = eventTargetEl(e);
        if (!target) return;
        const btn = target.closest('[data-notifications-toggle]');
        if (btn) {
          const panel = document.getElementById('notifications-panel');
          if (panel) {
            Drawer.open(panel);
            this.markAllRead();
          }
        }
      });

      OpenCourseDeck.bus.on('notification:new', data => this._onNew(data));
    },

    setCount(n) {
      this._count = Math.max(0, n);
      if (this._badge) {
        this._badge.textContent = this._count > 99 ? '99+' : String(this._count);
        this._badge.hidden = this._count === 0;
      }
    },

    increment() {
      this.setCount(this._count + 1);
    },

    markAllRead() {
      this.setCount(0);
      $$('.notif-item.unread').forEach(el => el.classList.remove('unread'));
    },

    _onNew({ message, type = 'info', title = '' }) {
      this.increment();
      Toast.show({ message, type, title, position: 'top-right' });

      // Add to panel if open
      const list = $('#notifications-panel .notif-list');
      if (!list) return;
      const item = createElement('li', { class: 'notif-item unread' },
        createElement('div', { class: 'notif-title' }, title),
        createElement('div', { class: 'notif-message' }, message),
        createElement('div', { class: 'notif-time' }, 'Just now'));
      list.prepend(item);
    },
  };


  // ──────────────────────────────────────────────────────────
  // 19. USER PROFILE MENU
  // ──────────────────────────────────────────────────────────

  const UserMenu = {
    init() {
      const trigger = $('[data-user-menu-trigger]');
      const menu    = $('[data-user-menu]');
      if (!trigger || !menu) return;

      trigger.addEventListener('click', e => {
        e.stopPropagation();
        Dropdown.toggle(menu, trigger);
      });
    },
  };


  // ──────────────────────────────────────────────────────────
  // 20. COPY TO CLIPBOARD
  // ──────────────────────────────────────────────────────────

  const Clipboard = {
    init() {
      document.addEventListener('click', async e => {
        const target = eventTargetEl(e);
        if (!target) return;
        const btn = target.closest('[data-copy]');
        if (!btn) return;

        const text = btn.dataset.copy
          || document.getElementById(btn.dataset.copyTarget)?.textContent?.trim()
          || '';

        try {
          await navigator.clipboard.writeText(text);
          this._feedback(btn, true);
          OpenCourseDeck.bus.emit('clipboard:copy', { text });
        } catch {
          this._feedback(btn, false);
        }
      });
    },

    _feedback(btn, success) {
      const original = [...btn.childNodes];
      btn.replaceChildren(document.createTextNode(success ? '✓ Copied!' : 'Copy failed'));
      btn.disabled  = true;
      setTimeout(() => {
        btn.replaceChildren(...original);
        btn.disabled = false;
      }, 2000);
    },
  };


  // ──────────────────────────────────────────────────────────
  // 21. DARK MODE AWARE IMAGES
  // ──────────────────────────────────────────────────────────

  const ThemeImages = {
    init() {
      OpenCourseDeck.bus.on('theme:change', ({ effective }) => {
        $$('[data-src-dark][data-src-light]').forEach(img => {
          const nextSrc = effective === 'dark' ? img.dataset.srcDark : img.dataset.srcLight;
          const url = safeImageUrl(nextSrc);
          applyImageFallback(img);
          img.src = url ?? IMAGE_FALLBACK_SRC;
          if (!url) img.classList.add('image-fallback');
        });
      });
    },
  };


  // ──────────────────────────────────────────────────────────
  // 22. SKELETON LOADERS
  // ──────────────────────────────────────────────────────────

  const Skeleton = {
    /**
     * Show skeletons inside a container, hide real content
     */
    show(container) {
      const el = typeof container === 'string'
        ? document.getElementById(container)
        : container;
      if (!el) return;
      el.classList.add('skeleton-loading');
      $$('[data-skeleton]', el).forEach(sk => sk.removeAttribute('hidden'));
      $$('[data-content]', el).forEach(c  => c.setAttribute('hidden', ''));
    },

    hide(container) {
      const el = typeof container === 'string'
        ? document.getElementById(container)
        : container;
      if (!el) return;
      el.classList.remove('skeleton-loading');
      $$('[data-skeleton]', el).forEach(sk => sk.setAttribute('hidden', ''));
      $$('[data-content]', el).forEach(c  => c.removeAttribute('hidden'));
    },
  };


  // ──────────────────────────────────────────────────────────
  // 23. INFINITE SCROLL
  // ──────────────────────────────────────────────────────────

  const InfiniteScroll = {
    /**
     * @param {Object} opts
     * @param {string|HTMLElement} opts.container
     * @param {Function} opts.onLoad  async fn(page) → returns false when exhausted
     * @param {string} opts.sentinel  selector for bottom sentinel element
     */
    init({ container, onLoad, sentinel = '.scroll-sentinel' } = {}) {
      const el       = typeof container === 'string'
        ? document.getElementById(container)
        : container;
      const sentinelEl = typeof sentinel === 'string'
        ? el?.querySelector(sentinel)
        : sentinel;
      if (!el || !sentinelEl) return;

      let page    = 1;
      let loading = false;
      let done    = false;

      const observer = new IntersectionObserver(async entries => {
        if (!entries[0].isIntersecting || loading || done) return;
        loading = true;
        const loader = el.querySelector('.scroll-loader');
        if (loader) loader.removeAttribute('hidden');

        let hasMore;
        try {
          hasMore = await onLoad(++page);
        } catch (err) {
          OpenCourseDeck.bus.emit('infinite-scroll:error', { err, page });
        } finally {
          loading = false;
          if (loader) loader.setAttribute('hidden', '');
        }

        if (hasMore === false) {
          done = true;
          observer.disconnect();
        }
      }, { rootMargin: '0px 0px 200px 0px' });

      observer.observe(sentinelEl);

      return () => observer.disconnect(); // cleanup
    },
  };


  // ──────────────────────────────────────────────────────────
  // 24. ROUTER (Hash-based SPA helper)
  // ──────────────────────────────────────────────────────────

  function routeTitle(hash) {
    return {
      '#/home': 'Home',
      '#/courses': 'Courses',
      '#/my-courses': 'My Courses',
      '#/materials': 'Materials',
      '#/tags': 'Tags',
      '#/playlists': 'Playlists',
      '#/bookmarks': 'Bookmarks',
      '#/notes': 'Notes',
      '#/pdf': 'PDF',
      '#/studio': 'Studio',
      '#/progress': 'Progress',
      '#/help': 'Help',
      '#/achievements': 'Achievements',
      '#/settings': 'Settings',
    }[hash] ?? 'OpenCourseDeck';
  }

  const Router = createRouter({
    $$,
    Progress,
    bus: OpenCourseDeck.bus,
    getNotFoundView: () => OpenCourseDeck.Views?.notFound,
    getRouteLabel: hash => routeTitle(hash),
  });

  async function loadRouteFeatures(...names) {
    if (!names.length) return;
    const loader = OpenCourseDeck.loadFeatures;
    if (typeof loader === 'function') {
      await loader(...names);
      return;
    }
    await Promise.all(names.map(name => OpenCourseDeck.loadFeature?.(name)).filter(Boolean));
  }

  const SyncRouteRefresh = (() => {
    const safeRoutes = new Set([
      '#/home',
      '#/my-courses',
      '#/materials',
      '#/tags',
      '#/playlists',
      '#/bookmarks',
      '#/progress',
      '#/achievements',
    ]);
    const routeMap = {
      progress: ['#/home', '#/my-courses', '#/playlists', '#/bookmarks', '#/progress', '#/achievements'],
      timestamp: ['#/home', '#/playlists', '#/bookmarks', '#/progress', '#/achievements'],
      note: ['#/home', '#/bookmarks', '#/progress', '#/achievements'],
      folder: ['#/home', '#/bookmarks', '#/progress'],
      annotation: ['#/home', '#/bookmarks', '#/progress'],
      setting: ['#/home', '#/my-courses', '#/materials', '#/tags', '#/playlists', '#/progress', '#/achievements'],
    };
    let pending = null;
    let timer = 0;

    const affectsRoute = (payload, hash) => {
      if (!safeRoutes.has(hash)) return false;
      if (payload?.action === 'clear') return true;
      const routes = routeMap[payload?.kind];
      return Array.isArray(routes) && routes.includes(hash);
    };

    const schedule = (payload = {}) => {
      const hash = window.location.hash || '#/';
      if (!affectsRoute(payload, hash)) return;
      pending = payload;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const currentHash = window.location.hash || '#/';
        if (!affectsRoute(pending, currentHash)) return;
        const detail = { source: 'sync', payload: pending };
        OpenCourseDeck.bus.emit?.('sync:route-refresh', { hash: currentHash, payload: pending });
        Router.refresh?.(detail);
      }, 80);
    };

    return {
      init() {
        OpenCourseDeck.bus.on?.('sync:message', schedule);
      },
    };
  })();


  // ──────────────────────────────────────────────────────────
  // 25. RESPONSIVE UTILITIES
  // ──────────────────────────────────────────────────────────

  const Responsive = {
    /**
     * Returns the current breakpoint name
     */
    current() {
      const w  = window.innerWidth;
      const bp = OpenCourseDeck.config.breakpoints;
      if (w < bp.sm)   return 'xs';
      if (w < bp.md)   return 'sm';
      if (w < bp.lg)   return 'md';
      if (w < bp.xl)   return 'lg';
      if (w < bp['2xl']) return 'xl';
      return '2xl';
    },

    isMobile()  { return window.innerWidth < OpenCourseDeck.config.breakpoints.md; },
    isTablet()  { const w = window.innerWidth; const bp = OpenCourseDeck.config.breakpoints; return w >= bp.md && w < bp.lg; },
    isDesktop() { return window.innerWidth >= OpenCourseDeck.config.breakpoints.lg; },

    init() {
      const onResize = throttle(() => {
        OpenCourseDeck.bus.emit('responsive:change', { breakpoint: this.current() });
      }, 200);
      window.addEventListener('resize', onResize);
    },
  };


  // ──────────────────────────────────────────────────────────
  // 33. VIEWS (SPA route rendering)
  // ──────────────────────────────────────────────────────────

  const Views = (() => {
    const container = () => document.getElementById('view-container');

    function set(html) {
      const el = container();
      if (!el) return null;
      const purify = window.DOMPurify;
      if (purify?.sanitize) {
        // Intentional rich route-template boundary; dynamic rows inside routes use DOM nodes.
        el.innerHTML = purify.sanitize(String(html ?? ''), {
          ADD_TAGS: ['canvas'],
          ADD_ATTR: ['tabindex', 'role', 'aria-label', 'aria-hidden', 'aria-live', 'aria-atomic'],
          FORBID_TAGS: ['template'],
        });
      } else {
        // Same route-template boundary, using the local fallback sanitizer above.
        el.innerHTML = fallbackSanitizeHtml(html);
      }
      return el;
    }

    async function home() {
      const { mountHomeView } = await import('./src/views/homeRoute.js');
      return mountHomeView({
        setView: set,
        Router,
        setPendingCourseMedia,
      });
    }

    async function notes() {
      const { mountNotesView } = await import('./src/views/notesRoute.js');
      return mountNotesView({ setView: set });
    }

    async function pdf() {
      const { mountPdfView } = await import('./src/views/pdfRoute.js');
      return mountPdfView();
    }

    async function studio() {
      const { mountStudioView } = await import('./src/views/studioRoute.js');
      return mountStudioView({
        setView: set,
        safeFetchUrl,
        safeMediaUrl,
        safeFrameUrl,
        setPendingCourseMedia,
        Router,
        Toast,
        downloadTextFile,
        downloadDataUrl,
        printStudioBoardPdf,
      });
    }
    async function progress() {
      const { mountProgressView } = await import('./src/views/progressRoute.js');
      return mountProgressView({ setView: set });
    }

    async function courses() {
      const { mountCoursesView } = await import('./src/views/coursesRoute.js');
      return mountCoursesView({
        setView: set,
        createElement,
        $$,
        eventTargetEl,
        safeExternalUrl,
        safeMediaUrl,
        Router,
        Toast,
        consumePendingCourseSession,
        formatMediaClock,
        escapeHtmlText,
      });
    }
    async function materials() {
      const { mountMaterialsView } = await import('./src/views/materialsRoute.js');
      return mountMaterialsView({
        setView: set,
        createElement,
        eventTargetEl,
        safeMediaUrl,
        Router,
        Paginator,
        setPendingCourseMedia,
      });
    }
    async function settings() {
      const { mountSettingsView } = await import('./src/views/settingsRoute.js');
      return mountSettingsView({
        setView: set,
        ThemeManager,
        FontScale,
        Prefs,
        Toast,
        formatBytes,
        localStorageFootprint,
      });
    }
    async function help() {
      const { mountHelpView } = await import('./src/views/helpRoute.js');
      return mountHelpView({
        setView: set,
        Toast,
      });
    }
    async function myCourses() {
      const { mountMyCoursesView } = await import('./src/views/myCoursesRoute.js');
      return mountMyCoursesView({ setView: set, Toast });
    }

    async function tags() {
      const { mountTagsView } = await import('./src/views/tagsRoute.js');
      return mountTagsView({ setView: set });
    }

    async function playlists() {
      const { mountPlaylistsView } = await import('./src/views/playlistsRoute.js');
      return mountPlaylistsView({
        setView: set,
        safeMediaUrl,
        Toast,
      });
    }

    async function bookmarks() {
      const { mountBookmarksView } = await import('./src/views/bookmarksRoute.js');
      return mountBookmarksView({
        setView: set,
        createElement,
        Router,
        Toast,
        setPendingCourseMedia,
        setPendingPdfPage,
        sanitizeHtml: fallbackSanitizeHtml,
      });
    }
    async function achievements() {
      const { mountAchievementsView } = await import('./src/views/achievementsRoute.js');
      return mountAchievementsView({
        setView: set,
        Router,
        setPendingCourseMedia,
      });
    }
    function notFound(hash) {
      return mountNotFoundView({ setView: set, hash });
    }

    return { home, courses, myCourses, materials, tags, playlists, bookmarks, achievements, settings, help, notes, pdf, studio, progress, notFound };
  })();


  // ──────────────────────────────────────────────────────────
  // 26. KEYBOARD SHORTCUTS
  // ──────────────────────────────────────────────────────────

  const KeyboardShortcuts = {
    _shortcuts: [],

    /**
     * Register a shortcut
     * @param {string} combo  e.g. 'ctrl+k', 'shift+/', '?'
     * @param {Function} handler
     * @param {string} description
     */
    register(combo, handler, description = '') {
      this._shortcuts.push({ combo: combo.toLowerCase(), handler, description });
      return this;
    },

    init() {
      // Idempotent: a second init() used to re-register all eight built-ins
      // and stack another anonymous, unremovable document keydown listener,
      // so _shortcuts grew without bound and each combo ran twice.
      if (this._inited) return;
      this._inited = true;

      // Built-in shortcuts
      this.register('ctrl+shift+f', () => {
        const input = $('.topbar-search input');
        if (input) { input.focus(); input.select(); }
      }, 'Focus global search');

      this.register('ctrl+/', () => this._showHelp(), 'Show keyboard shortcuts');

      this.register('ctrl+b', () => Sidebar.toggle(), 'Toggle sidebar');

      this.register('ctrl+shift+d', () => ThemeManager.toggle(), 'Toggle dark/light mode');

      // Global UI font scale
      this.register('ctrl+=', () => FontScale.inc(), 'Increase UI font size');
      this.register('ctrl++', () => FontScale.inc(), 'Increase UI font size');
      this.register('ctrl+-', () => FontScale.dec(), 'Decrease UI font size');
      this.register('ctrl+0', () => FontScale.reset(), 'Reset UI font size');

      document.addEventListener('keydown', e => {
        const target = eventTargetEl(e);
        // `[contenteditable]` alone also matches contenteditable="false"
        // (read-only islands inside an editor), which suppressed every
        // shortcut there — the inverse of the intent.
        if (target?.matches?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
        if (target?.closest?.('[contenteditable]:not([contenteditable="false"])')) return;
        const combo = [
          e.ctrlKey  ? 'ctrl'  : '',
          // Held Meta must disqualify a Ctrl-only match, or Cmd+Ctrl+K fires
          // 'ctrl+k' and preventDefault() hijacks the browser's Cmd shortcut.
          e.metaKey  ? 'meta'  : '',
          e.altKey   ? 'alt'   : '',
          e.shiftKey ? 'shift' : '',
          e.key.toLowerCase(),
        ].filter(Boolean).join('+');

        for (const { combo: c, handler } of this._shortcuts) {
          if (c === combo) {
            e.preventDefault();
            handler(e);
            return;
          }
        }
      });
    },

    _showHelp() {
      const table = createElement('table', { class: 'shortcuts-table' });
      const tbody = document.createElement('tbody');
      this._shortcuts.forEach((shortcut) => {
        const tr = document.createElement('tr');
        tr.append(
          createElement('td', {}, createElement('kbd', {}, shortcut.combo)),
          createElement('td', {}, shortcut.description)
        );
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      Modal.create({
        title: '⌨️ Keyboard Shortcuts',
        body:  table,
        size:  'sm',
      });
    },
  };


  // ──────────────────────────────────────────────────────────
  // 27. AVATAR UPLOAD (settings page)
  // ──────────────────────────────────────────────────────────

  const AvatarUpload = {
    init() {
      $$('[data-avatar-upload]').forEach(wrapper => {
        const input   = $('input[type="file"]', wrapper);
        const preview = $('[data-avatar-preview]', wrapper);
        if (!input || !preview) return;

        input.accept = 'image/*';

        const trigger = $('[data-avatar-trigger]', wrapper);
        if (trigger) trigger.addEventListener('click', () => input.click());

        input.addEventListener('change', () => {
          const file = input.files[0];
          if (!file) return;
          if (!file.type.startsWith('image/')) {
            Toast.error('Please select a valid image file.');
            return;
          }
          const reader = new FileReader();
          reader.onload = ev => {
            preview.src = ev.target.result;
            OpenCourseDeck.bus.emit('avatar:change', { file, dataUrl: ev.target.result });
          };
          reader.readAsDataURL(file);
        });
      });
    },
  };


  // ──────────────────────────────────────────────────────────
  // 28. SETTINGS PAGE
  // ──────────────────────────────────────────────────────────

  const Settings = {
    init() {
      // Settings form auto-save with debounce
      $$('form[data-autosave]').forEach(form => {
        const saveIndicator = form.querySelector('[data-save-indicator]');
        const save = debounce(async () => {
          const data = Object.fromEntries(new FormData(form));
          try {
            OpenCourseDeck.bus.emit('settings:save', { data });
            if (saveIndicator) {
              saveIndicator.textContent = '✅ Saved';
              setTimeout(() => { saveIndicator.textContent = ''; }, 2000);
            }
          } catch {
            Toast.error('Failed to save settings.');
          }
        }, 1000);

        form.addEventListener('input', save);
        form.addEventListener('change', save);
      });

      // Delete account confirmation
      const deleteBtn = $('[data-delete-account]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          const confirmed = await Modal.confirmAsync({
            title:     '⚠️ Delete Account',
            message:   'This action is <strong>irreversible</strong>. All your data will be permanently deleted. Are you absolutely sure?',
            confirmLabel: 'Delete account',
            cancelLabel: 'Cancel',
          });
          if (!confirmed) return;
          OpenCourseDeck.bus.emit('account:delete');
          Toast.error('Account deletion initiated.');
        });
      }
    },
  };


  // ──────────────────────────────────────────────────────────
  // 29. LAZY IMAGE LOADING
  // ──────────────────────────────────────────────────────────

  const LazyImages = {
    init() {
      const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const img = entry.target;
          if (img.dataset.src) {
            const url = safeImageUrl(img.dataset.src);
            applyImageFallback(img);
            img.src = url ?? IMAGE_FALLBACK_SRC;
            if (!url) img.classList.add('image-fallback');
            img.removeAttribute('data-src');
            img.classList.add('loaded');
          }
          obs.unobserve(img);
        });
      }, { rootMargin: '0px 0px 200px 0px' });

      $$('img[data-src]').forEach(img => {
        applyImageFallback(img);
        observer.observe(img);
      });

      // Expose so dynamically added images can be observed
      OpenCourseDeck.lazy = img => {
        applyImageFallback(img);
        observer.observe(img);
      };
    },
  };


  // ──────────────────────────────────────────────────────────
  // 30. DATA FETCHING HELPER
  // ──────────────────────────────────────────────────────────

  const API = {
    _baseURL: '',
    _headers: { 'Content-Type': 'application/json' },

    setBase(url)           { this._baseURL = url; },
    setHeader(key, value)  { this._headers[key] = value; },

    async request(method, path, body = null, opts = {}) {
      Progress.pageBar.start();
      const url     = safeFetchUrl(this._baseURL, path);
      if (!url) {
        Progress.pageBar.fail();
        throw new Error('Unsafe fetch URL');
      }
      const options = {
        method,
        headers: { ...this._headers, ...opts.headers },
        signal:  opts.signal,
      };
      if (body !== null && body !== undefined) options.body = JSON.stringify(body);

      try {
        const res  = await fetch(url, options);
        const json = await res.json().catch(() => null);

        if (!res.ok) {
          const msg = json?.message ?? `HTTP ${res.status}`;
          throw new Error(msg);
        }

        Progress.pageBar.finish();
        return json;
      } catch (err) {
        Progress.pageBar.fail();
        OpenCourseDeck.bus.emit('api:error', { err, path, method });
        throw err;
      }
    },

    get   (path, opts)        { return this.request('GET',    path, null, opts); },
    post  (path, body, opts)  { return this.request('POST',   path, body, opts); },
    put   (path, body, opts)  { return this.request('PUT',    path, body, opts); },
    patch (path, body, opts)  { return this.request('PATCH',  path, body, opts); },
    delete(path, opts)        { return this.request('DELETE', path, null, opts); },
  };


  // ──────────────────────────────────────────────────────────
  // 31. HEATMAP CALENDAR (renders inside [data-heatmap])
  // ──────────────────────────────────────────────────────────

  const Heatmap = {
    /**
     * @param {string|HTMLElement} container
     * @param {Object} data  { 'YYYY-MM-DD': count }
     * @param {Object} opts
     */
    render(container, data = {}, opts = {}) {
      const el = typeof container === 'string'
        ? document.getElementById(container)
        : container;
      if (!el) return;

      const weeks     = opts.weeks ?? 52;
      const maxCount  = Math.max(...Object.values(data), 1);
      const today     = new Date();
      const grid      = createElement('div', { class: 'heatmap-grid' });

      for (let w = weeks - 1; w >= 0; w--) {
        const col = createElement('div', { class: 'heatmap-col' });
        for (let d = 0; d < 7; d++) {
          const date = new Date(today);
          date.setDate(today.getDate() - (w * 7 + (6 - d)));
          // Key by local day: toISOString() shifts the date for non-UTC users.
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          const count = data[key] ?? 0;
          const level = count === 0 ? 0 : Math.ceil((count / maxCount) * 4);

                    const cell = document.createElement('div');
          cell.className = `heatmap-cell level-${level}`;
          cell.setAttribute('data-date', key);
          cell.setAttribute('data-count', count);
          cell.title = `${count} activity on ${key}`;

          col.appendChild(cell);
        }
        grid.appendChild(col);
      }

      el.replaceChildren(grid);
    }
  };


  // ──────────────────────────────────────────────────────────
  // 32. INITIALIZATION
  // ──────────────────────────────────────────────────────────

  function initEnhancements() {
    // Breadcrumb updates from router events
    const breadcrumbList = document.getElementById('breadcrumb-list');
    if (breadcrumbList) {
      OpenCourseDeck.bus.on?.('route:change', ({ hash }) => {
        const home = createElement('li', { class: 'breadcrumb-item' },
          createElement('a', { href: '#/home', class: 'breadcrumb-link' }, 'Home')
        );
        const current = createElement('li', { class: 'breadcrumb-item' },
          createElement('span', { class: 'breadcrumb-current' }, routeTitle(hash))
        );
        breadcrumbList.replaceChildren(home, current);
      });
    }

    // Theme-color meta sync
    const metaTheme = document.getElementById('meta-theme-color');
    const syncThemeColor = () => {
      if (!metaTheme) return;
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent')?.trim();
      if (accent) metaTheme.setAttribute('content', accent);
    };
    OpenCourseDeck.bus.on?.('theme:change', syncThemeColor);
    syncThemeColor();

    // Command palette (extracted to an ES module under src/)
    const cpOpen = () => window.OpenCourseDeck?.CommandPalette?.open?.();
    KeyboardShortcuts.register('ctrl+k', () => cpOpen(), 'Open command palette');
    const btn = document.getElementById('command-palette-btn');
    if (btn && !btn.dataset.pdBound) {
      btn.dataset.pdBound = 'true';
      btn.addEventListener('click', () => cpOpen());
    }

    // Service worker update prompt (index.html dispatches plasma:sw-update-ready)
    if (!document.documentElement.dataset.pdSwBound) {
      document.documentElement.dataset.pdSwBound = 'true';
      document.addEventListener('plasma:sw-update-ready', (event) => {
        const registration = event?.detail?.registration;
        const reloadWrap = createElement('div', { style: { marginTop: '8px' } });
        const reloadBtn = createElement('button', { class: 'btn btn-primary btn-sm', 'data-sw-reload': '' }, 'Reload');
        reloadWrap.appendChild(reloadBtn);
        const t = Toast.show?.({
          type: 'info',
          message: 'Update available. Reload to apply?',
          action: reloadWrap,
          duration: 8000,
        });
        const btn = t?.querySelector?.('[data-sw-reload]');
        btn?.addEventListener?.('click', () => {
          // The service worker is generated with skipWaiting:false so an
          // update can never interrupt an in-flight note/canvas/backup write.
          // A bare location.reload() therefore does NOT activate the waiting
          // worker (the client survives the navigation and keeps the old one
          // in control), so the user would reload straight back into the
          // stale version and the update would only land once every tab is
          // closed. Tell the waiting worker to take over, then let the
          // controllerchange handler in src/index.js perform the reload.
          const waiting = registration?.waiting;
          if (waiting) {
            window.__plasmaSwUpdateAccepted = true;
            try {
              waiting.postMessage({ type: 'SKIP_WAITING' });
              // Safety net: if controllerchange never fires (worker failed to
              // activate), still honor the user's click.
              setTimeout(() => {
                if (!window.__plasmaSwReloading) {
                  window.__plasmaSwReloading = true;
                  window.location.reload();
                }
              }, 3000);
              return;
            } catch {
              window.__plasmaSwUpdateAccepted = false;
            }
          }
          window.location.reload();
        });
      });
    }
  }

  function init() {
    window.__pdMark?.('pd:app:init:start');
    window.__pdDebug?.({location:'app.js:init',message:'App init start',data:{readyState:document.readyState,hasDOMPurify:!!window.DOMPurify,hasChart:!!window.Chart,hasPdf:!!window.pdfjsLib},timestamp:Date.now()});

    ThemeManager.init();
    Prefs.init();
    Sidebar.init();
    TopbarSearch.init();

    Ripple.init();

    Modal.init();
    Drawer.init();
    Dropdown.init();

    Tabs.init();
    Accordion.init();

    Toast.init();
    StorageAlerts.init();

    Forms.init();
    Tables.init();

    Tooltips.init();

    Charts.init();
    StatCards.init();

    NotificationsPanel.init();
    UserMenu.init();

    Clipboard.init();
    ThemeImages.init();

    LazyImages.init();

    KeyboardShortcuts.init();
    AvatarUpload.init();

    Settings.init();

    Responsive.init();
    initEnhancements();

    // Route registrations (views injected into #view-container)
    Router
      .on('#/', () => Router.navigate('#/home'))
      .on('#/home', () => Views.home())
      .on('#/courses', async (_hash, ctx) => { await loadRouteFeatures('player'); if (!ctx?.isCurrent?.()) return undefined; return Views.courses(); })
      .on('#/notes', async (_hash, ctx) => { await loadRouteFeatures('notes'); if (!ctx?.isCurrent?.()) return undefined; return Views.notes(); })
      .on('#/pdf', async (_hash, ctx) => { await loadRouteFeatures('pdf'); if (!ctx?.isCurrent?.()) return undefined; return Views.pdf(); })
      .on('#/studio', async (_hash, ctx) => { await loadRouteFeatures('canvas'); if (!ctx?.isCurrent?.()) return undefined; return Views.studio(); })
      .on('#/progress', async (_hash, ctx) => { await loadRouteFeatures('progress'); if (!ctx?.isCurrent?.()) return undefined; return Views.progress(); })
      .on('#/help', () => Views.help())
      .on('#/settings', () => Views.settings())
      .on('#/my-courses', () => Views.myCourses())
      .on('#/materials', () => Views.materials())
      .on('#/tags', () => Views.tags())
      .on('#/playlists', () => Views.playlists())
      .on('#/bookmarks', () => Views.bookmarks())
      .on('#/achievements', () => Views.achievements());

    SyncRouteRefresh.init();
    Router.init();

    // Expose utilities globally
    OpenCourseDeck.Toast      = Toast;
    OpenCourseDeck.StorageAlerts = StorageAlerts;
    OpenCourseDeck.Modal      = Modal;
    OpenCourseDeck.Drawer     = Drawer;
    OpenCourseDeck.Dropdown   = Dropdown;
    OpenCourseDeck.Progress   = Progress;
    OpenCourseDeck.API        = API;
    OpenCourseDeck.Router     = Router;
    OpenCourseDeck.SyncRouteRefresh = SyncRouteRefresh;
    // Core preferences + theming (used by ES modules in src/)
    OpenCourseDeck.ThemeManager = ThemeManager;
    OpenCourseDeck.Prefs        = Prefs;
    OpenCourseDeck.FontScale    = FontScale;
    OpenCourseDeck.KeyboardShortcuts = KeyboardShortcuts;
    OpenCourseDeck.Heatmap    = Heatmap;
    OpenCourseDeck.ChartPlugins = Charts.plugins;
    OpenCourseDeck.CanvasCharts = { CanvasGauge, CanvasTreemap, CanvasAreaChart, CanvasHeatmap };
    OpenCourseDeck.CanvasZoom = CanvasZoom;
    OpenCourseDeck.CourseGraph = CourseGraph;
    OpenCourseDeck.KnowledgeGraph = KnowledgeGraph;
    OpenCourseDeck.Graphs = { CourseGraph, KnowledgeGraph };
    OpenCourseDeck.ContextMenu = OpenCourseDeck.ContextMenu ?? ContextMenu;
    OpenCourseDeck.CanvasExport = OpenCourseDeck.CanvasExport ?? CanvasExport;
    OpenCourseDeck.Clipboard = OpenCourseDeck.Clipboard ?? ClipboardBridge;
    OpenCourseDeck.Pointer = OpenCourseDeck.Pointer ?? Pointer;
    OpenCourseDeck.Skeleton   = Skeleton;
    OpenCourseDeck.InfiniteScroll = InfiniteScroll;
    OpenCourseDeck.Charts     = Charts;
    OpenCourseDeck.Views      = Views;
    OpenCourseDeck.TopbarSearch = TopbarSearch;
    OpenCourseDeck.safeExternalUrl = safeExternalUrl;
    OpenCourseDeck.safeNavigationUrl = safeNavigationUrl;
    OpenCourseDeck.safeMediaUrl = safeMediaUrl;
    OpenCourseDeck.safeImageUrl = safeImageUrl;
    OpenCourseDeck.safeFrameUrl = safeFrameUrl;
    // The hardened fallback sanitizer was only ever threaded into route
    // modules as an argument, so anything outside that call graph that needed
    // it wrote its own weaker copy instead. Publish it alongside the URL
    // policies it is built on.
    OpenCourseDeck.sanitizeHtml = fallbackSanitizeHtml;
    OpenCourseDeck.escapeHtmlText = escapeHtmlText;
    OpenCourseDeck.safeFetchUrl = safeFetchUrl;
    OpenCourseDeck.applyImageFallback = applyImageFallback;
    OpenCourseDeck.IMAGE_FALLBACK_SRC = IMAGE_FALLBACK_SRC;

    // Fire ready event
    OpenCourseDeck.bus.emit('app:ready');
    window.__pdMark?.('pd:app:ready');
    window.__pdMeasure?.('pd:bundle_to_ready', 'pd:bundle:evaluated', 'pd:app:ready');
    window.__pdMeasure?.('pd:app:init', 'pd:app:init:start', 'pd:app:ready');

    window.__pdDebug?.({location:'app.js:init',message:'App init done',data:{hash:window.location.hash||'#/',splashExists:!!document.getElementById('app-loading')},timestamp:Date.now()});

    // Dismiss loading splash (index.html overlay)
    const splash = document.getElementById('app-loading');
    if (splash) {
      const status = document.getElementById('splash-status');
      if (status) status.textContent = 'Ready';

      // Trigger CSS transition
      requestAnimationFrame(() => splash.classList.add('fade-out'));

      // Remove after transition (and fallback timeout)
      const remove = () => { try { splash.remove(); } catch {} };
      splash.addEventListener('transitionend', remove, { once: true });
      setTimeout(remove, 1500);
    }

  }

  // DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();



