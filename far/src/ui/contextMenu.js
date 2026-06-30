/**
 * ContextMenu — data-driven context menu with keyboard navigation.
 * Based on x-spreadsheet contextmenu pattern.
 * Position-aware (flips near edge), click-outside to close, Shift+F10 trigger.
 */

const MENU_CLASS = 'pd-context-menu';
const ITEM_CLASS = 'pd-context-item';
const DIVIDER_CLASS = 'pd-context-divider';
const ACTIVE_CLASS = 'active';

let _menuEl = null;
let _activeItems = [];
let _focusIdx = -1;
let _onSelect = null;
let _outsideHandler = null;
let _keyHandler = null;

function createMenu() {
  if (_menuEl) return _menuEl;
  _menuEl = document.createElement('div');
  _menuEl.className = MENU_CLASS;
  _menuEl.setAttribute('role', 'menu');
  _menuEl.setAttribute('aria-hidden', 'true');
  _menuEl.style.cssText = 'position:fixed;z-index:9999;min-width:180px;max-width:320px;background:var(--surface,#1e1e2e);border:1px solid var(--border,#334155);border-radius:8px;padding:4px 0;box-shadow:0 8px 24px rgba(0,0,0,0.4);display:none;';
  document.body.appendChild(_menuEl);
  return _menuEl;
}

function renderItems(items) {
  const el = createMenu();
  el.replaceChildren();
  _activeItems = [];
  _focusIdx = -1;

  for (const item of items) {
    if (item.divider) {
      const div = document.createElement('div');
      div.className = DIVIDER_CLASS;
      div.style.cssText = 'height:1px;background:var(--border,#334155);margin:4px 8px;';
      el.appendChild(div);
      continue;
    }

    const btn = document.createElement('button');
    btn.className = ITEM_CLASS;
    btn.type = 'button';
    btn.setAttribute('role', 'menuitem');
    btn.dataset.key = item.key || '';

    btn.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;padding:6px 12px;border:none;background:none;color:var(--text,#e2e8f0);font:inherit;font-size:13px;cursor:pointer;text-align:left;white-space:nowrap;';

    if (item.icon) {
      const icon = document.createElement('span');
      icon.className = 'pd-context-icon';
      icon.style.cssText = 'width:16px;text-align:center;flex-shrink:0;';
      icon.textContent = item.icon;
      btn.appendChild(icon);
    }

    const label = document.createElement('span');
    label.className = 'pd-context-label';
    label.style.flex = '1';
    label.textContent = item.label || item.title || item.key || '';
    btn.appendChild(label);

    if (item.shortcut) {
      const shortcut = document.createElement('span');
      shortcut.className = 'pd-context-shortcut';
      shortcut.style.cssText = 'color:var(--text-muted,#64748b);font-size:11px;flex-shrink:0;';
      shortcut.textContent = item.shortcut;
      btn.appendChild(shortcut);
    }

    if (item.disabled) {
      btn.disabled = true;
      btn.style.opacity = '0.4';
      btn.style.cursor = 'default';
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!item.disabled) {
        hide();
        _onSelect?.(item.key || item.title || '', item);
      }
    });

    btn.addEventListener('mouseenter', () => {
      setFocus(_activeItems.indexOf(btn));
    });

    el.appendChild(btn);
    if (!item.disabled) _activeItems.push(btn);
  }
}

function setFocus(idx) {
  if (_focusIdx >= 0 && _activeItems[_focusIdx]) {
    _activeItems[_focusIdx].classList.remove(ACTIVE_CLASS);
    _activeItems[_focusIdx].style.background = '';
  }
  _focusIdx = Math.max(0, Math.min(idx, _activeItems.length - 1));
  const el = _activeItems[_focusIdx];
  if (el) {
    el.classList.add(ACTIVE_CLASS);
    el.style.background = 'var(--accent-bg,rgba(99,102,241,0.15))';
    el.focus();
  }
}

function handleKey(e) {
  if (!_menuEl || _menuEl.style.display === 'none') return;
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      setFocus(_focusIdx + 1);
      break;
    case 'ArrowUp':
      e.preventDefault();
      setFocus(_focusIdx - 1);
      break;
    case 'Enter':
    case ' ':
      e.preventDefault();
      if (_activeItems[_focusIdx]) _activeItems[_focusIdx].click();
      break;
    case 'Escape':
      e.preventDefault();
      hide();
      break;
    case 'Tab':
      hide();
      break;
  }
}

/**
 * Show the context menu at (x, y) with given items.
 * @param {Array<{key?:string, title?:string, label?:string, shortcut?:string, icon?:string, divider?:boolean, disabled?:boolean}>} items
 * @param {number} x
 * @param {number} y
 * @param {function} onSelect — called with (key, item)
 */
export function show(items, x, y, onSelect) {
  _onSelect = onSelect || null;
  renderItems(items);

  const el = createMenu();
  el.style.display = 'block';
  el.setAttribute('aria-hidden', 'false');

  // Position with edge-flip
  requestAnimationFrame(() => {
    const rect = el.getBoundingClientRect();
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    let left = x;
    let top = y;
    if (x + rect.width > vpW) left = Math.max(0, vpW - rect.width - 8);
    if (y + rect.height > vpH) top = Math.max(0, vpH - rect.height - 8);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    if (_activeItems.length) setFocus(0);
  });

  // Click outside to close
  if (_outsideHandler) {
    document.removeEventListener('mousedown', _outsideHandler);
    _outsideHandler = null;
  }
  setTimeout(() => {
    _outsideHandler = (e) => {
      if (!el.contains(e.target)) hide();
    };
    document.addEventListener('mousedown', _outsideHandler, { once: true });
  }, 0);

  if (_keyHandler) {
    document.removeEventListener('keydown', _keyHandler);
    _keyHandler = null;
  }
  _keyHandler = handleKey;
  document.addEventListener('keydown', _keyHandler);
}

/**
 * Hide the context menu.
 */
export function hide() {
  if (_menuEl) {
    _menuEl.style.display = 'none';
    _menuEl.setAttribute('aria-hidden', 'true');
  }
  if (_outsideHandler) {
    document.removeEventListener('mousedown', _outsideHandler);
    _outsideHandler = null;
  }
  if (_keyHandler) {
    document.removeEventListener('keydown', _keyHandler);
    _keyHandler = null;
  }
  _activeItems = [];
  _focusIdx = -1;
  _onSelect = null;
}

/**
 * Bind Shift+F10 keyboard trigger.
 * @param {HTMLElement} [root=document]
 */
export function bindKeyboardTrigger(root = document) {
  root.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.key === 'F10') {
      e.preventDefault();
      const target = e.target;
      const rect = target.getBoundingClientRect?.();
      if (rect) {
        target.dispatchEvent(new MouseEvent('contextmenu', {
          clientX: rect.left + 8,
          clientY: rect.top + 8,
          bubbles: true,
        }));
      }
    }
  });
}

if (typeof window !== 'undefined') {
  window.OpenCourseDeck = window.OpenCourseDeck ?? {};
  window.OpenCourseDeck.ContextMenu = { show, hide, bindKeyboardTrigger };
}
