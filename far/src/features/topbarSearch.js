
import { $, createElement, debounce } from '../lib/dom.js';

export const TopbarSearch = {
  input: null,
  resultsBox: null,

  init() {
    this.input = $('.topbar-search input');
    if (!this.input) return;

    this.resultsBox = createElement('div', { class: 'search-results-box' });
    this.input.parentElement.appendChild(this.resultsBox);

    this.input.addEventListener('input', debounce(e => this._onInput(e.target.value), 300));
    this.input.addEventListener('focus', () => this._onInput(this.input.value));
    
    document.addEventListener('click', e => {
      if (!this.input.contains(e.target) && !this.resultsBox.contains(e.target)) {
        this.resultsBox.classList.remove('active');
      }
    });

    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.resultsBox.classList.remove('active');
    });
  },

  async _onInput(query) {
    if (!query || query.length < 2) {
      this.resultsBox.classList.remove('active');
      return;
    }

    const results = await this._search(query);
    this._render(results, query);
    this.resultsBox.classList.add('active');
  },

  async _search(query) {
    const q = query.toLowerCase();
    const data = await this._loadUniversalData();
    
    // Simple substring search for now, could use Fuse.js if available
    return data.filter(item => 
      String(item.label || '').toLowerCase().includes(q) ||
      String(item.description || '').toLowerCase().includes(q) ||
      String(item.searchText || '').toLowerCase().includes(q)
    ).slice(0, 10);
  },

  async _loadUniversalData() {
    const catalog = await window.DataStore?.init() || { courses: [], topics: [] };
    const notes = await window.DB?.getNotes() || [];
    // const timestamps = ...
    // const annotations = ...

    const results = [];

    (catalog.courses || []).forEach(course => {
      results.push({
        icon: '??',
        label: String(course.title || course.id),
        description: 'Course',
        href: `#/courses?id=${course.id}`,
      });
    });

    (catalog.topics || []).forEach(topic => {
      results.push({
        icon: topic.videos?.length ? '??' : '??',
        label: String(topic.title || topic.topicId),
        description: String(topic.sourceLabel || 'Topic'),
        href: `#/courses?topic=${topic.topicId}`,
      });
    });

    notes.forEach(note => {
      results.push({
        icon: '??',
        label: String(note.title || 'Untitled note'),
        description: note.topicId ? `Linked to ${note.topicId}` : 'Note',
        searchText: this._plainText(note.content || ''),
        href: `#/notes?id=${note.id}`,
      });
    });

    // ... add more if needed
    return results;
  },

  _plainText(value) {
    if (value == null) return '';
    if (value instanceof Node) return (value.textContent || '').replace(/\s+/g, ' ').trim();
    const s = String(value);
    if (!s.includes('<') && !s.includes('&')) return s.replace(/\s+/g, ' ').trim();
    try {
      const doc = new DOMParser().parseFromString(s, 'text/html');
      return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
    } catch {
      return s.replace(/\s+/g, ' ').trim();
    }
  },

  _render(results, query) {
    this.resultsBox.replaceChildren();
    if (!results.length) {
      this.resultsBox.appendChild(createElement('div', { class: 'search-no-results' }, `No results for "${query}"`));
      return;
    }

    results.forEach(item => {
      const el = createElement('a', { class: 'search-result', href: item.href });
      const icon = createElement('span', { class: 'search-result-icon' }, item.icon || '??');
      const text = createElement('div', { class: 'search-result-text' });
      
      const label = createElement('span', { class: 'search-result-label' });
      this._appendHighlighted(label, item.label, query);
      
      text.appendChild(label);
      if (item.description) {
        text.appendChild(createElement('span', { class: 'search-result-desc' }, item.description));
      }
      
      el.append(icon, text);
      el.addEventListener('click', (e) => {
        if (!item.href.startsWith('#')) {
           e.preventDefault();
           if (typeof item.action === 'function') item.action();
        }
        this.resultsBox.classList.remove('active');
      });
      this.resultsBox.appendChild(el);
    });
  },

  _appendHighlighted(parent, text, query) {
    const source = (text instanceof Node ? text.textContent : String(text || ''));
    const q = String(query || '').trim().toLowerCase();
    if (!q || !source.toLowerCase().includes(q)) {
      parent.appendChild(document.createTextNode(source));
      return;
    }

    let cursor = 0;
    const lower = source.toLowerCase();
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
};

