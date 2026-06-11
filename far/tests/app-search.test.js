import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('app topbar search rendering', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
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
    window.PlasmaDeck = { bus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() } };
    window.location.hash = '#/help';
    document.body.innerHTML = `
      <div id="plasma-app">
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
    window.PlasmaDeck.TopbarSearch.setData([
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

  it('central URL helpers allow expected URLs and reject executable schemes', () => {
    expect(window.PlasmaDeck.safeExternalUrl('https://plasmato.net/course')).toBe('https://plasmato.net/course');
    expect(window.PlasmaDeck.safeExternalUrl('http://example.test/course')).toBe('http://example.test/course');
    expect(window.PlasmaDeck.safeExternalUrl('/relative-course')).toContain('/relative-course');
    expect(window.PlasmaDeck.safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(window.PlasmaDeck.safeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull();

    expect(window.PlasmaDeck.safeNavigationUrl('#/courses')).toBe('#/courses');
    expect(window.PlasmaDeck.safeNavigationUrl('/docs/getting-started.md')).toContain('/docs/getting-started.md');
    expect(window.PlasmaDeck.safeNavigationUrl('javascript:alert(1)')).toBeNull();
    expect(window.PlasmaDeck.safeNavigationUrl('vbscript:msgbox(1)')).toBeNull();

    expect(window.PlasmaDeck.safeImageUrl('data:image/png;base64,AAAA')).toContain('data:image/png');
    expect(window.PlasmaDeck.safeImageUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(window.PlasmaDeck.safeMediaUrl('data:video/mp4;base64,AAAA')).toContain('data:video/mp4');
    expect(window.PlasmaDeck.safeMediaUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('renders empty search state as text even for malicious queries', async () => {
    window.PlasmaDeck.TopbarSearch.setData([]);
    const input = document.querySelector('[data-search-input]');
    input.value = '<img src=x onerror="window.__emptySearchXss = true">';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(350);

    const empty = document.querySelector('.search-no-results');
    expect(empty.textContent).toContain('<img');
    expect(empty.querySelector('img')).toBeNull();
    expect(window.__emptySearchXss).toBeUndefined();
  });

  it('merges semantic note matches into universal topbar search', async () => {
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
    window.PlasmaDeck.AI = {
      upsertEmbedding: vi.fn(async () => true),
      searchEmbeddings: vi.fn(async () => [{ id: 'note-memory', score: 0.82 }]),
    };

    const input = document.querySelector('[data-search-input]');
    input.value = 'recall';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(350);

    await vi.waitFor(() => expect(window.PlasmaDeck.AI.searchEmbeddings).toHaveBeenCalledWith('recall', { limit: 4 }));
    expect(window.PlasmaDeck.AI.upsertEmbedding).toHaveBeenCalledWith(expect.objectContaining({
      id: 'note-memory',
      text: expect.stringContaining('Long term memory'),
    }));
    const result = document.querySelector('.search-result-item');
    expect(result.textContent).toContain('Retrieval practice');
    expect(result.textContent).toContain('Semantic note');
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
    window.PlasmaDeck.Player = { init: vi.fn(), destroyAll: vi.fn() };

    await window.PlasmaDeck.Views.courses();

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
    window.PlasmaDeck.courseDetailRenderBatchSize = 25;
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
    window.PlasmaDeck.Player = { init: vi.fn(), destroyAll: vi.fn() };

    const controller = await window.PlasmaDeck.Views.courses();
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

    await window.PlasmaDeck.Views.materials();

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
    window.PlasmaDeck.materialsRenderBatchSize = 20;
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

    const controller = await window.PlasmaDeck.Views.materials();
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
    window.PlasmaDeck.Player = { init: vi.fn(), destroyAll: vi.fn() };

    await window.PlasmaDeck.Views.courses();

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
    sessionStorage.setItem('plasma_pending_topic', 'pending-xss');
    window.DataStore = {
      init: vi.fn().mockResolvedValue(true),
      allCourses: vi.fn(() => [
        { id: 'course-pending', title: 'Pending course', productUrl: 'https://plasmato.net/course' },
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
    window.PlasmaDeck.Player = {
      init: vi.fn((el) => {
        el._pdPlayer = { loadPlaylist, on: vi.fn(), off: vi.fn(), getCurrentTrack: vi.fn() };
        return el._pdPlayer;
      }),
      destroyAll: vi.fn(),
    };

    await window.PlasmaDeck.Views.courses();
    vi.advanceTimersByTime(150);

    expect(loadPlaylist).not.toHaveBeenCalled();
    expect(window.__pendingAutoplayXss).toBeUndefined();
    expect(sessionStorage.getItem('plasma_pending_topic')).toBeNull();
  });

  it('renders toast action strings as text while allowing node actions', () => {
    const toast = window.PlasmaDeck.Toast.show({
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
    const actionable = window.PlasmaDeck.Toast.show({ message: 'Node action', action: button, duration: 0 });
    expect(actionable.querySelector('[data-safe-action="true"]')).toBe(button);

    expect(window.__toastTitleXss).toBeUndefined();
    expect(window.__toastMessageXss).toBeUndefined();
    expect(window.__toastActionXss).toBeUndefined();
  });

  it('renders modal body and footer strings as text', () => {
    const modal = window.PlasmaDeck.Modal.create({
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
    window.PlasmaDeck.CommandPalette = { open };
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
    window.PlasmaDeck.Player = {
      init: vi.fn(() => {
        document.getElementById('course-player')._pdPlayer = fakePlayer;
      }),
      destroyAll: vi.fn(),
    };

    const controller = await window.PlasmaDeck.Views.courses();

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
