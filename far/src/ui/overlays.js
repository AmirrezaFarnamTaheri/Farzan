
import {
  $, $$, uid, createElement, appendContent, trapFocus, setAppInert, restoreFocus, eventTargetEl
} from '../lib/dom.js';

const config = {
  animationDuration: 300
};

export const Modal = {
  _cleanupFns: new WeakMap(),
  _previousFocus: new WeakMap(),

  open(target) {
    const modal = typeof target === 'string'
      ? document.getElementById(target)
      : target;
    if (!modal) return;
    if (modal.classList.contains('active')) return;

    let backdrop = $('.modal-backdrop');
    if (!backdrop) {
      backdrop = createElement('div', { class: 'modal-backdrop' });
      document.body.appendChild(backdrop);
      backdrop.addEventListener('click', () => this.closeAll());
    }

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('tabindex', '-1');

    requestAnimationFrame(() => {
      backdrop.classList.add('active');
      modal.classList.add('active');
    });

    document.body.style.overflow = 'hidden';
    this._previousFocus.set(modal, document.activeElement);
    setAppInert(true);
    this._cleanupFns.set(modal, trapFocus(modal));

    window.PlasmaDeck?.bus?.emit('modal:open', { modal });
  },

  close(target) {
    const modal = typeof target === 'string'
      ? document.getElementById(target)
      : target;
    if (!modal) return;
    if (!modal.classList.contains('active')) return;

    modal.classList.remove('active');
    const backdrop = $('.modal-backdrop');
    if (backdrop) backdrop.classList.remove('active');

    setTimeout(() => {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      modal.removeAttribute('aria-modal');
      if (backdrop && !$('.modal-container.active')) backdrop.remove();
    }, config.animationDuration);

    document.body.style.overflow = '';
    const cleanup = this._cleanupFns.get(modal);
    if (cleanup) { cleanup(); this._cleanupFns.delete(modal); }
    setAppInert(false);
    restoreFocus(this._previousFocus.get(modal));
    this._previousFocus.delete(modal);

    modal.dispatchEvent(new CustomEvent('modal:close', { detail: { modal } }));
    window.PlasmaDeck?.bus?.emit('modal:close', { modal });
  },

  closeAll() {
    $$('.modal-container.active').forEach(m => this.close(m));
  },

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

    window.PlasmaDeck?.bus?.on('modal:close', ({ modal: m }) => {
      if (m === modal) setTimeout(() => modal.remove(), 400);
    });

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
      window.PlasmaDeck?.bus?.once('modal:close', ({ modal: closed }) => {
        if (closed === modal) settle(false);
      });
      footer.append(cancelBtn, confirmBtn);
    });
  },

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

export const Drawer = {
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

    window.PlasmaDeck?.bus?.emit('drawer:open', { drawer });
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
    }, config.animationDuration);

    const backdrop = $('.drawer-backdrop');
    if (backdrop) {
      backdrop.classList.remove('open');
      setTimeout(() => backdrop.remove(), config.animationDuration);
    }

    document.body.style.overflow = '';
    const cleanup = this._cleanupFns.get(drawer);
    if (cleanup) { cleanup(); this._cleanupFns.delete(drawer); }
    setAppInert(false);
    restoreFocus(this._previousFocus.get(drawer));
    this._previousFocus.delete(drawer);
    window.PlasmaDeck?.bus?.emit('drawer:close', { drawer });
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

