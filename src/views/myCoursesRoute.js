const STORAGE_KEY = 'ocd_my_courses';

export function mountMyCoursesView({ setView, Toast = window.OpenCourseDeck?.Toast } = {}) {
  setView(`
    <section class="view view-my-courses">
      <div class="page-header my-courses-header">
        <div>
          <span class="eyebrow">Custom Curriculum</span>
          <h1 class="page-title">My Courses</h1>
          <p class="page-subtitle">Create and organize your own custom course outlines.</p>
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
    </section>
  `);

  document.querySelector('[data-my-courses-add]')?.addEventListener('click', () => {
    window.OpenCourseDeck?.AddContent?.openMenu?.();
  });

  document.querySelector('[data-my-course-save]')?.addEventListener('click', async (event) => {
    event.preventDefault();
    const titleInput = document.querySelector('[data-my-course-title]');
    const descriptionInput = document.querySelector('[data-my-course-description]');
    const title = titleInput?.value.trim() || '';
    if (!title) return;
    const courses = await loadCourses();
    const record = {
      id: `course-${Date.now().toString(36)}`,
      title,
      description: descriptionInput?.value.trim() || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveCourses([record, ...courses]);
    try {
      await window.OpenCourseDeck?.UserLibrary?.upsertCourse?.({
        id: record.id,
        title: record.title,
        description: record.description,
      });
    } catch {}
    titleInput.value = '';
    if (descriptionInput) descriptionInput.value = '';
    Toast?.success?.('Course saved');
    await renderCourses();
  });

  let pendingLibraryCourse = '';
  try {
    pendingLibraryCourse = sessionStorage.getItem('ocd_pending_library_course') || '';
  } catch {}

  renderCourses();

  async function renderCourses() {
    const list = document.querySelector('[data-my-course-list]');
    const metrics = document.querySelector('[data-my-course-metrics]');
    if (!list || !metrics) return;
    const courses = await loadCourses();
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
      const next = (await loadCourses()).filter(item => item.id !== course.id);
      await saveCourses(next);
      try { await window.OpenCourseDeck?.UserLibrary?.removeCourse?.(course.id); } catch {}
      Toast?.info?.('Course deleted');
      await renderCourses();
    });
    actions.append(open, remove);
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
  const courses = await Promise.resolve(window.DB?.getSetting?.(STORAGE_KEY)).catch(() => []);
  return Array.isArray(courses) ? courses : [];
}

async function saveCourses(courses) {
  await Promise.resolve(window.DB?.saveSetting?.(STORAGE_KEY, courses));
}
