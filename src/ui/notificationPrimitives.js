/** Shared notification primitives used by the app shell and route modules. */
import { $, uid, eventTargetEl } from '../lib/dom.js';

const escapeHtmlText = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

export function createToast({ OpenCourseDeck, createElement, spriteIcon }) {
  if (!OpenCourseDeck || typeof createElement !== 'function' || typeof spriteIcon !== 'function') {
    throw new TypeError('Toast requires an app owner and DOM helpers');
  }
  return {
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
      const iconId = { info: 'info', success: 'circle-check', warning: 'alert-triangle', error: 'alert-circle' }[type] ?? 'info';
      const icon = spriteIcon(iconId);

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
        toast.appendChild(createElement('button', { class: 'toast-close', type: 'button', 'aria-label': 'Dismiss notification' }, spriteIcon('close')));
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
      return escapeHtmlText(str);
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


}

export function createTooltips({ createElement }) {
  if (typeof createElement !== 'function') throw new TypeError('Tooltips require DOM creator');
  return {
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


}

/** Legacy UI Tooltip: keeps the public UI.Tooltip contract and ARIA linkage. */
export function createUiTooltip() {
  return {
      _tooltip: null,
      _anchor: null,
      _previousDescription: null,
      _initialized: false,
      _listeners: [],

      init() {
        if (this._initialized) {
          // Route replacements may remove this persistent overlay. Reattach
          // without registering a second group of global event listeners.
          if (this._tooltip && !this._tooltip.isConnected) document.body.appendChild(this._tooltip);
          return;
        }
        // The UI module can be reloaded by a test/HMR or an independent
        // initializer. There must still be just one document-wide owner,
        // with its original keyboard listeners and ARIA link fully removed.
        const previous = document.__farzanUiTooltipOwner;
        if (previous && previous !== this) previous.destroy?.();
        document.__farzanUiTooltipOwner = this;
        this._initialized = true;
        this._tooltip = document.createElement('div');
        this._tooltip.className = 'tooltip';
        this._tooltip.id = 'ocd-ui-tooltip';
        this._tooltip.setAttribute('role', 'tooltip');
        document.body.appendChild(this._tooltip);
        this._observer = new MutationObserver(() => {
          if (this._anchor && !this._anchor.isConnected) this.hide();
        });
        this._observer.observe(document.body, { childList: true, subtree: true });

        const anchorOf = target => target instanceof Element
          ? target.closest('[data-tooltip]') : null;
        const listen = (name, callback) => {
          document.addEventListener(name, callback);
          this._listeners.push([name, callback]);
        };
        listen('mouseover', event => {
          const el = anchorOf(event.target);
          if (el) this.show(el);
        });
        listen('mouseout', event => {
          const el = anchorOf(event.target);
          if (el && el === this._anchor) this.hide();
        });
        listen('focusin', event => {
          const el = anchorOf(event.target);
          if (el) this.show(el);
        });
        listen('focusout', event => {
          if (this._anchor && event.target === this._anchor) this.hide();
        });
        listen('keydown', event => {
          if (event.key === 'Escape' && this._anchor) this.hide();
        });
      },

      show(el) {
        const text = el?.dataset?.tooltip;
        if (!text || !this._tooltip) return;
        if (this._anchor && this._anchor !== el) this.hide();
        if (this._anchor !== el) {
          this._anchor = el;
          this._previousDescription = el.getAttribute('aria-describedby');
        }
        this._tooltip.textContent = text;
        this._tooltip.classList.add('visible');
        const existing = this._previousDescription || '';
        const ids = existing.split(/\s+/).filter(Boolean);
        if (!ids.includes(this._tooltip.id)) ids.push(this._tooltip.id);
        el.setAttribute('aria-describedby', ids.join(' '));

        const rect = el.getBoundingClientRect();
        const tip  = this._tooltip.getBoundingClientRect();
        this._tooltip.style.left = `${rect.left + rect.width / 2 - tip.width / 2}px`;
        this._tooltip.style.top = `${rect.top - tip.height - 8}px`;
      },

      hide() {
        this._tooltip?.classList.remove('visible');
        if (this._anchor) {
          if (this._previousDescription == null) this._anchor.removeAttribute('aria-describedby');
          else this._anchor.setAttribute('aria-describedby', this._previousDescription);
        }
        this._anchor = null;
        this._previousDescription = null;
      },

      destroy() {
        this.hide();
        this._observer?.disconnect?.();
        for (const [name, callback] of this._listeners) {
          document.removeEventListener(name, callback);
        }
        this._listeners = [];
        this._tooltip?.remove();
        this._tooltip = null;
        this._initialized = false;
        if (document.__farzanUiTooltipOwner === this) {
          delete document.__farzanUiTooltipOwner;
        }
      }
    };


}
