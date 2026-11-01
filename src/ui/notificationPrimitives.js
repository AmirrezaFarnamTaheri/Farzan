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
