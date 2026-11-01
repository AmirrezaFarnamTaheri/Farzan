import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('app topbar search rendering', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    try { window.OpenCourseDeck?.Router?.destroy?.(); } catch {}
    vi.resetModules();
    window.matchMedia = vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    window.requestAnimationFrame = vi.fn((cb) => {
      cb();
      return 1;
    });
    window.cancelAnimationFrame = vi.fn();
    window.IntersectionObserver = vi.fn(function IntersectionObserver() {
      this.observe = vi.fn();
      this.unobserve = vi.fn();
      this.disconnect = vi.fn();
    });
    window.OpenCourseDeck = { bus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() } };
    window.location.hash = '#/help';
    document.body.innerHTML = `
      <div id="ocd-app">
        <div class="topbar-search"><input data-search-input /></div>
        <main id="view-container"></main>
      </div>
    `;
    await import('../app.js');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders search result fields as text and blocks unsafe navigation URLs', async () => {
    window.OpenCourseDeck.TopbarSearch.setData([
      {
        label: '<img src=x onerror="window.__searchXss = true">',
        description: '<script>window.__searchDescXss = true</script>',
        category: '<b>Category</b>',
        href: 'javascript:window.__searchHrefXss = true',
      },
    ]);

    const input = document.querySelector('[data-search-input]');
    input.value = '<img';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(350);

    const result = document.querySelector('.search-result-item');
    expect(result.textContent).toContain('<img');
    expect(result.textContent).toContain('<script>');
    expect(result.textContent).toContain('<b>Category</b>');
    expect(result.querySelector('img')).toBeNull();
    expect(result.querySelector('script')).toBeNull();

    result.click();

    expect(window.__searchXss).toBeUndefined();
    expect(window.__searchDescXss).toBeUndefined();
    expect(window.__searchHrefXss).toBeUndefined();
    expect(window.location.href).not.toContain('javascript:');
  });

  it('renders a title-only imported search suggestion and exposes it to keyboard navigation', async () => {
    const select = vi.fn();
    const search = window.OpenCourseDeck.TopbarSearch;
    search.setData([
      { id: 'imported-lecture', title: 'Renal physiology 你好', category: 'Imported media', action: select },
    ]);
    const input = document.querySelector('[data-search-input]');
    input.value = 'renal';
    await search._onInput('renal');
    const row = search.resultsBox.querySelector('[role="option"]');
    expect(row).not.toBeNull();
    expect(row.querySelector('.search-result-label').textContent).toBe('Renal physiology 你好');
    expect(input.getAttribute('aria-activedescendant')).toBe(row.id);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(select).toHaveBeenCalledOnce();
  });

  it('uses an accessible selected option and consistent Arrow/Enter/Escape behavior', async () => {
    const actionA = vi.fn();
    const actionB = vi.fn();
    const search = window.OpenCourseDeck.TopbarSearch;
    search.setData([
      { label: 'Biology', action: actionA, category: 'Course' },
      { label: 'Biology practice', action: actionB, category: 'Topic' },
    ]);
    const input = document.querySelector('[data-search-input]');
    input.focus();
    input.value = 'biology';
    await search._onInput('biology');

    const rows = [...search.resultsBox.querySelectorAll('.search-result-item')];
    expect(rows).toHaveLength(2);
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-controls')).toBe(search.resultsBox.id);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(rows[0].getAttribute('aria-selected')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(rows[0].id);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(rows[1].getAttribute('aria-selected')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(rows[1].id);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(rows[0].getAttribute('aria-selected')).toBe('true');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(actionA).toHaveBeenCalledOnce();
    expect(actionB).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);

    await search._onInput('biology');
    expect(input.hasAttribute('aria-activedescendant')).toBe(true);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('clears the old active option as soon as a new query begins debouncing', async () => {
    const search = window.OpenCourseDeck.TopbarSearch;
    search.setData([{ label: 'Biology', category: 'Course' }]);
    const input = document.querySelector('[data-search-input]');
    input.value = 'biology';
    await search._onInput('biology');
    expect(input.hasAttribute('aria-activedescendant')).toBe(true);
    input.value = 'physics';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('does not let a slow earlier topbar query replace newer search results', async () => {
    const search = window.OpenCourseDeck.TopbarSearch;
    const input = document.querySelector('[data-search-input]');
    let resolveEarlier;
    let resolveNewer;
    search._queryUniversal = vi.fn(value => new Promise(resolve => {
      if (value === 'biology') resolveEarlier = resolve;
      else if (value === 'biochemistry') resolveNewer = resolve;
    }));

    input.value = 'biology';
    const earlier = search._onInput('biology');
    input.value = 'biochemistry';
    const newer = search._onInput('biochemistry');

    resolveNewer([{ label: 'Biochemistry guide', category: 'Course' }]);
    await newer;
    expect(search.resultsBox.textContent).toContain('Biochemistry guide');

    // An older IndexedDB/catalog query settles after the newer one. It must
    // not replace the search the learner is currently reading.
    resolveEarlier([{ label: 'Biology basics', category: 'Course' }]);
    await earlier;
    expect(search.resultsBox.textContent).toContain('Biochemistry guide');
    expect(search.resultsBox.textContent).not.toContain('Biology basics');
  });

  it('does not render a completed request when the input changed during debounce', async () => {
    const search = window.OpenCourseDeck.TopbarSearch;
    const input = document.querySelector('[data-search-input]');
    let resolveSearch;
    search._queryUniversal = vi.fn(() => new Promise(resolve => { resolveSearch = resolve; }));

    input.value = 'chemistry';
    const pending = search._onInput('chemistry');
    // A new input event has been typed, but the 300ms debounce has not yet
    // invoked _onInput for the new text. The old result must not appear.
    input.value = 'chemistry notes';

    resolveSearch([{ label: 'Chemistry course', category: 'Course' }]);
    await pending;
    expect(search.resultsBox.classList.contains('open')).toBe(false);
    expect(search.resultsBox.textContent).not.toContain('Chemistry course');
  });

  it('does not reopen stale search results after clearing the input', async () => {
    const search = window.OpenCourseDeck.TopbarSearch;
    const input = document.querySelector('[data-search-input]');
    let resolveSearch;
    search._queryUniversal = vi.fn(() => new Promise(resolve => { resolveSearch = resolve; }));

    input.value = 'physiology';
    const pending = search._onInput('physiology');
    input.value = '';
    await search._onInput('');
    expect(search.resultsBox.classList.contains('open')).toBe(false);

    resolveSearch([{ label: 'Physiology lesson', category: 'Course' }]);
    await pending;
    expect(search.resultsBox.classList.contains('open')).toBe(false);
    expect(search.resultsBox.textContent).not.toContain('Physiology lesson');
  });

  it('does not execute a debounced search that Escape dismissed before it started', () => {
    const search = window.OpenCourseDeck.TopbarSearch;
    const input = document.querySelector('[data-search-input]');
    search.setData([{ label: 'Anatomy handbook', category: 'Course' }]);

    input.value = 'Anatomy';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // Dismiss while the 300ms debounce is still waiting. No async request
    // has started yet, so an in-flight response guard alone cannot help.
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(search.resultsBox.classList.contains('open')).toBe(false);

    vi.advanceTimersByTime(350);
    expect(search.resultsBox.classList.contains('open')).toBe(false);
    expect(search.resultsBox.textContent).not.toContain('Anatomy handbook');
  });

  it('does not reopen stale search results after Escape closes the dropdown', async () => {
    const search = window.OpenCourseDeck.TopbarSearch;
    const input = document.querySelector('[data-search-input]');
    let resolveSearch;
    search._queryUniversal = vi.fn(() => new Promise(resolve => { resolveSearch = resolve; }));

    input.value = 'history';
    const pending = search._onInput('history');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(search.resultsBox.classList.contains('open')).toBe(false);

    resolveSearch([{ label: 'History lesson', category: 'Course' }]);
    await pending;
    expect(search.resultsBox.classList.contains('open')).toBe(false);
    expect(search.resultsBox.textContent).not.toContain('History lesson');
  });

  it('keeps distinct results visible when repeated source records dominate ranking', async () => {
    const search = window.OpenCourseDeck.TopbarSearch;
    const same = { sourceType: 'course', sourceId: 'one', label: 'Physics', category: 'Course' };
    const others = Array.from({ length: 12 }, (_, i) => ({
      sourceType: 'course', sourceId: 'extra-' + i, label: 'Physics ' + i,
      category: 'Course',
    }));
    search._loadUniversalData = vi.fn(async () => [...Array(24).fill(same), ...others]);
    const results = await search._queryUniversal('physics');
    expect(results.map(item => item.sourceId))
      .toEqual(['one', ...others.slice(0, 11).map(item => item.sourceId)]);
  });

  it('central URL helpers allow expected URLs and reject executable schemes', () => {
    expect(window.OpenCourseDeck.safeExternalUrl('https://media.example.com/course')).toBe('https://media.example.com/course');
    expect(window.OpenCourseDeck.safeExternalUrl('http://example.test/course')).toBe('http://example.test/course');
    expect(window.OpenCourseDeck.safeExternalUrl('/relative-course')).toContain('/relative-course');
    expect(window.OpenCourseDeck.safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(window.OpenCourseDeck.safeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull();

    expect(window.OpenCourseDeck.safeNavigationUrl('#/courses')).toBe('#/courses');
    expect(window.OpenCourseDeck.safeNavigationUrl('/docs/getting-started.md')).toContain('/docs/getting-started.md');
    expect(window.OpenCourseDeck.safeNavigationUrl('javascript:alert(1)')).toBeNull();
    expect(window.OpenCourseDeck.safeNavigationUrl('vbscript:msgbox(1)')).toBeNull();

    expect(window.OpenCourseDeck.safeImageUrl('data:image/png;base64,AAAA')).toContain('data:image/png');
    expect(window.OpenCourseDeck.safeImageUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(window.OpenCourseDeck.safeMediaUrl('data:video/mp4;base64,AAAA')).toContain('data:video/mp4');
    expect(window.OpenCourseDeck.safeMediaUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('renders empty search state as text even for malicious queries', async () => {
    window.OpenCourseDeck.TopbarSearch.setData([]);
    const input = document.querySelector('[data-search-input]');
    input.value = '<img src=x onerror="window.__emptySearchXss = true">';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(350);

    const empty = document.querySelector('.search-no-results');
    expect(empty.textContent).toContain('<img');
    expect(empty.querySelector('img')).toBeNull();
    expect(window.__emptySearchXss).toBeUndefined();
  });

  it('indexes persisted Note tags and catalog keywords across Persian keyboard variants', async () => {
    const notes = [{ id: 'renal-note', title: 'Saved physiology',
      content: '<p>Unrelated body</p>', tags: ['كليه', 'Review'] }];
    const topics = [{ topicId: 'physics-topic', courseId: 'course',
      courseTitle: 'Biology', sourceLabel: 'Lecture', title: 'Chapter one',
      keywords: ['فيزيك'], labels: ['Teaching'] }];
    const original = structuredClone({ notes, topics });
    window.DB = {
      getAllNotes: vi.fn(async () => structuredClone(notes)),
      getAllTimestamps: vi.fn(async () => []),
      getAllAnnotations: vi.fn(async () => []),
    };
    window.DataStore = {
      init: vi.fn(async () => true),
      allCourses: vi.fn(() => []),
      allTopics: vi.fn(() => structuredClone(topics)),
    };

    const search = window.OpenCourseDeck.TopbarSearch;
    const savedNote = await search._queryUniversal('کلیه');
    expect(savedNote.map(row => [row.sourceType, row.sourceId]))
      .toContainEqual(['note', 'renal-note']);
    expect(savedNote.find(row => row.sourceId === 'renal-note')?.tags).toEqual(['كليه', 'Review']);

    const catalogTopic = await search._queryUniversal('فیزیک');
    expect(catalogTopic.map(row => [row.sourceType, row.sourceId]))
      .toContainEqual(['topic', 'course:physics-topic']);
    expect(catalogTopic.find(row => row.sourceId === 'course:physics-topic')?.keywords)
      .toEqual(['فيزيك']);
    const teaching = await search._queryUniversal('teaching');
    expect(teaching.map(row => [row.sourceType, row.sourceId]))
      .toContainEqual(['topic', 'course:physics-topic']);
    expect(teaching.find(row => row.sourceId === 'course:physics-topic')?.labels)
      .toEqual(['Teaching']);
    expect({ notes, topics }).toEqual(original);
    expect(window.DB.saveSetting).toBeUndefined();
  });

  it('awaits promise-backed course and topic readers before indexing canonical catalog results', async () => {
    const courses = [{ id: 'renal-course', title: 'Renal Medicine' }];
    const topics = [{
      topicId: 'renal-topic', courseId: 'renal-course',
      title: 'Renal physiology', sourceLabel: 'Lecture',
      keywords: ['کلیه'],
    }];
    const original = structuredClone({ courses, topics });
    window.DB = {
      getAllNotes: vi.fn(async () => []),
      getAllTimestamps: vi.fn(async () => []),
      getAllAnnotations: vi.fn(async () => []),
    };
    window.DataStore = {
      init: vi.fn(async () => true),
      allCourses: vi.fn(async () => structuredClone(courses)),
      allTopics: vi.fn(async () => structuredClone(topics)),
    };
    const search = window.OpenCourseDeck.TopbarSearch;
    const matches = await search._queryUniversal('renal');
    expect(matches.map(item => [item.sourceType, item.sourceId]))
      .toEqual(expect.arrayContaining([
        ['course', 'renal-course'],
        ['topic', 'renal-course:renal-topic'],
      ]));
    expect(search._universalData).toHaveLength(2);
    expect({ courses, topics }).toEqual(original);
  });

  it('keeps a same-ID imported topic attached to its original course after topbar search', async () => {
    window.DB = {
      getAllNotes: vi.fn(async () => []),
      getAllTimestamps: vi.fn(async () => []),
      getAllAnnotations: vi.fn(async () => []),
    };
    window.DataStore = {
      init: vi.fn(async () => true),
      allCourses: vi.fn(() => [{ id: 'course-a', title: 'Anatomy A' },
        { id: 'course-b', title: 'Anatomy B' }]),
      allTopics: vi.fn(() => [
        { courseId: 'course-a', topicId: 'shared', title: 'Anatomy A topic' },
        { courseId: 'course-b', topicId: 'shared', title: 'Anatomy B topic' },
      ]),
    };
    const search = window.OpenCourseDeck.TopbarSearch;
    const results = await search._queryUniversal('Anatomy B topic');
    const selected = results.find(row => row.sourceType === 'topic' && row.sourceId === 'course-b:shared');
    expect(selected).toBeTruthy();
    selected.action();
    expect(sessionStorage.getItem('ocd_pending_topic')).toBe('shared');
    expect(sessionStorage.getItem('ocd_pending_course')).toBe('course-b');
    sessionStorage.removeItem('ocd_pending_course');
    sessionStorage.removeItem('ocd_pending_topic');
  });

  it('never republishes a stale Notes corpus when a save invalidates an in-flight canonical read', async () => {
    let finishOld;
    const oldRecord = { id: 'same', title: 'Stale renal note', content: 'old' };
    const newRecord = { id: 'same', title: 'Updated renal note', content: 'new' };
    const getAllNotes = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce([newRecord]);
    window.DB = {
      getAllNotes,
      getAllTimestamps: vi.fn(async () => []),
      getAllAnnotations: vi.fn(async () => []),
    };
    window.DataStore = { init: vi.fn(async () => true), allCourses: () => [], allTopics: () => [] };
    const search = window.OpenCourseDeck.TopbarSearch;

    const inFlight = search._loadUniversalData();
    expect(getAllNotes).toHaveBeenCalledTimes(1);
    window.OpenCourseDeck.bus.emit('note:save', { noteId: 'same' });
    // A same-tab or cross-tab mutation must invalidate the older read.
    finishOld([oldRecord]);

    const result = await inFlight;
    expect(result.map(item => item.label)).toEqual(['Updated renal note']);
    expect(search._universalData.map(item => item.label)).toEqual(['Updated renal note']);
    expect(getAllNotes).toHaveBeenCalledTimes(2);
    const again = await search._loadUniversalData();
    expect(again.map(item => item.label)).toEqual(['Updated renal note']);
    expect(getAllNotes).toHaveBeenCalledTimes(2);
  });

  it('does not cache a fictitious empty Notes index when canonical storage is inaccessible', async () => {
    const readNotes = vi.fn()
      .mockRejectedValueOnce(new Error('Canonical Notes IndexedDB locked'))
      .mockResolvedValueOnce([{ id: 'renal-1', title: 'Renal practice', content: '<p>Kidney</p>' }]);
    window.DB = {
      getAllNotes: readNotes,
      getAllTimestamps: vi.fn(async () => []),
      getAllAnnotations: vi.fn(async () => []),
    };
    window.DataStore = { init: vi.fn(async () => true), allCourses: () => [], allTopics: () => [] };
    const search = window.OpenCourseDeck.TopbarSearch;

    await expect(search._queryUniversal('renal')).rejects.toThrow(/IndexedDB locked/i);
    expect(search._universalData).toBeNull();

    const recovered = await search._queryUniversal('renal');
    expect(recovered.map(item => item.sourceId)).toContain('renal-1');
    expect(readNotes).toHaveBeenCalledTimes(2);
  });

  it('does not fabricate an empty catalog when canonical catalog hydration fails and can retry', async () => {
    const init = vi.fn().mockRejectedValueOnce(new Error('Catalog data unavailable'))
      .mockResolvedValueOnce(true);
    window.DataStore = {
      init,
      allCourses: () => [{ id: 'medicine', title: 'Renal Medicine' }],
      allTopics: () => [],
    };
    window.DB = {
      getAllNotes: async () => [],
      getAllTimestamps: async () => [],
      getAllAnnotations: async () => [],
    };
    const search = window.OpenCourseDeck.TopbarSearch;
    await expect(search._queryUniversal('renal')).rejects.toThrow(/catalog data unavailable/i);
    expect(search._universalData).toBeNull();
    const recovered = await search._queryUniversal('renal');
    expect(recovered.some(item => item.sourceType === 'course' && item.sourceId === 'medicine')).toBe(true);
    // App bootstrap may independently hydrate its catalog in the background;
    // verify recovered search state, not an internal global init call count.
    expect(search._universalData?.some(item => item.sourceId === 'medicine')).toBe(true);
  });

  it('renders a non-actionable accessible read-failure status, then retries recovered Notes', async () => {
    const readNotes = vi.fn()
      .mockRejectedValueOnce(new Error('Canonical store unavailable'))
      .mockResolvedValueOnce([{ id: 'saved-note', title: 'Saved nephrology', content: 'Patient details' }]);
    window.DB = { getAllNotes: readNotes, getAllTimestamps: async () => [], getAllAnnotations: async () => [] };
    window.DataStore = { init: async () => true, allCourses: () => [], allTopics: () => [] };
    const search = window.OpenCourseDeck.TopbarSearch;
    const input = document.querySelector('[data-search-input]');
    input.value = 'nephrology';

    await expect(search._onInput('nephrology')).resolves.toBeUndefined();
    const message = search.resultsBox.querySelector('[role="alert"]');
    expect(message?.textContent).toMatch(/search.*unavailable|could not.*search/i);
    expect(message.textContent).toMatch(/saved.*not changed|data.*not changed/i);
    expect(search.resultsBox.querySelectorAll('[role="option"]')).toHaveLength(0);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);

    await search._onInput('nephrology');
    expect(search.resultsBox.querySelector('[role="alert"]')).toBeNull();
    expect(search.resultsBox.textContent).toContain('Saved nephrology');
    expect(readNotes).toHaveBeenCalledTimes(2);
  });

  it('does not replace newer results with a stale failure from an earlier canonical search', async () => {
    const search = window.OpenCourseDeck.TopbarSearch;
    const input = document.querySelector('[data-search-input]');
    let rejectOld, resolveNew;
    search._queryUniversal = vi.fn(value => new Promise((resolve, reject) => {
      if (value === 'renal') rejectOld = reject;
      else resolveNew = resolve;
    }));
    input.value = 'renal';
    const old = search._onInput('renal');
    input.value = 'renal medicine';
    const newer = search._onInput('renal medicine');
    resolveNew([{ label: 'Renal medicine notes', sourceType: 'note', sourceId: 'note-1' }]);
    await newer;
    rejectOld(new Error('Locked earlier Notes query'));
    await expect(old).resolves.toBeUndefined();
    expect(search.resultsBox.textContent).toContain('Renal medicine notes');
    expect(search.resultsBox.querySelector('[role="alert"]')).toBeNull();
  });

  it('finds related note words without indexing on each query or duplicating lexical hits', async () => {
    window.DB = {
      getAllNotes: vi.fn(async () => [
        { id: 'note-memory', title: 'Retrieval practice', content: '<p>Long term memory and recall.</p>' },
      ]),
      getAllTimestamps: vi.fn(async () => []),
      getAllAnnotations: vi.fn(async () => []),
    };
    window.DataStore = {
      init: vi.fn(async () => true),
      allCourses: vi.fn(() => []),
      allTopics: vi.fn(() => []),
    };
    window.OpenCourseDeck.AI = {
      upsertEmbedding: vi.fn(),
      searchEmbeddings: vi.fn(),
    };
    const input = document.querySelector('[data-search-input]');
    input.value = 'retrieval memory';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(350);
    await vi.waitFor(() => expect([...document.querySelectorAll('.search-result-item')]
      .some(result => result.textContent.includes('Related note'))).toBe(true));
    expect(window.OpenCourseDeck.AI.upsertEmbedding).not.toHaveBeenCalled();
    expect(window.OpenCourseDeck.AI.searchEmbeddings).not.toHaveBeenCalled();

    input.value = 'recall';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(350);
    await vi.waitFor(() => expect([...document.querySelectorAll('.search-result-item')].length).toBe(1));
  });

  it('escapes catalog course and topic titles in the courses view', async () => {
    window.DataStore = {
      init: vi.fn().mockResolvedValue(true),
      allCourses: vi.fn(() => [
        {
          id: 'course-xss',
          title: '<img src=x onerror="window.__courseXss = true">',
          productUrl: 'javascript:window.__productXss = true',
        },
      ]),
      allTopics: vi.fn(() => [
        {
          topicId: 'topic-xss',
          courseId: 'course-xss',
          courseTitle: '<img src=x onerror="window.__courseXss = true">',
          sourceIndex: 0,
          sourceLabel: '<script>window.__sourceXss = true</script>',
          title: '<svg onload="window.__topicXss = true"></svg>',
          videos: [],
          pdfs: [],
        },
      ]),
    };
    window.DB = { getProgress: vi.fn().mockResolvedValue(null) };
    window.OpenCourseDeck.Player = { init: vi.fn(), destroyAll: vi.fn() };

    await window.OpenCourseDeck.Views.courses();

    const courseButton = document.querySelector('[data-course-id="course-xss"]');
    expect(courseButton.textContent).toContain('<img');
    expect(courseButton.querySelector('img')).toBeNull();

    courseButton.click();
    await vi.waitFor(() => expect(document.querySelector('.topic-title')?.textContent).toContain('<svg'));

    const detail = document.getElementById('course-detail');
    const statusBadge = detail.querySelector('.badge-status');
    expect(statusBadge.textContent).toBe('Not started');
    expect(statusBadge.getAttribute('aria-label')).toBe('Status: Not started');
    expect(statusBadge.dataset.status).toBe('not-started');
    expect(detail.querySelector('img')).toBeNull();
    expect(detail.querySelector('script')).toBeNull();
    expect(detail.querySelector('svg')).toBeNull();
    expect(detail.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(window.__courseXss).toBeUndefined();
    expect(window.__sourceXss).toBeUndefined();
    expect(window.__topicXss).toBeUndefined();
    expect(window.__productXss).toBeUndefined();
  });

  it('renders large Courses topic detail lists incrementally and cancels queued batches', async () => {
    window.OpenCourseDeck.courseDetailRenderBatchSize = 25;
    window.DataStore = {
      init: vi.fn().mockResolvedValue(true),
      allCourses: vi.fn(() => [{ id: 'course-large', title: 'Large course' }]),
      allTopics: vi.fn(() => Array.from({ length: 75 }, (_, index) => ({
        topicId: `topic-large-${index}`,
        courseId: 'course-large',
        courseTitle: 'Large course',
        sourceIndex: 0,
        sourceLabel: 'Main source',
        title: `Topic ${index}`,
        videos: [],
        pdfs: [],
      }))),
    };
    window.DB = { getProgress: vi.fn().mockResolvedValue(null) };
    window.OpenCourseDeck.Player = { init: vi.fn(), destroyAll: vi.fn() };

    const controller = await window.OpenCourseDeck.Views.courses();
    document.querySelector('[data-course-id="course-large"]').click();

    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelectorAll('#course-detail [data-topic-id]')).toHaveLength(25);
    expect(document.querySelector('[data-course-detail-render-status]').textContent).toBe('Showing 25 of 75 topics');

    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelectorAll('#course-detail [data-topic-id]')).toHaveLength(50);

    controller.unmount();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelectorAll('#course-detail [data-topic-id]')).toHaveLength(50);
  });

  it('renders materials rows with text nodes for catalog labels', async () => {
    window.DataStore = {
      init: vi.fn().mockResolvedValue(true),
      allTopics: vi.fn(() => [
        {
          topicId: 'material-xss',
          courseId: 'course-xss',
          courseTitle: '<img src=x onerror="window.__materialCourseXss = true">',
          sourceLabel: '<script>window.__materialSourceXss = true</script>',
          title: '<svg onload="window.__materialTopicXss = true"></svg>',
          videos: ['https://cdn.example.test/video.mp4'],
          pdfs: ['https://cdn.example.test/file.pdf'],
        },
      ]),
    };

    await window.OpenCourseDeck.Views.materials();

    const list = document.getElementById('materials-list');
    expect(list.textContent).toContain('<svg');
    expect(list.textContent).toContain('<img');
    expect(list.textContent).toContain('<script>');
    expect(list.querySelector('img, script, svg')).toBeNull();
    expect(list.querySelector('[data-action="play-video"]')).not.toBeNull();
    expect(list.querySelector('[data-action="open-pdf"]')).not.toBeNull();
    expect(window.__materialCourseXss).toBeUndefined();
    expect(window.__materialSourceXss).toBeUndefined();
    expect(window.__materialTopicXss).toBeUndefined();
  });

  it('renders Materials rows incrementally and binds route-level filters', async () => {
    window.OpenCourseDeck.materialsRenderBatchSize = 20;
    window.DataStore = {
      init: vi.fn().mockResolvedValue(true),
      allTopics: vi.fn(() => Array.from({ length: 60 }, (_, index) => ({
        topicId: `topic-${index}`,
        courseId: 'course-1',
        courseTitle: 'Course',
        sourceLabel: `Source ${index}`,
        title: `Topic ${index}`,
        videos: index < 30 ? [`https://cdn.example.test/video-${index}.mp4`] : [],
        pdfs: index >= 30 ? [`https://cdn.example.test/file-${index}.pdf`] : [],
      }))),
    };

    const controller = await window.OpenCourseDeck.Views.materials();
    const list = document.getElementById('materials-list');

    expect(list.querySelectorAll('[data-topic-id]')).toHaveLength(20);
    expect(list.querySelector('[data-materials-render-status]').textContent).toBe('Showing 20 of 50 visible materials');

    await vi.advanceTimersByTimeAsync(0);
    expect(list.querySelectorAll('[data-topic-id]')).toHaveLength(40);

    document.querySelector('[data-material-filter="pdf"]').click();
    expect(document.querySelector('[data-material-filter="pdf"]').getAttribute('aria-pressed')).toBe('true');
    expect(list.querySelectorAll('[data-topic-id]')).toHaveLength(20);
    expect(Array.from(list.querySelectorAll('[data-topic-id]')).every((row) => row.dataset.media === 'pdf')).toBe(true);

    const courseSelect = document.getElementById('materials-course-filter');
    courseSelect.value = 'course-1';
    courseSelect.dispatchEvent(new Event('change', { bubbles: true }));
    expect(Array.from(list.querySelectorAll('[data-course-id]')).every((row) => row.dataset.courseId === 'course-1')).toBe(true);

    const sourceSelect = document.getElementById('materials-source-filter');
    sourceSelect.value = 'Source 30';
    sourceSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(list.querySelectorAll('[data-topic-id]')).toHaveLength(1));
    expect(list.textContent).toContain('Topic 30');

    controller.unmount();
    await vi.advanceTimersByTimeAsync(0);
    expect(list.querySelectorAll('[data-topic-id]')).toHaveLength(1);
  });

  it('filters course cards by media and source facets', async () => {
    window.DataStore = {
      init: vi.fn().mockResolvedValue(true),
      allCourses: vi.fn(() => [
        { id: 'course-video', title: 'Video course' },
        { id: 'course-mixed', title: 'Mixed course' },
        { id: 'course-pdf', title: 'PDF course' },
      ]),
      allTopics: vi.fn(() => [
        { topicId: 'topic-v1', courseId: 'course-video', courseTitle: 'Video course', sourceIndex: 0, sourceLabel: 'Source A', title: 'Video topic', videos: ['video.mp4'], pdfs: [] },
        { topicId: 'topic-m1', courseId: 'course-mixed', courseTitle: 'Mixed course', sourceIndex: 0, sourceLabel: 'Source A', title: 'Mixed video', videos: ['video.mp4'], pdfs: [] },
        { topicId: 'topic-m2', courseId: 'course-mixed', courseTitle: 'Mixed course', sourceIndex: 1, sourceLabel: 'Source B', title: 'Mixed pdf', videos: [], pdfs: ['file.pdf'] },
        { topicId: 'topic-p1', courseId: 'course-pdf', courseTitle: 'PDF course', sourceIndex: 0, sourceLabel: 'Source Solo', title: 'PDF topic', videos: [], pdfs: ['file.pdf'] },
      ]),
    };
    window.DB = { getProgress: vi.fn().mockResolvedValue(null) };
    window.OpenCourseDeck.Player = { init: vi.fn(), destroyAll: vi.fn() };

    await window.OpenCourseDeck.Views.courses();

    const renderedCourses = document.getElementById('courses-list');
    expect(renderedCourses.textContent).not.toContain('[object HTMLSpanElement]');
    expect(renderedCourses.textContent).toContain('video');
    expect(renderedCourses.textContent).toContain('pdf');

    document.querySelector('[data-course-filter="mixed"]').click();
    await vi.waitFor(() => expect(document.querySelectorAll('#courses-list [data-course-id]')).toHaveLength(1));
    expect(document.querySelector('#courses-list [data-course-id]').dataset.courseId).toBe('course-mixed');

    const scope = document.getElementById('courses-source-scope');
    scope.value = 'single';
    scope.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelectorAll('#courses-list [data-course-id]')).toHaveLength(0));
    expect(document.getElementById('course-detail').textContent).toContain('Pick a different search or course filter');

    document.querySelector('[data-course-filter="all"]').click();
    scope.value = 'multi';
    scope.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelectorAll('#courses-list [data-course-id]')).toHaveLength(1));
    expect(document.querySelector('#courses-list [data-course-id]').dataset.courseId).toBe('course-mixed');
  });

  it('blocks unsafe pending course autoplay media URLs', async () => {
    sessionStorage.setItem('ocd_pending_topic', 'pending-xss');
    window.DataStore = {
      init: vi.fn().mockResolvedValue(true),
      allCourses: vi.fn(() => [
        { id: 'course-pending', title: 'Pending course', productUrl: 'https://media.example.com/course' },
      ]),
      allTopics: vi.fn(() => [
        {
          topicId: 'pending-xss',
          courseId: 'course-pending',
          courseTitle: 'Pending course',
          sourceIndex: 0,
          sourceLabel: 'Source',
          title: 'Unsafe pending video',
          videos: ['javascript:window.__pendingAutoplayXss = true'],
          pdfs: [],
        },
      ]),
    };
    window.DB = { getProgress: vi.fn().mockResolvedValue(null) };
    const loadPlaylist = vi.fn();
    window.OpenCourseDeck.Player = {
      init: vi.fn((el) => {
        el._pdPlayer = { loadPlaylist, on: vi.fn(), off: vi.fn(), getCurrentTrack: vi.fn() };
        return el._pdPlayer;
      }),
      destroyAll: vi.fn(),
    };

    await window.OpenCourseDeck.Views.courses();
    vi.advanceTimersByTime(150);

    expect(loadPlaylist).not.toHaveBeenCalled();
    expect(window.__pendingAutoplayXss).toBeUndefined();
    expect(sessionStorage.getItem('ocd_pending_topic')).toBeNull();
  });

  it('renders toast action strings as text while allowing node actions', () => {
    const toast = window.OpenCourseDeck.Toast.show({
      title: '<img src=x onerror="window.__toastTitleXss = true">',
      message: '<script>window.__toastMessageXss = true</script>',
      action: '<button onclick="window.__toastActionXss = true">Run</button>',
      duration: 0,
    });

    expect(toast.textContent).toContain('<img');
    expect(toast.textContent).toContain('<script>');
    expect(toast.textContent).toContain('<button');
    expect(toast.querySelector('img')).toBeNull();
    expect(toast.querySelector('script')).toBeNull();
    expect(toast.querySelector('.toast-action button')).toBeNull();

    const button = document.createElement('button');
    button.dataset.safeAction = 'true';
    button.textContent = 'Safe';
    const actionable = window.OpenCourseDeck.Toast.show({ message: 'Node action', action: button, duration: 0 });
    expect(actionable.querySelector('[data-safe-action="true"]')).toBe(button);

    expect(window.__toastTitleXss).toBeUndefined();
    expect(window.__toastMessageXss).toBeUndefined();
    expect(window.__toastActionXss).toBeUndefined();
  });

  it('renders modal body and footer strings as text', () => {
    const modal = window.OpenCourseDeck.Modal.create({
      title: '<img src=x onerror="window.__modalTitleXss = true">',
      body: '<img src=x onerror="window.__modalBodyXss = true">',
      footer: '<script>window.__modalFooterXss = true</script>',
    });

    expect(modal.textContent).toContain('<img');
    expect(modal.textContent).toContain('<script>');
    expect(modal.querySelector('img')).toBeNull();
    expect(modal.querySelector('script')).toBeNull();
    expect(window.__modalTitleXss).toBeUndefined();
    expect(window.__modalBodyXss).toBeUndefined();
    expect(window.__modalFooterXss).toBeUndefined();
  });

  it('does not trigger global keyboard shortcuts from editable fields', () => {
    const open = vi.fn();
    window.OpenCourseDeck.CommandPalette = { open };
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    document.body.appendChild(editor);
    editor.focus();

    editor.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
    }));

    expect(open).not.toHaveBeenCalled();

    document.body.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
    }));

    expect(open).toHaveBeenCalled();
  });

  it('saves course player progress on pause, seek, track change, and before unload', async () => {
    const handlers = {};
    const track = {
      title: 'Topic video',
      src: 'video.mp4',
      artist: 'Course',
      topicId: 'topic-1',
      courseId: 'course-1',
    };
    const fakePlayer = {
      queue: [track],
      trackIndex: 0,
      currentTime: 42,
      duration: 100,
      on: vi.fn((event, handler) => {
        handlers[event] = handler;
        return fakePlayer;
      }),
      off: vi.fn(),
      loadPlaylist: vi.fn((tracks) => {
        fakePlayer.queue = tracks;
        fakePlayer.trackIndex = 0;
        handlers.trackChange?.(tracks[0]);
      }),
    };

    window.DataStore = {
      init: vi.fn().mockResolvedValue(true),
      allCourses: vi.fn(() => [{ id: 'course-1', title: 'Course' }]),
      allTopics: vi.fn(() => [{
        topicId: 'topic-1',
        courseId: 'course-1',
        courseTitle: 'Course',
        sourceIndex: 0,
        sourceLabel: 'Source',
        title: 'Topic video',
        videos: ['video.mp4'],
        pdfs: [],
      }]),
    };
    window.DB = {
      getProgress: vi.fn().mockResolvedValue(null),
      saveProgress: vi.fn().mockResolvedValue(true),
    };
    window.OpenCourseDeck.Player = {
      init: vi.fn(() => {
        document.getElementById('course-player')._pdPlayer = fakePlayer;
      }),
      destroyAll: vi.fn(),
    };

    const controller = await window.OpenCourseDeck.Views.courses();

    await handlers.pause(track);
    await handlers.seeked({ track, currentTime: 50, duration: 100, percent: 50 });
    await handlers.beforeTrackChange(track);
    window.dispatchEvent(new Event('beforeunload'));
    await vi.waitFor(() => expect(window.DB.saveProgress).toHaveBeenCalled());

    expect(window.DB.saveProgress).toHaveBeenCalledWith('topic-1', 'course-1', expect.objectContaining({
      position: 42,
      duration: 100,
      percent: 42,
      status: 'in-progress',
    }));
    expect(window.DB.saveProgress).toHaveBeenCalledWith('topic-1', 'course-1', expect.objectContaining({
      position: 50,
      duration: 100,
      percent: 50,
      status: 'in-progress',
    }));

    controller.unmount();
    expect(fakePlayer.off).toHaveBeenCalledWith('pause', handlers.pause);
    expect(fakePlayer.off).toHaveBeenCalledWith('seeked', handlers.seeked);
    expect(fakePlayer.off).toHaveBeenCalledWith('beforeTrackChange', handlers.beforeTrackChange);
  });
});
