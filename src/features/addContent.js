import {
  addPdfFile,
  addRemoteLink,
  addTopic,
  addVideoFile,
  initUserLibrary,
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

function field({ label, type = 'text', name, value = '', placeholder = '', required = false, tag = 'input' }) {
  const wrap = document.createElement('label');
  wrap.className = 'form-group';
  wrap.style.display = 'grid';
  wrap.style.gap = '6px';
  wrap.style.marginBottom = '12px';
  const caption = document.createElement('span');
  caption.className = 'form-label';
  caption.textContent = label;
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

function setMenuOpen(open) {
  const menu = document.getElementById('add-content-menu');
  const trigger = document.getElementById('topbar-add-btn');
  if (!menu) return;
  menu.setAttribute('aria-hidden', open ? 'false' : 'true');
  trigger?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function isMenuOpen() {
  return document.getElementById('add-content-menu')?.getAttribute('aria-hidden') === 'false';
}

function pickFile(inputId) {
  const input = document.getElementById(inputId);
  if (!input) throw new Error('File picker is missing from the page');
  input.value = '';
  input.click();
}

async function afterAdd(result, message) {
  toast('success', message);
  announce(message);
  try { window.OpenCourseDeck?.Router?.navigate?.('#/courses'); } catch {}
  return result;
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
      } catch {}
      await afterAdd(result, `Course “${result.title}” created`);
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
      { label: 'Kind (video, pdf, or embed)', name: 'kind', value: 'video' },
    ],
    onSubmit: async ({ url, title, kind }) => {
      const type = ['video', 'pdf', 'embed'].includes(kind) ? kind : 'video';
      const result = await addRemoteLink({ url, title, kind: type });
      await afterAdd(result, 'Link added to your library');
    },
  });
}

export function importBackup() {
  try {
    window.ProgressStats?.importJSON?.();
  } catch {
    pickFile('file-input-backup');
  }
}

async function handleVideoFiles(files) {
  const list = [...files].filter(Boolean);
  if (!list.length) return;
  for (const file of list) {
    await addVideoFile(file);
  }
  await afterAdd({ count: list.length }, list.length === 1 ? 'Video added to My Library' : `${list.length} videos added`);
}

async function handlePdfFiles(files) {
  const list = [...files].filter(Boolean);
  if (!list.length) return;
  for (const file of list) {
    await addPdfFile(file);
  }
  await afterAdd({ count: list.length }, list.length === 1 ? 'PDF added to My Library' : `${list.length} PDFs added`);
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

function bindChrome() {
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn && themeBtn.dataset.pdChromeBound !== 'true') {
    themeBtn.dataset.pdChromeBound = 'true';
    themeBtn.addEventListener('click', () => {
      window.OpenCourseDeck?.ThemeManager?.toggle?.();
    });
  }

  const fullscreenBtn = document.getElementById('fullscreen-btn');
  if (fullscreenBtn && fullscreenBtn.dataset.pdChromeBound !== 'true') {
    fullscreenBtn.dataset.pdChromeBound = 'true';
    fullscreenBtn.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen?.();
        else await document.documentElement.requestFullscreen?.();
      } catch {
        toast('info', 'Fullscreen is not available in this browser');
      }
    });
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
  };

  bindChrome();
  bindFileInput('file-input-video', handleVideoFiles);
  bindFileInput('file-input-pdf', handlePdfFiles);
  bindFileInput('file-input-backup', async (files) => {
    const file = files[0];
    if (!file) return;
    try { window.ProgressStats?.importJSON?.(); } catch {}
  });

  const addBtn = document.getElementById('topbar-add-btn');
  const menu = document.getElementById('add-content-menu');
  if (addBtn && addBtn.dataset.pdAddBound !== 'true') {
    addBtn.dataset.pdAddBound = 'true';
    addBtn.setAttribute('aria-haspopup', 'menu');
    addBtn.setAttribute('aria-expanded', 'false');
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

  if (document.documentElement.dataset.pdAddMenuBound !== 'true') {
    document.documentElement.dataset.pdAddMenuBound = 'true';
    document.addEventListener('click', (event) => {
      if (!isMenuOpen()) return;
      const target = event.target;
      if (target?.closest?.('#add-content-menu, #topbar-add-btn')) return;
      setMenuOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isMenuOpen()) setMenuOpen(false);
    });
  }

  return pd.AddContent;
}
