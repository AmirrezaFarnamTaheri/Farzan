// ============================================================
// PlasmaDeck — notes.js
// Full Rich Notes System
// Features: Editor, Folders, Tags, Search, Autosave, Export
// ============================================================

(() => {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // 0. CONSTANTS & STATE
  // ──────────────────────────────────────────────────────────

  const STORAGE_KEY   = 'plasma-notes';
  const FOLDERS_KEY   = 'plasma-folders';
  const SETTINGS_KEY  = 'plasma-notes-settings';

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

  // ──────────────────────────────────────────────────────────
  // 1. DATA STORE
  // ──────────────────────────────────────────────────────────

  const Store = {
    // ── Notes ─────────────────────────────────────────────
    getNotes() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []; }
      catch { return []; }
    },

    saveNotes(notes) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    },

    getNote(id) {
      return this.getNotes().find(n => n.id === id) ?? null;
    },

    createNote(data = {}) {
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
      const notes = this.getNotes();
      notes.unshift(note);
      this.saveNotes(notes);
      return note;
    },

    updateNote(id, patch) {
      const notes = this.getNotes();
      const idx   = notes.findIndex(n => n.id === id);
      if (idx === -1) return null;
      notes[idx] = {
        ...notes[idx],
        ...patch,
        updatedAt: Date.now(),
      };
      this.saveNotes(notes);
      return notes[idx];
    },

    deleteNote(id) {
      const notes = this.getNotes().filter(n => n.id !== id);
      this.saveNotes(notes);
    },

    // ── Folders ───────────────────────────────────────────
    getFolders() {
      try {
        return JSON.parse(localStorage.getItem(FOLDERS_KEY)) ?? [
          { id: 'default', name: 'Personal',  icon: '📁', color: '' },
          { id: 'work',    name: 'Work',       icon: '💼', color: '' },
          { id: 'archive', name: 'Archive',    icon: '🗃️', color: '' },
        ];
      } catch { return []; }
    },

    saveFolders(folders) {
      localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
    },

    createFolder(name, icon = '📁', color = '') {
      const folders = this.getFolders();
      const folder  = { id: uid('folder'), name, icon, color };
      folders.push(folder);
      this.saveFolders(folders);
      return folder;
    },

    deleteFolder(id) {
      const folders = this.getFolders().filter(f => f.id !== id);
      this.saveFolders(folders);
      // Move notes to default
      const notes = this.getNotes().map(n =>
        n.folderId === id ? { ...n, folderId: 'default' } : n
      );
      this.saveNotes(notes);
    },

    // ── Settings ──────────────────────────────────────────
    getSettings() {
      try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) ?? {}; }
      catch { return {}; }
    },
    saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); },
  };


  // ──────────────────────────────────────────────────────────
  // 2. EDITOR (ContentEditable Rich Text)
  // ──────────────────────────────────────────────────────────

  const Editor = {
    _el:         null,
    _currentId:  null,
    _saveTimer:  null,
    _history:    [],      // undo stack (snapshots)
    _historyIdx: -1,
    _maxHistory: 100,

    // ── Toolbar commands ───────────────────────────────────
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

    // ── Mount ─────────────────────────────────────────────
    mount(editorEl) {
      this._el = editorEl;
      this._el.setAttribute('contenteditable', 'true');
      this._el.setAttribute('role', 'textbox');
      this._el.setAttribute('aria-multiline', 'true');
      this._el.setAttribute('spellcheck', 'true');
      this._el.setAttribute('data-placeholder', 'Start writing your note...');

      // Input → autosave + snapshot
      this._el.addEventListener('input', () => {
        this._onInput();
        this._scheduleSnapshot();
      });

      // Keyboard shortcuts
      this._el.addEventListener('keydown', e => this._onKeydown(e));

      // Paste — strip external formatting
      this._el.addEventListener('paste', e => this._onPaste(e));

      // Update toolbar state on selection change
      document.addEventListener('selectionchange', debounce(() => {
        if (document.activeElement === this._el || this._el.contains(document.activeElement)) {
          this._updateToolbar();
        }
      }, 100));
    },

    // ── Load note into editor ─────────────────────────────
    load(note) {
      if (!note || !this._el) return;
      this._currentId  = note.id;
      this._el.innerHTML = this._sanitize(note.content || '');
      this._history    = [];
      this._historyIdx = -1;
      this._snapshot();
      this._el.focus();

      // Update title field
      const titleEl = $('[data-note-title-input]');
      if (titleEl) titleEl.value = note.title;

      this._updateMeta(note);
      window.PlasmaDeck?.beforeUnload?.unmark?.('notes-body');
      window.PlasmaDeck?.beforeUnload?.unmark?.('notes-title');
    },

    // ── Get current HTML ──────────────────────────────────
    getContent() {
      return this._sanitize(this._el?.innerHTML ?? '');
    },

    // ── Save ──────────────────────────────────────────────
    save(immediate = false) {
      if (!this._currentId) return;
      clearTimeout(this._saveTimer);

      const doSave = () => {
        const content  = this.getContent();
        const text     = this._el.innerText ?? '';
        const words    = text.trim().split(/\s+/).filter(Boolean).length;
        const chars    = text.length;
        const title    = $('[data-note-title-input]')?.value.trim() ?? 'Untitled';

        const updated = Store.updateNote(this._currentId, {
          content, title, wordCount: words, charCount: chars,
        });
        if (updated) {
          this._updateMeta(updated);
          this._showSaveIndicator();
          NotesList.refreshItem(updated);
          window.PlasmaDeck?.beforeUnload?.unmark?.('notes-body');
          window.PlasmaDeck?.bus?.emit('note:save', { note: updated });
        }
      };

      if (immediate) {
        doSave();
      } else {
        this._saveTimer = setTimeout(doSave, 800);
      }
    },

    // ── Undo / Redo ───────────────────────────────────────
    _snapshot() {
      const html = this._el?.innerHTML ?? '';
      // Trim future history if we branched
      this._history = this._history.slice(0, this._historyIdx + 1);
      this._history.push(html);
      if (this._history.length > this._maxHistory) this._history.shift();
      this._historyIdx = this._history.length - 1;
    },

    _scheduleSnapshot: debounce(function() { Editor._snapshot(); }, 500),

    undo() {
      if (this._historyIdx <= 0) return;
      this._historyIdx--;
      this._el.innerHTML = this._history[this._historyIdx];
      this._placeCursorAtEnd();
    },

    redo() {
      if (this._historyIdx >= this._history.length - 1) return;
      this._historyIdx++;
      this._el.innerHTML = this._history[this._historyIdx];
      this._placeCursorAtEnd();
    },

    // ── Keyboard shortcuts ────────────────────────────────
    _onKeydown(e) {
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === 's') { e.preventDefault(); this.save(true); return; }
      if (ctrl && e.key === 'z') { e.preventDefault(); this.undo(); return; }
      if (ctrl && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); this.redo(); return; }
      if (ctrl && e.key === 'b') { e.preventDefault(); this.COMMANDS.bold(); return; }
      if (ctrl && e.key === 'i') { e.preventDefault(); this.COMMANDS.italic(); return; }
      if (ctrl && e.key === 'u') { e.preventDefault(); this.COMMANDS.underline(); return; }
      if (ctrl && e.key === 'k') { e.preventDefault(); this.COMMANDS.link(); return; }

      // Tab → indent
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) this.COMMANDS.outdent();
        else document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
      }

      // Slash commands
      if (e.key === '/' && this._isEmptyBlock()) {
        this._showSlashMenu(e);
      }
    },

    // ── Paste handler ─────────────────────────────────────
    _onPaste(e) {
      e.preventDefault();
      const text = e.clipboardData.getData('text/html')
        || e.clipboardData.getData('text/plain');
      // Sanitize
      const clean = this._sanitize(text);
      document.execCommand('insertHTML', false, clean);
    },

    _sanitize(html) {
      const purify = window.DOMPurify;
      if (purify?.sanitize) {
        return purify.sanitize(String(html ?? ''), {
          FORBID_TAGS: ['script', 'style', 'meta', 'link', 'iframe', 'object', 'embed', 'form'],
          FORBID_ATTR: ['style'],
          // Block javascript: etc while still allowing normal links/images.
          ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
        });
      }

      // Fallback sanitizer (best-effort; DOMPurify is preferred)
      const tmp = document.createElement('div');
      tmp.innerHTML = String(html ?? '');
      $$('script, style, meta, link, iframe, object, embed, form', tmp).forEach(el => el.remove());
      $$('*', tmp).forEach(el => {
        [...el.attributes].forEach(attr => {
          const n = attr.name;
          const v = attr.value ?? '';
          if (/^on/i.test(n)) el.removeAttribute(n);
          if (n === 'href' || n === 'src' || n === 'xlink:href' || n === 'formaction') {
            if (/^\s*javascript:/i.test(v) || /^\s*data:text\/html/i.test(v)) el.removeAttribute(n);
          }
        });
      });
      return tmp.innerHTML;
    },

    // ── Toolbar state sync ────────────────────────────────
    _updateToolbar() {
      const commands = ['bold', 'italic', 'underline', 'strikeThrough',
                        'justifyLeft', 'justifyCenter', 'justifyRight'];
      commands.forEach(cmd => {
        const btn = $(`[data-cmd="${cmd.toLowerCase()}"]`);
        if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
      });

      // Block format
      const block = document.queryCommandValue('formatBlock');
      $$('[data-cmd-block]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cmdBlock === block);
      });
    },

    // ── Insert helpers ────────────────────────────────────
    _wrapSelection(tag) {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const node  = document.createElement(tag);
      range.surroundContents(node);
    },

    _insertCodeBlock() {
      const pre  = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = window.getSelection().toString() || 'code here';
      pre.appendChild(code);
      const range = window.getSelection().getRangeAt(0);
      range.deleteContents();
      range.insertNode(pre);
    },

    _promptLink() {
      const sel = window.getSelection().toString();
      const url = window.prompt('Enter URL:', 'https://');
      if (!url) return;
      if (/^\s*javascript:/i.test(url) || /^\s*data:text\/html/i.test(url)) return;
      document.execCommand('createLink', false, url);
    },

    _promptImage() {
      const url = window.prompt('Enter image URL:');
      if (!url) return;
      if (!/^(https?:|data:image\/)/i.test(url.trim())) return;
      document.execCommand('insertImage', false, url);
    },

    _insertTable(rows = 3, cols = 3) {
      let html = '<table class="note-table"><tbody>';
      for (let r = 0; r < rows; r++) {
        html += '<tr>';
        for (let c = 0; c < cols; c++) {
          html += r === 0
            ? `<th contenteditable="true">Header ${c + 1}</th>`
            : `<td contenteditable="true">Cell</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table><p><br></p>';
      document.execCommand('insertHTML', false, html);
    },

    // ── Slash command menu ────────────────────────────────
    _slashMenu: null,

    _isEmptyBlock() {
      const sel   = window.getSelection();
      if (!sel.rangeCount) return false;
      const range = sel.getRangeAt(0);
      const block = range.startContainer?.parentElement?.closest(
        'p, h1, h2, h3, li, div'
      );
      return block ? block.textContent.trim() === '' : false;
    },

    _showSlashMenu(e) {
      this._hideSlashMenu();

      const items = [
        { label: '📝 Paragraph',     cmd: 'paragraph'  },
        { label: '# Heading 1',      cmd: 'h1'         },
        { label: '## Heading 2',     cmd: 'h2'         },
        { label: '### Heading 3',    cmd: 'h3'         },
        { label: '• Bullet List',    cmd: 'ul'         },
        { label: '1. Numbered List', cmd: 'ol'         },
        { label: '❝ Blockquote',     cmd: 'blockquote' },
        { label: '</> Code Block',   cmd: 'codeblock'  },
        { label: '⊞ Table',          cmd: 'table'      },
        { label: '─ Divider',        cmd: 'hr'         },
      ];

      const sel  = window.getSelection();
      const rect = sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : { left: 0, bottom: 0 };

      const menu = document.createElement('div');
      menu.className = 'slash-menu';
      menu.style.cssText = `
        position: fixed;
        left: ${rect.left}px;
        top:  ${rect.bottom + 6}px;
        z-index: 9999;
      `;

      items.forEach(({ label, cmd }) => {
        const item = document.createElement('button');
        item.className = 'slash-menu-item';
        item.textContent = label;
        item.addEventListener('mousedown', ev => {
          ev.preventDefault();
          // Delete the slash character first
          document.execCommand('delete');
          this.COMMANDS[cmd]?.();
          this._hideSlashMenu();
        });
        menu.appendChild(item);
      });

      // Keyboard nav
      let focused = -1;
      menu.addEventListener('keydown', ev => {
        const btns = $$('.slash-menu-item', menu);
        if (ev.key === 'ArrowDown') { focused = (focused + 1) % btns.length; btns[focused]?.focus(); }
        if (ev.key === 'ArrowUp')   { focused = (focused - 1 + btns.length) % btns.length; btns[focused]?.focus(); }
        if (ev.key === 'Escape')    this._hideSlashMenu();
      });

      document.body.appendChild(menu);
      this._slashMenu = menu;

      // Close on outside click
      setTimeout(() => {
        document.addEventListener('click', this._hideSlashMenu.bind(this), { once: true });
      }, 0);
    },

    _hideSlashMenu() {
      this._slashMenu?.remove();
      this._slashMenu = null;
    },

    // ── Helpers ───────────────────────────────────────────
    _onInput() {
      window.PlasmaDeck?.beforeUnload?.mark?.('notes-body');
      this.save();
    },

    _updateMeta(note) {
      const wordEl  = $('[data-note-words]');
      const charEl  = $('[data-note-chars]');
      const dateEl  = $('[data-note-date]');
      if (wordEl) wordEl.textContent = `${note.wordCount ?? 0} words`;
      if (charEl) charEl.textContent = `${note.charCount ?? 0} chars`;
      if (dateEl) dateEl.textContent = `Edited ${this._relativeTime(note.updatedAt)}`;
    },

    _relativeTime(ts) {
      const diff = Date.now() - ts;
      if (diff < 60000)    return 'just now';
      if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      return new Date(ts).toLocaleDateString();
    },

    _showSaveIndicator() {
      const el = $('[data-save-status]');
      if (!el) return;
      el.textContent = '✅ Saved';
      el.classList.add('visible');
      clearTimeout(el._timer);
      el._timer = setTimeout(() => { el.classList.remove('visible'); }, 2000);
    },

    _placeCursorAtEnd() {
      const range = document.createRange();
      const sel   = window.getSelection();
      range.selectNodeContents(this._el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    },
  };


  // ──────────────────────────────────────────────────────────
  // 3. NOTES LIST
  // ──────────────────────────────────────────────────────────

  const NotesList = {
    _container:    null,
    _activeId:     null,
    _filter:       { folderId: null, tag: null, query: '' },
    _sortBy:       'updatedAt',  // 'updatedAt' | 'createdAt' | 'title'
    _sortDir:      'desc',

    init(containerEl) {
      this._container = containerEl;
      this.render();
    },

    render() {
      if (!this._container) return;
      let notes = Store.getNotes();

      // Filter
      if (this._filter.folderId) notes = notes.filter(n => n.folderId === this._filter.folderId);
      if (this._filter.tag)      notes = notes.filter(n => n.tags.includes(this._filter.tag));
      if (this._filter.query) {
        const q = this._filter.query.toLowerCase();
        notes = notes.filter(n =>
          n.title.toLowerCase().includes(q) ||
          (n.content ? this._stripHTML(n.content).toLowerCase().includes(q) : false)
        );
      }

      // Sort
      notes.sort((a, b) => {
        let av = a[this._sortBy], bv = b[this._sortBy];
        if (this._sortBy === 'title') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
        return this._sortDir === 'desc' ? (av < bv ? 1 : -1) : (av > bv ? 1 : -1);
      });

      // Pinned first
      const pinned   = notes.filter(n => n.pinned);
      const unpinned = notes.filter(n => !n.pinned);
      const sorted   = [...pinned, ...unpinned];

      this._container.innerHTML = '';

      if (!sorted.length) {
        this._container.innerHTML =
          `<div class="notes-empty">
            <div class="empty-icon">📄</div>
            <div class="empty-text">No notes found</div>
            <button class="btn btn-primary btn-sm" data-action="new-note">+ New Note</button>
          </div>`;
        return;
      }

      sorted.forEach(note => this._container.appendChild(this._buildItem(note)));
    },

    _buildItem(note) {
      const excerpt = this._stripHTML(note.content).slice(0, 100);
      const date    = this._relTime(note.updatedAt);
      const isActive = note.id === this._activeId;

      const item = document.createElement('div');
      item.className = `note-item ${isActive ? 'active' : ''} ${note.pinned ? 'pinned' : ''}`;
      item.dataset.noteId = note.id;
      if (note.color) item.style.borderLeftColor = note.color;

      item.innerHTML = `
        <div class="note-item-header">
          <span class="note-item-title">${escHtml(note.title)}</span>
          ${note.pinned ? '<span class="note-pin" title="Pinned">📌</span>' : ''}
          <span class="note-item-date">${date}</span>
        </div>
        <div class="note-item-excerpt">${escHtml(excerpt)}</div>
        ${note.tags.length
          ? `<div class="note-item-tags">${note.tags.map(t => `<span class="note-tag">${escHtml(t)}</span>`).join('')}</div>`
          : ''}
      `;

      item.addEventListener('click', () => NotesApp.openNote(note.id));

      // Context menu
      item.addEventListener('contextmenu', e => {
        e.preventDefault();
        ContextMenu.show(e.clientX, e.clientY, [
          { label: note.pinned ? '📌 Unpin' : '📌 Pin',
            action: () => { Store.updateNote(note.id, { pinned: !note.pinned }); NotesList.render(); } },
          { label: '🎨 Set Color', action: () => NotesApp.promptColor(note.id) },
          { label: '🏷️ Edit Tags', action: () => NotesApp.promptTags(note.id) },
          { label: '📁 Move to Folder', action: () => NotesApp.promptMoveFolder(note.id) },
          { label: '📋 Duplicate', action: () => NotesApp.duplicateNote(note.id) },
          { label: '📥 Export as TXT', action: () => NotesApp.exportNote(note.id, 'txt') },
          { label: '📥 Export as HTML', action: () => NotesApp.exportNote(note.id, 'html') },
          { type: 'divider' },
          { label: '🗑️ Delete', danger: true, action: () => NotesApp.deleteNote(note.id) },
        ]);
      });

      return item;
    },

    refreshItem(note) {
      const existing = this._container?.querySelector(`[data-note-id="${note.id}"]`);
      if (existing) {
        const fresh = this._buildItem(note);
        existing.replaceWith(fresh);
      }
    },

    setActive(id) {
      $$('.note-item', this._container).forEach(el =>
        el.classList.toggle('active', el.dataset.noteId === id)
      );
      this._activeId = id;
    },

    setFilter(patch) {
      Object.assign(this._filter, patch);
      this.render();
    },

    _stripHTML(html) {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      return tmp.textContent ?? '';
    },

    _relTime(ts) {
      const d = Date.now() - ts;
      if (d < 60000)    return 'just now';
      if (d < 3600000)  return `${Math.floor(d / 60000)}m ago`;
      if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
      return new Date(ts).toLocaleDateString();
    },
  };


  // ──────────────────────────────────────────────────────────
  // 4. FOLDERS PANEL
  // ──────────────────────────────────────────────────────────

  const FoldersPanel = {
    _container: null,

    init(containerEl) {
      this._container = containerEl;
      this.render();

      // Add folder button
      document.addEventListener('click', e => {
        if (e.target.closest('[data-action="add-folder"]')) this._promptNewFolder();
      });
    },

    render() {
      if (!this._container) return;
      const folders = Store.getFolders();
      const notes   = Store.getNotes();

      this._container.innerHTML = `
        <div class="folder-item ${!NotesList._filter.folderId ? 'active' : ''}"
             data-folder-id="">
          <span class="folder-icon">🗒️</span>
          <span class="folder-name">All Notes</span>
          <span class="folder-count">${notes.length}</span>
        </div>
        <div class="folder-item ${NotesList._filter.folderId === '__pinned__' ? 'active' : ''}"
             data-folder-id="__pinned__">
          <span class="folder-icon">📌</span>
          <span class="folder-name">Pinned</span>
          <span class="folder-count">${notes.filter(n => n.pinned).length}</span>
        </div>
      `;

      folders.forEach(folder => {
        const count = notes.filter(n => n.folderId === folder.id).length;
        const item  = document.createElement('div');
        item.className = `folder-item ${NotesList._filter.folderId === folder.id ? 'active' : ''}`;
        item.dataset.folderId = folder.id;
        item.innerHTML = `
          <span class="folder-icon">${escHtml(folder.icon)}</span>
          <span class="folder-name">${escHtml(folder.name)}</span>
          <span class="folder-count">${count}</span>
          <button class="folder-delete-btn" data-delete-folder="${escHtml(folder.id)}" title="Delete folder">×</button>
        `;
        this._container.appendChild(item);
      });

      // Footer: Add folder
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-ghost btn-sm folder-add-btn';
      addBtn.setAttribute('data-action', 'add-folder');
      addBtn.textContent = '+ Add Folder';
      this._container.appendChild(addBtn);

      // Click events
      this._container.addEventListener('click', async e => {
        const delBtn = e.target.closest('[data-delete-folder]');
        if (delBtn) {
          e.stopPropagation();
          if (await pdConfirm('Delete this folder? Notes will move to Personal.')) {
            Store.deleteFolder(delBtn.dataset.deleteFolder);
            this.render();
            NotesList.render();
          }
          return;
        }
        const item = e.target.closest('[data-folder-id]');
        if (item) {
          const fid = item.dataset.folderId;
          if (fid === '__pinned__') {
            NotesList.setFilter({ folderId: null, tag: null });
            // Manually filter pinned
            NotesList._filter._pinned = true;
          } else {
            NotesList._filter._pinned = false;
            NotesList.setFilter({ folderId: fid || null });
          }
          this.render();
        }
      }, { capture: true });
    },

    _promptNewFolder() {
      const name = window.prompt('Folder name:');
      if (name?.trim()) {
        Store.createFolder(name.trim());
        this.render();
      }
    },
  };


  // ──────────────────────────────────────────────────────────
  // 5. TAGS CLOUD
  // ──────────────────────────────────────────────────────────

  const TagsCloud = {
    render(containerEl) {
      if (!containerEl) return;
      const notes   = Store.getNotes();
      const tagMap  = {};
      notes.forEach(n => n.tags.forEach(t => { tagMap[t] = (tagMap[t] ?? 0) + 1; }));

      containerEl.innerHTML = '';
      if (!Object.keys(tagMap).length) {
        containerEl.textContent = 'No tags yet.';
        return;
      }

      Object.entries(tagMap).forEach(([tag, count]) => {
        const el = document.createElement('span');
        el.className = `note-tag ${NotesList._filter.tag === tag ? 'active' : ''}`;
        el.textContent = `${tag} (${count})`;
        el.addEventListener('click', () => {
          NotesList.setFilter({ tag: NotesList._filter.tag === tag ? null : tag });
          TagsCloud.render(containerEl);
        });
        containerEl.appendChild(el);
      });
    },
  };


  // ──────────────────────────────────────────────────────────
  // 6. CONTEXT MENU
  // ──────────────────────────────────────────────────────────

  const ContextMenu = {
    _el: null,

    show(x, y, items) {
      this.hide();
      const menu = document.createElement('div');
      menu.className = 'context-menu';

      items.forEach(item => {
        if (item.type === 'divider') {
          menu.appendChild(document.createElement('hr'));
          return;
        }
        const btn = document.createElement('button');
        btn.className = `context-menu-item ${item.danger ? 'danger' : ''}`;
        btn.textContent = item.label;
        btn.addEventListener('click', () => { item.action?.(); this.hide(); });
        menu.appendChild(btn);
      });

      // Viewport clamp
      document.body.appendChild(menu);
      const rect = menu.getBoundingClientRect();
      menu.style.left = `${Math.min(x, window.innerWidth  - rect.width  - 8)}px`;
      menu.style.top  = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;

      this._el = menu;
      setTimeout(() => document.addEventListener('click', this.hide.bind(this), { once: true }), 0);
    },

    hide() {
      this._el?.remove();
      this._el = null;
    },
  };


  // ──────────────────────────────────────────────────────────
  // 7. SEARCH
  // ──────────────────────────────────────────────────────────

  const NotesSearch = {
    init(inputEl) {
      if (!inputEl) return;
      inputEl.addEventListener('input', debounce(e => {
        NotesList.setFilter({ query: e.target.value.trim() });
      }, 300));

      inputEl.addEventListener('keydown', e => {
        if (e.key === 'Escape') { inputEl.value = ''; NotesList.setFilter({ query: '' }); }
      });
    },
  };


  // ──────────────────────────────────────────────────────────
  // 8. EXPORT / IMPORT
  // ──────────────────────────────────────────────────────────

  const NotesExport = {
    exportAll(format = 'json') {
      const notes = Store.getNotes();
      if (format === 'json') {
        this._download('plasma-notes.json', JSON.stringify(notes, null, 2), 'application/json');
      } else if (format === 'md') {
        const md = notes.map(n =>
          `# ${n.title}\n\n${this._htmlToMd(n.content)}\n\n---\n`
        ).join('\n');
        this._download('plasma-notes.md', md, 'text/markdown');
      }
    },

    exportNote(id, format = 'html') {
      const note = Store.getNote(id);
      if (!note) return;
      if (format === 'html') {
        const safeTitle = escHtml(note.title);
        const safeContent = Editor._sanitize(note.content);
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
          <title>${safeTitle}</title></head><body>
          <h1>${safeTitle}</h1>${safeContent}</body></html>`;
        this._download(`${safeFilename(note.title)}.html`, html, 'text/html');
      } else if (format === 'txt') {
        const tmp = document.createElement('div');
        tmp.innerHTML = Editor._sanitize(note.content);
        this._download(`${safeFilename(note.title)}.txt`, `${note.title}\n\n${tmp.textContent}`, 'text/plain');
      }
    },

    importJSON(file) {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const notes = JSON.parse(e.target.result);
          if (!Array.isArray(notes)) throw new Error('Invalid format');
          let imported = 0;
          notes.forEach(n => {
            if (!n || typeof n !== 'object') return;
            const note = {
              ...n,
              id: String(n.id || uid('note')),
              title: String(n.title || 'Imported Note').slice(0, 200),
              content: Editor._sanitize(n.content || ''),
              tags: Array.isArray(n.tags) ? n.tags.map(String).slice(0, 30) : [],
              folderId: String(n.folderId || 'default'),
              createdAt: Number(n.createdAt) || Date.now(),
              updatedAt: Number(n.updatedAt) || Date.now(),
            };
            if (!Store.getNote(note.id)) {
              const existing = Store.getNotes();
              existing.push(note);
              Store.saveNotes(existing);
              imported++;
            }
          });
          NotesList.render();
          window.PlasmaDeck?.Toast?.success(`Imported ${imported} notes.`);
        } catch {
          window.PlasmaDeck?.Toast?.error('Invalid JSON file.');
        }
      };
      reader.readAsText(file);
    },

    _htmlToMd(html) {
      const tmp = document.createElement('div');
      tmp.innerHTML = Editor._sanitize(html);
      return tmp.textContent ?? '';
    },

    _download(filename, content, mime) {
      const blob = new Blob([content], { type: mime });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  };


  // ──────────────────────────────────────────────────────────
  // 9. TOOLBAR
  // ──────────────────────────────────────────────────────────

  const Toolbar = {
    init(toolbarEl) {
      if (!toolbarEl) return;
      toolbarEl.addEventListener('mousedown', e => {
        const btn = e.target.closest('[data-cmd], [data-cmd-block]');
        if (!btn) return;
        e.preventDefault(); // prevent blur

        if (btn.dataset.cmdBlock) {
          Editor.COMMANDS[btn.dataset.cmdBlock]?.();
        } else {
          Editor.COMMANDS[btn.dataset.cmd]?.();
        }
      });

      // Font size
      const sizeSelect = toolbarEl.querySelector('[data-font-size]');
      if (sizeSelect) {
        sizeSelect.addEventListener('change', () => {
          document.execCommand('fontSize', false, sizeSelect.value);
        });
      }

      // Font family
      const fontSelect = toolbarEl.querySelector('[data-font-family]');
      if (fontSelect) {
        fontSelect.addEventListener('change', () => {
          document.execCommand('fontName', false, fontSelect.value);
        });
      }

      // Text color
      const colorInput = toolbarEl.querySelector('[data-text-color]');
      if (colorInput) {
        colorInput.addEventListener('input', () => {
          document.execCommand('foreColor', false, colorInput.value);
        });
      }

      // Highlight color
      const hlInput = toolbarEl.querySelector('[data-highlight-color]');
      if (hlInput) {
        hlInput.addEventListener('input', () => {
          document.execCommand('hiliteColor', false, hlInput.value);
        });
      }
    },
  };


  // ──────────────────────────────────────────────────────────
  // 10. MAIN APP CONTROLLER
  // ──────────────────────────────────────────────────────────

  const NotesApp = {
    _inited: false,
    init() {
      if (this._inited) return;
      // Only initialize when the notes view DOM exists (supports SPA route injection).
      if (!document.querySelector('[data-notes-editor]')) return;
      this._inited = true;
      // Mount editor
      const editorEl = $('[data-notes-editor]');
      if (editorEl) Editor.mount(editorEl);

      // Init list
      NotesList.init($('[data-notes-list]'));

      // Init folders
      FoldersPanel.init($('[data-folders-panel]'));

      // Init tags
      TagsCloud.render($('[data-tags-cloud]'));

      // Init search
      NotesSearch.init($('[data-notes-search]'));

      // Init toolbar
      Toolbar.init($('[data-notes-toolbar]'));

      // Title input
      const titleInput = $('[data-note-title-input]');
      if (titleInput) {
        titleInput.addEventListener('input', () => {
          window.PlasmaDeck?.beforeUnload?.mark?.('notes-title');
          clearTimeout(titleInput._pdTitleT);
          titleInput._pdTitleT = setTimeout(() => {
            if (Editor._currentId) {
              Store.updateNote(Editor._currentId, { title: titleInput.value });
              NotesList.render();
            }
            window.PlasmaDeck?.beforeUnload?.unmark?.('notes-title');
          }, 500);
        });
      }

      // New note button
      document.addEventListener('click', e => {
        const t = e?.target;
        const target = t && t.nodeType === 1 ? t : t?.parentElement;
        if (!target) return;
        if (target.closest('[data-action="new-note"]')) this.newNote();
        if (target.closest('[data-action="export-all"]')) NotesExport.exportAll('json');
        if (target.closest('[data-action="export-md"]'))  NotesExport.exportAll('md');
        if (target.closest('[data-action="import-notes"]')) {
          const input = document.createElement('input');
          input.type = 'file'; input.accept = '.json';
          input.onchange = e => NotesExport.importJSON(e.target.files[0]);
          input.click();
        }
      });

      // Open first note or create one
      const notes = Store.getNotes();
      if (notes.length) this.openNote(notes[0].id);
      else this.newNote();
    },

    newNote(folderId = NotesList._filter.folderId ?? 'default') {
      const note = Store.createNote({ folderId });
      NotesList.render();
      this.openNote(note.id);
      window.PlasmaDeck?.bus?.emit('note:create', { note });
    },

    openNote(id) {
      Editor.save(true); // Save current
      const note = Store.getNote(id);
      if (!note) return;
      Editor.load(note);
      NotesList.setActive(id);

      const pane = $('[data-notes-main-pane]');
      if (pane) pane.classList.add('has-note');
    },

    async deleteNote(id) {
      if (!await pdConfirm('Delete this note permanently?')) return;
      Store.deleteNote(id);
      if (Editor._currentId === id) {
        Editor._currentId = null;
        if (Editor._el) Editor._el.innerHTML = '';
        const titleInput = $('[data-note-title-input]');
        if (titleInput) titleInput.value = '';
      }
      NotesList.render();
      FoldersPanel.render();
      window.PlasmaDeck?.bus?.emit('note:delete', { id });
    },

    duplicateNote(id) {
      const note = Store.getNote(id);
      if (!note) return;
      const copy = Store.createNote({
        ...note,
        id:    undefined,
        title: `${note.title} (Copy)`,
      });
      NotesList.render();
      this.openNote(copy.id);
    },

    promptColor(id) {
      const color = window.prompt('Enter color (hex or name):', '#3b82f6');
      if (color) Store.updateNote(id, { color });
      NotesList.render();
    },

    promptTags(id) {
      const note = Store.getNote(id);
      const raw  = window.prompt('Enter tags (comma-separated):', note?.tags.join(', ') ?? '');
      if (raw !== null) {
        const tags = raw.split(',').map(t => t.trim()).filter(Boolean);
        Store.updateNote(id, { tags });
        NotesList.render();
        TagsCloud.render($('[data-tags-cloud]'));
      }
    },

    promptMoveFolder(id) {
      const folders = Store.getFolders();
      const list    = folders.map((f, i) => `${i + 1}. ${f.name}`).join('\n');
      const input   = window.prompt(`Move to folder:\n${list}`, '1');
      const idx     = parseInt(input, 10) - 1;
      if (!isNaN(idx) && folders[idx]) {
        Store.updateNote(id, { folderId: folders[idx].id });
        NotesList.render();
        FoldersPanel.render();
      }
    },

    exportNote: NotesExport.exportNote.bind(NotesExport),
  };

  /**
   * Flush pending note body (debounced) and title to storage — used before tab unload.
   */
  NotesApp.flushPendingSave = function flushPendingSave() {
    try {
      Editor.save(true);
      const titleInput = $('[data-note-title-input]');
      if (titleInput && Editor._currentId) {
        Store.updateNote(Editor._currentId, { title: titleInput.value.trim() || 'Untitled' });
        NotesList.render();
      }
      window.PlasmaDeck?.beforeUnload?.unmark?.('notes-body');
      window.PlasmaDeck?.beforeUnload?.unmark?.('notes-title');
    } catch {
      /* ignore */
    }
  };


  // ──────────────────────────────────────────────────────────
  // BOOT
  // ──────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => NotesApp.init());
  } else {
    NotesApp.init();
  }

  // Public API
  window.PlasmaNotesApp = NotesApp;
  window.PlasmaNotesStore = Store;

})();
