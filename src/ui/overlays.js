// The app shell singleton is accessed lazily so this module stays import-order free.
const shell = () => window.OpenCourseDeck ?? {};

/**
 * Overlay primitives shared across route views and core modules.
 * Extracted verbatim from the app shell so src/core modules can compose
 * dialogs without importing the whole IIFE shell.
 */
import { $, $$, appendContent, createElement, eventTargetEl, restoreFocus, setAppInert, trapFocus, uid } from '../lib/dom.js';

export const Modal = {
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

      // Give the dialog an accessible name. Without one, a screen reader
      // announces only "dialog" on open and the user has to explore the
      // subtree to learn what it is -- WCAG 4.1.2. Done here rather than in
      // create() so modals declared in static markup are covered too. An
      // author-supplied aria-label or aria-labelledby always wins.
      if (!modal.hasAttribute('aria-label') && !modal.hasAttribute('aria-labelledby')) {
        const titleEl = modal.querySelector('.modal-title');
        if (titleEl) {
          if (!titleEl.id) titleEl.id = uid('modal-title');
          modal.setAttribute('aria-labelledby', titleEl.id);
        } else if (opts.label) {
          modal.setAttribute('aria-label', String(opts.label));
        }
      }

      requestAnimationFrame(() => {
        backdrop.classList.add('open');
        modal.classList.add('open');
      });

      document.body.style.overflow = 'hidden';
      (shell().state?.openModals ?? []).push(modal);
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
        const stack = shell().state?.openModals ?? [];
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

      (window.OpenCourseDeck?.bus)?.emit('modal:open', { modal, opts });
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
      }, shell().config?.animationDuration ?? 0);
      this._teardownTimers.set(modal, teardown);

      const stackNow = shell().state?.openModals;
      if (stackNow) shell().state.openModals = stackNow.filter(m => m !== modal);

      if (!stackNow || !stackNow.length) {
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
      (window.OpenCourseDeck?.bus)?.emit('modal:close', { modal });
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
        (window.OpenCourseDeck?.bus)?.off('modal:close', onModalClose);
        setTimeout(() => modal.remove(), 400);
      };
      (window.OpenCourseDeck?.bus)?.on('modal:close', onModalClose);

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
          (window.OpenCourseDeck?.bus)?.off('modal:close', onAnyClose);
          settle(false);
        };
        (window.OpenCourseDeck?.bus)?.on('modal:close', onAnyClose);
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
