// src/views/myCoursesRoute.js
var STORAGE_KEY = "plasma-my-courses";
function mountMyCoursesView({ setView, Toast = window.PlasmaDeck?.Toast } = {}) {
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
  document.querySelector("[data-my-course-save]")?.addEventListener("click", async (event) => {
    event.preventDefault();
    const titleInput = document.querySelector("[data-my-course-title]");
    const descriptionInput = document.querySelector("[data-my-course-description]");
    const title = titleInput?.value.trim() || "";
    if (!title) return;
    const courses = await loadCourses();
    const record = {
      id: `course-${Date.now().toString(36)}`,
      title,
      description: descriptionInput?.value.trim() || "",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await saveCourses([record, ...courses]);
    titleInput.value = "";
    if (descriptionInput) descriptionInput.value = "";
    Toast?.success?.("Course saved");
    await renderCourses();
  });
  renderCourses();
  async function renderCourses() {
    const list = document.querySelector("[data-my-course-list]");
    const metrics = document.querySelector("[data-my-course-metrics]");
    if (!list || !metrics) return;
    const courses = await loadCourses();
    metrics.replaceChildren(metric("Courses", courses.length), metric("With descriptions", courses.filter((course) => course.description).length));
    list.replaceChildren();
    if (!courses.length) {
      const empty = document.createElement("p");
      empty.textContent = "No custom courses yet.";
      list.appendChild(empty);
      return;
    }
    courses.forEach((course) => list.appendChild(courseCard(course)));
  }
  function courseCard(course) {
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.myCourseId = course.id;
    const body = document.createElement("div");
    body.className = "card-body";
    const title = document.createElement("h2");
    title.className = "h3";
    title.textContent = course.title || "Untitled course";
    const description = document.createElement("p");
    description.textContent = course.description || "No description";
    const meta = document.createElement("p");
    meta.className = "text-muted text-sm";
    meta.textContent = course.updatedAt ? `Updated ${new Date(course.updatedAt).toLocaleDateString()}` : "Saved course";
    const remove = document.createElement("button");
    remove.className = "btn btn-ghost btn-sm";
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", async () => {
      const next = (await loadCourses()).filter((item) => item.id !== course.id);
      await saveCourses(next);
      Toast?.info?.("Course deleted");
      await renderCourses();
    });
    body.append(title, description, meta, remove);
    card.appendChild(body);
    return card;
  }
}
function metric(label, value) {
  const card = document.createElement("div");
  card.className = "stat-card";
  const strong = document.createElement("strong");
  strong.textContent = String(value);
  const span = document.createElement("span");
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
export {
  mountMyCoursesView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3ZpZXdzL215Q291cnNlc1JvdXRlLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBTVE9SQUdFX0tFWSA9ICdwbGFzbWEtbXktY291cnNlcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3VudE15Q291cnNlc1ZpZXcoeyBzZXRWaWV3LCBUb2FzdCA9IHdpbmRvdy5QbGFzbWFEZWNrPy5Ub2FzdCB9ID0ge30pIHtcbiAgc2V0VmlldyhgXG4gICAgPHNlY3Rpb24gY2xhc3M9XCJ2aWV3IHZpZXctbXktY291cnNlc1wiPlxuICAgICAgPGRpdiBjbGFzcz1cInBhZ2UtaGVhZGVyXCI+XG4gICAgICAgIDxoMSBjbGFzcz1cInBhZ2UtdGl0bGVcIj5NeSBDb3Vyc2VzPC9oMT5cbiAgICAgICAgPHAgY2xhc3M9XCJwYWdlLXN1YnRpdGxlXCI+Q3JlYXRlIGFuZCBvcmdhbml6ZSB5b3VyIG93biBjb3Vyc2Ugb3V0bGluZXMuPC9wPlxuICAgICAgPC9kaXY+XG4gICAgICA8ZGl2IGNsYXNzPVwiY2FyZCBjYXJkLWZpbGxlZFwiIHN0eWxlPVwibWFyZ2luLWJvdHRvbToxNnB4XCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLWJvZHlcIj5cbiAgICAgICAgICA8ZGl2IGRhdGEtbXktY291cnNlLWZvcm0gc3R5bGU9XCJkaXNwbGF5OmdyaWQ7Z2FwOjEwcHhcIj5cbiAgICAgICAgICAgIDxsYWJlbCBzdHlsZT1cImRpc3BsYXk6Z3JpZDtnYXA6NnB4XCI+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwidGV4dC1zbVwiPkNvdXJzZSB0aXRsZTwvc3Bhbj5cbiAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiaW5wdXRcIiBkYXRhLW15LWNvdXJzZS10aXRsZSByZXF1aXJlZCBtYXhsZW5ndGg9XCIxMjBcIiBwbGFjZWhvbGRlcj1cIkNvdXJzZSB0aXRsZVwiIC8+XG4gICAgICAgICAgICA8L2xhYmVsPlxuICAgICAgICAgICAgPGxhYmVsIHN0eWxlPVwiZGlzcGxheTpncmlkO2dhcDo2cHhcIj5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJ0ZXh0LXNtXCI+RGVzY3JpcHRpb248L3NwYW4+XG4gICAgICAgICAgICAgIDx0ZXh0YXJlYSBjbGFzcz1cImlucHV0XCIgZGF0YS1teS1jb3Vyc2UtZGVzY3JpcHRpb24gcm93cz1cIjNcIiBtYXhsZW5ndGg9XCI2MDBcIiBwbGFjZWhvbGRlcj1cIldoYXQgdGhpcyBjb3Vyc2UgY292ZXJzXCI+PC90ZXh0YXJlYT5cbiAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1wcmltYXJ5XCIgdHlwZT1cImJ1dHRvblwiIGRhdGEtbXktY291cnNlLXNhdmU+U2F2ZSBDb3Vyc2U8L2J1dHRvbj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L2Rpdj5cbiAgICAgIDxkaXYgY2xhc3M9XCJzdGF0LWdyaWRcIiBkYXRhLW15LWNvdXJzZS1tZXRyaWNzPjwvZGl2PlxuICAgICAgPGRpdiBjbGFzcz1cImNhcmQgY2FyZC1maWxsZWRcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQtYm9keVwiPlxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJncmlkIGdyaWQtM1wiIGRhdGEtbXktY291cnNlLWxpc3Q+XG4gICAgICAgICAgICA8cD5Mb2FkaW5nIGNvdXJzZXMuLi48L3A+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG4gICAgPC9zZWN0aW9uPlxuICBgKTtcblxuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1teS1jb3Vyc2Utc2F2ZV0nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoZXZlbnQpID0+IHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IHRpdGxlSW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1teS1jb3Vyc2UtdGl0bGVdJyk7XG4gICAgY29uc3QgZGVzY3JpcHRpb25JbnB1dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLW15LWNvdXJzZS1kZXNjcmlwdGlvbl0nKTtcbiAgICBjb25zdCB0aXRsZSA9IHRpdGxlSW5wdXQ/LnZhbHVlLnRyaW0oKSB8fCAnJztcbiAgICBpZiAoIXRpdGxlKSByZXR1cm47XG4gICAgY29uc3QgY291cnNlcyA9IGF3YWl0IGxvYWRDb3Vyc2VzKCk7XG4gICAgY29uc3QgcmVjb3JkID0ge1xuICAgICAgaWQ6IGBjb3Vyc2UtJHtEYXRlLm5vdygpLnRvU3RyaW5nKDM2KX1gLFxuICAgICAgdGl0bGUsXG4gICAgICBkZXNjcmlwdGlvbjogZGVzY3JpcHRpb25JbnB1dD8udmFsdWUudHJpbSgpIHx8ICcnLFxuICAgICAgY3JlYXRlZEF0OiBEYXRlLm5vdygpLFxuICAgICAgdXBkYXRlZEF0OiBEYXRlLm5vdygpLFxuICAgIH07XG4gICAgYXdhaXQgc2F2ZUNvdXJzZXMoW3JlY29yZCwgLi4uY291cnNlc10pO1xuICAgIHRpdGxlSW5wdXQudmFsdWUgPSAnJztcbiAgICBpZiAoZGVzY3JpcHRpb25JbnB1dCkgZGVzY3JpcHRpb25JbnB1dC52YWx1ZSA9ICcnO1xuICAgIFRvYXN0Py5zdWNjZXNzPy4oJ0NvdXJzZSBzYXZlZCcpO1xuICAgIGF3YWl0IHJlbmRlckNvdXJzZXMoKTtcbiAgfSk7XG5cbiAgcmVuZGVyQ291cnNlcygpO1xuXG4gIGFzeW5jIGZ1bmN0aW9uIHJlbmRlckNvdXJzZXMoKSB7XG4gICAgY29uc3QgbGlzdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLW15LWNvdXJzZS1saXN0XScpO1xuICAgIGNvbnN0IG1ldHJpY3MgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1teS1jb3Vyc2UtbWV0cmljc10nKTtcbiAgICBpZiAoIWxpc3QgfHwgIW1ldHJpY3MpIHJldHVybjtcbiAgICBjb25zdCBjb3Vyc2VzID0gYXdhaXQgbG9hZENvdXJzZXMoKTtcbiAgICBtZXRyaWNzLnJlcGxhY2VDaGlsZHJlbihtZXRyaWMoJ0NvdXJzZXMnLCBjb3Vyc2VzLmxlbmd0aCksIG1ldHJpYygnV2l0aCBkZXNjcmlwdGlvbnMnLCBjb3Vyc2VzLmZpbHRlcihjb3Vyc2UgPT4gY291cnNlLmRlc2NyaXB0aW9uKS5sZW5ndGgpKTtcbiAgICBsaXN0LnJlcGxhY2VDaGlsZHJlbigpO1xuICAgIGlmICghY291cnNlcy5sZW5ndGgpIHtcbiAgICAgIGNvbnN0IGVtcHR5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xuICAgICAgZW1wdHkudGV4dENvbnRlbnQgPSAnTm8gY3VzdG9tIGNvdXJzZXMgeWV0Lic7XG4gICAgICBsaXN0LmFwcGVuZENoaWxkKGVtcHR5KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY291cnNlcy5mb3JFYWNoKChjb3Vyc2UpID0+IGxpc3QuYXBwZW5kQ2hpbGQoY291cnNlQ2FyZChjb3Vyc2UpKSk7XG4gIH1cblxuICBmdW5jdGlvbiBjb3Vyc2VDYXJkKGNvdXJzZSkge1xuICAgIGNvbnN0IGNhcmQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhcnRpY2xlJyk7XG4gICAgY2FyZC5jbGFzc05hbWUgPSAnY2FyZCc7XG4gICAgY2FyZC5kYXRhc2V0Lm15Q291cnNlSWQgPSBjb3Vyc2UuaWQ7XG4gICAgY29uc3QgYm9keSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGJvZHkuY2xhc3NOYW1lID0gJ2NhcmQtYm9keSc7XG4gICAgY29uc3QgdGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdoMicpO1xuICAgIHRpdGxlLmNsYXNzTmFtZSA9ICdoMyc7XG4gICAgdGl0bGUudGV4dENvbnRlbnQgPSBjb3Vyc2UudGl0bGUgfHwgJ1VudGl0bGVkIGNvdXJzZSc7XG4gICAgY29uc3QgZGVzY3JpcHRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJyk7XG4gICAgZGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSBjb3Vyc2UuZGVzY3JpcHRpb24gfHwgJ05vIGRlc2NyaXB0aW9uJztcbiAgICBjb25zdCBtZXRhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xuICAgIG1ldGEuY2xhc3NOYW1lID0gJ3RleHQtbXV0ZWQgdGV4dC1zbSc7XG4gICAgbWV0YS50ZXh0Q29udGVudCA9IGNvdXJzZS51cGRhdGVkQXQgPyBgVXBkYXRlZCAke25ldyBEYXRlKGNvdXJzZS51cGRhdGVkQXQpLnRvTG9jYWxlRGF0ZVN0cmluZygpfWAgOiAnU2F2ZWQgY291cnNlJztcbiAgICBjb25zdCByZW1vdmUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICByZW1vdmUuY2xhc3NOYW1lID0gJ2J0biBidG4tZ2hvc3QgYnRuLXNtJztcbiAgICByZW1vdmUudHlwZSA9ICdidXR0b24nO1xuICAgIHJlbW92ZS50ZXh0Q29udGVudCA9ICdEZWxldGUnO1xuICAgIHJlbW92ZS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IG5leHQgPSAoYXdhaXQgbG9hZENvdXJzZXMoKSkuZmlsdGVyKGl0ZW0gPT4gaXRlbS5pZCAhPT0gY291cnNlLmlkKTtcbiAgICAgIGF3YWl0IHNhdmVDb3Vyc2VzKG5leHQpO1xuICAgICAgVG9hc3Q/LmluZm8/LignQ291cnNlIGRlbGV0ZWQnKTtcbiAgICAgIGF3YWl0IHJlbmRlckNvdXJzZXMoKTtcbiAgICB9KTtcbiAgICBib2R5LmFwcGVuZCh0aXRsZSwgZGVzY3JpcHRpb24sIG1ldGEsIHJlbW92ZSk7XG4gICAgY2FyZC5hcHBlbmRDaGlsZChib2R5KTtcbiAgICByZXR1cm4gY2FyZDtcbiAgfVxufVxuXG5mdW5jdGlvbiBtZXRyaWMobGFiZWwsIHZhbHVlKSB7XG4gIGNvbnN0IGNhcmQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgY2FyZC5jbGFzc05hbWUgPSAnc3RhdC1jYXJkJztcbiAgY29uc3Qgc3Ryb25nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3Ryb25nJyk7XG4gIHN0cm9uZy50ZXh0Q29udGVudCA9IFN0cmluZyh2YWx1ZSk7XG4gIGNvbnN0IHNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG4gIHNwYW4udGV4dENvbnRlbnQgPSBsYWJlbDtcbiAgY2FyZC5hcHBlbmQoc3Ryb25nLCBzcGFuKTtcbiAgcmV0dXJuIGNhcmQ7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRDb3Vyc2VzKCkge1xuICBjb25zdCBjb3Vyc2VzID0gYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHdpbmRvdy5EQj8uZ2V0U2V0dGluZz8uKFNUT1JBR0VfS0VZKSkuY2F0Y2goKCkgPT4gW10pO1xuICByZXR1cm4gQXJyYXkuaXNBcnJheShjb3Vyc2VzKSA/IGNvdXJzZXMgOiBbXTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc2F2ZUNvdXJzZXMoY291cnNlcykge1xuICBhd2FpdCBQcm9taXNlLnJlc29sdmUod2luZG93LkRCPy5zYXZlU2V0dGluZz8uKFNUT1JBR0VfS0VZLCBjb3Vyc2VzKSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQUEsSUFBTSxjQUFjO0FBRWIsU0FBUyxtQkFBbUIsRUFBRSxTQUFTLFFBQVEsT0FBTyxZQUFZLE1BQU0sSUFBSSxDQUFDLEdBQUc7QUFDckYsVUFBUTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxHQThCUDtBQUVELFdBQVMsY0FBYyx1QkFBdUIsR0FBRyxpQkFBaUIsU0FBUyxPQUFPLFVBQVU7QUFDMUYsVUFBTSxlQUFlO0FBQ3JCLFVBQU0sYUFBYSxTQUFTLGNBQWMsd0JBQXdC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
