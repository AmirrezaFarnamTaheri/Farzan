import Fuse from 'fuse.js';
import { $, createElement, debounce } from '../lib/dom.js';

export const TopbarSearch = {
  input: null,
  resultsBox: null,
  _fuse: null,
  _indexedData: null,

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
    // Cached search data goes stale on any notes/folders mutation.
    const bus = window.OpenCourseDeck?.bus;
    for (const evt of ['note:save', 'note:delete', 'folder:save', 'folder:delete']) {
      bus?.on?.(evt, () => {
        this._universalData = null;
        this._workerIndexedData = null;
      });
    }  },

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
    const data = await this._loadUniversalData();
    const viaWorker = await this._searchViaWorker(query, data);
    if (viaWorker) return viaWorker;
    const q = query.toLowerCase();

    if (Fuse) {
      if (this._indexedData !== data) {
        this._indexedData = data;
        this._fuse = new Fuse(data, {
          includeMatches: true,
          threshold: 0.35,
          ignoreLocation: true,
          keys: [
            { name: 'label', weight: 0.55 },
            { name: 'description', weight: 0.2 },
            { name: 'searchText', weight: 0.2 },
            { name: 'tags', weight: 0.05 },
          ],
        });
      }
      return this._fuse.search(query, { limit: 10 }).map(result => ({
        ...result.item,
        matches: result.matches || [],
      }));
    }

    return data.filter(item => 
      String(item.label || '').toLowerCase().includes(q) ||
      String(item.description || '').toLowerCase().includes(q) ||
      String(item.searchText || '').toLowerCase().includes(q)
    ).slice(0, 10);
  },

  // Heavy fuzzy search runs in the vendored search worker; the main-thread
  // Fuse below is the fallback when workers are unavailable or broken.
  async _searchViaWorker(query, data) {
    if (this._workerBroken) return null;
    const runInWorker = window.OpenCourseDeck?.WorkerPool?.runInWorker;
    if (typeof runInWorker !== 'function') return null;
    try {
      if (this._workerIndexedData !== data) {
        this._workerIndexedData = data;
        await runInWorker('search', { type: 'init', data: { items: data, options: { keys: [ { name: 'label', weight: 0.55 }, { name: 'description', weight: 0.2 }, { name: 'searchText', weight: 0.2 }, { name: 'tags', weight: 0.05 } ], threshold: 0.35, ignoreLocation: true, includeMatches: true } } }, { timeout: 15000 });
      }
      const res = await runInWorker('search', { type: 'search', data: { query, options: { limit: 10 } } }, { timeout: 5000 });
      return (res?.results || []).map((item, i) => ({ ...item, matches: res.matches?.[i]?.matches || [] }));
    } catch (error) {
      if (error?.code === 'WORKER_BUSY') return null; // transient: main thread covers this keystroke
      this._workerBroken = true; // unavailable/broken: stay on the main thread
      return null;
    }
  },

  async _loadUniversalData() {
    if (this._universalData) return this._universalData;    const catalog = await window.DataStore?.init() || { courses: [], topics: [] };
    const notes = await window.DB?.getNotes() || [];
    // const timestamps = ...
    // const annotations = ...

    const results = [];

    (catalog.courses || []).forEach(course => {
      results.push({
        icon: '??',
        label: String(course.title || course.id),
        description: 'Course',
        tags: course.tags || [],
        href: `#/courses?id=${course.id}`,
      });
    });

    (catalog.topics || []).forEach(topic => {
      results.push({
        icon: topic.videos?.length ? '??' : '??',
        label: String(topic.title || topic.topicId),
        description: String(topic.sourceLabel || 'Topic'),
        tags: topic.tags || [],
        searchText: `${topic.courseTitle || ''} ${topic.sourceLabel || ''}`,
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
    this._universalData = results;
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
      this._appendHighlighted(label, item.label, query, item.matches);
      
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

  _appendHighlighted(parent, text, query, matches = []) {
    const source = (text instanceof Node ? text.textContent : String(text || ''));
    const labelMatch = matches.find(match => match.key === 'label' && Array.isArray(match.indices));
    if (labelMatch) {
      let cursor = 0;
      labelMatch.indices.forEach(([start, end]) => {
        if (start > cursor) parent.appendChild(document.createTextNode(source.slice(cursor, start)));
        parent.appendChild(createElement('mark', { class: 'search-highlight' }, source.slice(start, end + 1)));
        cursor = end + 1;
      });
      if (cursor < source.length) parent.appendChild(document.createTextNode(source.slice(cursor)));
      return;
    }
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
