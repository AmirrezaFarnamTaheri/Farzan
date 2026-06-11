// ============================================================
// PlasmaDeck â€” notes.js
// Full Rich Notes System
// Features: Editor, Folders, Tags, Search, Autosave, Export
// Version: 1.1.3 (Unified DB Refactor)
// ============================================================

(() => {
  'use strict';

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 0. CONSTANTS & UTILS
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function uid(prefix = 'n') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function debounce(fn, ms = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  async function pdConfirm(message) {
    const fn = window.PlasmaDeck?.UI?.confirm;
    if (typeof fn === 'function') return fn(message);
    return window.confirm(String(message ?? 'Are you sure?'));
  }

  function escHtml(str) {
    return String(str).replace(
      /[&<>"']/g,
      m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])
    );
  }

  function safeFilename(name, fallback = 'plasma-note') {
    return String(name || fallback)
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || fallback;
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 1. DATA STORE (Using window.DB)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const Store = {
    async getNotes() { return (await window.DB?.getAllNotes()) ?? []; },
    async getNote(id) { const all = await this.getNotes(); return all.find(n => n.id === id) ?? null; },

    async createNote(data = {}) {
      const note = {
        id:        uid('note'),
        title:     data.title     ?? 'Untitled Note',
        content:   data.content   ?? '',
        folderId:  data.folderId  ?? 'default',
        tags:      data.tags      ?? [],
        pinned:    data.pinned    ?? false,
        color:     data.color     ?? '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        wordCount: 0,
        charCount: 0,
      };
      return await window.DB?.saveNote(note);
    },

    async updateNote(id, patch) {
      const existing = await this.getNote(id);
      if (!existing) return null;
      const next = { ...existing, ...patch, id, updatedAt: Date.now() };
      return await window.DB?.saveNote(next);
    },

    async deleteNote(id) { await window.DB?.deleteNote(id); },

    async getFolders() {
      const custom = await window.DB?.getAllFolders();
      if (custom?.length) return custom;
      return [
        { id: 'default', name: 'Personal',  icon: 'ðŸ“', color: '' },
        { id: 'work',    name: 'Work',       icon: 'ðŸ’¼', color: '' },
        { id: 'archive', name: 'Archive',    icon: 'ðŸ—ƒï¸', color: '' },
      ];
    },

    async createFolder(name, icon = 'ðŸ“', color = '') {
      const folder = { id: uid('folder'), name, icon, color, updatedAt: Date.now() };
      return await window.DB?.saveFolder(folder);
    },

    async deleteFolder(id) {
      await window.DB?.deleteFolder(id);
      const notes = await this.getNotes();
      for (const n of notes) { if (n.folderId === id) await this.updateNote(n.id, { folderId: 'default' }); }
    },

    async getSettings() { return (await window.DB?.getSetting('notes')) ?? {}; },
    async saveSettings(s) { return await window.DB?.saveSetting('notes', s); },
  };


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 2. EDITOR (ContentEditable Rich Text)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const Editor = {
    _el:         null,
    _currentId:  null,
    _saveTimer:  null,
    _history:    [],
    _historyIdx: -1,
    _maxHistory: 100,

    COMMANDS: {
      bold:          () => document.execCommand('bold'),
      italic:        () => document.execCommand('italic'),
      underline:     () => document.execCommand('underline'),
      strikethrough: () => document.execCommand('strikeThrough'),
      h1:            () => document.execCommand('formatBlock', false, 'h1'),
      h2:            () => document.execCommand('formatBlock', false, 'h2'),
      h3:            () => document.execCommand('formatBlock', false, 'h3'),
      paragraph:     () => document.execCommand('formatBlock', false, 'p'),
      ul:            () => document.execCommand('insertUnorderedList'),
      ol:            () => document.execCommand('insertOrderedList'),
      blockquote:    () => document.execCommand('formatBlock', false, 'blockquote'),
      code:          () => Editor._wrapSelection('code'),
      codeblock:     () => Editor._insertCodeBlock(),
      link:          () => Editor._promptLink(),
      image:         () => Editor._promptImage(),
      table:         () => Editor._insertTable(),
      hr:            () => document.execCommand('insertHorizontalRule'),
      alignLeft:     () => document.execCommand('justifyLeft'),
      alignCenter:   () => document.execCommand('justifyCenter'),
      alignRight:    () => document.execCommand('justifyRight'),
      alignJustify:  () => document.execCommand('justifyFull'),
      indent:        () => document.execCommand('indent'),
      outdent:       () => document.execCommand('outdent'),
      undo:          () => Editor.undo(),
      redo:          () => Editor.redo(),
      clearFormat:   () => document.execCommand('removeFormat'),
    },

    mount(editorEl) {
      this._el = editorEl;
      this._el.setAttribute('contenteditable', 'true');
      this._el.setAttribute('role', 'textbox');
      this._el.setAttribute('aria-multiline', 'true');
      this._el.setAttribute('spellcheck', 'true');
      this._el.setAttribute('data-placeholder', 'Start writing your note...');
      this._onInputBound = () => { this._onInput(); this._scheduleSnapshot(); };
      this._el.addEventListener('input', this._onInputBound);
      this._onKeydownBound = e => this._onKeydown(e);
      this._el.addEventListener('keydown', this._onKeydownBound);
      this._onPasteBound = e => this._onPaste(e);
      this._el.addEventListener('paste', this._onPasteBound);
      this._onSelectionChange = debounce(() => {
        if (!this._el || !this._el.isConnected) return; 
        if (document.activeElement === this._el || this._el.contains(document.activeElement)) this._updateToolbar();
      }, 100);
      document.addEventListener('selectionchange', this._onSelectionChange);
    },

    unmount() {
      if (!this._el) return;
      this._el.removeEventListener('input', this._onInputBound);
      this._el.removeEventListener('keydown', this._onKeydownBound);
      this._el.removeEventListener('paste', this._onPasteBound);
      document.removeEventListener('selectionchange', this._onSelectionChange);
      this._el = null; this._currentId = null;
    },

    load(note) {
      if (!note || !this._el) return;
      this._currentId  = note.id;
      this._el.innerHTML = this._sanitize(note.content || '');
      this._history = []; this._historyIdx = -1;
      this._snapshot(); this._el.focus();
      const titleEl = $('[data-note-title-input]');
      if (titleEl) titleEl.value = note.title;
      this._updateMeta(note);
      window.PlasmaDeck?.beforeUnload?.unmark?.('notes-body');
      window.PlasmaDeck?.beforeUnload?.unmark?.('notes-title');
    },

    getContent() { return this._sanitize(this._el?.innerHTML ?? ''); },

    save(immediate = false) {
      if (!this._currentId) return;
      clearTimeout(this._saveTimer);
      const doSave = async () => {
        if (!this._el) return;
        const content = this.getContent(), text = this._el.innerText ?? '';
        const words = text.trim().split(/\s+/).filter(Boolean).length, chars = text.length;
        const title = $('[data-note-title-input]')?.value.trim() ?? 'Untitled';
        const updated = await Store.updateNote(this._currentId, { content, title, wordCount: words, charCount: chars });
        if (updated) {
          this._updateMeta(updated); this._showSaveIndicator();
          await NotesList.refreshItem(updated);
          window.PlasmaDeck?.beforeUnload?.unmark?.('notes-body');
          window.PlasmaDeck?.bus?.emit('note:save', { note: updated });
        }
      };
      if (immediate) doSave(); else this._saveTimer = setTimeout(doSave, 800);
    },

    _snapshot() {
      if (!this._el) return;
      const html = this._el.innerHTML ?? '';
      this._history = this._history.slice(0, this._historyIdx + 1);
      this._history.push(html);
      if (this._history.length > this._maxHistory) this._history.shift();
      this._historyIdx = this._history.length - 1;
    },

    _scheduleSnapshot: debounce(function() { Editor._snapshot(); }, 500),

    undo() {
      if (this._historyIdx <= 0 || !this._el) return;
      this._historyIdx--; this._el.innerHTML = this._history[this._historyIdx]; this._placeCursorAtEnd();
    },

    redo() {
      if (this._historyIdx >= this._history.length - 1 || !this._el) return;
      this._historyIdx++; this._el.innerHTML = this._history[this._historyIdx]; this._placeCursorAtEnd();
    },

    _onKeydown(e) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 's') { e.preventDefault(); this.save(true); return; }
      if (ctrl && e.key === 'z') { e.preventDefault(); this.undo(); return; }
      if (ctrl && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); this.redo(); return; }
      if (ctrl && e.key === 'b') { e.preventDefault(); this.COMMANDS.bold(); return; }
      if (ctrl && e.key === 'i') { e.preventDefault(); this.COMMANDS.italic(); return; }
      if (ctrl && e.key === 'u') { e.preventDefault(); this.COMMANDS.underline(); return; }
      if (ctrl && e.key === 'k') { e.preventDefault(); this.COMMANDS.link(); return; }
      if (e.key === 'Tab') { e.preventDefault(); if (e.shiftKey) this.COMMANDS.outdent(); else document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;'); }
      if (e.key === '/' && this._isEmptyBlock()) this._showSlashMenu(e);
    },

    _onPaste(e) {
      e.preventDefault();
      const text = e.clipboardData.getData('text/html') || e.clipboardData.getData('text/plain');
      const clean = this._sanitize(text);
      document.execCommand('insertHTML', false, clean);
    },

    _sanitize(html) {
      const purify = window.DOMPurify;
      if (purify?.sanitize) {
        return purify.sanitize(String(html ?? ''), {
          FORBID_TAGS: ['script', 'style', 'meta', 'link', 'iframe', 'object', 'embed', 'form'],
          FORBID_ATTR: ['style'],
          ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
        });
      }
      try {
        const doc = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
        doc.querySelectorAll('script, style, meta, link, iframe, object, embed, form').forEach(el => el.remove());
        doc.querySelectorAll('*').forEach(el => {
          [...el.attributes].forEach(attr => {
            const n = attr.name, v = attr.value ?? '';
            if (/^on/i.test(n)) el.removeAttribute(n);
            if (n === 'href' || n === 'src' || n === 'xlink:href' || n === 'formaction') {
              if (/^\s*javascript:/i.test(v) || /^\s*data:text\/html/i.test(v)) el.removeAttribute(n);
            }
          });
        });
        return doc.body.innerHTML;
      } catch { return ''; }
    },

    _updateToolbar() {
      const commands = ['bold', 'italic', 'underline', 'strikeThrough', 'justifyLeft', 'justifyCenter', 'justifyRight'];
      commands.forEach(cmd => {
        const btn = $(`[data-cmd="${cmd.toLowerCase()}"]`);
        if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
      });
      const block = document.queryCommandValue('formatBlock');
      $$('[data-cmd-block]').forEach(btn => { btn.classList.toggle('active', btn.dataset.cmdBlock === block); });
    },

    _wrapSelection(tag) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        if (this._el && !this._el.contains(range.commonAncestorContainer)) return;
        const node  = document.createElement(tag);
        try {
          range.surroundContents(node);
        } catch (e) {
          console.warn('[Notes] wrapSelection failed:', e);
        }
      },

    _insertCodeBlock() {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const pre  = document.createElement('pre'), code = document.createElement('code');
        code.textContent = sel.toString() || 'code here';
        pre.appendChild(code);
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(pre);
      },

    _promptLink() {
      const url = window.prompt('Enter URL:', 'https://'); if (!url) return;
      if (/^\s*javascript:/i.test(url) || /^\s*data:text\/html/i.test(url)) return;
      document.execCommand('createLink', false, url);
    },

    _promptImage() {
      const url = window.prompt('Enter image URL:'); if (!url) return;
      if (!/^(https?:|data:image\/)/i.test(url.trim())) return;
      document.execCommand('insertImage', false, url);
    },

    _insertTable(rows = 3, cols = 3) {
      let html = '<table class="note-table"><tbody>';
      for (let r = 0; r < rows; r++) {
        html += '<tr>';
        for (let c = 0; c < cols; c++) { html += r === 0 ? `<th>Header ${c + 1}</th>` : `<td>Cell</td>`; }
        html += '</tr>';
      }
      html += '</tbody></table><p><br></p>';
      document.execCommand('insertHTML', false, html);
    },

    _isEmptyBlock() {
      const sel = window.getSelection(); if (!sel.rangeCount) return false;
      const range = sel.getRangeAt(0), block = range.startContainer?.parentElement?.closest('p, h1, h2, h3, li, div');
      return block ? block.textContent.trim() === '' : false;
    },

    _showSlashMenu(e) {
      this._hideSlashMenu();
      const items = [
        { label: 'ðŸ“ Paragraph',     cmd: 'paragraph'  }, { label: '# Heading 1',      cmd: 'h1'         },
        { label: '## Heading 2',     cmd: 'h2'         }, { label: '### Heading 3',    cmd: 'h3'         },
        { label: 'â€¢ Bullet List',    cmd: 'ul'         }, { label: '1. Numbered List', cmd: 'ol'         },
        { label: 'â Blockquote',     cmd: 'blockquote' }, { label: '</> Code Block',   cmd: 'codeblock'  },
        { label: 'âŠž Table',          cmd: 'table'      }, { label: 'â”€ Divider',        cmd: 'hr'         },
      ];
      const sel  = window.getSelection(), rect = sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : { left: 0, bottom: 0 };
      const menu = document.createElement('div'); menu.className = 'slash-menu';
      menu.style.cssText = `position: fixed; left: ${rect.left}px; top: ${rect.bottom + 6}px; z-index: 9999;`;
      items.forEach(({ label, cmd }) => {
        const item = document.createElement('button'); item.className = 'slash-menu-item'; item.textContent = label;
        item.addEventListener('mousedown', ev => { ev.preventDefault(); document.execCommand('delete'); this.COMMANDS[cmd]?.(); this._hideSlashMenu(); });
        menu.appendChild(item);
      });
      document.body.appendChild(menu); this._slashMenu = menu;
      setTimeout(() => { document.addEventListener('click', this._hideSlashMenu.bind(this), { once: true }); }, 0);
    },

    _hideSlashMenu() { this._slashMenu?.remove(); this._slashMenu = null; },
    _onInput() { window.PlasmaDeck?.beforeUnload?.mark?.('notes-body'); this.save(); },

    _updateMeta(note) {
      const wordEl = $('[data-note-words]'), charEl = $('[data-note-chars]'), dateEl = $('[data-note-date]');
      if (wordEl) wordEl.textContent = `${note.wordCount ?? 0} words`;
      if (charEl) charEl.textContent = `${note.charCount ?? 0} chars`;
      if (dateEl) dateEl.textContent = `Edited ${this._relativeTime(note.updatedAt)}`;
    },

    _relativeTime(ts) {
      const diff = Date.now() - ts;
      if (diff < 60000) return 'just now'; if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`; return new Date(ts).toLocaleDateString();
    },

    _showSaveIndicator() {
      const el = $('[data-save-status]'); if (!el) return;
      el.textContent = 'âœ… Saved'; el.classList.add('visible');
      clearTimeout(el._timer); el._timer = setTimeout(() => { el.classList.remove('visible'); }, 2000);
    },

    _placeCursorAtEnd() {
      if (!this._el) return;
      const range = document.createRange(), sel = window.getSelection();
      range.selectNodeContents(this._el); range.collapse(false);
      sel.removeAllRanges(); sel.addRange(range);
    },
  };


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 3. NOTES LIST
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const NotesList = {
    _container:    null,
    _activeId:     null,
    _filter:       { folderId: null, tag: null, query: '', _pinned: false },
    _sortBy:       'updatedAt',
    _sortDir:      'desc',

    async init(containerEl) { this._container = containerEl; await this.render(); },

    async render() {
      if (!this._container) return;
      let notes = await Store.getNotes();
      if (this._filter._pinned) notes = notes.filter(n => n.pinned);
      if (this._filter.folderId) notes = notes.filter(n => n.folderId === this._filter.folderId);
      if (this._filter.tag)      notes = notes.filter(n => n.tags.includes(this._filter.tag));
      if (this._filter.query) {
        const q = this._filter.query.toLowerCase();
        notes = notes.filter(n => n.title.toLowerCase().includes(q) || (n.content ? this._stripHTML(n.content).toLowerCase().includes(q) : false));
      }
      notes.sort((a, b) => {
        let av = a[this._sortBy], bv = b[this._sortBy];
        if (this._sortBy === 'title') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
        return this._sortDir === 'desc' ? (av < bv ? 1 : -1) : (av > bv ? 1 : -1);
      });
      const pinned = notes.filter(n => n.pinned), unpinned = notes.filter(n => !n.pinned), sorted = [...pinned, ...unpinned];
      this._container.innerHTML = '';
      if (!sorted.length) {
        this._container.innerHTML = `<div class="notes-empty"><div class="empty-icon">ðŸ“„</div><div class="empty-text">No notes found</div><button class="btn btn-primary btn-sm" data-action="new-note">+ New Note</button></div>`;
        return;
      }
      sorted.forEach(note => this._container.appendChild(this._buildItem(note)));
    },

    _buildItem(note) {
      const excerpt = this._stripHTML(note.content).slice(0, 100), date = this._relTime(note.updatedAt), isActive = note.id === this._activeId;
      const item = document.createElement('div'); item.className = `note-item ${isActive ? 'active' : ''} ${note.pinned ? 'pinned' : ''}`;
      item.dataset.noteId = note.id; if (note.color) item.style.borderLeftColor = note.color;
      item.innerHTML = `<div class="note-item-header"><span class="note-item-title">${escHtml(note.title)}</span>${note.pinned ? '<span class="note-pin" title="Pinned">ðŸ“Œ</span>' : ''}<span class="note-item-date">${date}</span></div><div class="note-item-excerpt">${escHtml(excerpt)}</div>${note.tags.length ? `<div class="note-item-tags">${note.tags.map(t => `<span class="note-tag">${escHtml(t)}</span>`).join('')}</div>` : ''}`;
      item.addEventListener('click', () => NotesApp.openNote(note.id));
      item.addEventListener('contextmenu', e => {
        e.preventDefault();
        ContextMenu.show(e.clientX, e.clientY, [
          { label: note.pinned ? 'ðŸ“Œ Unpin' : 'ðŸ“Œ Pin', action: async () => { await Store.updateNote(note.id, { pinned: !note.pinned }); await NotesList.render(); await FoldersPanel.render(); } },
          { label: 'ðŸŽ¨ Set Color', action: () => NotesApp.promptColor(note.id) },
          { label: 'ðŸ·ï¸ Edit Tags', action: () => NotesApp.promptTags(note.id) },
          { label: 'ðŸ“ Move to Folder', action: () => NotesApp.promptMoveFolder(note.id) },
          { label: 'ðŸ“‹ Duplicate', action: () => NotesApp.duplicateNote(note.id) },
          { label: 'ðŸ—‘ï¸ Delete', danger: true, action: () => NotesApp.deleteNote(note.id) },
        ]);
      });
      return item;
    },

    async refreshItem(note) {
      const existing = this._container?.querySelector(`[data-note-id="${note.id}"]`);
      if (existing) { const fresh = this._buildItem(note); existing.replaceWith(fresh); }
    },

    setActive(id) { $$('.note-item', this._container).forEach(el => el.classList.toggle('active', el.dataset.noteId === id)); this._activeId = id; },
    async setFilter(patch) { Object.assign(this._filter, patch); await this.render(); },
    _stripHTML(html) { try { const doc = new DOMParser().parseFromString(html, 'text/html'); return doc.body.textContent ?? ''; } catch { return ''; } },
    _relTime(ts) {
      const d = Date.now() - ts;
      if (d < 60000) return 'just now'; if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
      if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`; return new Date(ts).toLocaleDateString();
    },
  };


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 4. FOLDERS PANEL
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const FoldersPanel = {
    _container: null,
    _onAddFolder: null,

    async init(containerEl) {
      this._container = containerEl; await this.render();
      this._onAddFolder = e => { if (e.target.closest('[data-action="add-folder"]')) this._promptNewFolder(); };
      document.addEventListener('click', this._onAddFolder);
    },

    destroy() { document.removeEventListener('click', this._onAddFolder); this._onAddFolder = null; this._container = null; },

    async render() {
      if (!this._container) return;
      const folders = await Store.getFolders(), notes = await Store.getNotes();
      this._container.innerHTML = `<div class="folder-item ${(!NotesList._filter.folderId && !NotesList._filter._pinned) ? 'active' : ''}" data-folder-id=""><span class="folder-icon">ðŸ—’ï¸</span><span class="folder-name">All Notes</span><span class="folder-count">${notes.length}</span></div><div class="folder-item ${NotesList._filter._pinned ? 'active' : ''}" data-folder-id="__pinned__"><span class="folder-icon">ðŸ“Œ</span><span class="folder-name">Pinned</span><span class="folder-count">${notes.filter(n => n.pinned).length}</span></div>`;
      folders.forEach(folder => {
        const count = notes.filter(n => n.folderId === folder.id).length, item = document.createElement('div');
        item.className = `folder-item ${NotesList._filter.folderId === folder.id ? 'active' : ''}`; item.dataset.folderId = folder.id;
        item.innerHTML = `<span class="folder-icon">${escHtml(folder.icon)}</span><span class="folder-name">${escHtml(folder.name)}</span><span class="folder-count">${count}</span>${folder.id !== 'default' ? `<button class="folder-delete-btn" data-delete-folder="${escHtml(folder.id)}" title="Delete folder">Ã—</button>` : ''}`;
        this._container.appendChild(item);
      });
      const addBtn = document.createElement('button'); addBtn.className = 'btn btn-ghost btn-sm folder-add-btn'; addBtn.setAttribute('data-action', 'add-folder'); addBtn.textContent = '+ Add Folder';
      this._container.appendChild(addBtn);
      if (!this._clickBound) {
        this._clickBound = true;
        this._container.addEventListener('click', async e => {
          const delBtn = e.target.closest('[data-delete-folder]');
          if (delBtn) { e.stopPropagation(); if (await pdConfirm('Delete this folder? Notes will move to Personal.')) { await Store.deleteFolder(delBtn.dataset.deleteFolder); await this.render(); await NotesList.render(); } return; }
          const item = e.target.closest('[data-folder-id]');
          if (item) {
            const fid = item.dataset.folderId;
            if (fid === '__pinned__') await NotesList.setFilter({ folderId: null, tag: null, _pinned: true });
            else await NotesList.setFilter({ folderId: fid || null, _pinned: false });
            await this.render();
          }
        }, { capture: true });
      }
    },

    async _promptNewFolder() { const name = window.prompt('Folder name:'); if (name?.trim()) { await Store.createFolder(name.trim()); await this.render(); } },
  };


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 5. TAGS CLOUD
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const TagsCloud = {
    async render(containerEl) {
      if (!containerEl) return; const notes = await Store.getNotes(), tagMap = {};
      notes.forEach(n => n.tags.forEach(t => { tagMap[t] = (tagMap[t] ?? 0) + 1; }));
      containerEl.innerHTML = ''; if (!Object.keys(tagMap).length) { containerEl.textContent = 'No tags yet.'; return; }
      Object.entries(tagMap).forEach(([tag, count]) => {
        const el = document.createElement('span'); el.className = `note-tag ${NotesList._filter.tag === tag ? 'active' : ''}`;
        el.textContent = `${tag} (${count})`;
        el.addEventListener('click', async () => { await NotesList.setFilter({ tag: NotesList._filter.tag === tag ? null : tag }); await this.render(containerEl); });
        containerEl.appendChild(el);
      });
    },
  };


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 6. CONTEXT MENU
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const ContextMenu = {
    _el: null,
    show(x, y, items) {
      this.hide(); const menu = document.createElement('div'); menu.className = 'context-menu';
      items.forEach(item => {
        if (item.type === 'divider') { menu.appendChild(document.createElement('hr')); return; }
        const btn = document.createElement('button'); btn.className = `context-menu-item ${item.danger ? 'danger' : ''}`;
        btn.textContent = item.label; btn.addEventListener('click', () => { item.action?.(); this.hide(); });
        menu.appendChild(btn);
      });
      document.body.appendChild(menu); const rect = menu.getBoundingClientRect();
      menu.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
      menu.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;
      this._el = menu; setTimeout(() => document.addEventListener('click', this.hide.bind(this), { once: true }), 0);
    },
    hide() { this._el?.remove(); this._el = null; },
  };


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 7. SEARCH
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const NotesSearch = {
    init(inputEl) {
      if (!inputEl) return; inputEl.addEventListener('input', debounce(async e => { await NotesList.setFilter({ query: e.target.value.trim() }); }, 300));
      inputEl.addEventListener('keydown', async e => { if (e.key === 'Escape') { inputEl.value = ''; await NotesList.setFilter({ query: '' }); } });
    },
  };


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 8. MAIN APP CONTROLLER
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const NotesApp = {
    _inited: false, _onGlobalClick: null, _onTitleInput: null,
    async init() {
      if (this._inited) return; const editorEl = $('[data-notes-editor]'); if (!editorEl) return; this._inited = true;
      Editor.mount(editorEl); await NotesList.init($('[data-notes-list]')); await FoldersPanel.init($('[data-folders-panel]'));
      await TagsCloud.render($('[data-tags-cloud]')); NotesSearch.init($('[data-notes-search]'));
      $('[data-notes-toolbar]')?.addEventListener('mousedown', e => {
        const btn = e.target.closest('[data-cmd], [data-cmd-block]'); if (!btn) return; e.preventDefault();
        if (btn.dataset.cmdBlock) Editor.COMMANDS[btn.dataset.cmdBlock]?.(); else Editor.COMMANDS[btn.dataset.cmd]?.();
      });
      const titleInput = $('[data-note-title-input]');
      if (titleInput) {
        this._onTitleInput = () => {
          window.PlasmaDeck?.beforeUnload?.mark?.('notes-title'); clearTimeout(titleInput._pdTitleT);
          titleInput._pdTitleT = setTimeout(async () => {
            if (Editor._currentId) { await Store.updateNote(Editor._currentId, { title: titleInput.value }); await NotesList.render(); await FoldersPanel.render(); }
            window.PlasmaDeck?.beforeUnload?.unmark?.('notes-title');
          }, 500);
        };
        titleInput.addEventListener('input', this._onTitleInput);
      }
      this._onGlobalClick = async e => {
        const target = e?.target?.closest('[data-action]'); if (!target) return;
        switch (target.dataset.action) {
          case 'new-note': await this.newNote(); break;
          case 'import-notes': const input = document.createElement('input'); input.type = 'file'; input.accept = '.json'; input.onchange = ev => this.importJSON(ev.target.files[0]); input.click(); break;
        }
      };
      document.addEventListener('click', this._onGlobalClick);
      const notes = await Store.getNotes(); if (notes.length) await this.openNote(notes[0].id); else await this.newNote();
    },
    destroy() {
      if (!this._inited) return; Editor.unmount(); FoldersPanel.destroy(); document.removeEventListener('click', this._onGlobalClick);
      const titleInput = $('[data-note-title-input]'); if (titleInput) titleInput.removeEventListener('input', this._onTitleInput);
      this._onGlobalClick = null; this._onTitleInput = null; this._inited = false;
    },
    async newNote(folderId = NotesList._filter.folderId ?? 'default') { const note = await Store.createNote({ folderId }); await NotesList.render(); await FoldersPanel.render(); await this.openNote(note.id); window.PlasmaDeck?.bus?.emit('note:create', { note }); },
    async openNote(id) { await Editor.save(true); const note = await Store.getNote(id); if (!note) return; Editor.load(note); NotesList.setActive(id); $('[data-notes-main-pane]')?.classList.add('has-note'); },
    async deleteNote(id) {
      if (!await pdConfirm('Delete this note permanently?')) return; await Store.deleteNote(id);
      if (Editor._currentId === id) { Editor._currentId = null; if (Editor._el) Editor._el.innerHTML = ''; const titleInput = $('[data-note-title-input]'); if (titleInput) titleInput.value = ''; }
      await NotesList.render(); await FoldersPanel.render(); await TagsCloud.render($('[data-tags-cloud]')); window.PlasmaDeck?.bus?.emit('note:delete', { id });
    },
    async duplicateNote(id) { const note = await Store.getNote(id); if (!note) return; const copy = await Store.createNote({ ...note, id: undefined, title: `${note.title} (Copy)` }); await NotesList.render(); await FoldersPanel.render(); await this.openNote(copy.id); },
    async promptColor(id) { const color = window.prompt('Enter color (hex or name):', '#3b82f6'); if (color) { await Store.updateNote(id, { color }); await NotesList.render(); } },
    async promptTags(id) {
      const note = await Store.getNote(id), raw = window.prompt('Enter tags (comma-separated):', note?.tags.join(', ') ?? '');
      if (raw !== null) { const tags = raw.split(',').map(t => t.trim()).filter(Boolean); await Store.updateNote(id, { tags }); await NotesList.render(); await TagsCloud.render($('[data-tags-cloud]')); }
    },
    async promptMoveFolder(id) {
      const folders = await Store.getFolders(), list = folders.map((f, i) => `${i + 1}. ${f.name}`).join('\n');
      const input = window.prompt(`Move to folder:\n${list}`, '1'), idx = parseInt(input, 10) - 1;
      if (!isNaN(idx) && folders[idx]) { await Store.updateNote(id, { folderId: folders[idx].id }); await NotesList.render(); await FoldersPanel.render(); }
    },
    async importJSON(file) {
      const text = await file.text();
      try {
        const notes = JSON.parse(text); if (!Array.isArray(notes)) throw new Error(); let imported = 0;
        for (const n of notes) { if (!n) continue; const note = { ...n, id: String(n.id || uid('note')), updatedAt: Date.now() }; await window.DB.saveNote(note); imported++; }
        await NotesList.render(); await FoldersPanel.render(); await TagsCloud.render($('[data-tags-cloud]')); window.PlasmaDeck?.Toast?.success(`Imported ${imported} notes.`);
      } catch { window.PlasmaDeck?.Toast?.error('Invalid JSON file.'); }
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => NotesApp.init()); else NotesApp.init();
  window.PlasmaNotesApp = NotesApp; window.PlasmaNotesStore = Store;
})();
