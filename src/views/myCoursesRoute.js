const LEGACY_COURSES_KEY = 'ocd_my_courses';
const CANONICAL_LIBRARY_KEY = 'ocd_user_library';

export function mountMyCoursesView({ setView, Toast = window.OpenCourseDeck?.Toast } = {}) {
  setView(`
    <section class="view view-my-courses">
      <div class="page-header my-courses-header">
        <div>
          <h1 class="page-title">My Courses</h1>
          <p class="page-subtitle">Add courses and organize your own study topics.</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-ghost" type="button" data-my-courses-add>
            <svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg>
            Add media
          </button>
        </div>
      </div>
      <div class="card card-filled my-courses-create-card">
        <div class="card-body">
          <div class="my-courses-form" data-my-course-form>
            <div class="my-courses-create-copy">
              <h2 class="my-courses-create-title">Start a course</h2>
              <p class="text-muted text-sm">Name the track first. Add lectures from the plus menu or by dropping files onto the page.</p>
            </div>
            <label class="my-courses-field">
              <span class="text-sm font-semibold">Course title</span>
              <input class="input" data-my-course-title required maxlength="120" placeholder="e.g. Advanced Neurology Review" />
            </label>
            <label class="my-courses-field">
              <span class="text-sm font-semibold">Description</span>
              <textarea class="input" data-my-course-description rows="3" maxlength="600" placeholder="What concepts, lectures, and resources this course covers"></textarea>
            </label>
            <div class="button-row">
              <button class="btn btn-primary" type="button" data-my-course-save>
                <svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg>
                Save Course
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="stat-grid" data-my-course-metrics></div>
      <div class="card card-filled my-courses-list-card">
        <div class="card-body">
          <div class="grid grid-3" data-my-course-list>
            <p>Loading courses...</p>
          </div>
        </div>
      </div>
      <section class="card card-filled" aria-labelledby="media-folder-heading">
        <div class="card-body">
          <h2 class="text-lg font-semibold" id="media-folder-heading">Keep a copy of your imported files</h2>
          <p class="text-sm text-muted">The JSON backup includes notes, courses and saved study state, but not your PDF/video bytes. Export these files to a folder alongside your JSON backup. Restore the JSON first, then restore this media folder on the new device. Available in supported browsers with folder access.</p>
          <div class="button-row">
            <button class="btn btn-ghost btn-sm" type="button" data-backup-media-folder>Export media folder</button>
            <button class="btn btn-ghost btn-sm" type="button" data-restore-media-folder>Restore media folder</button>
          </div>
          <p class="text-sm text-muted" data-media-backup-status role="status" aria-live="polite"></p>
        </div>
      </section>
      <section class="card card-filled" aria-label="Missing imported files" data-missing-library-section>
        <div class="card-body">
          <h2 class="text-lg font-semibold">Missing local files</h2>
          <p class="text-sm text-muted">A metadata-only backup keeps notes and progress linked, but local PDFs and videos must be found again on this device.</p>
          <div data-missing-library-files role="status">Checking local files…</div>
        </div>
      </section>
    </section>
  `);

  document.querySelector('[data-my-courses-add]')?.addEventListener('click', () => {
    window.OpenCourseDeck?.AddContent?.openMenu?.();
  });

  const backupStatus = document.querySelector('[data-media-backup-status]');
  const chooseFolder = async (mode) => {
    if (typeof window.showDirectoryPicker !== 'function') {
      throw new Error('Folder backup requires a browser with the File System Access API. Keep the original media and JSON backup in other browsers.');
    }
    return window.showDirectoryPicker({ mode });
  };
  const bindMediaAction = (selector, action) => {
    const button = document.querySelector(selector);
    button?.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      if (backupStatus) backupStatus.textContent = action === 'export' ? 'Preparing media export…' : 'Reading media folder…';
      try {
        const directory = await chooseFolder(action === 'export' ? 'readwrite' : 'read');
        const api = window.OpenCourseDeck?.UserLibrary;
        if (action === 'export') {
          if (typeof api?.exportMediaDirectory !== 'function') throw new Error('Media export unavailable');
          const result = await api.exportMediaDirectory(directory);
          if (backupStatus) backupStatus.textContent = `Exported ${result.files} local file(s). Keep this folder together with your portable JSON backup.`;
          Toast?.success?.('Media export completed');
        } else {
          if (typeof api?.importMediaDirectory !== 'function') throw new Error('Media restore unavailable');
          const result = await api.importMediaDirectory(directory);
          if (backupStatus) backupStatus.textContent = `Restored ${result.restored} local file(s); ${result.skipped} did not need restoration or are not linked here.`;
          Toast?.success?.('Media restore completed');
          await renderMissingFiles();
        }
      } catch (error) {
        if (error?.name !== 'AbortError') {
          const message = error?.message || 'Could not process media folder';
          if (backupStatus) backupStatus.textContent = message;
          Toast?.error?.(message);
        } else if (backupStatus) backupStatus.textContent = 'Folder selection cancelled.';
      } finally { button.disabled = false; }
    });
  };
  bindMediaAction('[data-backup-media-folder]', 'export');
  bindMediaAction('[data-restore-media-folder]', 'import');

  let savingCourse = false;
  document.querySelector('[data-my-course-save]')?.addEventListener('click', async (event) => {
    event.preventDefault();
    if (savingCourse) return;
    const button = event.currentTarget;
    const titleInput = document.querySelector('[data-my-course-title]');
    const descriptionInput = document.querySelector('[data-my-course-description]');
    const title = titleInput?.value.trim() || '';
    if (!title) {
      titleInput?.focus?.();
      Toast?.error?.('Enter a course title');
      return;
    }
    savingCourse = true;
    button.disabled = true;
    try {
      // The canonical UserLibrary setting is the single writable authority.
      // Legacy outlines are only imported when that setting never existed.
      const api = window.OpenCourseDeck?.UserLibrary;
      if (typeof api?.upsertCourse !== 'function') throw new Error('Course storage is unavailable');
      const record = await api.upsertCourse({
        title,
        description: descriptionInput?.value.trim() || '',
      });
      try { sessionStorage.setItem('ocd_active_import_course', record.id); } catch {}
      titleInput.value = '';
      if (descriptionInput) descriptionInput.value = '';
      Toast?.success?.('Course saved');
      await renderCourses();
    } catch (error) {
      console.warn('[My Courses] failed to save course:', error);
      Toast?.error?.('Unable to save the course. Check local storage and try again.');
    } finally {
      savingCourse = false;
      button.disabled = false;
    }
  });

  let pendingLibraryCourse = '';
  try {
    pendingLibraryCourse = sessionStorage.getItem('ocd_pending_library_course') || '';
  } catch {}

  renderCourses();
  void renderMissingFiles();

  async function renderMissingFiles() {
    const section = document.querySelector('[data-missing-library-section]');
    const container = document.querySelector('[data-missing-library-files]');
    if (!section || !container) return;
    const library = window.OpenCourseDeck?.UserLibrary;
    if (typeof library?.listMissingFiles !== 'function' || typeof library?.relinkFile !== 'function') {
      section.hidden = true;
      return;
    }
    let missing;
    try {
      missing = await library.listMissingFiles();
    } catch (error) {
      container.textContent = 'Could not check local files. Check storage permissions and reload.';
      return;
    }
    if (!container.isConnected) return;
    section.hidden = !missing.length;
    container.replaceChildren();
    for (const entry of missing) {
      const row = document.createElement('div');
      row.className = 'button-row';
      row.style.cssText = 'align-items:center;gap:12px;flex-wrap:wrap;margin-top:12px';
      const description = document.createElement('span');
      description.className = 'text-sm';
      description.textContent = `${entry.courseTitle} / ${entry.topicTitle} — ${entry.label}`;
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.hidden = true;
      fileInput.accept = entry.kind === 'pdf' ? '.pdf,application/pdf'
        : entry.kind === 'video' ? 'video/*,.mp4,.webm,.mkv' : '*/*';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-ghost btn-sm';
      button.textContent = 'Locate file';
      button.dataset.relinkFile = '';
      button.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        button.disabled = true;
        try {
          await library.relinkFile(entry.ref, file);
          Toast?.success?.('Local file relinked. Existing study links were preserved.');
          await renderMissingFiles();
        } catch (error) {
          Toast?.error?.(error?.message || 'Could not relink this file');
          button.disabled = false;
        }
      });
      row.append(description, fileInput, button);
      container.appendChild(row);
    }
  }

  async function renderCourses() {
    const list = document.querySelector('[data-my-course-list]');
    const metrics = document.querySelector('[data-my-course-metrics]');
    if (!list || !metrics) return;
    let courses;
    try {
      courses = await loadCourses();
    } catch (error) {
      console.warn('[My Courses] failed to read saved courses:', error);
      metrics.replaceChildren();
      list.replaceChildren();
      const notice = document.createElement('p');
      notice.className = 'text-muted';
      notice.setAttribute('role', 'alert');
      notice.textContent = 'Unable to load saved courses. Your data has not been reset. Check storage and reload this view.';
      list.append(notice);
      return;
    }
    metrics.replaceChildren(metric('Courses', courses.length), metric('Topics', courses.reduce((count, course) => count + (course.sources || []).reduce((total, src) => total + (src.topics || []).length, 0), 0)), metric('With descriptions', courses.filter(course => course.description).length));
    list.replaceChildren();
    if (!courses.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state my-courses-empty';
      const icon = document.createElement('div');
      icon.className = 'empty-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = '<svg class="icon"><use href="#i-folder-plus"/></svg>';
      const copy = document.createElement('p');
      copy.textContent = 'No custom courses yet.';
      const hint = document.createElement('p');
      hint.className = 'empty-text';
      hint.textContent = 'Save an outline here, then drop videos or PDFs onto the page to fill it.';
      const actions = document.createElement('div');
      actions.className = 'button-row';
      const create = document.createElement('button');
      create.className = 'btn btn-primary btn-sm';
      create.type = 'button';
      create.textContent = 'Create a course';
      create.addEventListener('click', () => {
        document.querySelector('[data-my-course-title]')?.focus?.();
      });
      const catalog = document.createElement('a');
      catalog.className = 'btn btn-ghost btn-sm';
      catalog.href = '#/courses';
      catalog.textContent = 'Open catalog';
      actions.append(create, catalog);
      empty.append(icon, copy, hint, actions);
      list.appendChild(empty);
      return;
    }
    if (pendingLibraryCourse && courses.some((course) => course.id === pendingLibraryCourse)) {
      try { sessionStorage.removeItem('ocd_pending_library_course'); } catch {}
    }
    courses.forEach((course) => {
      const card = courseCard(course, courses);
      if (course.id === pendingLibraryCourse) card.classList.add('is-new');
      list.appendChild(card);
    });
  }

  function courseCard(course, allCourses) {
    const card = document.createElement('article');
    card.className = 'card my-course-card';
    card.dataset.myCourseId = course.id;
    const body = document.createElement('div');
    body.className = 'card-body my-course-card-body';
    const title = document.createElement('h2');
    title.className = 'my-course-title';
    title.textContent = course.title || 'Untitled course';
    const description = document.createElement('p');
    description.className = 'my-course-desc';
    description.textContent = course.description || 'No description';
    const meta = document.createElement('p');
    meta.className = 'text-muted text-sm my-course-meta';
    meta.textContent = course.updatedAt ? `Updated ${new Date(course.updatedAt).toLocaleDateString()}` : 'Saved course';
    const actions = document.createElement('div');
    actions.className = 'button-row';
    const open = document.createElement('a');
    open.className = 'btn btn-primary btn-sm';
    open.href = '#/courses';
    open.textContent = 'Open in catalog';
    open.addEventListener('click', () => {
      try { sessionStorage.setItem('ocd_pending_library_course', course.id); } catch {}
    });
    const remove = document.createElement('button');
    remove.dataset.myCourseDelete = '';
    remove.className = 'btn btn-danger-ghost btn-sm';
    remove.type = 'button';
    remove.textContent = 'Delete';
    remove.addEventListener('click', async () => {
      if (remove.disabled) return;
      const confirm = window.OpenCourseDeck?.UI?.confirm;
      const confirmed = typeof confirm === 'function'
        ? await confirm({ title: 'Delete course', message: 'Delete this personal course and any files not used by other courses? Notes and progress will not be deleted.', confirmLabel: 'Delete course' })
        : window.confirm('Delete this course and its unused files?');
      if (!confirmed) return;
      remove.disabled = true;
      try {
        const api = window.OpenCourseDeck?.UserLibrary;
        if (typeof api?.removeCourse !== 'function') throw new Error('Course storage is unavailable');
        await api.removeCourse(course.id);
        Toast?.info?.('Course deleted');
        await renderCourses();
        await renderMissingFiles();
      } catch (error) {
        console.warn('[My Courses] course deletion failed:', error);
        Toast?.error?.('Course deletion failed. Your library has not been reset.');
      } finally {
        remove.disabled = false;
      }
    });
    const addMedia = document.createElement('button');
    addMedia.className = 'btn btn-ghost btn-sm';
    addMedia.type = 'button';
    addMedia.textContent = 'Add media';
    addMedia.setAttribute('aria-label', `Add media to ${course.title || 'this course'}`);
    addMedia.addEventListener('click', (event) => {
      event.stopPropagation();
      try { sessionStorage.setItem('ocd_active_import_course', course.id); } catch {}
      window.OpenCourseDeck?.AddContent?.openMenu?.();
    });
    const edit = document.createElement('button');
    edit.className = 'btn btn-ghost btn-sm';
    edit.type = 'button';
    edit.textContent = 'Edit';
    edit.dataset.myCourseEdit = '';
    edit.addEventListener('click', () => {
      if (card.querySelector('[data-my-course-edit-form]')) return;
      const form = document.createElement('form');
      form.dataset.myCourseEditForm = '';
      form.className = 'my-courses-form';
      const titleLabel = document.createElement('label');
      titleLabel.textContent = 'Course title';
      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.className = 'input';
      titleInput.maxLength = 120;
      titleInput.required = true;
      titleInput.dataset.myCourseEditTitle = '';
      titleInput.value = course.title || '';
      titleLabel.append(titleInput);
      const descLabel = document.createElement('label');
      descLabel.textContent = 'Description';
      const descInput = document.createElement('textarea');
      descInput.className = 'input';
      descInput.maxLength = 600;
      descInput.value = course.description || '';
      descLabel.append(descInput);
      const save = document.createElement('button');
      save.type = 'submit';
      save.className = 'btn btn-primary btn-sm';
      save.textContent = 'Save changes';
      save.dataset.myCourseEditSave = '';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn btn-ghost btn-sm';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => form.remove());
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!titleInput.value.trim()) { titleInput.focus(); return; }
        save.disabled = true;
        try {
          const api = window.OpenCourseDeck?.UserLibrary;
          if (typeof api?.updateCourse !== 'function') throw new Error('Course editing unavailable');
          await api.updateCourse({ id: course.id, title: titleInput.value, description: descInput.value });
          Toast?.success?.('Course updated');
          await renderCourses();
        } catch (error) {
          Toast?.error?.(error?.message || 'Course could not be updated');
          save.disabled = false;
        }
      });
      form.append(titleLabel, descLabel, save, cancel);
      body.appendChild(form);
      titleInput.focus();
    });
    actions.append(open, edit, addMedia, remove);

    const topics = (course.sources || []).flatMap(src => src.topics || []);
    if (topics.length) {
      const topicSection = document.createElement('section');
      topicSection.className = 'my-course-topics';
      const heading = document.createElement('h3');
      heading.className = 'text-sm font-semibold';
      heading.textContent = `Topics (${topics.length})`;
      topicSection.appendChild(heading);
      for (const topic of topics) {
        const id = String(topic.url || topic.id || '');
        if (!id) continue;
        const row = document.createElement('div');
        row.className = 'my-course-topic button-row';
        row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px';
        row.dataset.myTopicId = id;
        const name = document.createElement('span');
        name.className = 'text-sm';
        name.textContent = topic.title || 'Untitled topic';
        const rename = document.createElement('button');
        rename.type = 'button';
        rename.className = 'btn btn-ghost btn-sm';
        rename.textContent = 'Rename';
        rename.addEventListener('click', () => {
          const input = document.createElement('input');
          input.className = 'input input-sm';
          input.maxLength = 200;
          input.value = topic.title || '';
          input.setAttribute('aria-label', `Rename ${topic.title || 'topic'}`);
          const save = document.createElement('button');
          save.type = 'button';
          save.className = 'btn btn-primary btn-sm';
          save.textContent = 'Save';
          save.addEventListener('click', async () => {
            try {
              await window.OpenCourseDeck?.UserLibrary?.renameTopic?.({ courseId: course.id, topicId: id, title: input.value });
              Toast?.success?.('Topic renamed');
              await renderCourses();
            } catch (error) { Toast?.error?.(error?.message || 'Could not rename topic'); }
          });
          row.replaceChildren(input, save);
          input.focus();
        });
        row.append(name, rename);
        const destinations = allCourses.filter(item => item.id !== course.id);
        if (destinations.length) {
          const destination = document.createElement('select');
          destination.className = 'select input-sm';
          destination.dataset.myTopicDestination = '';
          destination.setAttribute('aria-label', `Move ${topic.title || 'topic'} to course`);
          for (const dest of destinations) {
            const option = document.createElement('option');
            option.value = dest.id;
            option.textContent = dest.title || 'Untitled course';
            destination.appendChild(option);
          }
          const move = document.createElement('button');
          move.type = 'button';
          move.className = 'btn btn-ghost btn-sm';
          move.textContent = 'Move';
          move.dataset.myTopicMove = '';
          move.addEventListener('click', async () => {
            if (move.disabled) return;
            move.disabled = true;
            try {
              await window.OpenCourseDeck?.UserLibrary?.moveTopic?.({
                topicId: id, fromCourseId: course.id, toCourseId: destination.value,
              });
              Toast?.success?.('Topic moved');
              await renderCourses();
            } catch (error) {
              Toast?.error?.(error?.message || 'Could not move topic');
              move.disabled = false;
            }
          });
          row.append(destination, move);
        }
        topicSection.appendChild(row);
      }
      body.appendChild(topicSection);
    }
    body.append(title, description, meta, actions);
    card.appendChild(body);
    return card;
  }
}

function metric(label, value) {
  const card = document.createElement('div');
  card.className = 'stat-card';
  const strong = document.createElement('strong');
  strong.textContent = String(value);
  const span = document.createElement('span');
  span.textContent = label;
  card.append(strong, span);
  return card;
}

/**
 * The user-owned library is authoritative. Only migrate the legacy outline
 * array when the canonical setting was never created. A canonical `courses: {}`
 * is an intentional empty state and must never resurrect deleted outlines.
 */
async function loadCourses() {
  const api = window.OpenCourseDeck?.UserLibrary;
  if (typeof api?.load !== 'function') throw new Error('User Library storage is unavailable');
  if (typeof window.DB?.getSetting !== 'function') throw new Error('Course storage is unavailable');
  const raw = await window.DB.getSetting(CANONICAL_LIBRARY_KEY);
  if (raw == null) {
    const legacy = await window.DB.getSetting(LEGACY_COURSES_KEY);
    if (Array.isArray(legacy) && legacy.length) {
      if (typeof api.migrateLegacyCourses !== 'function') throw new Error('Legacy course recovery is unavailable');
      await api.migrateLegacyCourses(legacy);
    }
  }
  const library = await api.load();
  return Object.entries(library.courses || {})
    .filter(([id]) => id !== 'user-library')
    .map(([id, record]) => ({
      id, title: record?.title || 'Untitled course',
      description: record?.description || '',
      sources: Array.isArray(record?.sources) ? record.sources : [],
      createdAt: record?.createdAt,
      updatedAt: record?.updatedAt,
    }))
    .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
}
