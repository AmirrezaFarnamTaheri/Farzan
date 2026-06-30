/**
 * HElement — fluent DOM wrapper based on wolf-table element.ts + x-spreadsheet helpers.
 * Usage: h('div', '.my-class', { id: 'foo' }).css({ color: 'red' }).append(child)
 */

const isStr = (v) => typeof v === 'string';
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Node);

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
  /**
   * @param {string} tag — tag name with optional CSS selector syntax (e.g. 'div#id.class1.class2')
   * @param  {...(string|Object|Node|Array)} attrsOrChildren
   */
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

  /**
   * Set inline styles.
   * @param {Object} obj
   * @returns {this}
   */
  css(obj) {
    Object.assign(this.el.style, obj);
    return this;
  }

  /**
   * Set a single attribute.
   * @param {string} key
   * @param {*} value
   * @returns {this}
   */
  attr(key, value) {
    if (value == null) { this.el.removeAttribute(key); }
    else { this.el.setAttribute(key, String(value)); }
    return this;
  }

  /**
   * Set multiple attributes from an object.
   * @param {Object} obj
   * @returns {this}
   */
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
        this.el.innerHTML = String(v);
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

  /**
   * Add event listener.
   * @param {string} event
   * @param {Function} handler
   * @param {AddEventListenerOptions} [options]
   * @returns {this}
   */
  on(event, handler, options) {
    this.el.addEventListener(event, handler, options);
    return this;
  }

  /**
   * Remove event listener.
   * @param {string} event
   * @param {Function} handler
   * @param {EventListenerOptions} [options]
   * @returns {this}
   */
  off(event, handler, options) {
    this.el.removeEventListener(event, handler, options);
    return this;
  }

  /**
   * Append children using a document fragment for batch performance.
   * @param  {...(Node|string|HElement)} children
   * @returns {this}
   */
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

  /**
   * Prepend children.
   * @param  {...(Node|string|HElement)} children
   * @returns {this}
   */
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

  /**
   * Set textContent.
   * @param {string} str
   * @returns {this}
   */
  text(str) {
    this.el.textContent = String(str ?? '');
    return this;
  }

  /**
   * Set innerHTML. Uses DOMPurify.sanitize if available.
   * @param {string} str
   * @returns {this}
   */
  html(str) {
    const raw = String(str ?? '');
    if (typeof window.DOMPurify?.sanitize === 'function') {
      this.el.innerHTML = window.DOMPurify.sanitize(raw);
    } else {
      this.el.innerHTML = raw;
    }
    return this;
  }

  /**
   * Add CSS class(es).
   * @param {string} cls — space-separated class names
   * @returns {this}
   */
  addClass(cls) {
    if (cls) this.el.classList.add(...cls.split(/\s+/).filter(Boolean));
    return this;
  }

  /**
   * Remove CSS class(es).
   * @param {string} cls — space-separated class names
   * @returns {this}
   */
  removeClass(cls) {
    if (cls) this.el.classList.remove(...cls.split(/\s+/).filter(Boolean));
    return this;
  }

  /**
   * Toggle CSS class(es).
   * @param {string} cls — space-separated class names
   * @param {boolean} [force]
   * @returns {this}
   */
  toggleClass(cls, force) {
    if (cls) {
      for (const c of cls.split(/\s+/).filter(Boolean)) {
        this.el.classList.toggle(c, force);
      }
    }
    return this;
  }

  /**
   * Check if element has a class.
   * @param {string} cls
   * @returns {boolean}
   */
  hasClass(cls) {
    return this.el.classList.contains(cls);
  }

  /**
   * Toggle 'active' class.
   * @param {boolean} bool
   * @returns {this}
   */
  active(bool) {
    this.el.classList.toggle('active', bool);
    return this;
  }

  /**
   * Toggle 'checked' attribute.
   * @param {boolean} bool
   * @returns {this}
   */
  checked(bool) {
    if (bool) this.el.setAttribute('checked', '');
    else this.el.removeAttribute('checked');
    return this;
  }

  /**
   * Toggle 'disabled' attribute.
   * @param {boolean} bool
   * @returns {this}
   */
  disabled(bool) {
    if (bool) this.el.setAttribute('disabled', '');
    else this.el.removeAttribute('disabled');
    return this;
  }

  /**
   * Show element (remove display:none).
   * @returns {this}
   */
  show() {
    this.el.style.display = '';
    return this;
  }

  /**
   * Hide element (set display:none).
   * @returns {this}
   */
  hide() {
    this.el.style.display = 'none';
    return this;
  }

  /**
   * Remove element from DOM.
   */
  remove() {
    this.el.remove();
  }

  /**
   * Query within this element.
   * @param {string} sel
   * @returns {HElement|null}
   */
  find(sel) {
    const found = this.el.querySelector(sel);
    return found ? new HElement('__fragment__')._replaceEl(found) : null;
  }

  /**
   * Query all within this element.
   * @param {string} sel
   * @returns {HElement[]}
   */
  findAll(sel) {
    return [...this.el.querySelectorAll(sel)].map(el => new HElement('__fragment__')._replaceEl(el));
  }

  /**
   * Closest ancestor matching selector.
   * @param {string} sel
   * @returns {HElement|null}
   */
  closest(sel) {
    const found = this.el.closest(sel);
    return found ? new HElement('__fragment__')._replaceEl(found) : null;
  }

  /**
   * Get or set data attributes.
   * @param {string} key
   * @param {*} [value]
   * @returns {this|string}
   */
  data(key, value) {
    if (value === undefined) return this.el.dataset[key];
    this.el.dataset[key] = String(value);
    return this;
  }

  /**
   * Get bounding client rect.
   * @returns {DOMRect}
   */
  rect() {
    return this.el.getBoundingClientRect();
  }

  /** @internal replace the backing element (used by find/closest) */
  _replaceEl(el) {
    this.el = el;
    return this;
  }
}

/**
 * Create an HElement with fluent API.
 * @param {string} tag — tag name with optional CSS selector syntax
 * @param  {...(string|Object|Node|Array)} attrsOrChildren
 * @returns {HElement}
 */
export function h(tag, ...attrsOrChildren) {
  return new HElement(tag, ...attrsOrChildren);
}
