// ============================================================
// PlasmaDeck UI â€” app.js
// Complete JavaScript Interaction Layer
// Version 1.1.2 (keep aligned with package.json)
// ============================================================

import { Prefs, FontScale } from './src/core/prefs.js';
import { ThemeManager } from './src/core/themeManager.js';
import {
  $,
  $$,
  appendContent,
  createElement,
  debounce,
  esc,
  eventTargetEl,
  restoreFocus,
  setAppInert,
  throttle,
  trapFocus,
  uid,
} from './src/lib/dom.js';
import { createRouter } from './src/router/router.js';
import { mountNotFoundView } from './src/views/notFoundRoute.js';

(() => {
  'use strict';

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 0. NAMESPACE & GLOBAL STATE
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // IMPORTANT: merge into any existing window.PlasmaDeck so earlier modules
  // (e.g. data.js, db.js) are not clobbered.
  const PlasmaDeck = window.PlasmaDeck ?? {};

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

  PlasmaDeck.version = PlasmaDeck.version ?? '1.1.2';
  PlasmaDeck.state = {
    ...defaultState,
    ...(PlasmaDeck.state ?? {}),
    // Keep Set instances if they already exist
    openDropdowns: PlasmaDeck.state?.openDropdowns instanceof Set ? PlasmaDeck.state.openDropdowns : defaultState.openDropdowns,
    openAccordions: PlasmaDeck.state?.openAccordions instanceof Set ? PlasmaDeck.state.openAccordions : defaultState.openAccordions,
  };
  PlasmaDeck.config = {
    ...defaultConfig,
    ...(PlasmaDeck.config ?? {}),
    breakpoints: {
      ...defaultConfig.breakpoints,
      ...((PlasmaDeck.config ?? {}).breakpoints ?? {}),
    },
  };
  PlasmaDeck.plugins = PlasmaDeck.plugins ?? {};
  PlasmaDeck.dom = {
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
  window.PlasmaDeck = PlasmaDeck;


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 1. UTILITIES
  // Shim window.DomUtils so legacy runtime callers still work.
  window.DomUtils = window.DomUtils ?? { createElement, appendContent, esc };
  // 2. THEME SYSTEM  (ThemeManager, Prefs, FontScale are ESM imports at top)
  // 3. SIDEBAR
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


  // ─────────────────────────────────────────────────────────────────────────
  // 1b. MISSING HELPER DEFINITIONS
  // All functions below were referenced but never defined; they are defined
  // here once, close to the top of the IIFE, so every section can use them.
  // ─────────────────────────────────────────────────────────────────────────

  // -- Animation helper (sub-nav accordion, accordion widgets) ---------------
  function animateHeight(el, open) {
    if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      el.style.height = open ? 'auto' : '0';
      el.style.overflow = 'hidden';
      return;
    }
    if (open) {
      el.style.overflow = 'hidden';
      el.style.height = '0';
      const target = el.scrollHeight;
      requestAnimationFrame(() => {
        el.style.transition = 'height 250ms ease';
        el.style.height = target + 'px';
        el.addEventListener('transitionend', () => {
          el.style.height = 'auto';
          el.style.overflow = '';
          el.style.transition = '';
        }, { once: true });
      });
    } else {
      el.style.height = el.scrollHeight + 'px';
      el.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        el.style.transition = 'height 250ms ease';
        el.style.height = '0';
        el.addEventListener('transitionend', () => {
          el.style.transition = '';
        }, { once: true });
      });
    }
  }

  // -- Pending course/PDF session (cross-route navigation state) -------------
  const _pendingSession = {};

  function setPendingCourseMedia(topicId, position) {
    if (topicId != null) {
      _pendingSession.topicId = topicId;
      _pendingSession.position = position ?? null;
    }
  }

  function consumePendingCourseSession() {
    const snap = { ...(_pendingSession) };
    delete _pendingSession.topicId;
    delete _pendingSession.position;
    return snap.topicId ? snap : null;
  }

  function setPendingPdfPage(docId, page) {
    if (docId != null) {
      _pendingSession.pdfDocId = docId;
      _pendingSession.pdfPage = page ?? 1;
    }
  }

  // -- URL safety guards (CSP-aligned) ---------------------------------------
  const _SAFE_URL_RE   = /^(https?:|\/|#|data:image\/|data:audio\/|data:video\/|blob:)/i;
  const _SAFE_MEDIA_RE = /^(https?:|\/|data:audio\/|data:video\/|blob:)/i;
  const _SAFE_IMG_RE   = /^(https?:|\/|data:image\/|blob:)/i;
  const _SAFE_FRAME_RE = /^(https?:|\/)/i;

  function safeNavigationUrl(url) {
    const s = String(url ?? '').trim();
    return _SAFE_URL_RE.test(s) ? s : '#/';
  }

  function safeExternalUrl(url) {
    const s = String(url ?? '').trim();
    return /^https?:/i.test(s) ? s : null;
  }

  function safeMediaUrl(url) {
    const s = String(url ?? '').trim();
    return _SAFE_MEDIA_RE.test(s) ? s : null;
  }

  function safeImageUrl(url) {
    const s = String(url ?? '').trim();
    return _SAFE_IMG_RE.test(s) ? s : null;
  }

  function safeFrameUrl(url) {
    const s = String(url ?? '').trim();
    return _SAFE_FRAME_RE.test(s) ? s : null;
  }

  function safeFetchUrl(base, path) {
    try {
      const resolved = path ? new URL(path, base || location.origin).href : (base || '');
      return /^https?:/i.test(resolved) || resolved.startsWith('/') ? resolved : null;
    } catch {
      return null;
    }
  }

  // -- Image fallback ---------------------------------------------------------
  const IMAGE_FALLBACK_SRC = 'assets/placeholder.svg';

  function applyImageFallback(img) {
    if (!img) return;
    img.addEventListener('error', () => {
      if (img.src !== IMAGE_FALLBACK_SRC) {
        img.src = IMAGE_FALLBACK_SRC;
        img.classList.add('image-fallback');
      }
    }, { once: true });
  }

  // -- Sanitize HTML (fallback when DOMPurify is absent) ---------------------
  function fallbackSanitizeHtml(html) {
    const tmp = document.createElement('div');
    tmp.textContent = String(html ?? '');
    return tmp.innerHTML;
  }

  // -- Download helpers -------------------------------------------------------
  function downloadTextFile(text, filename, mime = 'text/plain') {
    const blob = new Blob([text], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadDataUrl(dataUrl, filename) {
    const a    = document.createElement('a');
    a.href     = dataUrl;
    a.download = filename;
    a.click();
  }

  function printStudioBoardPdf() {
    window.print();
  }

  // -- Formatting helpers ----------------------------------------------------
  function formatMediaClock(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  }

  function escapeHtmlText(str) {
    return String(str ?? '').replace(
      /[&<>"']/g,
      m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])
    );
  }

  function formatBytes(bytes) {
    const b = Number(bytes) || 0;
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  }

  function localStorageFootprint() {
    try {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        total += (key?.length ?? 0) + (localStorage.getItem(key)?.length ?? 0);
      }
      return total * 2; // UTF-16 characters = 2 bytes each
    } catch {
      return 0;
    }
  }

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
      this._setCollapsed(!PlasmaDeck.state.sidebarCollapsed);
    },

    _setCollapsed(collapsed) {
      PlasmaDeck.state.sidebarCollapsed = collapsed;
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

      PlasmaDeck.bus.emit('sidebar:toggle', { collapsed });
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
      if (w < PlasmaDeck.config.breakpoints.lg) {
        // Mobile: remove desktop collapsed, use mobile open/close
        this.el.classList.remove('sidebar-collapsed');
      } else {
        this.closeMobile();
        if (PlasmaDeck.state.sidebarCollapsed) {
          this.el.classList.add('sidebar-collapsed');
        }
      }
    },
  };


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 4. TOPBAR â€” SEARCH
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    },

    /**
     * Provide data for client-side search (optional â€” falls back to server fetch)
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
      PlasmaDeck.bus.emit('search:query', eventPayload);
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
      const ai = window.PlasmaDeck?.AI;
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
      if (value == null) return '';
      if (value instanceof Node) return (value.textContent || value.innerText || '').replace(/\s+/g, ' ').trim();
      const s = String(value);
      if (!s.includes('<') && !s.includes('&')) return s.replace(/\s+/g, ' ').trim();
      try {
        const doc = new DOMParser().parseFromString(s, 'text/html');
        return (doc.body.textContent || doc.body.innerText || '').replace(/\s+/g, ' ').trim();
      } catch {
        return s.replace(/\s+/g, ' ').trim();
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
            PlasmaDeck.bus.emit('search:select', item);
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
      const source = (text instanceof Node ? text.textContent : String(text || ''));
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


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 5. RIPPLE EFFECT (Buttons)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const Ripple = {
    init() {
      document.addEventListener('pointerdown', e => {
        if (!PlasmaDeck.state.rippleEnabled) return;
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
      ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    },
  };


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 6. MODALS & DRAWERS
  const Modal = window.Modal;
  // 7. DRAWERS
  const Drawer = window.Drawer;
  // 8. DROPDOWN MENUS
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

      PlasmaDeck.bus.emit('dropdown:open', { menu });
    },

    close(menu) {
      menu.classList.remove('open');
      menu.setAttribute('aria-hidden', 'true');

      const trigger = $(`[data-dropdown-trigger="${menu.id}"]`)
        ?? menu.previousElementSibling;
      if (trigger) trigger.setAttribute('aria-expanded', 'false');

      if (this._active === menu) this._active = null;

      PlasmaDeck.bus.emit('dropdown:close', { menu });
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


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 9. TABS
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

      PlasmaDeck.bus.emit('tab:change', { tab, panel });
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


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 10. ACCORDION
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

      PlasmaDeck.bus.emit('accordion:toggle', { item, open: !isOpen });
    },
  };


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 11. TOAST NOTIFICATIONS
  const Toast = window.Toast;
  // 12. FORMS â€” Validation, Inputs, Toggles, Range
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
          message: 'PlasmaDeck cannot save this change because browser storage is full. Export your data, then clear browser storage before continuing.',
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
          message: 'IndexedDB did not accept a save, so PlasmaDeck used the browser fallback. Export a backup soon if this repeats.',
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
          message: 'Another PlasmaDeck tab upgraded the local database. Reload this tab before saving more changes.',
          action: reloadWrap,
        });
        toast?.querySelector?.('[data-db-reload]')?.addEventListener?.('click', () => window.location.reload());
      };

      PlasmaDeck.bus.on?.('storage:save-error', showSaveError);
      PlasmaDeck.bus.on?.('storage:fallback', showFallback);
      PlasmaDeck.bus.on?.('db:versionchange', showDbVersionChange);
      if (window.__pdDbVersionChangeHandler) {
        window.removeEventListener?.('plasma:db-versionchange', window.__pdDbVersionChangeHandler);
      }
      window.__pdDbVersionChangeHandler = showDbVersionChange;
      window.addEventListener?.('plasma:db-versionchange', showDbVersionChange);
      if (window.PlasmaDeck?.lastStorageIssue) showSaveError(window.PlasmaDeck.lastStorageIssue);
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

    // â”€â”€ Inline validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Password visibility toggle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Range sliders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Character counters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Custom file inputs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    _initFileInputs() {
      $$('[data-file-input]').forEach(wrapper => {
        const input   = $('input[type="file"]', wrapper);
        const label   = $('[data-file-label]', wrapper);
        if (!input) return;

        input.addEventListener('change', () => {
          const names = [...input.files].map(f => f.name).join(', ');
          if (label) label.textContent = names || 'No file chosen';
          wrapper.classList.toggle('has-file', input.files.length > 0);
          PlasmaDeck.bus.emit('file:select', { files: [...input.files] });
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


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 13. TABLES â€” Sorting, Selection, Pagination
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const Tables = {
    init() {
      this._initSorting();
      this._initRowSelection();
      this._initPagination();
      this._initSearch();
    },

    // â”€â”€ Column sorting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        PlasmaDeck.bus.emit('table:sort', { col, dir });
      });
    },

    // â”€â”€ Row selection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        PlasmaDeck.bus.emit('table:select', { count: selected.length, rows: selected });
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

    // â”€â”€ Client-side pagination â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          PlasmaDeck.bus.emit('table:page', { page, pages });
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

      ul.appendChild(mkBtn('â€¹', current - 1, current === 1));

      // Ellipsis logic
      const range = this._pageRange(current, pages);
      let prev = null;
      range.forEach(p => {
        if (prev !== null && p - prev > 1) {
          ul.appendChild(createElement('li', { class: 'page-item page-ellipsis' },
            createElement('span', {}, 'â€¦')));
        }
        ul.appendChild(mkBtn(p, p, false, p === current));
        prev = p;
      });

      ul.appendChild(mkBtn('â€º', current + 1, current === pages));
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

    // â”€â”€ Per-table search filter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 13b. LIST PAGINATION (cards/lists, not tables)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 14. TOOLTIPS
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const Tooltips = {
    _current: null,
    _anchor: null,
    _observer: null,

    init() {
      // CSS-only tooltips use [data-tip] â€” we enhance with JS for dynamic content
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


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 15. PROGRESS & LOADERS
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      const start    = parseFloat(el.style.getPropertyValue('--progress') ?? '0');
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


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 16. CHARTS (Thin wrappers â€” expects Chart.js or similar)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const Charts = {
    _instances: new Map(),

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
      const isDark = PlasmaDeck.state.theme !== 'light';
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
      PlasmaDeck.bus.on('theme:change', () => {
        this._instances.forEach(chart => {
          if (!chart?.options) return;
          this._mergeOptions(chart.options, this.themeOptions());
          chart.update();
        });
      });
    },
  };


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 17. STAT CARDS â€” Animated counters
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 18. NOTIFICATIONS PANEL
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

      PlasmaDeck.bus.on('notification:new', data => this._onNew(data));
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


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 19. USER PROFILE MENU
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 20. COPY TO CLIPBOARD
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
          PlasmaDeck.bus.emit('clipboard:copy', { text });
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


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 21. DARK MODE AWARE IMAGES
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const ThemeImages = {
    init() {
      PlasmaDeck.bus.on('theme:change', ({ effective }) => {
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


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 22. SKELETON LOADERS
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 23. INFINITE SCROLL
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const InfiniteScroll = {
    /**
     * @param {Object} opts
     * @param {string|HTMLElement} opts.container
     * @param {Function} opts.onLoad  async fn(page) â†’ returns false when exhausted
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
          PlasmaDeck.bus.emit('infinite-scroll:error', { err, page });
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


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 24. ROUTER (Hash-based SPA helper)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    }[hash] ?? 'PlasmaDeck';
  }

  const Router = createRouter({
    $$,
    Progress,
    bus: PlasmaDeck.bus,
    getNotFoundView: () => PlasmaDeck.Views?.notFound,
    getRouteLabel: hash => routeTitle(hash),
  });

  async function loadRouteFeatures(...names) {
    if (!names.length) return;
    const loader = PlasmaDeck.loadFeatures;
    if (typeof loader === 'function') {
      await loader(...names);
      return;
    }
    await Promise.all(names.map(name => PlasmaDeck.loadFeature?.(name)).filter(Boolean));
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
        PlasmaDeck.bus.emit?.('sync:route-refresh', { hash: currentHash, payload: pending });
        Router.refresh?.(detail);
      }, 80);
    };

    return {
      init() {
        PlasmaDeck.bus.on?.('sync:message', schedule);
      },
    };
  })();


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 25. RESPONSIVE UTILITIES
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const Responsive = {
    /**
     * Returns the current breakpoint name
     */
    current() {
      const w  = window.innerWidth;
      const bp = PlasmaDeck.config.breakpoints;
      if (w < bp.sm)   return 'xs';
      if (w < bp.md)   return 'sm';
      if (w < bp.lg)   return 'md';
      if (w < bp.xl)   return 'lg';
      if (w < bp['2xl']) return 'xl';
      return '2xl';
    },

    isMobile()  { return window.innerWidth < PlasmaDeck.config.breakpoints.md; },
    isTablet()  { const w = window.innerWidth; const bp = PlasmaDeck.config.breakpoints; return w >= bp.md && w < bp.lg; },
    isDesktop() { return window.innerWidth >= PlasmaDeck.config.breakpoints.lg; },

    init() {
      const onResize = throttle(() => {
        PlasmaDeck.bus.emit('responsive:change', { breakpoint: this.current() });
      }, 200);
      window.addEventListener('resize', onResize);
    },
  };


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 33. VIEWS (SPA route rendering)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 26. KEYBOARD SHORTCUTS
  const KeyboardShortcuts = window.KeyboardShortcuts;
  // 27. AVATAR UPLOAD (settings page)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
            PlasmaDeck.bus.emit('avatar:change', { file, dataUrl: ev.target.result });
          };
          reader.readAsDataURL(file);
        });
      });
    },
  };


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 28. SETTINGS PAGE
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const Settings = {
    init() {
      // Settings form auto-save with debounce
      $$('form[data-autosave]').forEach(form => {
        const saveIndicator = form.querySelector('[data-save-indicator]');
        const save = debounce(async () => {
          const data = Object.fromEntries(new FormData(form));
          try {
            PlasmaDeck.bus.emit('settings:save', { data });
            if (saveIndicator) {
              saveIndicator.textContent = 'âœ… Saved';
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
            title:     'âš ï¸ Delete Account',
            message:   'This action is <strong>irreversible</strong>. All your data will be permanently deleted. Are you absolutely sure?',
            confirmLabel: 'Delete account',
            cancelLabel: 'Cancel',
          });
          if (!confirmed) return;
          PlasmaDeck.bus.emit('account:delete');
          Toast.error('Account deletion initiated.');
        });
      }
    },
  };


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 29. LAZY IMAGE LOADING
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      PlasmaDeck.lazy = img => {
        applyImageFallback(img);
        observer.observe(img);
      };
    },
  };


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 30. DATA FETCHING HELPER
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
        PlasmaDeck.bus.emit('api:error', { err, path, method });
        throw err;
      }
    },

    get   (path, opts)        { return this.request('GET',    path, null, opts); },
    post  (path, body, opts)  { return this.request('POST',   path, body, opts); },
    put   (path, body, opts)  { return this.request('PUT',    path, body, opts); },
    patch (path, body, opts)  { return this.request('PATCH',  path, body, opts); },
    delete(path, opts)        { return this.request('DELETE', path, null, opts); },
  };


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 31. HEATMAP CALENDAR (renders inside [data-heatmap])
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
          const key   = date.toISOString().slice(0, 10);
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


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 32. INITIALIZATION
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function initEnhancements() {
    // Breadcrumb updates from router events
    const breadcrumbList = document.getElementById('breadcrumb-list');
    if (breadcrumbList) {
      PlasmaDeck.bus.on?.('route:change', ({ hash }) => {
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
    PlasmaDeck.bus.on?.('theme:change', syncThemeColor);
    syncThemeColor();

    // Command palette (extracted to an ES module under src/)
    const cpOpen = () => window.PlasmaDeck?.CommandPalette?.open?.();
    KeyboardShortcuts.register('ctrl+k', () => cpOpen(), 'Open command palette');
    const btn = document.getElementById('command-palette-btn');
    if (btn && !btn.dataset.pdBound) {
      btn.dataset.pdBound = 'true';
      btn.addEventListener('click', () => cpOpen());
    }

    // Service worker update prompt (index.html dispatches plasma:sw-update-ready)
    if (!document.documentElement.dataset.pdSwBound) {
      document.documentElement.dataset.pdSwBound = 'true';
      document.addEventListener('plasma:sw-update-ready', () => {
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
        btn?.addEventListener?.('click', () => window.location.reload());
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
    PlasmaDeck.Toast      = Toast;
    PlasmaDeck.StorageAlerts = StorageAlerts;
    PlasmaDeck.Modal      = Modal;
    PlasmaDeck.Drawer     = Drawer;
    PlasmaDeck.Dropdown   = Dropdown;
    PlasmaDeck.Progress   = Progress;
    PlasmaDeck.API        = API;
    PlasmaDeck.Router     = Router;
    PlasmaDeck.SyncRouteRefresh = SyncRouteRefresh;
    // Core preferences + theming (used by ES modules in src/)
    PlasmaDeck.ThemeManager = ThemeManager;
    PlasmaDeck.Prefs        = Prefs;
    PlasmaDeck.FontScale    = FontScale;
    PlasmaDeck.KeyboardShortcuts = KeyboardShortcuts;
    PlasmaDeck.Heatmap    = Heatmap;
    PlasmaDeck.Skeleton   = Skeleton;
    PlasmaDeck.InfiniteScroll = InfiniteScroll;
    PlasmaDeck.Charts     = Charts;
    PlasmaDeck.Views      = Views;
    PlasmaDeck.TopbarSearch = TopbarSearch;
    PlasmaDeck.safeExternalUrl = safeExternalUrl;
    PlasmaDeck.safeNavigationUrl = safeNavigationUrl;
    PlasmaDeck.safeMediaUrl = safeMediaUrl;
    PlasmaDeck.safeImageUrl = safeImageUrl;
    PlasmaDeck.safeFrameUrl = safeFrameUrl;
    PlasmaDeck.safeFetchUrl = safeFetchUrl;
    PlasmaDeck.applyImageFallback = applyImageFallback;
    PlasmaDeck.IMAGE_FALLBACK_SRC = IMAGE_FALLBACK_SRC;

    // Fire ready event
    PlasmaDeck.bus.emit('app:ready');
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
      const remove = () => { try { splash.remove(); } catch { /* ignore */ } };
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





