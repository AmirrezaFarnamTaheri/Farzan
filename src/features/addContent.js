import {
  addMediaFiles,
  addPdfFile,
  addRemoteLink,
  addTopic,
  addVideoFile,
  initUserLibrary,
  isSafeRemoteUrl,
  upsertCourse,
} from './userLibrary.js';

function toast(type, message) {
  const T = window.OpenCourseDeck?.Toast;
  if (!T) return;
  const fn = T[type];
  if (typeof fn === 'function') return fn(message);
  T.show?.({ message, type });
}

function announce(message) {
  const region = document.getElementById('aria-announcer');
  if (region) region.textContent = message;
}

function progressImporter() {
  return window.ProgressStats?.importJSON
    || window.OpenCourseDeck?.ProgressStats?.importJSON
    || null;
}

function field({ label, type = 'text', name, value = '', placeholder = '', required = false, tag = 'input', options }) {
  const wrap = document.createElement('label');
  wrap.className = 'form-group';
  wrap.style.display = 'grid';
  wrap.style.gap = '6px';
  wrap.style.marginBottom = '12px';
  const caption = document.createElement('span');
  caption.className = 'form-label';
  caption.textContent = label;

  if (tag === 'select' || Array.isArray(options)) {
    const select = document.createElement('select');
    select.className = 'select';
    select.name = name;
    select.required = required;
    (options || []).forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      if (String(opt.value) === String(value)) option.selected = true;
      select.appendChild(option);
    });
    wrap.append(caption, select);
    return { wrap, input: select };
  }

  const input = document.createElement(tag);
  input.className = tag === 'textarea' ? 'textarea' : 'input';
  if (tag !== 'textarea') input.type = type;
  input.name = name;
  input.value = value;
  if (placeholder) input.placeholder = placeholder;
  input.required = required;
  if (tag === 'textarea') input.rows = 3;
  wrap.append(caption, input);
  return { wrap, input };
}

function openForm({ title, fields, confirmLabel = 'Save', onSubmit }) {
  const Modal = window.OpenCourseDeck?.Modal;
  if (typeof Modal?.create !== 'function') {
    return onSubmit(Object.fromEntries(fields.map((item) => [item.name, item.value || ''])));
  }

  const body = document.createElement('form');
  body.noValidate = true;
  const controls = fields.map((spec) => {
    const created = field(spec);
    body.appendChild(created.wrap);
    return created;
  });

  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn btn-ghost';
  cancel.textContent = 'Cancel';
  const confirm = document.createElement('button');
  confirm.type = 'submit';
  confirm.className = 'btn btn-primary';
  confirm.textContent = confirmLabel;
  footer.append(cancel, confirm);

  const modal = Modal.create({ title, body, footer, size: 'sm' });
  cancel.addEventListener('click', () => Modal.close(modal));
  body.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = {};
    for (const { input } of controls) {
      values[input.name] = String(input.value || '').trim();
      if (input.required && !values[input.name]) {
        input.focus();
        announce(`${input.name} is required.`);
        return;
      }
    }
    confirm.disabled = true;
    try {
      await onSubmit(values);
      Modal.close(modal);
    } catch (error) {
      toast('error', error?.message || 'Could not save content');
      confirm.disabled = false;
    }
  });
  controls[0]?.input?.focus?.();
  return modal;
}

function menuItems() {
  return [...document.querySelectorAll('#add-content-menu [role="menuitem"], #add-content-menu [data-action]')]
    .filter((el) => !el.hidden && el.getAttribute('aria-disabled') !== 'true');
}

function positionMenu() {
  const menu = document.getElementById('add-content-menu');
  const trigger = document.getElementById('topbar-add-btn');
  if (!menu || !trigger) return;
  menu.classList.add('is-anchored');
  const rect = trigger.getBoundingClientRect();
  const width = menu.offsetWidth || 260;
  const height = menu.offsetHeight || 320;
  const gap = 8;
  let left = rect.right - width;
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
  let top = rect.bottom + gap;
  if (top + height > window.innerHeight - 8) {
    top = Math.max(8, rect.top - height - gap);
  }
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
  menu.style.right = 'auto';
  menu.style.bottom = 'auto';
}

function setMenuOpen(open, { restoreFocus = false } = {}) {
  const menu = document.getElementById('add-content-menu');
  const trigger = document.getElementById('topbar-add-btn');
  if (!menu) return;
  menu.setAttribute('aria-hidden', open ? 'false' : 'true');
  menu.toggleAttribute('inert', !open);
  trigger?.setAttribute('aria-expanded', open ? 'true' : 'false');
  trigger?.classList.toggle('is-open', Boolean(open));
  if (open) {
    positionMenu();
    requestAnimationFrame(() => {
      positionMenu();
      menuItems()[0]?.focus?.();
    });
    return;
  }
  if (restoreFocus) trigger?.focus?.();
}

function isMenuOpen() {
  return document.getElementById('add-content-menu')?.getAttribute('aria-hidden') === 'false';
}

export function openAddMenu() {
  setMenuOpen(true);
}

export function closeAddMenu({ restoreFocus = false } = {}) {
  setMenuOpen(false, { restoreFocus });
}

function pickFile(inputId) {
  const input = document.getElementById(inputId);
  if (!input) throw new Error('File picker is missing from the page');
  input.value = '';
  input.click();
}

function currentHash() {
  return String(window.location.hash || '');
}

function alreadyOn(route) {
  const hash = currentHash();
  return hash === route || hash.startsWith(`${route}?`) || hash.startsWith(`${route}/`);
}

function rememberLibraryCourse(courseId) {
  const id = String(courseId || '').trim();
  if (!id) return;
  try { sessionStorage.setItem('ocd_pending_library_course', id); } catch { /* ignore */ }
}

async function afterAdd(result, message, { route = '#/courses' } = {}) {
  toast('success', message);
  announce(message);
  rememberLibraryCourse(result?.courseId || result?.id);
  // Stay on a live Courses view: remounting would tear down the player.
  if (alreadyOn('#/courses')) return result;
  if (route && !alreadyOn(route)) {
    try { window.OpenCourseDeck?.Router?.navigate?.(route); } catch { /* ignore */ }
    return result;
  }
  if (alreadyOn('#/my-courses')) {
    try { window.OpenCourseDeck?.Router?.refresh?.(); } catch { /* ignore */ }
  }
  return result;
}

export function classifyLibraryFile(file) {
  const type = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  if (type.startsWith('video/') || /\.(mp4|webm|ogg|ogv|mov|m4v|avi|mkv)$/i.test(name)) return 'video';
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (type.includes('json') || /\.(json|ocdbackup|plasmabackup)$/i.test(name)) return 'backup';
  return '';
}

export async function addVideo() {
  pickFile('file-input-video');
}

export async function addPdf() {
  pickFile('file-input-pdf');
}

export function createTopic() {
  return openForm({
    title: 'Create topic',
    confirmLabel: 'Create topic',
    fields: [
      { label: 'Topic title', name: 'title', placeholder: 'e.g. Week 1 lecture', required: true },
      { label: 'Course title', name: 'courseTitle', placeholder: 'My Library', value: 'My Library' },
    ],
    onSubmit: async ({ title, courseTitle }) => {
      const result = await addTopic({ title, courseTitle: courseTitle || 'My Library' });
      await afterAdd(result, `Topic “${title}” added`);
    },
  });
}

export function createCourse() {
  return openForm({
    title: 'Create course',
    confirmLabel: 'Create course',
    fields: [
      { label: 'Course title', name: 'title', placeholder: 'e.g. Anatomy review', required: true },
      { label: 'Description', name: 'description', tag: 'textarea', placeholder: 'What this course covers' },
    ],
    onSubmit: async ({ title, description }) => {
      const result = await upsertCourse({ title, description });
      try {
        const existing = await window.DB?.getSetting?.('ocd_my_courses');
        const list = Array.isArray(existing) ? existing : [];
        await window.DB?.saveSetting?.('ocd_my_courses', [{
          id: result.id,
          title: result.title,
          description: description || '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }, ...list.filter((item) => item?.id !== result.id)]);
      } catch { /* my-courses list is a convenience mirror */ }
      await afterAdd(result, `Course “${result.title}” created`, { route: '#/my-courses' });
    },
  });
}

export function addLink() {
  return openForm({
    title: 'Add URL',
    confirmLabel: 'Add URL',
    fields: [
      { label: 'URL', name: 'url', type: 'url', placeholder: 'https://…', required: true },
      { label: 'Title', name: 'title', placeholder: 'Optional label' },
      {
        label: 'Kind',
        name: 'kind',
        tag: 'select',
        value: 'video',
        options: [
          { value: 'video', label: 'Video' },
          { value: 'pdf', label: 'PDF' },
          { value: 'embed', label: 'Embed / iframe' },
        ],
      },
    ],
    onSubmit: async ({ url, title, kind }) => {
      if (!isSafeRemoteUrl(url)) throw new Error('Enter an http or https URL');
      const type = ['video', 'pdf', 'embed'].includes(kind) ? kind : 'video';
      const result = await addRemoteLink({ url, title, kind: type });
      await afterAdd(result, 'Link added to your library');
    },
  });
}

export function importBackup() {
  const importer = progressImporter();
  if (typeof importer === 'function') {
    importer();
    return;
  }
  pickFile('file-input-backup');
}

async function addFilesOfKind(files, kind) {
  const list = [...files].filter(Boolean);
  const accepted = list.filter((file) => classifyLibraryFile(file) === kind);
  const skipped = list.length - accepted.length;
  if (skipped) {
    toast('info', `${skipped} file${skipped === 1 ? '' : 's'} skipped — only ${kind === 'video' ? 'videos' : 'PDFs'} can be added here`);
  }
  if (!accepted.length) return { count: 0 };
  const results = typeof addMediaFiles === 'function'
    ? await addMediaFiles(accepted, { kind })
    : await Promise.all(accepted.map((file) => (kind === 'pdf' ? addPdfFile(file) : addVideoFile(file))));
  return { count: results.length, courseId: results[results.length - 1]?.courseId };
}

async function handleVideoFiles(files, { navigate = true } = {}) {
  const result = await addFilesOfKind(files, 'video');
  if (!result.count) return result;
  const message = result.count === 1 ? 'Video added to My Library' : `${result.count} videos added`;
  if (navigate) return afterAdd(result, message);
  toast('success', message);
  announce(message);
  return result;
}

async function handlePdfFiles(files, { navigate = true } = {}) {
  const result = await addFilesOfKind(files, 'pdf');
  if (!result.count) return result;
  const message = result.count === 1 ? 'PDF added to My Library' : `${result.count} PDFs added`;
  if (navigate) return afterAdd(result, message);
  toast('success', message);
  announce(message);
  return result;
}

function bindFileInput(id, handler) {
  const input = document.getElementById(id);
  if (!input || input.dataset.pdLibraryBound === 'true') return;
  input.dataset.pdLibraryBound = 'true';
  input.addEventListener('change', async () => {
    try {
      await handler(input.files || []);
    } catch (error) {
      toast('error', error?.message || 'Could not add file');
    } finally {
      input.value = '';
    }
  });
}

function syncFullscreenButton() {
  const btn = document.getElementById('fullscreen-btn');
  if (!btn) return;
  const on = Boolean(document.fullscreenElement);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Enter fullscreen');
}

function bindChrome() {
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn && themeBtn.dataset.pdChromeBound !== 'true' && !themeBtn.hasAttribute('data-theme-toggle')) {
    themeBtn.dataset.pdChromeBound = 'true';
    themeBtn.addEventListener('click', () => {
      window.OpenCourseDeck?.ThemeManager?.toggle?.();
    });
  }

  const fullscreenBtn = document.getElementById('fullscreen-btn');
  if (fullscreenBtn && fullscreenBtn.dataset.pdChromeBound !== 'true') {
    fullscreenBtn.dataset.pdChromeBound = 'true';
    syncFullscreenButton();
    fullscreenBtn.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen?.();
        else await document.documentElement.requestFullscreen?.();
      } catch {
        toast('info', 'Fullscreen is not available in this browser');
      } finally {
        syncFullscreenButton();
      }
    });
    document.addEventListener('fullscreenchange', syncFullscreenButton);
  }

  const searchBtn = document.getElementById('topbar-search-btn');
  if (searchBtn && searchBtn.dataset.pdChromeBound !== 'true') {
    searchBtn.dataset.pdChromeBound = 'true';
    searchBtn.addEventListener('click', () => {
      const input = document.getElementById('sidebar-search');
      if (input) {
        input.focus();
        input.select?.();
        return;
      }
      window.OpenCourseDeck?.CommandPalette?.open?.();
    });
  }
}

function hasFiles(event) {
  return [...(event.dataTransfer?.types || [])].includes('Files');
}

const OWNED_DROP_SELECTOR = [
  '[data-pdf-viewer]',
  '[data-file-input]',
  '[data-drop-zone]',
  '#studio-canvas',
  'input[type="file"]',
  'textarea',
  '[contenteditable="true"]',
].join(', ');

function eventPath(event) {
  if (typeof event.composedPath === 'function') {
    try { return event.composedPath(); } catch { /* fall through */ }
  }
  const path = [];
  let node = event.target;
  while (node) {
    path.push(node);
    node = node.parentNode || node.host;
  }
  return path;
}

export function isOwnedDropTarget(event) {
  return eventPath(event).some((node) => {
    if (!node || node.nodeType !== 1) return false;
    return Boolean(node.matches?.(OWNED_DROP_SELECTOR) || node.closest?.(OWNED_DROP_SELECTOR));
  });
}

function bindDropTarget() {
  if (document.documentElement.dataset.pdLibraryDropBound === 'true') return;
  document.documentElement.dataset.pdLibraryDropBound = 'true';
  let overlay = document.getElementById('library-drop-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'library-drop-overlay';
    overlay.className = 'library-drop-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<div class="library-drop-card"><span class="library-drop-icon" aria-hidden="true"><svg class="icon"><use href="#i-upload"/></svg></span><strong>Drop videos or PDFs</strong><span class="library-drop-hint">They stay in My Library on this device.</span></div>';
    document.body.appendChild(overlay);
  }
  let depth = 0;
  const show = (on) => {
    overlay.classList.toggle('is-visible', on);
    overlay.setAttribute('aria-hidden', on ? 'false' : 'true');
  };
  document.addEventListener('dragenter', (event) => {
    if (!hasFiles(event) || isOwnedDropTarget(event)) return;
    event.preventDefault();
    depth += 1;
    show(true);
  });
  document.addEventListener('dragover', (event) => {
    if (!hasFiles(event) || isOwnedDropTarget(event)) return;
    event.preventDefault();
    try { event.dataTransfer.dropEffect = 'copy'; } catch { /* ignore */ }
  });
  document.addEventListener('dragleave', (event) => {
    if (isOwnedDropTarget(event)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) show(false);
  });
  document.addEventListener('drop', async (event) => {
    if (!hasFiles(event) || isOwnedDropTarget(event)) return;
    event.preventDefault();
    depth = 0;
    show(false);
    const files = [...(event.dataTransfer?.files || [])];
    const videos = files.filter((file) => classifyLibraryFile(file) === 'video');
    const pdfs = files.filter((file) => classifyLibraryFile(file) === 'pdf');
    const backups = files.filter((file) => classifyLibraryFile(file) === 'backup');
    const skipped = files.length - videos.length - pdfs.length - backups.length;
    try {
      const added = [];
      if (videos.length) added.push(await handleVideoFiles(videos, { navigate: false }));
      if (pdfs.length) added.push(await handlePdfFiles(pdfs, { navigate: false }));
      if (backups[0]) {
        const importer = progressImporter();
        if (typeof importer === 'function') await importer(backups[0]);
        else toast('info', 'Backup import is unavailable');
      }
      const count = added.reduce((sum, item) => sum + (item?.count || 0), 0);
      if (count) {
        await afterAdd(
          { count, courseId: added.at(-1)?.courseId },
          count === 1 ? 'File added to My Library' : `${count} files added to My Library`,
        );
      }
      if (skipped) toast('info', `${skipped} file${skipped === 1 ? '' : 's'} skipped (videos, PDFs, and backups only)`);
    } catch (error) {
      toast('error', error?.message || 'Could not add dropped files');
    }
  });
}

function bindMenuKeyboard() {
  if (document.documentElement.dataset.pdAddMenuKeysBound === 'true') return;
  document.documentElement.dataset.pdAddMenuKeysBound = 'true';
  document.addEventListener('keydown', (event) => {
    if (!isMenuOpen()) return;
    const items = menuItems();
    if (event.key === 'Escape') {
      event.preventDefault();
      setMenuOpen(false, { restoreFocus: true });
      return;
    }
    if (!items.length) return;
    const index = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      let next = 0;
      if (event.key === 'ArrowDown') next = index < 0 ? 0 : (index + 1) % items.length;
      else if (event.key === 'ArrowUp') next = index <= 0 ? items.length - 1 : index - 1;
      else if (event.key === 'End') next = items.length - 1;
      items[next]?.focus?.();
    }
  });
}

export function initAddContent(root = window) {
  initUserLibrary(root);
  const pd = root.OpenCourseDeck = root.OpenCourseDeck || {};
  pd.AddContent = {
    addVideo,
    addPdf,
    createTopic,
    createCourse,
    addLink,
    importBackup,
    openMenu: openAddMenu,
    closeMenu: closeAddMenu,
    classifyLibraryFile,
    isOwnedDropTarget,
  };

  setMenuOpen(false);

  bindChrome();
  bindDropTarget();
  bindFileInput('file-input-video', handleVideoFiles);
  bindFileInput('file-input-pdf', handlePdfFiles);
  bindFileInput('file-input-backup', async (files) => {
    const file = files[0];
    if (!file) return;
    const importer = progressImporter();
    if (typeof importer !== 'function') throw new Error('Backup import is unavailable');
    await importer(file);
  });

  const addBtn = document.getElementById('topbar-add-btn');
  const menu = document.getElementById('add-content-menu');
  if (addBtn && addBtn.dataset.pdAddBound !== 'true') {
    addBtn.dataset.pdAddBound = 'true';
    addBtn.setAttribute('aria-haspopup', 'menu');
    addBtn.setAttribute('aria-expanded', 'false');
    addBtn.setAttribute('aria-controls', 'add-content-menu');
    addBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setMenuOpen(!isMenuOpen());
    });
  }

  if (menu && menu.dataset.pdAddBound !== 'true') {
    menu.dataset.pdAddBound = 'true';
    menu.addEventListener('click', (event) => {
      const item = event.target?.closest?.('[data-action]');
      if (!item) return;
      event.preventDefault();
      setMenuOpen(false);
      const action = item.dataset.action;
      const run = {
        'add-video': addVideo,
        'add-pdf': addPdf,
        'create-topic': createTopic,
        'create-course': createCourse,
        'add-link': addLink,
        'add-url': addLink,
        'import-backup': importBackup,
      }[action];
      try { run?.(); } catch (error) { toast('error', error?.message || 'Action failed'); }
    });
  }

  bindMenuKeyboard();

  if (document.documentElement.dataset.pdAddMenuBound !== 'true') {
    document.documentElement.dataset.pdAddMenuBound = 'true';
    document.addEventListener('click', (event) => {
      if (!isMenuOpen()) return;
      const target = event.target;
      if (target?.closest?.('#add-content-menu, #topbar-add-btn')) return;
      setMenuOpen(false);
    });
    window.addEventListener('resize', () => { if (isMenuOpen()) positionMenu(); });
  }

  return pd.AddContent;
}
