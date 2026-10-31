import { dueReviewCards, watchedCoverageSeconds } from '../core/studyMetrics.js';
import { ProceduralTrophy } from '../features/proceduralTrophy.js';

export function mountAchievementsView(deps = {}) {
  const {
    setView,
    Router,
  } = deps;

  setView(`
    <section class="view view-achievements">
      <div class="page-header achievements-header">
        <div>
          <div class="page-title-row">
            <h1 class="page-title">Achievements</h1>
          </div>
          <p class="page-subtitle">Study goals completed from your recorded activity.</p>
        </div>
      </div>
      <section class="card card-filled achievement-next-card" data-next-achievement hidden aria-label="Next attainable achievement"></section>
      <div class="stat-grid" data-achievement-metrics hidden></div>
      <div class="card card-filled achievements-section-card" data-unlocked-achievements hidden>
        <div class="card-body">
          <h2 class="h3">Unlocked achievements</h2>
          <div class="grid grid-3" data-achievement-list></div>
        </div>
      </div>
      <details class="card achievement-locked-section" data-locked-achievements>
        <summary class="h3" data-locked-achievement-summary>Locked achievements</summary>
        <div class="card-body">
          <div class="grid grid-3" data-locked-achievement-list></div>
        </div>
      </details>
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
    const nextRoot = document.querySelector('[data-next-achievement]');
    const lockedDetails = document.querySelector('[data-locked-achievements]');
    const lockedRoot = document.querySelector('[data-locked-achievement-list]');
    const unlockedSection = document.querySelector('[data-unlocked-achievements]');
    if (!metricsRoot || !listRoot || !nextRoot || !lockedDetails || !lockedRoot || !unlockedSection) return;

    let loaded;
    try {
      loaded = await Promise.all([
        window.DB?.getAllProgress?.() ?? [],
        window.DB?.getAllNotes?.() ?? [],
        window.DB?.getAllTimestamps?.() ?? [],
        (async () => {
          await window.DataStore?.init?.();
          return window.DataStore?.allTopics?.() ?? [];
        })(),
        window.DB?.getAllWatchedSegments?.() ?? [],
        window.DB?.getSetting?.('ocd_flashcards') ?? [],
      ]);
    } catch (error) {
      // A failed canonical read must not masquerade as "0 achievements".
      // Users can retry without navigating away or losing their actual data.
      if (!document.body.contains(listRoot)) return;
      console.warn('[Achievements] unable to read learning activity:', error);
      metricsRoot.replaceChildren();
      metricsRoot.hidden = true;
      nextRoot.replaceChildren();
      nextRoot.hidden = true;
      lockedRoot.replaceChildren();
      listRoot.replaceChildren();
      reviewRoot?.replaceChildren();
      const notice = document.createElement('div');
      notice.className = 'card card-filled achievement-load-error';
      notice.dataset.achievementsError = '';
      notice.setAttribute('role', 'alert');
      const label = document.createElement('p');
      label.textContent = 'Your learning activity could not load. Your saved progress has not been changed.';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn btn-primary btn-sm';
      retry.dataset.achievementsRetry = '';
      retry.textContent = 'Try again';
      retry.addEventListener('click', () => {
        retry.disabled = true;
        void renderAchievements();
      });
      notice.append(label, retry);
      listRoot.replaceChildren(notice);
      return;
    }
    const [progress, notes, timestamps, topics, watchedSegments, cards] = loaded;
    if (!document.body.contains(listRoot)) return;

    const topicMap = new Map(topics.map(topic => [topic.topicId, topic]));
    const progressByTopic = new Map(progress.map(record => [record.topicId, record]));
    const doneRecords = progress.filter(record => record.status === 'done' || Number(record.percent) >= 100);
    const activeRecords = progress.filter(record => Number(record.percent) > 0 || Number(record.position) > 0 || record.status === 'in-progress');
    const watchedSeconds = watchedCoverageSeconds(watchedSegments);
    const courseIds = new Set(topics.map(topic => topic.courseId).filter(Boolean));
    const reviewItems = dueReviewCards(cards).slice(0, 6);
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
      ['Tracked coverage minutes', Math.round(watchedSeconds / 60)],
      ['Due reviews', reviewItems.length],
    ];

    metricsRoot.replaceChildren();
    const meaningfulStats = stats.filter(([, value]) => value > 0);
    metricsRoot.hidden = meaningfulStats.length === 0;
    meaningfulStats.forEach(([label, value]) => {
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
      { id: 'deep-focus', title: 'Deep Focus', detail: 'Track 30 minutes of watched video coverage.', unlocked: watchedSeconds >= 1800 },
      { id: 'course-complete', title: 'Course Complete', detail: 'Finish every topic in a course.', unlocked: completedCourses >= 1 },
      { id: 'collector', title: 'Collector', detail: 'Make progress on 10 topics.', unlocked: activeRecords.length >= 10 },
      { id: 'catalog-roamer', title: 'Catalog Roamer', detail: 'Touch topics from three courses.', unlocked: new Set(activeRecords.map(record => record.courseId || topicMap.get(record.topicId)?.courseId).filter(Boolean)).size >= 3 },
    ];

    // Pick the closest incomplete objective, retaining the gentle first-step
    // order for learners with no recorded activity. These are actual activity
    // totals, never decorative or inferred XP percentages.
    const touchedCourses = new Set(activeRecords.map(record =>
      record.courseId || topicMap.get(record.topicId)?.courseId).filter(Boolean)).size;
    const progressGoals = [
      { id: 'first-step', title: 'First Step', current: Math.min(activeRecords.length, 1), target: 1, action: 'Browse courses' },
      { id: 'first-finish', title: 'First Finish', current: Math.min(doneRecords.length, 1), target: 1, action: 'Continue a lesson' },
      { id: 'deep-focus', title: 'Deep Focus', current: Math.min(Math.floor(watchedSeconds / 60), 30), target: 30, action: 'Watch a lesson', unit: 'minutes' },
      { id: 'course-complete', title: 'Course Complete', current: Math.min(completedCourses, 1), target: 1, action: 'Finish a course' },
      { id: 'collector', title: 'Collector', current: Math.min(activeRecords.length, 10), target: 10, action: 'Study another topic' },
      { id: 'catalog-roamer', title: 'Catalog Roamer', current: Math.min(touchedCourses, 3), target: 3, action: 'Explore courses' },
    ];
    const nextGoal = progressGoals
      .filter(goal => goal.current < goal.target)
      .sort((a, b) => (b.current / b.target) - (a.current / a.target))[0];
    nextRoot.replaceChildren();
    nextRoot.hidden = !nextGoal;
    if (nextGoal) {
      const body = document.createElement('div');
      body.className = 'card-body';
      const eyebrow = document.createElement('span');
      eyebrow.className = 'eyebrow';
      eyebrow.textContent = 'Next achievable goal';
      const title = document.createElement('h2');
      title.className = 'h3';
      title.textContent = nextGoal.title;
      const explanation = document.createElement('p');
      explanation.className = 'text-muted';
      explanation.textContent = `${nextGoal.current} of ${nextGoal.target}${nextGoal.unit ? ' ' + nextGoal.unit : ''}`;
      const meter = document.createElement('progress');
      meter.max = nextGoal.target;
      meter.value = nextGoal.current;
      meter.setAttribute('aria-label', nextGoal.title + ' progress');
      const action = document.createElement('a');
      action.className = 'btn btn-primary';
      action.href = '#/courses';
      action.textContent = nextGoal.action;
      body.append(eyebrow, title, explanation, meter, action);
      nextRoot.appendChild(body);
    }

    listRoot.replaceChildren();
    lockedRoot.replaceChildren();
    const unlockedCount = achievementsList.filter(achievement => achievement.unlocked).length;
    const lockedCount = achievementsList.length - unlockedCount;
    unlockedSection.hidden = unlockedCount === 0;
    lockedDetails.hidden = lockedCount === 0;
    lockedDetails.open = false;
    lockedDetails.querySelector('[data-locked-achievement-summary]').textContent =
      `Locked achievements (${lockedCount})`;
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
      (achievement.unlocked ? listRoot : lockedRoot).appendChild(card);
    });

    if (!reviewRoot) return;
    reviewRoot.replaceChildren();
    if (!reviewItems.length) {
      const empty = document.createElement('p');
      empty.className = 'text-muted';
      empty.textContent = 'No flashcards are due for review today.';
      reviewRoot.appendChild(empty);
      return;
    }
    reviewItems.forEach(item => {
      const card = document.createElement('article');
      card.className = 'card';
      card.dataset.reviewCardId = item.id;
      const body = document.createElement('div');
      body.className = 'card-body';
      const badge = document.createElement('span');
      badge.className = 'badge badge-warning';
      badge.textContent = item.deck || 'Flashcard';
      const title = document.createElement('h2');
      title.className = 'h4';
      title.textContent = item.front || 'Review card';
      const detail = document.createElement('p');
      detail.textContent = 'Recall the answer in Review.';
      const action = document.createElement('button');
      action.className = 'btn btn-ghost';
      action.type = 'button';
      action.dataset.reviewCard = item.id;
      action.textContent = 'Review';
      body.append(badge, title, detail, action);
      card.appendChild(body);
      reviewRoot.appendChild(card);
    });
    reviewRoot.onclick = (event) => {
      const button = event.target?.closest?.('[data-review-card]');
      if (!button) return;
      Router.navigate('#/flashcards');
    };
  }
}
