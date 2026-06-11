const STORAGE_KEY = 'plasma-my-courses';

export function mountMyCoursesView({ setView, Toast = window.PlasmaDeck?.Toast } = {}) {
  setView(`
    <section class="view view-my-courses">
      <div class="page-header">
        <h1 class="page-title">My Courses</h1>
        <p class="page-subtitle">Create and organize your own course outlines.</p>
      </div>
      <div class="card card-filled" style="margin-bottom:16px">
        <div class="card-body">
          <div data-my-course-form style="display:grid;gap:10px">
            <label style="display:grid;gap:6px">
              <span class="text-sm">Course title</span>
              <input class="input" data-my-course-title required maxlength="120" placeholder="Course title" />
            </label>
            <label style="display:grid;gap:6px">
              <span class="text-sm">Description</span>
              <textarea class="input" data-my-course-description rows="3" maxlength="600" placeholder="What this course covers"></textarea>
            </label>
            <button class="btn btn-primary" type="button" data-my-course-save>Save Course</button>
          </div>
        </div>
      </div>
      <div class="stat-grid" data-my-course-metrics></div>
      <div class="card card-filled">
        <div class="card-body">
          <div class="grid grid-3" data-my-course-list>
            <p>Loading courses...</p>
          </div>
        </div>
      </div>
    </section>
  `);

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
    titleInput.value = '';
    if (descriptionInput) descriptionInput.value = '';
    Toast?.success?.('Course saved');
    await renderCourses();
  });

  renderCourses();

  async function renderCourses() {
    const list = document.querySelector('[data-my-course-list]');
    const metrics = document.querySelector('[data-my-course-metrics]');
    if (!list || !metrics) return;
    const courses = await loadCourses();
    metrics.replaceChildren(metric('Courses', courses.length), metric('With descriptions', courses.filter(course => course.description).length));
    list.replaceChildren();
    if (!courses.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No custom courses yet.';
      list.appendChild(empty);
      return;
    }
    courses.forEach((course) => list.appendChild(courseCard(course)));
  }

  function courseCard(course) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.myCourseId = course.id;
    const body = document.createElement('div');
    body.className = 'card-body';
    const title = document.createElement('h2');
    title.className = 'h3';
    title.textContent = course.title || 'Untitled course';
    const description = document.createElement('p');
    description.textContent = course.description || 'No description';
    const meta = document.createElement('p');
    meta.className = 'text-muted text-sm';
    meta.textContent = course.updatedAt ? `Updated ${new Date(course.updatedAt).toLocaleDateString()}` : 'Saved course';
    const remove = document.createElement('button');
    remove.className = 'btn btn-ghost btn-sm';
    remove.type = 'button';
    remove.textContent = 'Delete';
    remove.addEventListener('click', async () => {
      const next = (await loadCourses()).filter(item => item.id !== course.id);
      await saveCourses(next);
      Toast?.info?.('Course deleted');
      await renderCourses();
    });
    body.append(title, description, meta, remove);
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
