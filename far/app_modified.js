// ============================================================
// PlasmaDeck UI — app.js
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

(() => {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // 0. NAMESPACE & GLOBAL STATE
  // ──────────────────────────────────────────────────────────
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


  // ──────────────────────────────────────────────────────────
  // 1. UTILITIES
  // ──────────────────────────────────────────────────────────

  /**
   * Create element with optional attributes and children.
   * Handles nested arrays of children correctly.
   * @param {string} tag
   * @param {Object} attrs
   * @param {...(string|Node|Array)} children
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

    const append = (parent, content) => {
      if (Array.isArray(content)) {
        content.forEach(c => append(parent, c));
      } else if (content != null) {
        parent.append(typeof content === 'string' ? document.createTextNode(content) : content);
      }
    };

    append(el, children);
    return el;
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
        this._events[event] = this._events[event].filter(f => f !== fn);
      }
      return this;
    }
    emit(event, ...args) {
      (this._events[event] ?? []).forEach(fn => fn(...args));
      return this;
    }
    once(event, fn) {
      const wrapper = (...args) => { fn(...args); this.off(event, wrapper); };
      return this.on(event, wrapper);
    }
  }

  // Global event bus
  PlasmaDeck.bus = new EventEmitter();

  /**
   * Animate element height from 0 → auto (or auto → 0)
   * @param {HTMLElement} el
   * @param {boolean} open   true = expand, false = collapse
   * @param {number} duration ms
   * @returns {Promise<void>}
   */
  function animateHeight(el, open, duration = PlasmaDeck.config.animationDuration) {
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
      if (collapsed) this._setCollapsed(true, false);

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

    _setCollapsed(collapsed, animate = true) {
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


  // ──────────────────────────────────────────────────────────
  // 4. TOPBAR — SEARCH
  // ──────────────────────────────────────────────────────────

  const TopbarSearch = {
    input: null,
    resultsBox: null,
    _data: [],

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
     * Provide data for client-side search (optional — falls back to server fetch)
     */
    setData(data) {
      this._data = data;
    },

    async _onInput(value) {
      if (value.trim().length < 2) { this._close(); return; }

      let results;
      if (this._data.length) {
        // Client-side filter
        const q = value.toLowerCase();
        results = this._data.filter(item =>
          item.label?.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q)
        ).slice(0, 8);
      } else {
        // Optionally fetch from API
        PlasmaDeck.bus.emit('search:query', { value, setResults: r => (results = r) });
        results ??= [];
      }

      this._render(results, value);
    },

    _render(results, query) {
      this.resultsBox.innerHTML = '';
      if (!results.length) {
        this.resultsBox.innerHTML =
          `<div class="search-no-results">No results for "<strong>${this._escHtml(query)}</strong>"</div>`;
      } else {
        results.forEach((item, i) => {
          const highlighted = this._highlight(item.label ?? '', query);
          const el = createElement('div', {
            class: 'search-result-item',
            role: 'option',
            tabindex: '-1',
            'data-index': String(i),
          });
          el.innerHTML = `
            <span class="search-result-icon">${item.icon ?? '🔍'}</span>
            <span class="search-result-text">
              <span class="search-result-label">${highlighted}</span>
              ${item.description ? `<span class="search-result-desc">${this._escHtml(item.description)}</span>` : ''}
            </span>
            ${item.category ? `<span class="search-result-cat">${this._escHtml(item.category)}</span>` : ''}
          `;
          el.addEventListener('click', () => {
            PlasmaDeck.bus.emit('search:select', item);
            if (item.href) window.location.href = item.href;
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

    _highlight(text, query) {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return text.replace(new RegExp(`(${escaped})`, 'gi'),
        '<mark class="search-highlight">$1</mark>');
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


  // ──────────────────────────────────────────────────────────
  // 6. MODALS & DRAWERS
  // ──────────────────────────────────────────────────────────

  const Modal = {
    _cleanupFns: new Map(),
    _previousFocus: new WeakMap(),

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
      PlasmaDeck.state.openModals.push(modal);
      this._previousFocus.set(modal, document.activeElement);
      setAppInert(true);

      // Trap focus
      const cleanup = trapFocus(modal);
      this._cleanupFns.set(modal, cleanup);

      // Close on backdrop click
      backdrop.addEventListener('click', () => this.close(modal), { once: true });

      // Close on Escape
      const onEsc = e => { if (e.key === 'Escape') this.close(modal); };
      document.addEventListener('keydown', onEsc);
      this._cleanupFns.set(modal, () => {
        cleanup();
        document.removeEventListener('keydown', onEsc);
      });

      // Wire close buttons inside modal
      $$('[data-modal-close]', modal).forEach(btn => {
        btn.addEventListener('click', () => this.close(modal), { once: true });
      });

      PlasmaDeck.bus.emit('modal:open', { modal, opts });
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

      setTimeout(() => {
        modal.setAttribute('hidden', '');
        modal.removeAttribute('aria-modal');
        if (backdrop?.classList.contains('modal-backdrop')) {
          backdrop.remove();
        }
      }, PlasmaDeck.config.animationDuration);

      PlasmaDeck.state.openModals = PlasmaDeck.state.openModals.filter(m => m !== modal);

      if (!PlasmaDeck.state.openModals.length) {
        document.body.style.overflow = '';
      }

      // Cleanup focus trap
      const cleanup = this._cleanupFns.get(modal);
      if (cleanup) { cleanup(); this._cleanupFns.delete(modal); }
      setAppInert(false);
      restoreFocus(this._previousFocus.get(modal));
      this._previousFocus.delete(modal);

      modal.dispatchEvent(new CustomEvent('modal:close', { detail: { modal } }));
      PlasmaDeck.bus.emit('modal:close', { modal });
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
      if (typeof body === 'string') bodyEl.innerHTML = body;
      else bodyEl.appendChild(body);

      const children = [header, bodyEl];

      if (footer || onConfirm) {
        const footerEl = createElement('div', { class: 'modal-footer' });
        if (typeof footer === 'string' && footer) {
          footerEl.innerHTML = footer;
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

      // Auto-remove from DOM after closing
      PlasmaDeck.bus.on('modal:close', ({ modal: m }) => {
        if (m === modal) setTimeout(() => modal.remove(), 400);
      });

      this.open(modal);
      return modal;
    },

    /**
     * Confirm dialog shorthand
     */
    confirm({ title = 'Are you sure?', message = '', onConfirm = () => {}, confirmLabel = 'Confirm', cancelLabel = 'Cancel' } = {}) {
      const modal = this.create({
        title,
        body: createElement('p', {}, String(message ?? '')),
        footer: '',
      });
      const footer = $('.modal-footer', modal) ?? createElement('div', { class: 'modal-footer' });
      if (!footer.isConnected) modal.appendChild(footer);
      footer.replaceChildren();
      const cancelBtn = createElement('button', { class: 'btn btn-ghost', 'data-modal-close': '' }, cancelLabel);
      const confirmBtn = createElement('button', { class: 'btn btn-primary' }, confirmLabel);
      confirmBtn.addEventListener('click', () => {
        onConfirm();
        this.close(modal);
      });
      footer.append(cancelBtn, confirmBtn);
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
        PlasmaDeck.bus.once('modal:close', ({ modal: closed }) => {
          if (closed === modal) settle(false);
        });
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
      requestAnimationFrame(() => {
        backdrop.classList.add('open');
        drawer.classList.add('open');
      });

      document.body.style.overflow = 'hidden';
      this._previousFocus.set(drawer, document.activeElement);
      setAppInert(true);
      this._cleanupFns.set(drawer, trapFocus(drawer));

      PlasmaDeck.bus.emit('drawer:open', { drawer });
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
      }, PlasmaDeck.config.animationDuration);

      const backdrop = $('.drawer-backdrop');
      if (backdrop) {
        backdrop.classList.remove('open');
        setTimeout(() => backdrop.remove(), PlasmaDeck.config.animationDuration);
      }

      document.body.style.overflow = '';
      this._cleanupFns.get(drawer)?.();
      this._cleanupFns.delete(drawer);
      setAppInert(false);
      restoreFocus(this._previousFocus.get(drawer));
      this._previousFocus.delete(drawer);
      PlasmaDeck.bus.emit('drawer:close', { drawer });
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


  // ──────────────────────────────────────────────────────────
  // 9. TABS
  // ──────────────────────────────────────────────────────────

  const Tabs = {
    init() {
      // Activate default tabs
      $$('.tab-list').forEach(list => {
        const active = $('.tab-item[aria-selected="true"]', list)
          ?? $('.tab-item', list);
        if (active) this._activate(active, false);
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

    _activate(tab, animate = true) {
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

      PlasmaDeck.bus.emit('accordion:toggle', { item, open: !isOpen });
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
     * @param {string} opts.action  HTML string for action button area
     * @returns {HTMLElement} the toast element
     */
    show({
      message     = '',
      type        = 'info',
      duration    = PlasmaDeck.config.toastDuration,
      position    = 'top-right',
      dismissible = true,
      title       = '',
      action      = '',
    } = {}) {
      const container = this._getContainer(position);

      // Enforce max stack
      const stack = $$('.toast', container);
      if (stack.length >= PlasmaDeck.config.toastMaxStack) {
        stack[0].remove();
      }

      const id   = uid('toast');
      const icon = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' }[type] ?? 'ℹ️';

      const toast = createElement('div', {
        id,
        class: `toast toast-${type}`,
        role: type === 'error' ? 'alert' : 'status',
        'aria-live': type === 'error' ? 'assertive' : 'polite',
        'aria-atomic': 'true',
      });

      toast.innerHTML = `
        <span class="toast-icon" aria-hidden="true">${icon}</span>
        <div class="toast-content">
          ${title ? `<div class="toast-title">${this._escHtml(title)}</div>` : ''}
          <div class="toast-message">${this._escHtml(message)}</div>
          ${action}
        </div>
        ${dismissible ? `<button class="toast-close" aria-label="Dismiss notification">×</button>` : ''}
        ${duration > 0 ? `<div class="toast-timer"></div>` : ''}
      `;

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

      PlasmaDeck.state.activeToasts.push(toast);
      PlasmaDeck.bus.emit('toast:show', { toast, type, message });

      return toast;
    },

    dismiss(toast) {
      toast.classList.remove('show');
      toast.classList.add('hide');
      toast.addEventListener('animationend', () => {
        toast.remove();
        PlasmaDeck.state.activeToasts = PlasmaDeck.state.activeToasts.filter(t => t !== toast);
        PlasmaDeck.bus.emit('toast:dismiss', { toast });
      }, { once: true });
    },

    dismissAll() {
      [...PlasmaDeck.state.activeToasts].forEach(t => this.dismiss(t));
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
        if (icon) icon.textContent = isVisible ? '👁️' : '🙈';
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
            return dir === 'asc'
              ? parseFloat(aVal) - parseFloat(bVal)
              : parseFloat(bVal) - parseFloat(aVal);
          }
          return dir === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        });

        rows.forEach(row => tbody.appendChild(row));
        PlasmaDeck.bus.emit('table:sort', { col, dir });
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
          PlasmaDeck.bus.emit('table:page', { page, pages });
        };

        render(1);
      });
    },

    _renderPageButtons(nav, pages, current, onPage) {
      const ul = nav.querySelector('.pagination-list') ?? nav;
      ul.innerHTML = '';

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
      const mkBtn = (label, nextPage, disabled) => `
        <button class="btn btn-ghost btn-sm" ${disabled ? 'disabled' : ''} data-page="${nextPage}">
          ${label}
        </button>`;
      container.innerHTML = `
        <div class="card card-ghost" style="padding:12px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div class="text-sm" style="opacity:.8">
              ${total.toLocaleString()} items • Page <strong>${page}</strong> / ${pages}
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <label class="text-sm" style="opacity:.75">Per page</label>
              <select class="select input-sm" data-per-page>
                ${perPageOptions.map(n => `<option value="${n}" ${n === perPage ? 'selected' : ''}>${n}</option>`).join('')}
              </select>
              ${mkBtn('‹ Prev', page - 1, page <= 1)}
              ${mkBtn('Next ›', page + 1, page >= pages)}
            </div>
          </div>
        </div>
      `;

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
    },

    _show(el) {
      this._hide();
      const text = el.dataset.tipJs;
      if (!text) return;

      const tip = createElement('div', { class: 'tooltip tooltip-js', role: 'tooltip' }, text);
      document.body.appendChild(tip);
      this._current = tip;

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


  // ──────────────────────────────────────────────────────────
  // 16. CHARTS (Thin wrappers — expects Chart.js or similar)
  // ──────────────────────────────────────────────────────────

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

    /**
     * Re-render all charts when theme changes
     */
    init() {
      PlasmaDeck.bus.on('theme:change', () => {
        this._instances.forEach(chart => {
          if (!chart?.options) return;
          Object.assign(chart.options, this.themeOptions());
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
          if (list) list.innerHTML = '';
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
          PlasmaDeck.bus.emit('clipboard:copy', { text });
        } catch {
          this._feedback(btn, false);
        }
      });
    },

    _feedback(btn, success) {
      const original = btn.innerHTML;
      btn.innerHTML = success ? '✅ Copied!' : '❌ Failed';
      btn.disabled  = true;
      setTimeout(() => { btn.innerHTML = original; btn.disabled = false; }, 2000);
    },
  };


  // ──────────────────────────────────────────────────────────
  // 21. DARK MODE AWARE IMAGES
  // ──────────────────────────────────────────────────────────

  const ThemeImages = {
    init() {
      PlasmaDeck.bus.on('theme:change', ({ effective }) => {
        $$('[data-src-dark][data-src-light]').forEach(img => {
          img.src = effective === 'dark' ? img.dataset.srcDark : img.dataset.srcLight;
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

        const hasMore = await onLoad(++page);
        loading = false;
        if (loader) loader.setAttribute('hidden', '');

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
  // FEATURE LOADER
  // ──────────────────────────────────────────────────────────

  const FEATURES = {
    home:         () => import('./src/views/homeRoute.js'),
    courses:      () => import('./src/views/coursesRoute.js'),
    myCourses:   () => import('./src/views/myCoursesRoute.js'),
    materials:    () => import('./src/views/materialsRoute.js'),
    tags:         () => import('./src/views/tagsRoute.js'),
    playlists:    () => import('./src/views/playlistsRoute.js'),
    bookmarks:    () => import('./src/views/bookmarksRoute.js'),
    achievements: () => import('./src/views/achievementsRoute.js'),
    settings:     () => import('./src/views/settingsRoute.js'),
    help:         () => import('./src/views/helpRoute.js'),
    notes:        () => import('./src/views/notesRoute.js'),
    pdf:          () => import('./src/views/pdfRoute.js'),
    studio:       () => import('./src/views/studioRoute.js'),
    progress:     () => import('./src/views/progressRoute.js'),
  };

  PlasmaDeck.loadFeatures = async (name) => {
    const loader = FEATURES[name];
    if (!loader) throw new Error(`Unknown feature: ${name}`);
    return loader();
  };


  // ──────────────────────────────────────────────────────────
  // 24. ROUTER (Hash-based SPA helper)
  // ──────────────────────────────────────────────────────────

  const Router = createRouter({
    $$,
    Progress,
    bus: PlasmaDeck.bus,
    getNotFoundView: () => PlasmaDeck.Views?.notFound,
  });

  const mountView = async (featureName, mountFnName) => {
    try {
      const module = await PlasmaDeck.loadFeatures(featureName);
      const mountFn = module[mountFnName];
      if (typeof mountFn !== 'function') throw new Error(`Mount function ${mountFnName} not found in ${featureName}`);
      
      return mountFn({
        setView: Views.set,
        createElement,
        $,
        $$,
        debounce,
        throttle,
        eventTargetEl,
        uid,
        safeExternalUrl,
        safeMediaUrl,
        safeNavigationUrl,
        formatBytes,
        formatMediaClock,
        setPendingCourseMedia,
        setPendingCourseSession,
        consumePendingCourseSession,
        setPendingPdfPage,
        escapeHtmlText,
        Router,
        Toast,
        Modal,
        Drawer,
        Dropdown,
        Progress,
        bus: PlasmaDeck.bus,
      });
    } catch (err) {
      console.error(`[Router] Failed to mount ${featureName}:`, err);
      Views.notFound(window.location.hash);
    }
  };


  // ──────────────────────────────────────────────────────────
  // 25. RESPONSIVE UTILITIES
  // ──────────────────────────────────────────────────────────

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
        el.innerHTML = purify.sanitize(String(html ?? ''), {
          ADD_TAGS: ['template', 'canvas'],
          ADD_ATTR: ['tabindex', 'role', 'aria-label', 'aria-hidden', 'aria-live', 'aria-atomic'],
        });
      } else {
        el.innerHTML = html;
      }
      return el;
    }

    function home() {
      set(`
        <section class="view view-home">
          <div class="home-hero card card-filled">
            <div class="home-hero-copy">
              <span class="eyebrow">Local-first learning studio</span>
              <h1 class="home-title">Your study command deck is ready.</h1>
              <p class="home-subtitle">Open a course, capture notes, mark progress, and keep backups close. PlasmaDeck stores your work on this device unless you export it.</p>
              <div class="home-actions">
                <a class="btn btn-primary" href="#/courses">
                  <i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>
                  Browse courses
                </a>
                <a class="btn btn-ghost" href="#/notes">
                  <i class="fa-solid fa-note-sticky" aria-hidden="true"></i>
                  Write notes
                </a>
                <a class="btn btn-ghost" href="#/help">
                  <i class="fa-solid fa-circle-question" aria-hidden="true"></i>
                  First-run guide
                </a>
              </div>
            </div>
            <div class="home-orbit" aria-hidden="true">
              <div class="home-orbit-core">PD</div>
              <span style="--i:0">Notes</span>
              <span style="--i:1">PDF</span>
              <span style="--i:2">Video</span>
              <span style="--i:3">Canvas</span>
            </div>
          </div>

          <div class="home-grid">
            <section class="card card-filled home-card home-card-wide">
              <div class="card-body">
                <div class="home-card-head">
                  <div>
                    <span class="eyebrow">Next best steps</span>
                    <h2 class="home-card-title">Start strong in three clicks</h2>
                  </div>
                  <kbd>Ctrl+K</kbd>
                </div>
                <div class="home-steps">
                  <a href="#/courses">
                    <span>1</span>
                    <strong>Choose a course</strong>
                    <small>Browse the catalog and open the first lesson.</small>
                  </a>
                  <a href="#/notes">
                    <span>2</span>
                    <strong>Create a note</strong>
                    <small>Capture ideas, links, code blocks, and tags.</small>
                  </a>
                  <a href="#/progress">
                    <span>3</span>
                    <strong>Review progress</strong>
                    <small>Export backups before changing browser or port.</small>
                  </a>
                </div>
              </div>
            </section>

            <section class="card card-filled home-card">
              <div class="card-body">
                <span class="eyebrow">Library snapshot</span>
                <div class="home-stat"><strong id="home-course-count">-</strong><span>Courses</span></div>
                <div class="home-stat"><strong id="home-topic-count">-</strong><span>Topics</span></div>
                <p class="home-card-note">Counts load from the active catalog selected in <code>data/catalog.json</code>.</p>
              </div>
            </section>

            <section class="card card-filled home-card">
              <div class="card-body">
                <span class="eyebrow">Daily tools</span>
                <div class="home-tool-list">
                  <a href="#/pdf"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i><span>Read PDFs</span></a>
                  <a href="#/studio"><i class="fa-solid fa-pen-ruler" aria-hidden="true"></i><span>Sketch in Studio</span></a>
                  <a href="#/settings"><i class="fa-solid fa-sliders" aria-hidden="true"></i><span>Tune preferences</span></a>
                </div>
              </div>
            </section>
          </div>
        </section>
      `);

      (async () => {
        try {
          await window.DataStore?.init?.();
          const courses = window.DataStore?.allCourses?.() ?? [];
          const topics = window.DataStore?.allTopics?.() ?? [];
          const courseCount = document.getElementById('home-course-count');
          const topicCount = document.getElementById('home-topic-count');
          if (courseCount) courseCount.textContent = String(courses.length);
          if (topicCount) topicCount.textContent = String(topics.length);
        } catch {
          const note = document.querySelector('.home-card-note');
          if (note) note.textContent = 'Catalog counts are unavailable right now. Try rebuilding or checking data/catalog.json.';
        }
      })();
    }

    function notes() {
      set(`
        <section class="view view-notes">
          <div class="page-header">
            <h1 class="page-title">Notes</h1>
            <p class="page-subtitle">Local-first rich notes.</p>
          </div>

          <div class="notes-shell">
            <aside class="notes-sidebar">
              <div class="notes-actions">
                <button class="btn btn-primary" data-action="new-note">New note</button>
                <button class="btn btn-ghost" data-action="export-all">Export JSON</button>
                <button class="btn btn-ghost" data-action="export-md">Export MD</button>
                <button class="btn btn-ghost" data-action="import-notes">Import</button>
              </div>

              <div class="notes-search">
                <input class="input" type="search" placeholder="Search notes…" data-notes-search />
              </div>

              <div class="notes-folders" data-folders-panel></div>
              <div class="notes-list" data-notes-list></div>
            </aside>

            <main class="notes-main" data-notes-main-pane>
              <div class="notes-top">
                <input class="input notes-title" data-note-title-input placeholder="Title" />
                <span class="notes-save" data-save-status></span>
              </div>

              <div class="notes-toolbar" data-notes-toolbar>
                <div class="notes-toolbar-row">
                  <button class="btn btn-ghost" data-cmd="bold"><strong>B</strong></button>
                  <button class="btn btn-ghost" data-cmd="italic"><em>I</em></button>
                  <button class="btn btn-ghost" data-cmd="underline"><u>U</u></button>
                  <button class="btn btn-ghost" data-cmd="strikethrough"><s>S</s></button>
                  <button class="btn btn-ghost" data-cmd="ul">• List</button>
                  <button class="btn btn-ghost" data-cmd="ol">1. List</button>
                  <button class="btn btn-ghost" data-cmd="blockquote">❝</button>
                  <button class="btn btn-ghost" data-cmd="code">Code</button>
                  <button class="btn btn-ghost" data-cmd-block data-cmd="codeblock">Code block</button>
                  <button class="btn btn-ghost" data-cmd="link">Link</button>
                  <button class="btn btn-ghost" data-cmd="image">Image</button>
                  <button class="btn btn-ghost" data-cmd="hr">HR</button>
                  <button class="btn btn-ghost" data-cmd="undo">Undo</button>
                  <button class="btn btn-ghost" data-cmd="redo">Redo</button>
                  <button class="btn btn-ghost" data-cmd="clearFormat">Clear</button>
                </div>
                <div class="notes-toolbar-row" style="gap:10px;flex-wrap:wrap;margin-top:8px">
                  <label style="display:flex;align-items:center;gap:6px">
                    <span style="opacity:.75">Size</span>
                    <select class="input input-sm" data-font-size>
                      <option value="12px">12</option>
                      <option value="14px">14</option>
                      <option value="16px" selected>16</option>
                      <option value="18px">18</option>
                      <option value="22px">22</option>
                      <option value="28px">28</option>
                    </select>
                  </label>
                  <label style="display:flex;align-items:center;gap:6px">
                    <span style="opacity:.75">Font</span>
                    <select class="input input-sm" data-font-family>
                      <option value="Inter">Inter</option>
                      <option value="JetBrains Mono">JetBrains Mono</option>
                      <option value="Playfair Display">Playfair Display</option>
                      <option value="system-ui">System</option>
                    </select>
                  </label>
                  <label style="display:flex;align-items:center;gap:6px">
                    <span style="opacity:.75">Text</span>
                    <input type="color" data-text-color value="#e5e7eb" />
                  </label>
                  <label style="display:flex;align-items:center;gap:6px">
                    <span style="opacity:.75">Highlight</span>
                    <input type="color" data-highlight-color value="#f59e0b" />
                  </label>
                </div>
              </div>
              <div class="notes-editor-wrap">
                <div class="notes-editor" data-notes-editor></div>
              </div>

              <div class="notes-meta">
                <span data-note-words></span>
                <span data-note-chars></span>
                <span data-note-date></span>
              </div>

              <div class="notes-tags" data-tags-cloud></div>
            </main>
          </div>
        </section>
      `);

      // Kick notes init (notes.js guards against missing DOM / double init)
      try { window.PlasmaNotesApp?.init?.(); } catch (e) { console.warn('[Notes view] init failed', e); }
    }

    function pdf() {
      set(`
        <section class="view view-pdf">
          <div class="page-header">
            <h1 class="page-title">PDF</h1>
            <p class="page-subtitle">Drop a PDF here or load via file picker.</p>
          </div>

          <div class="pdf-shell">
            <aside class="pdf-sidebar" data-pdf-thumbnails></aside>
            <div class="pdf-main">
              <div class="pdf-toolbar">
                <input class="input" data-pdf-search-input placeholder="Search…" />
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

      try { window.PlasmaPDFInit?.(); } catch (e) { console.warn('[PDF view] init failed', e); }
    }

    function studio() {
      set(`
        <section class="view view-studio">
          <div class="page-header">
            <h1 class="page-title">Studio</h1>
            <p class="page-subtitle">Whiteboard canvas.</p>
          </div>
          <div class="studio-shell">
            <canvas id="studio-canvas" class="studio-canvas"></canvas>
          </div>
        </section>
      `);

      const canvas = document.getElementById('studio-canvas');
      if (canvas) {
        // Give it a size; canvas.js reads offsetWidth/Height
        canvas.style.width = '100%';
        canvas.style.height = '70vh';
        try { window.PlasmaDeck?.Canvas?.init?.(canvas); } catch (e) { console.warn('[Studio view] init failed', e); }
      }
    }

    function progress() {
      set(`
        <section class="view view-progress">
          <div class="page-header">
            <h1 class="page-title">Progress</h1>
            <p class="page-subtitle">Analytics and export.</p>
          </div>

          <div class="progress-actions">
            <button class="btn btn-primary" id="btn-export-json">Export JSON</button>
            <button class="btn btn-ghost" id="btn-export-csv">Export CSV</button>
            <button class="btn btn-ghost" id="btn-export-md">Export Notes MD</button>
            <button class="btn btn-ghost" id="btn-import-json">Import</button>
            <button class="btn btn-danger" id="btn-reset-all">Reset all</button>
          </div>

          <div class="progress-grid">
            <div class="card card-filled">
              <div class="card-body">
                <div>Total topics: <strong id="stat-total-topics">0</strong></div>
                <div>Done: <strong id="stat-done-topics">0</strong></div>
                <div>In progress: <strong id="stat-in-progress">0</strong></div>
                <div>Completion: <strong id="stat-completion-pct">0%</strong></div>
                <div>Watched: <strong id="stat-watched-time">0:00</strong></div>
                <div>Streak: <strong id="stat-streak">0</strong></div>
                <div>Active days: <strong id="stat-active-days">0</strong></div>
                <div class="mini-bar-wrap" style="margin-top:10px">
                  <div class="mini-bar" id="stat-overall-bar" style="width:0%"></div>
                </div>
              </div>
            </div>

            <div class="card card-filled">
              <div class="card-body">
                <canvas id="chart-overall" height="220"></canvas>
              </div>
            </div>

            <div class="card card-filled" style="grid-column:1/-1">
              <div class="card-body">
                <canvas id="chart-courses" height="220"></canvas>
              </div>
            </div>

            <div class="card card-filled" style="grid-column:1/-1">
              <div class="card-body">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Course</th><th>Total</th><th>Done</th><th>In progress</th><th>%</th><th>Watch time</th><th>Last</th>
                    </tr>
                  </thead>
                  <tbody id="stat-course-table-body"></tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      `);

      // Bind buttons + render stats (progress.js exports init helper)
      window.PlasmaDeck?.ProgressStatsInit?.();
    }

    async function courses() {
      set(`
        <section class="view view-courses">
          <div class="page-header">
            <h1 class="page-title">Courses</h1>
            <p class="page-subtitle">Browse your catalog.</p>
          </div>

          <div class="courses-shell">
            <aside class="courses-sidebar">
              <input class="input" id="courses-search" type="search" placeholder="Search courses…" />
              <div id="courses-list" class="courses-list"></div>
            </aside>

            <main class="courses-main">
              <div id="course-detail" class="course-detail">
                <div class="card card-filled">
                  <div class="card-body">
                    Select a course on the left.
                  </div>
                </div>
              </div>

              <div class="card card-filled" style="margin-top:12px">
                <div class="card-body">
                  <div id="course-player" data-player data-player-options='{"type":"video","autoplay":false,"controls":true,"theme":"dark"}'></div>
                </div>
              </div>
            </main>
          </div>
        </section>
      `);

      // Ensure catalog loaded
      await window.DataStore?.init?.();
      const listEl = document.getElementById('courses-list');
      const searchEl = document.getElementById('courses-search');
      const detailEl = document.getElementById('course-detail');
      const playerEl = document.getElementById('course-player');
      if (!listEl || !detailEl) return;

      // Ensure player auto-inits for the inserted element
      try { window.PlasmaDeck?.Player?.init?.(); } catch { /* ignore */ }

      const allCourses = window.DataStore?.allCourses?.() ?? [];
      const allTopics = window.DataStore?.allTopics?.() ?? [];
      const topicsByCourse = allTopics.reduce((acc, t) => {
        (acc[t.courseId] = acc[t.courseId] ?? []).push(t);
        return acc;
      }, {});

      const renderCourses = (query = '') => {
        const q = query.trim().toLowerCase();
        const filtered = q
          ? allCourses.filter(c => String(c.title ?? '').toLowerCase().includes(q))
          : allCourses;
        listEl.innerHTML = filtered.map(c => {
          const count = (topicsByCourse[c.id] ?? []).length;
          return `
            <button class="course-item" data-course-id="${c.id}">
              <div class="course-item-title">${c.title}</div>
              <div class="course-item-meta">${count} topics</div>
            </button>
          `;
        }).join('') || `<div class="card card-ghost"><div class="card-body">No courses.</div></div>`;
      };

      const renderCourseDetail = async (courseId) => {
        const course = allCourses.find(c => c.id === courseId);
        const topics = (topicsByCourse[courseId] ?? []);
        if (!course) return;

        // Load progress for this course topics
        const progList = await Promise.all(topics.map(t => window.DB?.getProgress?.(t.topicId)));
        const progById = new Map(progList.filter(Boolean).map(p => [p.topicId, p]));

        detailEl.innerHTML = `
          <div class="card card-filled">
            <div class="card-body">
              <h2 style="margin:0 0 6px 0">${course.title}</h2>
              ${course.productUrl ? `<a href="${course.productUrl}" target="_blank" rel="noopener">Product page</a>` : ''}
            </div>
          </div>

          <div class="card card-filled" style="margin-top:12px">
            <div class="card-body">
              <div class="topics-list">
                ${topics.map(t => {
                  const p = progById.get(t.topicId);
                  const status = p?.status ?? 'not-started';
                  const hasVideo = (t.videos?.length ?? 0) > 0;
                  const hasPdf = (t.pdfs?.length ?? 0) > 0;
                  return `
                    <div class="topic-row" data-topic-id="${t.topicId}" data-course-id="${t.courseId}">
                      <div class="topic-title">${t.title}</div>
                      <div class="topic-meta">
                        <span class="badge">${status}</span>
                      </div>
                      <div class="topic-actions">
                        ${hasVideo ? `<button class="btn btn-ghost btn-sm" data-action="play-video">Play</button>` : ''}
                        ${hasPdf ? `<button class="btn btn-ghost btn-sm" data-action="open-pdf">PDF</button>` : ''}
                        <button class="btn btn-ghost btn-sm" data-action="toggle-done">${status === 'done' ? 'Undone' : 'Done'}</button>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
        `;
      };

      // Initial render
      renderCourses('');

      if (!listEl.dataset.pdBound) {
        listEl.dataset.pdBound = 'true';
        listEl.addEventListener('click', (e) => {
          const target = eventTargetEl(e);
          if (!target) return;
          const btn = target.closest('[data-course-id]');
          if (!btn) return;
          $$('.course-item', listEl).forEach(x => x.classList.toggle('active', x === btn));
          renderCourseDetail(btn.dataset.courseId);
        });
      }

      if (searchEl && !searchEl.dataset.pdBound) {
        searchEl.dataset.pdBound = 'true';
        searchEl.addEventListener('input', () => renderCourses(searchEl.value));
      }

      if (!detailEl.dataset.pdBound) {
        detailEl.dataset.pdBound = 'true';
        detailEl.addEventListener('click', async (e) => {
          const target = eventTargetEl(e);
          if (!target) return;
          const actionBtn = target.closest('[data-action]');
          if (!actionBtn) return;
          const row = target.closest('[data-topic-id]');
          if (!row) return;
          const topicId = row.dataset.topicId;
          const courseId = row.dataset.courseId;
          const topic = (window.DataStore?.allTopics?.() ?? []).find(t => t.topicId === topicId);
          if (!topic) return;

          const action = actionBtn.dataset.action;
          if (action === 'toggle-done') {
            const existing = await window.DB?.getProgress?.(topicId);
            const isDone = existing?.status === 'done';
            await window.DB?.saveProgress?.(topicId, courseId, {
              status: isDone ? 'not-started' : 'done',
              percent: isDone ? 0 : 100,
              updatedAt: Date.now(),
            });
            // Re-render current course
            renderCourseDetail(courseId);
            return;
          }

          if (action === 'open-pdf') {
            const url = topic.pdfs?.[0];
            if (!url) return;
            Router.navigate('#/pdf');
            // Wait a tick for the view to mount, then load
            setTimeout(() => {
              try { window.PlasmaPDFViewer?.load?.(url); } catch {}
            }, 50);
            return;
          }

          if (action === 'play-video') {
            const url = topic.videos?.[0];
            if (!url) return;
            // Ensure player exists and has an instance
            const el = playerEl;
            const inst = el?._pdPlayer;
            if (inst?.loadPlaylist) {
              inst.loadPlaylist([{
                title: topic.title,
                src: url,
                artist: topic.courseTitle ?? courseId,
                topicId,
                courseId,
              }], true);
            } else {
              // Fallback: try to init then load
              try { window.PlasmaDeck?.Player?.init?.(); } catch {}
              setTimeout(() => {
                const i2 = el?._pdPlayer;
                i2?.loadPlaylist?.([{
                  title: topic.title,
                  src: url,
                  artist: topic.courseTitle ?? courseId,
                  topicId,
                  courseId,
                }], true);
              }, 50);
            }
          }
        });
      }

      // Persist watch progress into DB as the player runs (idempotent per player element)
      if (playerEl && !playerEl.dataset.pdProgressBound) {
        playerEl.dataset.pdProgressBound = 'true';
        const inst = playerEl._pdPlayer;
        const throttleMs = 2500;
        let lastSave = 0;

        const save = async (track, { currentTime, duration, percent } = {}) => {
          const t = track ?? inst?.queue?.[inst?.trackIndex ?? 0] ?? null;
          const topicId = t?.topicId;
          const courseId = t?.courseId;
          if (!topicId || !courseId) return;

          const cur = currentTime ?? inst?.currentTime ?? 0;
          const dur = duration ?? inst?.duration ?? 0;
          const pct = percent ?? (dur > 0 ? Math.round((cur / dur) * 100) : 0);

          const status = pct >= 98 ? 'done' : (pct > 0 ? 'in-progress' : 'not-started');
          await window.DB?.saveProgress?.(topicId, courseId, {
            position: Math.max(0, cur),
            duration: Math.max(0, dur || 0),
            percent: Math.max(0, Math.min(100, pct || 0)),
            status,
            updatedAt: Date.now(),
          });
        };

        inst?.on?.('timeupdate', async (payload) => {
          const now = Date.now();
          if (now - lastSave < throttleMs) return;
          lastSave = now;
          await save(null, payload);
        });
        inst?.on?.('ended', async (track) => {
          await save(track, { currentTime: inst?.duration ?? 0, duration: inst?.duration ?? 0, percent: 100 });
        });
        inst?.on?.('trackChange', async (track) => {
          // Record a "start" touch so it shows up in activity/streaks
          await save(track, { currentTime: 0, duration: inst?.duration ?? 0, percent: 0 });
        });
      }

      // Auto-select first course
      const pendingTopicId = sessionStorage.getItem('plasma_pending_topic');
      if (pendingTopicId) sessionStorage.removeItem('plasma_pending_topic');

      const selectCourse = (courseId) => {
        const btn = listEl.querySelector(`[data-course-id="${courseId}"]`);
        if (!btn) return false;
        $$('.course-item', listEl).forEach(x => x.classList.toggle('active', x === btn));
        renderCourseDetail(courseId);
        return true;
      };

      if (pendingTopicId) {
        const t = allTopics.find(x => x.topicId === pendingTopicId);
        if (t && selectCourse(t.courseId)) {
          // Autoplay after detail is rendered
          setTimeout(() => {
            const url = t.videos?.[0];
            if (!url) return;
            const el = playerEl;
            const inst = el?._pdPlayer;
            if (inst?.loadPlaylist) {
              inst.loadPlaylist([{
                title: t.title,
                src: url,
                artist: t.courseTitle ?? t.courseId,
                topicId: t.topicId,
                courseId: t.courseId,
              }], true);
            }
          }, 120);
          return;
        }
      }

      const first = listEl.querySelector('[data-course-id]');
      if (first) {
        first.classList.add('active');
        renderCourseDetail(first.dataset.courseId);
      }
    }

    async function materials() {
      set(`
        <section class="view view-materials">
          <div class="page-header">
            <h1 class="page-title">Materials</h1>
            <p class="page-subtitle">All videos and PDFs in your catalog.</p>
          </div>
          <div class="card card-filled">
            <div class="card-body">
              <input class="input" id="materials-search" type="search" placeholder="Search topics…" />
            </div>
          </div>
          <div id="materials-pager" style="margin-top:12px"></div>
          <div id="materials-list" class="materials-list" style="margin-top:12px"></div>
        </section>
      `);

      await window.DataStore?.init?.();
      const pagerEl = document.getElementById('materials-pager');
      const listEl = document.getElementById('materials-list');
      const searchEl = document.getElementById('materials-search');
      if (!listEl) return;

      const topics = window.DataStore?.allTopics?.() ?? [];
      let state = { page: 1, perPage: 50, query: '' };
      const render = (query = state.query) => {
        const q = query.trim().toLowerCase();
        const filtered = q ? topics.filter(t => String(t.title ?? '').toLowerCase().includes(q)) : topics;
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
            try { listEl.scrollTo?.({ top: 0, behavior: 'smooth' }); } catch { listEl.scrollTop = 0; }
          },
        });

        listEl.innerHTML = slice.map(t => {
          const v = t.videos?.[0];
          const p = t.pdfs?.[0];
          return `
            <div class="topic-row" data-topic-id="${t.topicId}" data-course-id="${t.courseId}">
              <div class="topic-title">${t.title}</div>
              <div class="topic-actions">
                ${v ? `<button class="btn btn-ghost btn-sm" data-action="play-video">Play</button>` : ''}
                ${p ? `<button class="btn btn-ghost btn-sm" data-action="open-pdf">PDF</button>` : ''}
              </div>
            </div>
          `;
        }).join('');
      };

      render('');

      if (searchEl && !searchEl.dataset.pdBound) {
        searchEl.dataset.pdBound = 'true';
        searchEl.addEventListener('input', () => render(searchEl.value));
      }

      if (!listEl.dataset.pdBound) {
        listEl.dataset.pdBound = 'true';
        listEl.addEventListener('click', (e) => {
          const target = eventTargetEl(e);
          if (!target) return;
          const btn = target.closest('[data-action]');
          if (!btn) return;
          const row = target.closest('[data-topic-id]');
          if (!row) return;
          const t = topics.find(x => x.topicId === row.dataset.topicId);
          if (!t) return;
          if (btn.dataset.action === 'open-pdf') {
            const url = t.pdfs?.[0];
            if (!url) return;
            Router.navigate('#/pdf');
            setTimeout(() => { try { window.PlasmaPDFViewer?.load?.(url); } catch {} }, 50);
          }
          if (btn.dataset.action === 'play-video') {
            const url = t.videos?.[0];
            if (!url) return;
            // Jump to courses and autoplay the exact topic
            try { sessionStorage.setItem('plasma_pending_topic', t.topicId); } catch { /* ignore */ }
            Router.navigate('#/courses');
          }
        });
      }
    }

    function settings() {
      set(`
        <section class="view view-settings">
          <div class="page-header">
            <h1 class="page-title">Settings</h1>
            <p class="page-subtitle">Personalization and data tools.</p>
          </div>

          <div class="card card-filled">
            <div class="card-body">
              <div class="dashboard-grid" style="margin-bottom:12px">
                <div class="card card-gradient col-12 col-lg-6">
                  <div class="card-body">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
                      <div>
                        <div style="font-weight:800">UI font size</div>
                        <div class="text-sm" style="opacity:.7">Affects the whole app (Ctrl + / Ctrl - / Ctrl 0)</div>
                      </div>
                      <div style="display:flex;align-items:center;gap:8px">
                        <button class="btn btn-ghost btn-sm" id="btn-font-dec" aria-label="Decrease font size">A-</button>
                        <span class="badge" id="font-scale-label">100%</span>
                        <button class="btn btn-ghost btn-sm" id="btn-font-inc" aria-label="Increase font size">A+</button>
                        <button class="btn btn-ghost btn-sm" id="btn-font-reset" aria-label="Reset font size">Reset</button>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="card card-gradient col-12 col-lg-6">
                  <div class="card-body">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
                      <div>
                        <div style="font-weight:800">Density</div>
                        <div class="text-sm" style="opacity:.7">Compact / Comfortable / Spacious</div>
                      </div>
                      <select class="select input-sm" id="select-density" aria-label="UI density">
                        <option value="compact">Compact</option>
                        <option value="comfortable">Comfortable</option>
                        <option value="spacious">Spacious</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
                <button class="btn btn-ghost" id="btn-theme-toggle">Toggle theme</button>
                <button class="btn btn-ghost" id="btn-clear-data">Wipe local data</button>
                <button class="btn btn-primary" id="btn-export-json-2">Export backup JSON</button>
                <button class="btn btn-ghost" id="btn-import-json-2">Import backup JSON</button>
              </div>
              <p style="margin-top:10px;opacity:.75">
                Data is stored locally (IndexedDB). Use export/import to move it between devices.
              </p>
            </div>
          </div>
        </section>
      `);

      const themeBtn = document.getElementById('btn-theme-toggle');
      themeBtn?.addEventListener('click', () => ThemeManager.toggle?.());

      const updateFontLabel = () => {
        const el = document.getElementById('font-scale-label');
        if (!el) return;
        el.textContent = `${Math.round(FontScale.get() * 100)}%`;
      };
      updateFontLabel();
      document.getElementById('btn-font-inc')?.addEventListener('click', () => { FontScale.inc(); updateFontLabel(); });
      document.getElementById('btn-font-dec')?.addEventListener('click', () => { FontScale.dec(); updateFontLabel(); });
      document.getElementById('btn-font-reset')?.addEventListener('click', () => { FontScale.reset(); updateFontLabel(); });
      PlasmaDeck.bus.on?.('fontScale:change', updateFontLabel);

      const densitySel = document.getElementById('select-density');
      if (densitySel) {
        densitySel.value = document.documentElement.getAttribute('data-density') || Prefs.get(Prefs.KEYS.density, 'comfortable') || 'comfortable';
        densitySel.addEventListener('change', () => {
          const v = densitySel.value;
          document.documentElement.setAttribute('data-density', v);
          Prefs.set(Prefs.KEYS.density, v);
          PlasmaDeck.bus.emit('density:change', { density: v });
        });
      }

      const wipeBtn = document.getElementById('btn-clear-data');
      wipeBtn?.addEventListener('click', async () => {
        const ok = await PlasmaDeck.UI?.confirm?.('This will delete all local data. Continue?');
        if (!ok) return;
        try { await window.DB?.clearAll?.(); } catch {}
        try { localStorage.clear(); sessionStorage.clear(); } catch {}
        Toast.success('Local data cleared');
      });

      document.getElementById('btn-export-json-2')?.addEventListener('click', () => {
        try { window.ProgressStats?.exportJSON?.(); } catch { Toast.error('Export failed'); }
      });
      document.getElementById('btn-import-json-2')?.addEventListener('click', () => {
        try { window.ProgressStats?.importJSON?.(); } catch { Toast.error('Import failed'); }
      });
    }

    function help() {
      set(`
        <section class="view view-help">
          <div class="page-header">
            <div>
              <h1 class="page-title">Help</h1>
              <p class="page-subtitle">Start quickly, find your data, and keep your library portable.</p>
            </div>
            <div class="page-actions">
              <button class="btn btn-primary" id="help-backup-btn">
                <i class="fa-solid fa-file-export" aria-hidden="true"></i>
                Export backup
              </button>
              <button class="btn btn-ghost" id="help-shortcuts-btn">
                <i class="fa-solid fa-keyboard" aria-hidden="true"></i>
                Shortcuts
              </button>
            </div>
          </div>

          <div class="help-grid">
            <section class="card card-filled help-card help-card-primary">
              <div class="card-body">
                <h2 class="help-card-title">First-run checklist</h2>
                <ol class="help-checklist">
                  <li><span aria-hidden="true">1</span><p>Start with <code>npm start</code> or the Windows launcher, then open <code>http://localhost:5173/</code>.</p></li>
                  <li><span aria-hidden="true">2</span><p>Use Courses or Materials to open content from the active catalog.</p></li>
                  <li><span aria-hidden="true">3</span><p>Create a note, try the PDF view, and open Studio for canvas work.</p></li>
                  <li><span aria-hidden="true">4</span><p>Export a backup before switching ports, browsers, profiles, or catalogs.</p></li>
                </ol>
              </div>
            </section>

            <section class="card card-filled help-card">
              <div class="card-body">
                <h2 class="help-card-title">Where your data lives</h2>
                <p>PlasmaDeck stores your data in this browser profile for this exact origin. Changing from <code>localhost:5173</code> to another port creates a different storage bucket.</p>
                <dl class="help-facts">
                  <div><dt>Progress</dt><dd>IndexedDB</dd></div>
                  <div><dt>Preferences</dt><dd>localStorage</dd></div>
                  <div><dt>Backups</dt><dd>JSON export files</dd></div>
                  <div><dt>Current origin</dt><dd id="help-origin"></dd></div>
                </dl>
              </div>
            </section>

            <section class="card card-filled help-card">
              <div class="card-body">
                <h2 class="help-card-title">Quick links</h2>
                <div class="help-links" aria-label="Help links">
                  <a href="docs/getting-started.md">Getting started</a>
                  <a href="docs/content-and-catalog.md">Content and catalog</a>
                  <a href="docs/backup-restore.md">Backup and restore</a>
                  <a href="docs/troubleshooting.md">Troubleshooting</a>
                  <a href="docs/roadmap.md">Roadmap</a>
                </div>
              </div>
            </section>

            <section class="card card-filled help-card">
              <div class="card-body">
                <h2 class="help-card-title">Common recovery moves</h2>
                <div class="help-recovery-list">
                  <div>
                    <strong>Blank or stuck loading?</strong>
                    <p>Run <code>npm run build</code>, hard refresh, then open <code>?debug=1</code> if it still stalls.</p>
                  </div>
                  <div>
                    <strong>Data looks missing?</strong>
                    <p>Check that you are using the same browser, profile, hostname, and port as before.</p>
                  </div>
                  <div>
                    <strong>Offline app seems stale?</strong>
                    <p>Run <code>npm run build:sw</code>, reload once online, or clear the service worker in browser devtools.</p>
                  </div>
                </div>
              </div>
            </section>

            <section class="card card-filled help-card">
              <div class="card-body">
                <h2 class="help-card-title">Keyboard essentials</h2>
                <table class="shortcuts-table help-shortcuts">
                  <tbody>
                    <tr><td><kbd>Ctrl+K</kbd></td><td>Command palette</td></tr>
                    <tr><td><kbd>Ctrl+/</kbd></td><td>All shortcuts</td></tr>
                    <tr><td><kbd>Ctrl+B</kbd></td><td>Toggle sidebar</td></tr>
                    <tr><td><kbd>Ctrl+=</kbd></td><td>Increase UI font size</td></tr>
                    <tr><td><kbd>Ctrl+-</kbd></td><td>Decrease UI font size</td></tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>
      `);

      const origin = document.getElementById('help-origin');
      if (origin) origin.textContent = window.location.origin || 'Current browser origin';

      document.getElementById('help-backup-btn')?.addEventListener('click', () => {
        try { window.ProgressStats?.exportJSON?.(); }
        catch { Toast.error('Export failed'); }
      });
      document.getElementById('help-shortcuts-btn')?.addEventListener('click', () => {
        KeyboardShortcuts._showHelp();
      });
    }

    function myCourses() {
      set(`
        <section class="view view-my-courses">
          <div class="page-header">
            <h1 class="page-title">My Courses</h1>
            <p class="page-subtitle">Your custom course drafts (coming next).</p>
          </div>
          <div class="card card-filled">
            <div class="card-body">
              <p>This view is now live and will store custom courses in IndexedDB in the next iteration.</p>
            </div>
          </div>
        </section>
      `);
    }

    function tags() {
      set(`
        <section class="view view-tags">
          <div class="page-header">
            <h1 class="page-title">Tags</h1>
            <p class="page-subtitle">Browse content by tag.</p>
          </div>
          <div class="card card-filled">
            <div class="card-body">
              <p>Tag browsing will be backed by catalog + note tags.</p>
            </div>
          </div>
        </section>
      `);
    }

    function playlists() {
      set(`
        <section class="view view-playlists">
          <div class="page-header">
            <h1 class="page-title">Playlists</h1>
            <p class="page-subtitle">Manage playback queues.</p>
          </div>
          <div class="card card-filled">
            <div class="card-body">
              <p>Playlist management will be wired to the MediaPlayer queue.</p>
            </div>
          </div>
        </section>
      `);
    }

    function bookmarks() {
      set(`
        <section class="view view-bookmarks">
          <div class="page-header">
            <h1 class="page-title">Bookmarks</h1>
            <p class="page-subtitle">Quick links into your study materials.</p>
          </div>
          <div class="card card-filled">
            <div class="card-body">
              <p>Bookmarks will unify PDF pages, video timestamps, and note anchors.</p>
            </div>
          </div>
        </section>
      `);
    }

    function achievements() {
      set(`
        <section class="view view-achievements">
          <div class="page-header">
            <h1 class="page-title">Achievements</h1>
            <p class="page-subtitle">Milestones based on your progress.</p>
          </div>
          <div class="card card-filled">
            <div class="card-body">
              <p>Achievements will be computed from your progress history.</p>
            </div>
          </div>
        </section>
      `);
    }

    function notFound(hash) {
      set(`
        <section class="view view-notfound">
          <div class="page-header">
            <h1 class="page-title">Not found</h1>
            <p class="page-subtitle">No view for <code>${String(hash ?? '')}</code></p>
          </div>
        </section>
      `);
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
        const combo = [
          e.ctrlKey  ? 'ctrl'  : '',
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
      const rows = this._shortcuts.map(s =>
        `<tr><td><kbd>${s.combo}</kbd></td><td>${s.description}</td></tr>`
      ).join('');

      Modal.create({
        title: '⌨️ Keyboard Shortcuts',
        body:  `<table class="shortcuts-table"><tbody>${rows}</tbody></table>`,
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
            PlasmaDeck.bus.emit('avatar:change', { file, dataUrl: ev.target.result });
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
            PlasmaDeck.bus.emit('settings:save', { data });
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
        deleteBtn.addEventListener('click', () => {
          Modal.confirm({
            title:     '⚠️ Delete Account',
            message:   'This action is <strong>irreversible</strong>. All your data will be permanently deleted. Are you absolutely sure?',
            onConfirm: () => {
              PlasmaDeck.bus.emit('account:delete');
              Toast.error('Account deletion initiated.');
            },
          });
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
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
            img.classList.add('loaded');
          }
          obs.unobserve(img);
        });
      }, { rootMargin: '0px 0px 200px 0px' });

      $$('img[data-src]').forEach(img => observer.observe(img));

      // Expose so dynamically added images can be observed
      PlasmaDeck.lazy = img => observer.observe(img);
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
      const url     = `${this._baseURL}${path}`;
      const options = {
        method,
        headers: { ...this._headers, ...opts.headers },
        signal:  opts.signal,
      };
      if (body) options.body = JSON.stringify(body);

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

      el.innerHTML = '';
      el.appendChild(grid);
    }
  };


  // ──────────────────────────────────────────────────────────
  // 32. INITIALIZATION
  // ──────────────────────────────────────────────────────────

  function initEnhancements() {
    // Breadcrumb updates from router events
    const breadcrumbList = document.getElementById('breadcrumb-list');
    const routeTitle = (hash) => ({
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
      '#/achievements': 'Achievements',
      '#/settings': 'Settings',
    }[hash] ?? 'PlasmaDeck');

    const escHtml = (str) => String(str).replace(
      /[&<>"']/g,
      m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])
    );

    if (breadcrumbList) {
      PlasmaDeck.bus.on?.('route:change', ({ hash }) => {
        breadcrumbList.innerHTML = `
          <li class="breadcrumb-item"><a href="#/home" class="breadcrumb-link">Home</a></li>
          <li class="breadcrumb-item"><span class="breadcrumb-current">${escHtml(routeTitle(hash))}</span></li>
        `;
      });
    }

    // Storage usage meter
    const storageBar = document.getElementById('storage-bar');
    const storageLabel = document.getElementById('storage-label');
    const updateStorage = async () => {
      if (!storageBar || !storageLabel || !navigator.storage?.estimate) return;
      try {
        const est = await navigator.storage.estimate();
        const used = est.usage ?? 0;
        const quota = est.quota ?? 0;
        const pct = quota ? Math.min(100, Math.round((used / quota) * 100)) : 0;
        storageBar.style.width = `${pct}%`;
        storageLabel.textContent = quota
          ? `${(used / (1024 * 1024)).toFixed(1)} MB / ${(quota / (1024 * 1024)).toFixed(0)} MB`
          : '—';
        const wrap = storageBar.closest('[role="progressbar"]');
        wrap?.setAttribute?.('aria-valuenow', String(pct));
      } catch {
        storageLabel.textContent = '—';
      }
    };
    updateStorage();
    setInterval(updateStorage, 30_000);

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
        const t = Toast.show?.({
          type: 'info',
          message: 'Update available. Reload to apply?',
          action: `<div style="margin-top:8px"><button class="btn btn-primary btn-sm" data-sw-reload>Reload</button></div>`,
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
      .on('#/courses', () => Views.courses())
      .on('#/notes', () => Views.notes())
      .on('#/pdf', () => Views.pdf())
      .on('#/studio', () => Views.studio())
      .on('#/progress', () => Views.progress())
      .on('#/help', () => Views.help())
      .on('#/settings', () => Views.settings())
      .on('#/my-courses', () => Views.myCourses())
      .on('#/materials', () => Views.materials())
      .on('#/tags', () => Views.tags())
      .on('#/playlists', () => Views.playlists())
      .on('#/bookmarks', () => Views.bookmarks())
      .on('#/achievements', () => Views.achievements());

    Router.init();

    // Expose utilities globally
    PlasmaDeck.Toast      = Toast;
    PlasmaDeck.Modal      = Modal;
    PlasmaDeck.Drawer     = Drawer;
    PlasmaDeck.Dropdown   = Dropdown;
    PlasmaDeck.Progress   = Progress;
    PlasmaDeck.API        = API;
    PlasmaDeck.Router     = Router;
    // Core preferences + theming (used by ES modules in src/)
    PlasmaDeck.ThemeManager = ThemeManager;
    PlasmaDeck.Prefs        = Prefs;
    PlasmaDeck.FontScale    = FontScale;
    PlasmaDeck.KeyboardShortcuts = KeyboardShortcuts;
    PlasmaDeck.Heatmap    = Heatmap;
    PlasmaDeck.Skeleton   = Skeleton;
    PlasmaDeck.InfiniteScroll = InfiniteScroll;
    PlasmaDeck.Views      = Views;

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
      const remove = () => { try { splash.remove(); } catch (_) {} };
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
