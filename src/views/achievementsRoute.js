import { ProceduralTrophy } from '../features/proceduralTrophy.js';

export function mountAchievementsView(deps = {}) {
  const {
    setView,
    Router,
    setPendingCourseMedia,
  } = deps;

  setView(`
    <section class="view view-achievements">
      <div class="page-header achievements-header">
        <div>
          <span class="eyebrow">Milestones & Mastery</span>
          <div class="page-title-row">
            <h1 class="page-title">Achievements</h1>
            <span class="badge badge-success" aria-label="Feature status: ready">Ready</span>
          </div>
          <p class="page-subtitle">Milestones and spaced retention cues based on your learning history.</p>
        </div>
      </div>
      <div class="stat-grid" data-achievement-metrics></div>
      <div class="card card-filled achievements-section-card">
        <div class="card-body">
          <div class="grid grid-3" data-achievement-list>
            <p>Loading achievements...</p>
          </div>
        </div>
      </div>
      <div class="card card-filled achievements-review-card">
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
    const metricsRoot = document.querySelector('[data-achievement-metrics]');
    const listRoot = document.querySelector('[data-achievement-list]');
    const reviewRoot = document.querySelector('[data-review-list]');
    if (!metricsRoot || !listRoot) return;

    const [progress, notes, timestamps, topics] = await Promise.all([
      (async () => { try { return await window.DB?.getAllProgress?.() ?? []; } catch { return []; } })(),
      (async () => { try { return await window.DB?.getAllNotes?.() ?? []; } catch { return []; } })(),
      (async () => { try { return await window.DB?.getAllTimestamps?.() ?? []; } catch { return []; } })(),
      (async () => {
        try {
          await window.DataStore?.init?.();
          return window.DataStore?.allTopics?.() ?? [];
        } catch {
          return [];
        }
      })(),
    ]);
    if (!document.body.contains(listRoot)) return;

    const topicMap = new Map(topics.map(topic => [topic.topicId, topic]));
    const progressByTopic = new Map(progress.map(record => [record.topicId, record]));
    const doneRecords = progress.filter(record => record.status === 'done' || Number(record.percent) >= 100);
    const activeRecords = progress.filter(record => Number(record.percent) > 0 || Number(record.position) > 0 || record.status === 'in-progress');
    const watchedSeconds = progress.reduce((sum, record) => sum + Math.max(0, Number(record.position) || 0), 0);
    const courseIds = new Set(topics.map(topic => topic.courseId).filter(Boolean));
    const now = Date.now();
    const reviewWindowMs = 30 * 24 * 60 * 60 * 1000;
    const activityTimesForTopic = (topicId, progressRecord) => [
      progressRecord?.reviewedAt,
      progressRecord?.updatedAt,
      progressRecord?.completedAt,
      ...timestamps.filter(item => item?.topicId === topicId).map(item => item.updatedAt || item.createdAt),
      ...notes.filter(item => item?.topicId === topicId).map(item => item.updatedAt || item.createdAt),
    ].map(value => Number(value) || 0);
    const reviewItems = doneRecords
      .map(record => {
        const topic = topicMap.get(record.topicId);
        const lastActivity = Math.max(...activityTimesForTopic(record.topicId, record), 0);
        return {
          topicId: record.topicId,
          courseId: record.courseId || topic?.courseId,
          title: topic?.title || record.topicTitle || record.topicId || 'Completed topic',
          courseTitle: topic?.courseTitle || record.courseTitle || record.courseId || topic?.courseId || 'Course',
          lastActivity,
          daysSince: lastActivity ? Math.floor((now - lastActivity) / (24 * 60 * 60 * 1000)) : null,
        };
      })
      .filter(item => item.topicId && (!item.lastActivity || now - item.lastActivity >= reviewWindowMs))
      .sort((a, b) => (a.lastActivity || 0) - (b.lastActivity || 0))
      .slice(0, 6);
    let completedCourses = 0;
    courseIds.forEach(courseId => {
      const courseTopics = topics.filter(topic => topic.courseId === courseId);
      if (courseTopics.length && courseTopics.every(topic => {
        const record = progressByTopic.get(topic.topicId);
        return record?.status === 'done' || Number(record?.percent) >= 100;
      })) {
        completedCourses += 1;
      }
    });

    const stats = [
      ['Touched topics', activeRecords.length],
      ['Done topics', doneRecords.length],
      ['Completed courses', completedCourses],
      ['Watched minutes', Math.round(watchedSeconds / 60)],
      ['Due reviews', reviewItems.length],
    ];

    metricsRoot.replaceChildren();
    stats.forEach(([label, value]) => {
      const card = document.createElement('div');
      card.className = 'stat-card';
      const strong = document.createElement('strong');
      strong.textContent = String(value);
      const span = document.createElement('span');
      span.textContent = label;
      card.append(strong, span);
      metricsRoot.appendChild(card);
    });

    const achievementsList = [
      { id: 'first-step', title: 'First Step', detail: 'Start any topic.', unlocked: activeRecords.length >= 1 },
      { id: 'first-finish', title: 'First Finish', detail: 'Complete one topic.', unlocked: doneRecords.length >= 1 },
      { id: 'deep-focus', title: 'Deep Focus', detail: 'Watch at least 30 minutes.', unlocked: watchedSeconds >= 1800 },
      { id: 'course-complete', title: 'Course Complete', detail: 'Finish every topic in a course.', unlocked: completedCourses >= 1 },
      { id: 'collector', title: 'Collector', detail: 'Make progress on 10 topics.', unlocked: activeRecords.length >= 10 },
      { id: 'catalog-roamer', title: 'Catalog Roamer', detail: 'Touch topics from three courses.', unlocked: new Set(activeRecords.map(record => record.courseId || topicMap.get(record.topicId)?.courseId).filter(Boolean)).size >= 3 },
    ];

    listRoot.replaceChildren();
    achievementsList.forEach(achievement => {
      const card = document.createElement('article');
      card.className = `card achievement-card ${achievement.unlocked ? 'card-filled' : 'card-locked'}`.trim();
      card.dataset.achievementId = achievement.id;
      card.dataset.achievementState = achievement.unlocked ? 'unlocked' : 'locked';

      const trophyType =
        achievement.id === 'course-complete' ? 'cornell-master' :
        achievement.id === 'deep-focus' ? 'scholar' :
        achievement.id === 'first-finish' ? 'prism' :
        achievement.id === 'first-step' ? 'desk' :
        achievement.id === 'collector' ? 'crystal' :
        achievement.id === 'catalog-roamer' ? 'voyager' : 'prism';
      const trophyWrap = document.createElement('div');
      trophyWrap.className = 'achievement-trophy-wrap';
      trophyWrap.innerHTML = ProceduralTrophy.renderTrophySvg(trophyType, { size: 64 });
      if (!achievement.unlocked) {
        trophyWrap.style.filter = 'grayscale(1) opacity(0.35)';
      }

      const body = document.createElement('div');
      body.className = 'card-body';
      const title = document.createElement('h2');
      title.className = 'h4';
      title.textContent = achievement.title;
      const detail = document.createElement('p');
      detail.textContent = achievement.detail;
      const status = document.createElement('span');
      status.className = `badge ${achievement.unlocked ? 'badge-success' : 'badge-muted'}`;
      status.textContent = achievement.unlocked ? 'Unlocked' : 'Locked';
      status.setAttribute('aria-label', `Achievement status: ${status.textContent}`);
      body.append(title, detail, status);
      card.append(trophyWrap, body);
      listRoot.appendChild(card);
    });

    if (!reviewRoot) return;
    reviewRoot.replaceChildren();
    if (!reviewItems.length) {
      const empty = document.createElement('p');
      empty.className = 'text-muted';
      empty.textContent = 'No completed topics are due for review yet.';
      reviewRoot.appendChild(empty);
      return;
    }
    reviewItems.forEach(item => {
      const card = document.createElement('article');
      card.className = 'card';
      card.dataset.reviewTopicId = item.topicId;
      const body = document.createElement('div');
      body.className = 'card-body';
      const badge = document.createElement('span');
      badge.className = 'badge badge-warning';
      badge.textContent = item.daysSince == null ? 'Review' : `${item.daysSince} days`;
      const title = document.createElement('h2');
      title.className = 'h4';
      title.textContent = item.title;
      const detail = document.createElement('p');
      detail.textContent = `Revisit notes and media from ${item.courseTitle}.`;
      const action = document.createElement('button');
      action.className = 'btn btn-ghost';
      action.type = 'button';
      action.dataset.reviewTopic = item.topicId;
      action.textContent = 'Review';
      body.append(badge, title, detail, action);
      card.appendChild(body);
      reviewRoot.appendChild(card);
    });
    reviewRoot.onclick = (event) => {
      const button = event.target?.closest?.('[data-review-topic]');
      if (!button) return;
      setPendingCourseMedia(button.dataset.reviewTopic);
      Router.navigate('#/courses');
    };
  }
}
