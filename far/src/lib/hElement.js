/**
 * HElement — fluent DOM wrapper based on wolf-table element.ts + x-spreadsheet helpers.
 * Usage: h('div', '.my-class', { id: 'foo' }).css({ color: 'red' }).append(child)
 */

const isStr = (v) => typeof v === 'string';
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Node);

function sanitizeHtml(value) {
  const raw = String(value ?? '');
  const sanitizer = globalThis.window?.DOMPurify?.sanitize;
  if (typeof sanitizer !== 'function') {
    throw new Error('DOMPurify must be available before inserting HTML');
  }
  return sanitizer(raw);
}

function parseTag(tag) {
  let t = tag, id = '', classes = [];
  const idMatch = t.match(/^([^.#]+)#([^.]+)/);
  if (idMatch) { t = idMatch[1]; id = idMatch[2]; }
  const classMatches = t.match(/\.[^.#]+/g);
  if (classMatches) {
    t = t.replace(/\.[^.#]+/g, '');
    classes = classMatches.map(c => c.slice(1));
  }
  return { tag: t || 'div', id, classes };
}

export class HElement {
  constructor(tag, ...attrsOrChildren) {
    const { tag: t, id, classes } = parseTag(tag);
    this.el = document.createElement(t);
    if (id) this.el.id = id;
    for (const cls of classes) this.el.classList.add(cls);

    for (const arg of attrsOrChildren) {
      if (arg == null) continue;
      if (isStr(arg)) {
        if (arg.startsWith('.')) { this.el.classList.add(arg.slice(1)); }
        else if (arg.startsWith('#')) { this.el.id = arg.slice(1); }
        else { this.el.appendChild(document.createTextNode(arg)); }
      } else if (arg instanceof Node) {
        this.el.appendChild(arg);
      } else if (Array.isArray(arg)) {
        this.append(...arg);
      } else if (isObj(arg)) {
        this.attrs(arg);
      }
    }
  }

  css(obj) {
    Object.assign(this.el.style, obj);
    return this;
  }

  attr(key, value) {
    if (value == null) { this.el.removeAttribute(key); }
    else { this.el.setAttribute(key, String(value)); }
    return this;
  }

  attrs(obj) {
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'class' || k === 'className') {
        this.el.className = v;
      } else if (k === 'style' && isObj(v)) {
        Object.assign(this.el.style, v);
      } else if (k.startsWith('data-')) {
        this.el.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v);
      } else if (k === 'textContent') {
        this.el.textContent = String(v);
      } else if (k === 'innerHTML') {
        this.el.innerHTML = sanitizeHtml(v);
      } else if (v === true) {
        this.el.setAttribute(k, '');
      } else if (v === false || v == null) {
        this.el.removeAttribute(k);
      } else {
        this.el.setAttribute(k, String(v));
      }
    }
    return this;
  }

  on(event, handler, options) {
    this.el.addEventListener(event, handler, options);
    return this;
  }

  off(event, handler, options) {
    this.el.removeEventListener(event, handler, options);
    return this;
  }

  append(...children) {
    const frag = document.createDocumentFragment();
    for (const child of children) {
      if (child == null) continue;
      if (child instanceof HElement) frag.appendChild(child.el);
      else if (child instanceof Node) frag.appendChild(child);
      else frag.appendChild(document.createTextNode(String(child)));
    }
    this.el.appendChild(frag);
    return this;
  }

  prepend(...children) {
    const frag = document.createDocumentFragment();
    for (const child of children) {
      if (child == null) continue;
      if (child instanceof HElement) frag.appendChild(child.el);
      else if (child instanceof Node) frag.appendChild(child);
      else frag.appendChild(document.createTextNode(String(child)));
    }
    if (this.el.firstChild) this.el.insertBefore(frag, this.el.firstChild);
    else this.el.appendChild(frag);
    return this;
  }

  text(str) {
    this.el.textContent = String(str ?? '');
    return this;
  }

  html(str) {
    this.el.innerHTML = sanitizeHtml(str);
    return this;
  }

  addClass(cls) {
    if (cls) this.el.classList.add(...cls.split(/\s+/).filter(Boolean));
    return this;
  }

  removeClass(cls) {
    if (cls) this.el.classList.remove(...cls.split(/\s+/).filter(Boolean));
    return this;
  }

  toggleClass(cls, force) {
    if (cls) {
      for (const c of cls.split(/\s+/).filter(Boolean)) {
        this.el.classList.toggle(c, force);
      }
    }
    return this;
  }

  hasClass(cls) {
    return this.el.classList.contains(cls);
  }

  active(bool) {
    this.el.classList.toggle('active', bool);
    return this;
  }

  checked(bool) {
    if (bool) this.el.setAttribute('checked', '');
    else this.el.removeAttribute('checked');
    return this;
  }

  disabled(bool) {
    if (bool) this.el.setAttribute('disabled', '');
    else this.el.removeAttribute('disabled');
    return this;
  }

  show() {
    this.el.style.display = '';
    return this;
  }

  hide() {
    this.el.style.display = 'none';
    return this;
  }

  remove() {
    this.el.remove();
  }

  find(sel) {
    const found = this.el.querySelector(sel);
    return found ? new HElement('__fragment__')._replaceEl(found) : null;
  }

  findAll(sel) {
    return [...this.el.querySelectorAll(sel)].map(el => new HElement('__fragment__')._replaceEl(el));
  }

  closest(sel) {
    const found = this.el.closest(sel);
    return found ? new HElement('__fragment__')._replaceEl(found) : null;
  }

  data(key, value) {
    if (value === undefined) return this.el.dataset[key];
    this.el.dataset[key] = String(value);
    return this;
  }

  rect() {
    return this.el.getBoundingClientRect();
  }

  _replaceEl(el) {
    this.el = el;
    return this;
  }
}

export function h(tag, ...attrsOrChildren) {
  return new HElement(tag, ...attrsOrChildren);
}
