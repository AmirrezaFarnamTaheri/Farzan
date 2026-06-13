// src/views/achievementsRoute.js
function mountAchievementsView(deps = {}) {
  const {
    setView,
    Router,
    setPendingCourseMedia
  } = deps;
  setView(`
    <section class="view view-achievements">
      <div class="page-header">
        <div class="page-title-row">
          <h1 class="page-title">Achievements</h1>
          <span class="badge badge-success" aria-label="Feature status: ready">Ready</span>
        </div>
        <p class="page-subtitle">Milestones based on your current progress.</p>
      </div>
      <div class="stat-grid" data-achievement-metrics></div>
      <div class="card card-filled" style="margin-top:16px">
        <div class="card-body">
          <div class="grid grid-3" data-achievement-list>
            <p>Loading achievements...</p>
          </div>
        </div>
      </div>
      <div class="card card-filled" style="margin-top:16px">
        <div class="card-body">
          <h2 class="h3">Review queue</h2>
          <div class="grid grid-3" data-review-list>
            <p>Loading review prompts...</p>
          </div>
        </div>
      </div>
    </section>
  `);
  renderAchievements();
  async function renderAchievements() {
    const metricsRoot = document.querySelector("[data-achievement-metrics]");
    const listRoot = document.querySelector("[data-achievement-list]");
    const reviewRoot = document.querySelector("[data-review-list]");
    if (!metricsRoot || !listRoot) return;
    const [progress, notes, timestamps, topics] = await Promise.all([
      (async () => {
        try {
          return await window.DB?.getAllProgress?.() ?? [];
        } catch {
          return [];
        }
      })(),
      (async () => {
        try {
          return await window.DB?.getAllNotes?.() ?? [];
        } catch {
          return [];
        }
      })(),
      (async () => {
        try {
          return await window.DB?.getAllTimestamps?.() ?? [];
        } catch {
          return [];
        }
      })(),
      (async () => {
        try {
          await window.DataStore?.init?.();
          return window.DataStore?.allTopics?.() ?? [];
        } catch {
          return [];
        }
      })()
    ]);
    if (!document.body.contains(listRoot)) return;
    const topicMap = new Map(topics.map((topic) => [topic.topicId, topic]));
    const progressByTopic = new Map(progress.map((record) => [record.topicId, record]));
    const doneRecords = progress.filter((record) => record.status === "done" || Number(record.percent) >= 100);
    const activeRecords = progress.filter((record) => Number(record.percent) > 0 || Number(record.position) > 0 || record.status === "in-progress");
    const watchedSeconds = progress.reduce((sum, record) => sum + Math.max(0, Number(record.position) || 0), 0);
    const courseIds = new Set(topics.map((topic) => topic.courseId).filter(Boolean));
    const now = Date.now();
    const reviewWindowMs = 30 * 24 * 60 * 60 * 1e3;
    const activityTimesForTopic = (topicId, progressRecord) => [
      progressRecord?.reviewedAt,
      progressRecord?.updatedAt,
      progressRecord?.completedAt,
      ...timestamps.filter((item) => item?.topicId === topicId).map((item) => item.updatedAt || item.createdAt),
      ...notes.filter((item) => item?.topicId === topicId).map((item) => item.updatedAt || item.createdAt)
    ].map((value) => Number(value) || 0);
    const reviewItems = doneRecords.map((record) => {
      const topic = topicMap.get(record.topicId);
      const lastActivity = Math.max(...activityTimesForTopic(record.topicId, record), 0);
      return {
        topicId: record.topicId,
        courseId: record.courseId || topic?.courseId,
        title: topic?.title || record.topicTitle || record.topicId || "Completed topic",
        courseTitle: topic?.courseTitle || record.courseTitle || record.courseId || topic?.courseId || "Course",
        lastActivity,
        daysSince: lastActivity ? Math.floor((now - lastActivity) / (24 * 60 * 60 * 1e3)) : null
      };
    }).filter((item) => item.topicId && (!item.lastActivity || now - item.lastActivity >= reviewWindowMs)).sort((a, b) => (a.lastActivity || 0) - (b.lastActivity || 0)).slice(0, 6);
    let completedCourses = 0;
    courseIds.forEach((courseId) => {
      const courseTopics = topics.filter((topic) => topic.courseId === courseId);
      if (courseTopics.length && courseTopics.every((topic) => {
        const record = progressByTopic.get(topic.topicId);
        return record?.status === "done" || Number(record?.percent) >= 100;
      })) {
        completedCourses += 1;
      }
    });
    const stats = [
      ["Touched topics", activeRecords.length],
      ["Done topics", doneRecords.length],
      ["Completed courses", completedCourses],
      ["Watched minutes", Math.round(watchedSeconds / 60)],
      ["Due reviews", reviewItems.length]
    ];
    metricsRoot.replaceChildren();
    stats.forEach(([label, value]) => {
      const card = document.createElement("div");
      card.className = "stat-card";
      const strong = document.createElement("strong");
      strong.textContent = String(value);
      const span = document.createElement("span");
      span.textContent = label;
      card.append(strong, span);
      metricsRoot.appendChild(card);
    });
    const achievementsList = [
      { id: "first-step", title: "First Step", detail: "Start any topic.", unlocked: activeRecords.length >= 1 },
      { id: "first-finish", title: "First Finish", detail: "Complete one topic.", unlocked: doneRecords.length >= 1 },
      { id: "deep-focus", title: "Deep Focus", detail: "Watch at least 30 minutes.", unlocked: watchedSeconds >= 1800 },
      { id: "course-complete", title: "Course Complete", detail: "Finish every topic in a course.", unlocked: completedCourses >= 1 },
      { id: "collector", title: "Collector", detail: "Make progress on 10 topics.", unlocked: activeRecords.length >= 10 },
      { id: "catalog-roamer", title: "Catalog Roamer", detail: "Touch topics from three courses.", unlocked: new Set(activeRecords.map((record) => record.courseId || topicMap.get(record.topicId)?.courseId).filter(Boolean)).size >= 3 }
    ];
    listRoot.replaceChildren();
    achievementsList.forEach((achievement) => {
      const card = document.createElement("article");
      card.className = `card ${achievement.unlocked ? "card-filled" : ""}`.trim();
      card.dataset.achievementId = achievement.id;
      card.dataset.achievementState = achievement.unlocked ? "unlocked" : "locked";
      const body = document.createElement("div");
      body.className = "card-body";
      const title = document.createElement("h2");
      title.className = "h4";
      title.textContent = achievement.title;
      const detail = document.createElement("p");
      detail.textContent = achievement.detail;
      const status = document.createElement("span");
      status.className = `badge ${achievement.unlocked ? "badge-success" : "badge-muted"}`;
      status.textContent = achievement.unlocked ? "Unlocked" : "Locked";
      status.setAttribute("aria-label", `Achievement status: ${status.textContent}`);
      body.append(title, detail, status);
      card.appendChild(body);
      listRoot.appendChild(card);
    });
    if (!reviewRoot) return;
    reviewRoot.replaceChildren();
    if (!reviewItems.length) {
      const empty = document.createElement("p");
      empty.className = "text-muted";
      empty.textContent = "No completed topics are due for review yet.";
      reviewRoot.appendChild(empty);
      return;
    }
    reviewItems.forEach((item) => {
      const card = document.createElement("article");
      card.className = "card";
      card.dataset.reviewTopicId = item.topicId;
      const body = document.createElement("div");
      body.className = "card-body";
      const badge = document.createElement("span");
      badge.className = "badge badge-warning";
      badge.textContent = item.daysSince == null ? "Review" : `${item.daysSince} days`;
      const title = document.createElement("h2");
      title.className = "h4";
      title.textContent = item.title;
      const detail = document.createElement("p");
      detail.textContent = `Revisit notes and media from ${item.courseTitle}.`;
      const action = document.createElement("button");
      action.className = "btn btn-ghost";
      action.type = "button";
      action.dataset.reviewTopic = item.topicId;
      action.textContent = "Review";
      body.append(badge, title, detail, action);
      card.appendChild(body);
      reviewRoot.appendChild(card);
    });
    reviewRoot.onclick = (event) => {
      const button = event.target?.closest?.("[data-review-topic]");
      if (!button) return;
      setPendingCourseMedia(button.dataset.reviewTopic);
      Router.navigate("#/courses");
    };
  }
}
export {
  mountAchievementsView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3ZpZXdzL2FjaGlldmVtZW50c1JvdXRlLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJleHBvcnQgZnVuY3Rpb24gbW91bnRBY2hpZXZlbWVudHNWaWV3KGRlcHMgPSB7fSkge1xuICBjb25zdCB7XG4gICAgc2V0VmlldyxcbiAgICBSb3V0ZXIsXG4gICAgc2V0UGVuZGluZ0NvdXJzZU1lZGlhLFxuICB9ID0gZGVwcztcblxuICBzZXRWaWV3KGBcbiAgICA8c2VjdGlvbiBjbGFzcz1cInZpZXcgdmlldy1hY2hpZXZlbWVudHNcIj5cbiAgICAgIDxkaXYgY2xhc3M9XCJwYWdlLWhlYWRlclwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwicGFnZS10aXRsZS1yb3dcIj5cbiAgICAgICAgICA8aDEgY2xhc3M9XCJwYWdlLXRpdGxlXCI+QWNoaWV2ZW1lbnRzPC9oMT5cbiAgICAgICAgICA8c3BhbiBjbGFzcz1cImJhZGdlIGJhZGdlLXN1Y2Nlc3NcIiBhcmlhLWxhYmVsPVwiRmVhdHVyZSBzdGF0dXM6IHJlYWR5XCI+UmVhZHk8L3NwYW4+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8cCBjbGFzcz1cInBhZ2Utc3VidGl0bGVcIj5NaWxlc3RvbmVzIGJhc2VkIG9uIHlvdXIgY3VycmVudCBwcm9ncmVzcy48L3A+XG4gICAgICA8L2Rpdj5cbiAgICAgIDxkaXYgY2xhc3M9XCJzdGF0LWdyaWRcIiBkYXRhLWFjaGlldmVtZW50LW1ldHJpY3M+PC9kaXY+XG4gICAgICA8ZGl2IGNsYXNzPVwiY2FyZCBjYXJkLWZpbGxlZFwiIHN0eWxlPVwibWFyZ2luLXRvcDoxNnB4XCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLWJvZHlcIj5cbiAgICAgICAgICA8ZGl2IGNsYXNzPVwiZ3JpZCBncmlkLTNcIiBkYXRhLWFjaGlldmVtZW50LWxpc3Q+XG4gICAgICAgICAgICA8cD5Mb2FkaW5nIGFjaGlldmVtZW50cy4uLjwvcD5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L2Rpdj5cbiAgICAgIDxkaXYgY2xhc3M9XCJjYXJkIGNhcmQtZmlsbGVkXCIgc3R5bGU9XCJtYXJnaW4tdG9wOjE2cHhcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQtYm9keVwiPlxuICAgICAgICAgIDxoMiBjbGFzcz1cImgzXCI+UmV2aWV3IHF1ZXVlPC9oMj5cbiAgICAgICAgICA8ZGl2IGNsYXNzPVwiZ3JpZCBncmlkLTNcIiBkYXRhLXJldmlldy1saXN0PlxuICAgICAgICAgICAgPHA+TG9hZGluZyByZXZpZXcgcHJvbXB0cy4uLjwvcD5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L2Rpdj5cbiAgICA8L3NlY3Rpb24+XG4gIGApO1xuICByZW5kZXJBY2hpZXZlbWVudHMoKTtcblxuICBhc3luYyBmdW5jdGlvbiByZW5kZXJBY2hpZXZlbWVudHMoKSB7XG4gICAgY29uc3QgbWV0cmljc1Jvb3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1hY2hpZXZlbWVudC1tZXRyaWNzXScpO1xuICAgIGNvbnN0IGxpc3RSb290ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtYWNoaWV2ZW1lbnQtbGlzdF0nKTtcbiAgICBjb25zdCByZXZpZXdSb290ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtcmV2aWV3LWxpc3RdJyk7XG4gICAgaWYgKCFtZXRyaWNzUm9vdCB8fCAhbGlzdFJvb3QpIHJldHVybjtcblxuICAgIGNvbnN0IFtwcm9ncmVzcywgbm90ZXMsIHRpbWVzdGFtcHMsIHRvcGljc10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICAoYXN5bmMgKCkgPT4geyB0cnkgeyByZXR1cm4gYXdhaXQgd2luZG93LkRCPy5nZXRBbGxQcm9ncmVzcz8uKCkgPz8gW107IH0gY2F0Y2ggeyByZXR1cm4gW107IH0gfSkoKSxcbiAgICAgIChhc3luYyAoKSA9PiB7IHRyeSB7IHJldHVybiBhd2FpdCB3aW5kb3cuREI/LmdldEFsbE5vdGVzPy4oKSA/PyBbXTsgfSBjYXRjaCB7IHJldHVybiBbXTsgfSB9KSgpLFxuICAgICAgKGFzeW5jICgpID0+IHsgdHJ5IHsgcmV0dXJuIGF3YWl0IHdpbmRvdy5EQj8uZ2V0QWxsVGltZXN0YW1wcz8uKCkgPz8gW107IH0gY2F0Y2ggeyByZXR1cm4gW107IH0gfSkoKSxcbiAgICAgIChhc3luYyAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgd2luZG93LkRhdGFTdG9yZT8uaW5pdD8uKCk7XG4gICAgICAgICAgcmV0dXJuIHdpbmRvdy5EYXRhU3RvcmU/LmFsbFRvcGljcz8uKCkgPz8gW107XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfVxuICAgICAgfSkoKSxcbiAgICBdKTtcbiAgICBpZiAoIWRvY3VtZW50LmJvZHkuY29udGFpbnMobGlzdFJvb3QpKSByZXR1cm47XG5cbiAgICBjb25zdCB0b3BpY01hcCA9IG5ldyBNYXAodG9waWNzLm1hcCh0b3BpYyA9PiBbdG9waWMudG9waWNJZCwgdG9waWNdKSk7XG4gICAgY29uc3QgcHJvZ3Jlc3NCeVRvcGljID0gbmV3IE1hcChwcm9ncmVzcy5tYXAocmVjb3JkID0+IFtyZWNvcmQudG9waWNJZCwgcmVjb3JkXSkpO1xuICAgIGNvbnN0IGRvbmVSZWNvcmRzID0gcHJvZ3Jlc3MuZmlsdGVyKHJlY29yZCA9PiByZWNvcmQuc3RhdHVzID09PSAnZG9uZScgfHwgTnVtYmVyKHJlY29yZC5wZXJjZW50KSA+PSAxMDApO1xuICAgIGNvbnN0IGFjdGl2ZVJlY29yZHMgPSBwcm9ncmVzcy5maWx0ZXIocmVjb3JkID0+IE51bWJlcihyZWNvcmQucGVyY2VudCkgPiAwIHx8IE51bWJlcihyZWNvcmQucG9zaXRpb24pID4gMCB8fCByZWNvcmQuc3RhdHVzID09PSAnaW4tcHJvZ3Jlc3MnKTtcbiAgICBjb25zdCB3YXRjaGVkU2Vjb25kcyA9IHByb2dyZXNzLnJlZHVjZSgoc3VtLCByZWNvcmQpID0+IHN1bSArIE1hdGgubWF4KDAsIE51bWJlcihyZWNvcmQucG9zaXRpb24pIHx8IDApLCAwKTtcbiAgICBjb25zdCBjb3Vyc2VJZHMgPSBuZXcgU2V0KHRvcGljcy5tYXAodG9waWMgPT4gdG9waWMuY291cnNlSWQpLmZpbHRlcihCb29sZWFuKSk7XG4gICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICBjb25zdCByZXZpZXdXaW5kb3dNcyA9IDMwICogMjQgKiA2MCAqIDYwICogMTAwMDtcbiAgICBjb25zdCBhY3Rpdml0eVRpbWVzRm9yVG9waWMgPSAodG9waWNJZCwgcHJvZ3Jlc3NSZWNvcmQpID0+IFtcbiAgICAgIHByb2dyZXNzUmVjb3JkPy5yZXZpZXdlZEF0LFxuICAgICAgcHJvZ3Jlc3NSZWNvcmQ/LnVwZGF0ZWRBdCxcbiAgICAgIHByb2dyZXNzUmVjb3JkPy5jb21wbGV0ZWRBdCxcbiAgICAgIC4uLnRpbWVzdGFtcHMuZmlsdGVyKGl0ZW0gPT4gaXRlbT8udG9waWNJZCA9PT0gdG9waWNJZCkubWFwKGl0ZW0gPT4gaXRlbS51cGRhdGVkQXQgfHwgaXRlbS5jcmVhdGVkQXQpLFxuICAgICAgLi4ubm90ZXMuZmlsdGVyKGl0ZW0gPT4gaXRlbT8udG9waWNJZCA9PT0gdG9waWNJZCkubWFwKGl0ZW0gPT4gaXRlbS51cGRhdGVkQXQgfHwgaXRlbS5jcmVhdGVkQXQpLFxuICAgIF0ubWFwKHZhbHVlID0+IE51bWJlcih2YWx1ZSkgfHwgMCk7XG4gICAgY29uc3QgcmV2aWV3SXRlbXMgPSBkb25lUmVjb3Jkc1xuICAgICAgLm1hcChyZWNvcmQgPT4ge1xuICAgICAgICBjb25zdCB0b3BpYyA9IHRvcGljTWFwLmdldChyZWNvcmQudG9waWNJZCk7XG4gICAgICAgIGNvbnN0IGxhc3RBY3Rpdml0eSA9IE1hdGgubWF4KC4uLmFjdGl2aXR5VGltZXNGb3JUb3BpYyhyZWNvcmQudG9waWNJZCwgcmVjb3JkKSwgMCk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgdG9waWNJZDogcmVjb3JkLnRvcGljSWQsXG4gICAgICAgICAgY291cnNlSWQ6IHJlY29yZC5jb3Vyc2VJZCB8fCB0b3BpYz8uY291cnNlSWQsXG4gICAgICAgICAgdGl0bGU6IHRvcGljPy50aXRsZSB8fCByZWNvcmQudG9waWNUaXRsZSB8fCByZWNvcmQudG9waWNJZCB8fCAnQ29tcGxldGVkIHRvcGljJyxcbiAgICAgICAgICBjb3Vyc2VUaXRsZTogdG9waWM/LmNvdXJzZVRpdGxlIHx8IHJlY29yZC5jb3Vyc2VUaXRsZSB8fCByZWNvcmQuY291cnNlSWQgfHwgdG9waWM/LmNvdXJzZUlkIHx8ICdDb3Vyc2UnLFxuICAgICAgICAgIGxhc3RBY3Rpdml0eSxcbiAgICAgICAgICBkYXlzU2luY2U6IGxhc3RBY3Rpdml0eSA/IE1hdGguZmxvb3IoKG5vdyAtIGxhc3RBY3Rpdml0eSkgLyAoMjQgKiA2MCAqIDYwICogMTAwMCkpIDogbnVsbCxcbiAgICAgICAgfTtcbiAgICAgIH0pXG4gICAgICAuZmlsdGVyKGl0ZW0gPT4gaXRlbS50b3BpY0lkICYmICghaXRlbS5sYXN0QWN0aXZpdHkgfHwgbm93IC0gaXRlbS5sYXN0QWN0aXZpdHkgPj0gcmV2aWV3V2luZG93TXMpKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IChhLmxhc3RBY3Rpdml0eSB8fCAwKSAtIChiLmxhc3RBY3Rpdml0eSB8fCAwKSlcbiAgICAgIC5zbGljZSgwLCA2KTtcbiAgICBsZXQgY29tcGxldGVkQ291cnNlcyA9IDA7XG4gICAgY291cnNlSWRzLmZvckVhY2goY291cnNlSWQgPT4ge1xuICAgICAgY29uc3QgY291cnNlVG9waWNzID0gdG9waWNzLmZpbHRlcih0b3BpYyA9PiB0b3BpYy5jb3Vyc2VJZCA9PT0gY291cnNlSWQpO1xuICAgICAgaWYgKGNvdXJzZVRvcGljcy5sZW5ndGggJiYgY291cnNlVG9waWNzLmV2ZXJ5KHRvcGljID0+IHtcbiAgICAgICAgY29uc3QgcmVjb3JkID0gcHJvZ3Jlc3NCeVRvcGljLmdldCh0b3BpYy50b3BpY0lkKTtcbiAgICAgICAgcmV0dXJuIHJlY29yZD8uc3RhdHVzID09PSAnZG9uZScgfHwgTnVtYmVyKHJlY29yZD8ucGVyY2VudCkgPj0gMTAwO1xuICAgICAgfSkpIHtcbiAgICAgICAgY29tcGxldGVkQ291cnNlcyArPSAxO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29uc3Qgc3RhdHMgPSBbXG4gICAgICBbJ1RvdWNoZWQgdG9waWNzJywgYWN0aXZlUmVjb3Jkcy5sZW5ndGhdLFxuICAgICAgWydEb25lIHRvcGljcycsIGRvbmVSZWNvcmRzLmxlbmd0aF0sXG4gICAgICBbJ0NvbXBsZXRlZCBjb3Vyc2VzJywgY29tcGxldGVkQ291cnNlc10sXG4gICAgICBbJ1dhdGNoZWQgbWludXRlcycsIE1hdGgucm91bmQod2F0Y2hlZFNlY29uZHMgLyA2MCldLFxuICAgICAgWydEdWUgcmV2aWV3cycsIHJldmlld0l0ZW1zLmxlbmd0aF0sXG4gICAgXTtcblxuICAgIG1ldHJpY3NSb290LnJlcGxhY2VDaGlsZHJlbigpO1xuICAgIHN0YXRzLmZvckVhY2goKFtsYWJlbCwgdmFsdWVdKSA9PiB7XG4gICAgICBjb25zdCBjYXJkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICBjYXJkLmNsYXNzTmFtZSA9ICdzdGF0LWNhcmQnO1xuICAgICAgY29uc3Qgc3Ryb25nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3Ryb25nJyk7XG4gICAgICBzdHJvbmcudGV4dENvbnRlbnQgPSBTdHJpbmcodmFsdWUpO1xuICAgICAgY29uc3Qgc3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICAgIHNwYW4udGV4dENvbnRlbnQgPSBsYWJlbDtcbiAgICAgIGNhcmQuYXBwZW5kKHN0cm9uZywgc3Bhbik7XG4gICAgICBtZXRyaWNzUm9vdC5hcHBlbmRDaGlsZChjYXJkKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IGFjaGlldmVtZW50c0xpc3QgPSBbXG4gICAgICB7IGlkOiAnZmlyc3Qtc3RlcCcsIHRpdGxlOiAnRmlyc3QgU3RlcCcsIGRldGFpbDogJ1N0YXJ0IGFueSB0b3BpYy4nLCB1bmxvY2tlZDogYWN0aXZlUmVjb3Jkcy5sZW5ndGggPj0gMSB9LFxuICAgICAgeyBpZDogJ2ZpcnN0LWZpbmlzaCcsIHRpdGxlOiAnRmlyc3QgRmluaXNoJywgZGV0YWlsOiAnQ29tcGxldGUgb25lIHRvcGljLicsIHVubG9ja2VkOiBkb25lUmVjb3Jkcy5sZW5ndGggPj0gMSB9LFxuICAgICAgeyBpZDogJ2RlZXAtZm9jdXMnLCB0aXRsZTogJ0RlZXAgRm9jdXMnLCBkZXRhaWw6ICdXYXRjaCBhdCBsZWFzdCAzMCBtaW51dGVzLicsIHVubG9ja2VkOiB3YXRjaGVkU2Vjb25kcyA+PSAxODAwIH0sXG4gICAgICB7IGlkOiAnY291cnNlLWNvbXBsZXRlJywgdGl0bGU6ICdDb3Vyc2UgQ29tcGxldGUnLCBkZXRhaWw6ICdGaW5pc2ggZXZlcnkgdG9waWMgaW4gYSBjb3Vyc2UuJywgdW5sb2NrZWQ6IGNvbXBsZXRlZENvdXJzZXMgPj0gMSB9LFxuICAgICAgeyBpZDogJ2NvbGxlY3RvcicsIHRpdGxlOiAnQ29sbGVjdG9yJywgZGV0YWlsOiAnTWFrZSBwcm9ncmVzcyBvbiAxMCB0b3BpY3MuJywgdW5sb2NrZWQ6IGFjdGl2ZVJlY29yZHMubGVuZ3RoID49IDEwIH0sXG4gICAgICB7IGlkOiAnY2F0YWxvZy1yb2FtZXInLCB0aXRsZTogJ0NhdGFsb2cgUm9hbWVyJywgZGV0YWlsOiAnVG91Y2ggdG9waWNzIGZyb20gdGhyZWUgY291cnNlcy4nLCB1bmxvY2tlZDogbmV3IFNldChhY3RpdmVSZWNvcmRzLm1hcChyZWNvcmQgPT4gcmVjb3JkLmNvdXJzZUlkIHx8IHRvcGljTWFwLmdldChyZWNvcmQudG9waWNJZCk/LmNvdXJzZUlkKS5maWx0ZXIoQm9vbGVhbikpLnNpemUgPj0gMyB9LFxuICAgIF07XG5cbiAgICBsaXN0Um9vdC5yZXBsYWNlQ2hpbGRyZW4oKTtcbiAgICBhY2hpZXZlbWVudHNMaXN0LmZvckVhY2goYWNoaWV2ZW1lbnQgPT4ge1xuICAgICAgY29uc3QgY2FyZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2FydGljbGUnKTtcbiAgICAgIGNhcmQuY2xhc3NOYW1lID0gYGNhcmQgJHthY2hpZXZlbWVudC51bmxvY2tlZCA/ICdjYXJkLWZpbGxlZCcgOiAnJ31gLnRyaW0oKTtcbiAgICAgIGNhcmQuZGF0YXNldC5hY2hpZXZlbWVudElkID0gYWNoaWV2ZW1lbnQuaWQ7XG4gICAgICBjYXJkLmRhdGFzZXQuYWNoaWV2ZW1lbnRTdGF0ZSA9IGFjaGlldmVtZW50LnVubG9ja2VkID8gJ3VubG9ja2VkJyA6ICdsb2NrZWQnO1xuXG4gICAgICBjb25zdCBib2R5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICBib2R5LmNsYXNzTmFtZSA9ICdjYXJkLWJvZHknO1xuICAgICAgY29uc3QgdGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdoMicpO1xuICAgICAgdGl0bGUuY2xhc3NOYW1lID0gJ2g0JztcbiAgICAgIHRpdGxlLnRleHRDb250ZW50ID0gYWNoaWV2ZW1lbnQudGl0bGU7XG4gICAgICBjb25zdCBkZXRhaWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJyk7XG4gICAgICBkZXRhaWwudGV4dENvbnRlbnQgPSBhY2hpZXZlbWVudC5kZXRhaWw7XG4gICAgICBjb25zdCBzdGF0dXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG4gICAgICBzdGF0dXMuY2xhc3NOYW1lID0gYGJhZGdlICR7YWNoaWV2ZW1lbnQudW5sb2NrZWQgPyAnYmFkZ2Utc3VjY2VzcycgOiAnYmFkZ2UtbXV0ZWQnfWA7XG4gICAgICBzdGF0dXMudGV4dENvbnRlbnQgPSBhY2hpZXZlbWVudC51bmxvY2tlZCA/ICdVbmxvY2tlZCcgOiAnTG9ja2VkJztcbiAgICAgIHN0YXR1cy5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBgQWNoaWV2ZW1lbnQgc3RhdHVzOiAke3N0YXR1cy50ZXh0Q29udGVudH1gKTtcbiAgICAgIGJvZHkuYXBwZW5kKHRpdGxlLCBkZXRhaWwsIHN0YXR1cyk7XG4gICAgICBjYXJkLmFwcGVuZENoaWxkKGJvZHkpO1xuICAgICAgbGlzdFJvb3QuYXBwZW5kQ2hpbGQoY2FyZCk7XG4gICAgfSk7XG5cbiAgICBpZiAoIXJldmlld1Jvb3QpIHJldHVybjtcbiAgICByZXZpZXdSb290LnJlcGxhY2VDaGlsZHJlbigpO1xuICAgIGlmICghcmV2aWV3SXRlbXMubGVuZ3RoKSB7XG4gICAgICBjb25zdCBlbXB0eSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcbiAgICAgIGVtcHR5LmNsYXNzTmFtZSA9ICd0ZXh0LW11dGVkJztcbiAgICAgIGVtcHR5LnRleHRDb250ZW50ID0gJ05vIGNvbXBsZXRlZCB0b3BpY3MgYXJlIGR1ZSBmb3IgcmV2aWV3IHlldC4nO1xuICAgICAgcmV2aWV3Um9vdC5hcHBlbmRDaGlsZChlbXB0eSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHJldmlld0l0ZW1zLmZvckVhY2goaXRlbSA9PiB7XG4gICAgICBjb25zdCBjYXJkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYXJ0aWNsZScpO1xuICAgICAgY2FyZC5jbGFzc05hbWUgPSAnY2FyZCc7XG4gICAgICBjYXJkLmRhdGFzZXQucmV2aWV3VG9waWNJZCA9IGl0ZW0udG9waWNJZDtcbiAgICAgIGNvbnN0IGJvZHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgIGJvZHkuY2xhc3NOYW1lID0gJ2NhcmQtYm9keSc7XG4gICAgICBjb25zdCBiYWRnZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICAgIGJhZGdlLmNsYXNzTmFtZSA9ICdiYWRnZSBiYWRnZS13YXJuaW5nJztcbiAgICAgIGJhZGdlLnRleHRDb250ZW50ID0gaXRlbS5kYXlzU2luY2UgPT0gbnVsbCA/ICdSZXZpZXcnIDogYCR7aXRlbS5kYXlzU2luY2V9IGRheXNgO1xuICAgICAgY29uc3QgdGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdoMicpO1xuICAgICAgdGl0bGUuY2xhc3NOYW1lID0gJ2g0JztcbiAgICAgIHRpdGxlLnRleHRDb250ZW50ID0gaXRlbS50aXRsZTtcbiAgICAgIGNvbnN0IGRldGFpbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcbiAgICAgIGRldGFpbC50ZXh0Q29udGVudCA9IGBSZXZpc2l0IG5vdGVzIGFuZCBtZWRpYSBmcm9tICR7aXRlbS5jb3Vyc2VUaXRsZX0uYDtcbiAgICAgIGNvbnN0IGFjdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICAgICAgYWN0aW9uLmNsYXNzTmFtZSA9ICdidG4gYnRuLWdob3N0JztcbiAgICAgIGFjdGlvbi50eXBlID0gJ2J1dHRvbic7XG4gICAgICBhY3Rpb24uZGF0YXNldC5yZXZpZXdUb3BpYyA9IGl0ZW0udG9waWNJZDtcbiAgICAgIGFjdGlvbi50ZXh0Q29udGVudCA9ICdSZXZpZXcnO1xuICAgICAgYm9keS5hcHBlbmQoYmFkZ2UsIHRpdGxlLCBkZXRhaWwsIGFjdGlvbik7XG4gICAgICBjYXJkLmFwcGVuZENoaWxkKGJvZHkpO1xuICAgICAgcmV2aWV3Um9vdC5hcHBlbmRDaGlsZChjYXJkKTtcbiAgICB9KTtcbiAgICByZXZpZXdSb290Lm9uY2xpY2sgPSAoZXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IGJ1dHRvbiA9IGV2ZW50LnRhcmdldD8uY2xvc2VzdD8uKCdbZGF0YS1yZXZpZXctdG9waWNdJyk7XG4gICAgICBpZiAoIWJ1dHRvbikgcmV0dXJuO1xuICAgICAgc2V0UGVuZGluZ0NvdXJzZU1lZGlhKGJ1dHRvbi5kYXRhc2V0LnJldmlld1RvcGljKTtcbiAgICAgIFJvdXRlci5uYXZpZ2F0ZSgnIy9jb3Vyc2VzJyk7XG4gICAgfTtcbiAgfVxufVxu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
