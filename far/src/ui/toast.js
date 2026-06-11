
import { $, $$, uid, createElement, appendContent, eventTargetEl } from '../lib/dom.js';

export const Toast = {
  _containers: {},

  init() {
    // No-op for now, everything is programmatic
  },

  show({
    message = '',
    title = '',
    type = 'info',
    duration = 4000,
    action = null,
    position = 'top-right',
  } = {}) {
    const container = this._getContainer(position);
    const toast = createElement('div', {
      class: `toast toast-${type}`,
      role: 'alert',
      'aria-live': 'polite',
    });

    const iconEl = createElement('div', { class: 'toast-icon' });
    iconEl.textContent = { info: '??', success: '?', warning: '??', error: '?' }[type] ?? '??';

    const content = createElement('div', { class: 'toast-content' });
    if (title) content.appendChild(createElement('div', { class: 'toast-title' }, title));
    content.appendChild(createElement('div', { class: 'toast-message' }, message));
    this._appendAction(content, action);
    toast.append(iconEl, content);

    if (duration === 0 || duration > 10000) {
      toast.appendChild(createElement('button', { class: 'toast-close', 'aria-label': 'Dismiss notification' }, '×'));
    }
    if (duration > 0) {
      toast.appendChild(createElement('div', { class: 'toast-timer' }));
    }

    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('active'));

    const dismiss = () => {
      toast.classList.remove('active');
      setTimeout(() => toast.remove(), 400);
    };

    if (duration > 0) {
      const timer = toast.querySelector('.toast-timer');
      if (timer) timer.style.animationDuration = `${duration}ms`;
      setTimeout(dismiss, duration);
    }

    toast.querySelector('.toast-close')?.addEventListener('click', dismiss);

    return toast;
  },

  info(msg, title, opts)    { return this.show({ message: msg, title, type: 'info',    ...opts }); },
  success(msg, title, opts) { return this.show({ message: msg, title, type: 'success', ...opts }); },
  warning(msg, title, opts) { return this.show({ message: msg, title, type: 'warning', ...opts }); },
  error(msg, title, opts)   { return this.show({ message: msg, title, type: 'error',   ...opts }); },

  _getContainer(position) {
    if (this._containers[position]) return this._containers[position];
    let container = document.querySelector(`.toast-container.${position}`);
    if (!container) {
      container = createElement('div', { class: `toast-container ${position}` });
      document.body.appendChild(container);
    }
    this._containers[position] = container;
    return container;
  },

  _appendAction(parent, action) {
    if (!action) return;
    const wrap = createElement('div', { class: 'toast-action' });
    const append = (item) => {
      if (item instanceof Node) wrap.appendChild(item);
      else wrap.appendChild(document.createTextNode(String(item)));
    };
    if (Array.isArray(action)) action.forEach(append);
    else append(action);
    parent.appendChild(wrap);
  },
};

