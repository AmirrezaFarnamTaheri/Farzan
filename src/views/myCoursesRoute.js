const STORAGE_KEY = 'ocd_my_courses';

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
      // Do not replace a live library based on a failed authoritative read.
      const courses = await loadCourses();
      const record = {
        id: `course-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        description: descriptionInput?.value.trim() || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveCourses([record, ...courses]);
      const upsert = window.OpenCourseDeck?.UserLibrary?.upsertCourse;
      if (typeof upsert === 'function') {
        try {
          await upsert({ id: record.id, title: record.title, description: record.description });
        } catch (error) {
          // The outline committed; do not misreport a partial catalog update.
          console.warn('[My Courses] catalog update after saved outline failed:', error);
          Toast?.error?.('Course outline saved, but catalog update failed. Retry from My Courses.');
          await renderCourses();
          return;
        }
      } else {
        Toast?.error?.('Course outline saved, but catalog integration is unavailable.');
        await renderCourses();
        return;
      }
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
    metrics.replaceChildren(metric('Courses', courses.length), metric('With descriptions', courses.filter(course => course.description).length));
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
      const card = courseCard(course);
      if (course.id === pendingLibraryCourse) card.classList.add('is-new');
      list.appendChild(card);
    });
  }

  function courseCard(course) {
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
    remove.className = 'btn btn-danger-ghost btn-sm';
    remove.type = 'button';
    remove.textContent = 'Delete';
    remove.addEventListener('click', async () => {
      if (remove.disabled) return;
      remove.disabled = true;
      try {
        const existing = await loadCourses();
        const next = existing.filter(item => item.id !== course.id);
        await saveCourses(next);
        try {
          const removeFromCatalog = window.OpenCourseDeck?.UserLibrary?.removeCourse;
          if (typeof removeFromCatalog !== 'function') throw new Error('Catalog integration is unavailable');
          await removeFromCatalog(course.id);
        } catch (error) {
          // A failed catalog deletion must not invisibly remove this course.
          try { await saveCourses(existing); }
          catch (rollbackError) {
            throw new AggregateError([error, rollbackError], 'Course list and catalog may be out of sync', { cause: rollbackError });
          }
          throw error;
        }
        Toast?.info?.('Course deleted');
        await renderCourses();
      } catch (error) {
        console.warn('[My Courses] could not fully delete course:', error);
        Toast?.error?.('Course deletion did not complete. Check My Courses and the catalog before retrying.');
        await renderCourses();
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
    actions.append(open, addMedia, remove);
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

async function loadCourses() {
  if (typeof window.DB?.getSetting !== 'function') {
    throw new Error('Course storage is unavailable');
  }
  const courses = await window.DB.getSetting(STORAGE_KEY);
  if (courses == null) return [];
  if (!Array.isArray(courses)) throw new TypeError('Saved courses have an unexpected format');
  return courses;
}

async function saveCourses(courses) {
  if (typeof window.DB?.saveSetting !== 'function') {
    throw new Error('Course storage is unavailable');
  }
  return window.DB.saveSetting(STORAGE_KEY, courses);
}
