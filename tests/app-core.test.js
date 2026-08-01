import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initEndpointApprovalGuard } from '../src/core/endpointApprovalGuard.js';

let intersectionCallbacks;

async function loadApp(html = '<div id="plasma-app"><main id="view-container"></main></div>') {
  vi.resetModules();
  intersectionCallbacks = [];
  document.body.innerHTML = html;
  window.location.hash = '#/help';
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
  window.IntersectionObserver = vi.fn(function IntersectionObserver(callback) {
    intersectionCallbacks.push(callback);
    this.observe = vi.fn();
    this.unobserve = vi.fn();
    this.disconnect = vi.fn();
  });
  window.OpenCourseDeck = { bus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() } };
  initEndpointApprovalGuard(document);
  await import('../app.js');
}

describe('app shell resilience helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    delete window.DOMPurify;
  });

  it('allows once listeners to be removed by their original callback', async () => {
    await loadApp();
    const fn = vi.fn();

    window.OpenCourseDeck.bus.once('sample:event', fn);
    window.OpenCourseDeck.bus.off('sample:event', fn);
    window.OpenCourseDeck.bus.emit('sample:event');

    expect(fn).not.toHaveBeenCalled();
  });

  it('removes culled toasts from active toast bookkeeping', async () => {
    await loadApp();
    window.OpenCourseDeck.config.toastMaxStack = 2;

    const first = window.OpenCourseDeck.Toast.show({ message: 'one', duration: 0 });
    window.OpenCourseDeck.Toast.show({ message: 'two', duration: 0 });
    window.OpenCourseDeck.Toast.show({ message: 'three', duration: 0 });

    expect(document.querySelectorAll('.toast')).toHaveLength(2);
    expect(document.body.contains(first)).toBe(false);
    expect(window.OpenCourseDeck.state.activeToasts).toHaveLength(2);
    expect(window.OpenCourseDeck.state.activeToasts).not.toContain(first);
  });

  it('recovers infinite scroll loading state when onLoad rejects', async () => {
    await loadApp(`
      <div id="plasma-app">
        <main id="view-container"></main>
        <section id="scroll-root">
          <div class="scroll-loader" hidden></div>
          <div class="scroll-sentinel"></div>
        </section>
      </div>
    `);
    const onLoad = vi.fn()
      .mockRejectedValueOnce(new Error('network failed'))
      .mockResolvedValueOnce(true);

    window.OpenCourseDeck.InfiniteScroll.init({
      container: document.getElementById('scroll-root'),
      onLoad,
    });

    const callback = intersectionCallbacks.at(-1);
    await callback([{ isIntersecting: true }]);
    await callback([{ isIntersecting: true }]);

    expect(onLoad).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.scroll-loader').hasAttribute('hidden')).toBe(true);
  });

  it('keeps invalid numeric table values at the bottom while sorting', async () => {
    await loadApp(`
      <div id="plasma-app">
        <main id="view-container"></main>
        <table id="sortable-test-table">
          <thead><tr><th data-sort="score" data-sort-type="number">Score</th></tr></thead>
          <tbody>
            <tr><td>10</td></tr>
            <tr><td>N/A</td></tr>
            <tr><td>5</td></tr>
          </tbody>
        </table>
      </div>
    `);

    const table = document.getElementById('sortable-test-table');
    const header = table.querySelector('th[data-sort]');
    header.click();
    expect([...table.querySelectorAll('tbody tr')].map(row => row.textContent.trim()).at(-1)).toBe('N/A');

    header.click();
    expect([...table.querySelectorAll('tbody tr')].map(row => row.textContent.trim()).at(-1)).toBe('N/A');
  });

  it('deep-merges chart theme options without deleting custom nested options', async () => {
    await loadApp();
    const chart = {
      options: {
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true },
          },
          customPlugin: { enabled: true },
        },
        scales: {
          y: {
            min: 0,
            ticks: { precision: 0 },
          },
        },
      },
      update: vi.fn(),
    };

    window.OpenCourseDeck.Charts.register('custom', chart);
    window.OpenCourseDeck.bus.emit('theme:change', { theme: 'light' });

    expect(chart.options.plugins.legend.position).toBe('bottom');
    expect(chart.options.plugins.legend.labels.usePointStyle).toBe(true);
    expect(chart.options.plugins.legend.labels.color).toBeTruthy();
    expect(chart.options.plugins.customPlugin.enabled).toBe(true);
    expect(chart.options.scales.y.min).toBe(0);
    expect(chart.options.scales.y.ticks.precision).toBe(0);
    expect(chart.options.scales.y.ticks.color).toBeTruthy();
    expect(chart.update).toHaveBeenCalled();
  });

  it('stores modal cleanup state in weak maps', async () => {
    await loadApp();

    expect(window.OpenCourseDeck.Modal._cleanupFns).toBeInstanceOf(WeakMap);
    expect(window.OpenCourseDeck.Modal._previousFocus).toBeInstanceOf(WeakMap);
  });

  it('resolves styled async confirmations from confirm and cancel actions', async () => {
    await loadApp();

    const yes = window.OpenCourseDeck.Modal.confirmAsync({
      title: 'Confirm delete',
      message: 'Delete this item?',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
    });
    [...document.querySelectorAll('.modal-footer button')]
      .find(btn => btn.textContent === 'Delete')
      .click();
    await expect(yes).resolves.toBe(true);

    const no = window.OpenCourseDeck.Modal.confirmAsync({
      title: 'Confirm reset',
      message: 'Reset now?',
      confirmLabel: 'Reset',
      cancelLabel: 'Cancel',
    });
    [...document.querySelectorAll('.modal-footer button')]
      .find(btn => btn.textContent === 'Cancel')
      .click();
    await expect(no).resolves.toBe(false);
    expect(window.OpenCourseDeck.Modal.confirm).toBeUndefined();
  });

  it('opens drawers as modal dialogs and restores focus on close', async () => {
    await loadApp(`
      <button id="drawer-opener">Open drawer</button>
      <div id="plasma-app">
        <main id="view-container"></main>
      </div>
      <aside id="test-drawer" class="drawer" hidden aria-hidden="true">
        <button id="drawer-close" data-drawer-close>Close</button>
      </aside>
    `);
    const opener = document.getElementById('drawer-opener');
    const drawer = document.getElementById('test-drawer');
    const app = document.getElementById('plasma-app');
    opener.focus();

    window.OpenCourseDeck.Drawer.open(drawer);

    expect(drawer.getAttribute('role')).toBe('dialog');
    expect(drawer.getAttribute('aria-modal')).toBe('true');
    expect(drawer.getAttribute('aria-hidden')).toBe('false');
    expect(app.hasAttribute('inert')).toBe(true);

    window.OpenCourseDeck.Drawer.close(drawer);
    vi.runOnlyPendingTimers();

    expect(drawer.hasAttribute('hidden')).toBe(true);
    expect(drawer.hasAttribute('aria-modal')).toBe(false);
    expect(app.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('removes app tooltips when their anchor leaves the DOM', async () => {
    await loadApp(`
      <div id="plasma-app">
        <main id="view-container"></main>
        <button id="tip-anchor" data-tip-js="Helpful">Hover</button>
      </div>
    `);

    const anchor = document.getElementById('tip-anchor');
    anchor.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(document.querySelector('.tooltip-js')).not.toBeNull();

    anchor.remove();
    await Promise.resolve();

    expect(document.querySelector('.tooltip-js')).toBeNull();
  });

  it('shows a single reload prompt when IndexedDB version changes', async () => {
    await loadApp();

    window.OpenCourseDeck.bus.emit('db:versionchange', { name: 'opencoursedeck', version: 2 });
    window.dispatchEvent(new CustomEvent('plasma:db-versionchange', {
      detail: { name: 'opencoursedeck', version: 2 },
    }));

    const toasts = [...document.querySelectorAll('.toast')];
    expect(toasts).toHaveLength(1);
    expect(toasts[0].textContent).toContain('Refresh required');
    expect(toasts[0].textContent).toContain('upgraded the local database');
    expect(toasts[0].querySelector('[data-db-reload]')).not.toBeNull();
  });

  it('honors reduced-motion preferences when animating progress bars', async () => {
    await loadApp();
    window.requestAnimationFrame.mockClear();
    window.matchMedia = vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    document.body.insertAdjacentHTML('beforeend', `
      <div id="motion-progress" role="progressbar">
        <span class="progress-label"></span>
      </div>
    `);
    const bar = document.getElementById('motion-progress');

    window.OpenCourseDeck.Progress.animate(bar, 72);

    expect(bar.style.getPropertyValue('--progress')).toBe('72%');
    expect(bar.getAttribute('aria-valuenow')).toBe('72');
    expect(bar.querySelector('.progress-label').textContent).toBe('72%');
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('falls back to a local asset when lazy or themed images fail', async () => {
    await loadApp(`
      <div id="plasma-app">
        <main id="view-container"></main>
        <img id="lazy-img" data-src="https://cdn.example.test/missing.jpg" />
        <img id="theme-img" data-src-dark="https://cdn.example.test/dark.jpg" data-src-light="https://cdn.example.test/light.jpg" />
      </div>
    `);
    const lazy = document.getElementById('lazy-img');
    const themed = document.getElementById('theme-img');

    intersectionCallbacks.at(-1)([{ isIntersecting: true, target: lazy }], {
      unobserve: vi.fn(),
    });
    lazy.dispatchEvent(new Event('error'));
    window.OpenCourseDeck.bus.emit('theme:change', { effective: 'dark' });
    themed.dispatchEvent(new Event('error'));

    expect(lazy.dataset.failedSrc).toContain('missing.jpg');
    expect(themed.dataset.failedSrc).toContain('dark.jpg');
    expect(lazy.getAttribute('src')).toBe(window.OpenCourseDeck.IMAGE_FALLBACK_SRC);
    expect(themed.getAttribute('src')).toBe(window.OpenCourseDeck.IMAGE_FALLBACK_SRC);
    expect(lazy.classList.contains('image-fallback')).toBe(true);
    expect(themed.classList.contains('image-fallback')).toBe(true);
  });

  it('does not label graduated feature routes as planned placeholders', async () => {
    await loadApp();

    for (const viewName of ['tags', 'playlists', 'bookmarks', 'achievements']) {
      await window.OpenCourseDeck.Views[viewName]();
      const view = document.querySelector(`#view-container .view-${viewName}`);
      expect(view.querySelector('[aria-label="Feature status: ready"]').textContent).toBe('Ready');
      expect(view.textContent).not.toContain('planned and not yet interactive');
    }
  });

  it('renders tags from note tags and catalog tags', async () => {
    await loadApp();
    window.DB = {
      getAllNotes: vi.fn(async () => [
        { id: 'note-1', title: 'Rhythm note', tags: ['ECG', 'arrhythmia'] },
        { id: 'note-2', title: 'Cardio note', tags: ['cardiology', 'ecg'] },
      ]),
    };
    window.DataStore = {
      init: vi.fn(async () => {}),
      allTopics: vi.fn(() => [
        { topicId: 'topic-1', title: 'ECG basics', tags: ['ECG', 'signals'] },
        { topicId: 'topic-2', title: 'Heart failure', labels: ['cardiology'] },
      ]),
    };

    await window.OpenCourseDeck.Views.tags();

    await vi.waitFor(() => expect(document.querySelectorAll('[data-tag-name]')).toHaveLength(4));
    const view = document.querySelector('#view-container .view-tags');
    const ecg = view.querySelector('[data-tag-name="ecg"]');

    expect(view.querySelector('[aria-label="Feature status: ready"]').textContent).toBe('Ready');
    expect(view.textContent).not.toContain('planned and not yet interactive');
    expect(view.textContent).toContain('Unique tags');
    expect(view.textContent).toContain('Tagged records');
    expect(ecg.dataset.tagSource).toBe('mixed');
    expect(ecg.textContent).toContain('Mixed');
    expect(ecg.textContent).toContain('2 notes and 1 catalog topic');
    expect(ecg.querySelector('a[href="#/notes"]')).toBeTruthy();
    expect(ecg.querySelector('a[href="#/courses"]')).toBeTruthy();

    const search = view.querySelector('[data-tag-search]');
    search.value = 'card';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(view.querySelectorAll('[data-tag-name]')).toHaveLength(1));
    expect(view.querySelector('[data-tag-name="cardiology"]')).toBeTruthy();

    view.querySelector('[data-tag-filter="catalog"]').click();
    await vi.waitFor(() => expect(view.querySelectorAll('[data-tag-name]')).toHaveLength(0));
    expect(view.textContent).toContain('No tags match this search or filter.');

    search.value = 'sig';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(view.querySelectorAll('[data-tag-name]')).toHaveLength(1));
    expect(view.querySelector('[data-tag-name="signals"]').dataset.tagSource).toBe('catalog');
  });

  it('renders Home dashboard widgets from progress, reviews, and recent notes', async () => {
    vi.setSystemTime(new Date('2026-05-05T00:00:00Z'));
    await loadApp();
    const oldActivity = new Date('2026-03-01T00:00:00Z').getTime();
    const recentActivity = new Date('2026-05-01T00:00:00Z').getTime();
    window.DB = {
      getAllProgress: vi.fn(async () => [
        { topicId: 'topic-old', courseId: 'course-1', status: 'done', percent: 100, updatedAt: oldActivity },
        { topicId: 'topic-current', courseId: 'course-1', status: 'in-progress', percent: 45, position: 120, updatedAt: recentActivity },
      ]),
      getAllNotes: vi.fn(async () => [
        { id: 'note-1', title: 'Fresh ECG insight', topicId: 'topic-current', updatedAt: recentActivity },
      ]),
      getAllTimestamps: vi.fn(async () => [
        { id: 'ts-1', topicId: 'topic-current', title: 'Checkpoint', position: 125, updatedAt: recentActivity },
      ]),
    };
    window.DataStore = {
      init: vi.fn(async () => {}),
      allCourses: vi.fn(() => [{ id: 'course-1' }]),
      allTopics: vi.fn(() => [
        { topicId: 'topic-old', courseId: 'course-1', title: 'Old physiology' },
        { topicId: 'topic-current', courseId: 'course-1', title: 'Current physiology' },
      ]),
    };

    await window.OpenCourseDeck.Views.home();

    await vi.waitFor(() => expect(document.querySelectorAll('[data-home-widget]')).toHaveLength(3));
    const view = document.querySelector('#view-container .view-home');
    expect(view.querySelector('[data-home-widget="continue"]').textContent).toContain('Current physiology');
    expect(view.querySelector('[data-home-widget="review"]').textContent).toContain('Old physiology');
    expect(view.querySelector('[data-home-widget="recent"]').textContent).toContain('Fresh ECG insight');

    view.querySelector('[data-home-widget="review"]').click();
    expect(sessionStorage.getItem('plasma_pending_topic')).toBe('topic-old');
    expect(window.location.hash).toBe('#/courses');
  });

  it('saves and deletes custom courses from My Courses storage', async () => {
    await loadApp();
    const saveSetting = vi.fn(async () => true);
    window.DB = {
      getSetting: vi.fn(async () => []),
      saveSetting,
    };

    await window.OpenCourseDeck.Views.myCourses();
    const view = document.querySelector('#view-container .view-my-courses');
    await vi.waitFor(() => expect(view.textContent).toContain('No custom courses yet.'));
    expect(view.textContent).not.toContain('coming next');

    view.querySelector('[data-my-course-title]').value = 'Cardiology review';
    view.querySelector('[data-my-course-description]').value = 'Focused rhythm practice';
    view.querySelector('[data-my-course-save]').click();

    await vi.waitFor(() => expect(saveSetting).toHaveBeenCalledWith('plasma-my-courses', expect.any(Array)));
    const savedCourses = saveSetting.mock.calls[0][1];
    expect(savedCourses[0]).toEqual(expect.objectContaining({
      title: 'Cardiology review',
      description: 'Focused rhythm practice',
    }));

    window.DB.getSetting.mockResolvedValueOnce(savedCourses);
    await window.OpenCourseDeck.Views.myCourses();
    await vi.waitFor(() => expect(document.querySelector('[data-my-course-id]').textContent).toContain('Cardiology review'));
    document.querySelector('[data-my-course-id] button').click();

    await vi.waitFor(() => expect(saveSetting).toHaveBeenLastCalledWith('plasma-my-courses', []));
  });

  it('renders playlists from active queue, timestamps, and catalog video sources', async () => {
    await loadApp();
    const player = document.createElement('div');
    player.setAttribute('data-player', '');
    player._pdPlayer = {
      queue: [
        { title: 'Loaded lecture', topicId: 'topic-1', src: 'https://example.test/video.mp4' },
      ],
    };
    document.body.appendChild(player);
    window.DB = {
      getAllTimestamps: vi.fn(async () => [
        { id: 'ts-1', topicId: 'topic-2', title: 'Saved checkpoint' },
      ]),
    };
    window.DataStore = {
      init: vi.fn(async () => {}),
      allTopics: vi.fn(() => [
        { topicId: 'topic-1', courseId: 'course-a', courseTitle: 'Cardiology', sourceLabel: 'Lectures', title: 'Loaded lecture', videos: ['https://example.test/video.mp4'] },
        { topicId: 'topic-2', courseId: 'course-a', courseTitle: 'Cardiology', sourceLabel: 'Lectures', title: 'Rhythm review', videos: ['https://example.test/rhythm.mp4'] },
        { topicId: 'topic-3', courseId: 'course-b', courseTitle: 'Pathology', sourceLabel: 'Seminars', title: 'No media', videos: [] },
      ]),
    };

    await window.OpenCourseDeck.Views.playlists();

    await vi.waitFor(() => expect(document.querySelectorAll('[data-playlist-id]')).toHaveLength(3));
    const view = document.querySelector('#view-container .view-playlists');
    const live = view.querySelector('[data-playlist-id="active-queue"]');
    const resume = view.querySelector('[data-playlist-id="timestamp-queue"]');
    const catalog = view.querySelector('[data-playlist-id^="source-"]');

    expect(view.querySelector('[aria-label="Feature status: ready"]').textContent).toBe('Ready');
    expect(view.textContent).toContain('Active tracks');
    expect(view.textContent).toContain('Video topics');
    expect(live.textContent).toContain('Loaded lecture');
    expect(resume.textContent).toContain('Rhythm review');
    expect(catalog.textContent).toContain('Lectures');
    expect(catalog.textContent).toContain('2 video topics');
    expect(catalog.querySelector('a[href="#/courses"]')).toBeTruthy();
  });

  it('saves a named playlist from the first catalog queue', async () => {
    await loadApp();
    const saveSetting = vi.fn(async () => true);
    window.DB = {
      getAllTimestamps: vi.fn(async () => []),
      getSetting: vi.fn(async () => []),
      saveSetting,
    };
    window.DataStore = {
      init: vi.fn(async () => {}),
      allTopics: vi.fn(() => [
        { topicId: 'topic-1', courseId: 'course-a', sourceLabel: 'Lectures', title: 'Loaded lecture', videos: ['https://example.test/video.mp4'] },
        { topicId: 'topic-2', courseId: 'course-a', sourceLabel: 'Lectures', title: 'Rhythm review', videos: ['https://example.test/rhythm.mp4'] },
      ]),
    };

    await window.OpenCourseDeck.Views.playlists();

    await vi.waitFor(() => expect(document.querySelector('[data-playlist-id^="source-"]')).toBeTruthy());
    document.querySelector('[data-playlist-name]').value = 'Cardio queue';
    document.querySelector('[data-save-playlist]').click();

    await vi.waitFor(() => expect(saveSetting).toHaveBeenCalledWith('plasma-playlists', expect.any(Array)));
    const saved = saveSetting.mock.calls[0][1][0];
    expect(saved.title).toBe('Cardio queue');
    expect(saved.topicIds).toEqual(['topic-1', 'topic-2']);
  });

  it('loads and saves the Studio board through canonical settings storage', async () => {
    await loadApp();
    const savedBoard = {
      version: 1,
      layers: [{ id: 'layer-1', name: 'Layer 1', visible: true, locked: false, elements: [] }],
    };
    const canvasApi = {
      init: vi.fn(),
      destroy: vi.fn(),
      loadState: vi.fn(),
      serialize: vi.fn(() => ({ ...savedBoard, exportedAt: '2026-05-02T00:00:00.000Z' })),
      addText: vi.fn(() => ({ id: 'text-1', type: 'text' })),
      addCard: vi.fn(() => ({ id: 'card-1', type: 'roundRect' })),
      clearBoard: vi.fn(() => ({ ...savedBoard, layers: [{ ...savedBoard.layers[0], elements: [] }] })),
      exportPNG: vi.fn(() => 'data:image/png;base64,studio'),
      exportSVG: vi.fn(() => '<svg></svg>'),
    };
    const saveSetting = vi.fn(async () => true);
    window.OpenCourseDeck.Canvas = canvasApi;
    window.DB = {
      getSetting: vi.fn(async (key) => (key === 'plasma-studio-board' ? savedBoard : null)),
      saveSetting,
    };

    const controller = await window.OpenCourseDeck.Views.studio();

    await vi.waitFor(() => expect(canvasApi.loadState).toHaveBeenCalledWith(savedBoard));
    document.querySelector('[data-studio-save]').click();

    await vi.waitFor(() => expect(saveSetting).toHaveBeenCalledWith('plasma-studio-board', expect.objectContaining({ version: 1 })));
    expect(canvasApi.init).toHaveBeenCalledWith(document.getElementById('studio-canvas'));
    expect(document.querySelector('[data-studio-status]').textContent).toContain('Saved');

    controller.unmount();
    expect(canvasApi.destroy).toHaveBeenCalled();
  });

  it('patches external Studio board sync in place while preserving canvas context', async () => {
    await loadApp();
    const emitSpy = vi.spyOn(window.OpenCourseDeck.bus, 'emit');
    const offSpy = vi.spyOn(window.OpenCourseDeck.bus, 'off');
    const initialBoard = {
      version: 1,
      activeLayerIdx: 0,
      layers: [{
        id: 'layer-1',
        name: 'Layer 1',
        visible: true,
        locked: false,
        elements: [{ id: 'shape-1', type: 'rect', x: 10, y: 20, width: 80, height: 40 }],
      }],
    };
    const remoteBoard = {
      version: 1,
      activeLayerIdx: 0,
      layers: [{
        id: 'layer-1',
        name: 'Layer 1',
        visible: true,
        locked: false,
        elements: [{ id: 'shape-1', type: 'rect', x: 20, y: 30, width: 120, height: 50 }],
      }],
    };
    const canvasApi = {
      init: vi.fn(),
      destroy: vi.fn(),
      loadState: vi.fn((board) => board),
      serialize: vi.fn(() => initialBoard),
      getState: vi.fn(() => ({ tool: 'select', selectedIds: ['shape-1'] })),
      setTool: vi.fn(),
      exportPNG: vi.fn(() => 'data:image/png;base64,studio'),
      exportSVG: vi.fn(() => '<svg></svg>'),
    };
    window.OpenCourseDeck.Canvas = canvasApi;
    window.DB = {
      getSetting: vi.fn(async (key) => (key === 'plasma-studio-board' ? remoteBoard : null)),
      saveSetting: vi.fn(async () => true),
    };

    const controller = await window.OpenCourseDeck.Views.studio();
    document.querySelector('[data-inspect-element="shape-1"]').click();

    const result = await controller.refreshFromSync({
      kind: 'setting',
      action: 'save',
      record: { key: 'plasma-studio-board', value: remoteBoard },
    });

    expect(result).toEqual(expect.objectContaining({
      refreshed: true,
      key: 'plasma-studio-board',
      inspectedElementId: 'shape-1',
      selectedIds: ['shape-1'],
    }));
    expect(canvasApi.loadState).toHaveBeenLastCalledWith(remoteBoard, {
      preserveSelection: true,
      preserveTool: true,
      preserveViewport: true,
    });
    expect(document.querySelector('[data-studio-status]').textContent).toBe('Studio board synced');
    expect(document.querySelector('[data-studio-properties]').textContent).toContain('Inspecting rect');
    expect(emitSpy).toHaveBeenCalledWith('studio:sync-refresh', expect.objectContaining({
      refreshed: true,
      selectedIds: ['shape-1'],
    }));

    controller.unmount();
    expect(offSpy).toHaveBeenCalledWith('sync:message', expect.any(Function));
  });

  it('adds Studio note and card elements, autosaves them, and clears the board with confirmation', async () => {
    await loadApp();
    const board = {
      version: 1,
      layers: [{ id: 'layer-1', name: 'Layer 1', visible: true, locked: false, elements: [] }],
    };
    const canvasApi = {
      init: vi.fn(),
      destroy: vi.fn(),
      loadState: vi.fn(),
      serialize: vi.fn(() => board),
      addText: vi.fn(() => ({ id: 'text-1', type: 'text' })),
      addCard: vi.fn(() => ({ id: 'card-1', type: 'roundRect' })),
      addRectangle: vi.fn(() => ({ id: 'rect-1', type: 'rect' })),
      addCircle: vi.fn(() => ({ id: 'circle-1', type: 'circle' })),
      addArrow: vi.fn(() => ({ id: 'arrow-1', type: 'arrow' })),
      addImage: vi.fn(() => ({ id: 'image-1', type: 'image' })),
      clearBoard: vi.fn(() => board),
      addLayer: vi.fn(() => ({ id: 'layer-2', name: 'Layer 2', visible: true, locked: false, elements: [] })),
      setActiveLayer: vi.fn(() => board),
      setTool: vi.fn((tool) => tool),
      getState: vi.fn(() => ({ tool: 'pen' })),
      removeLayer: vi.fn(() => ({ id: 'layer-2' })),
      removeElement: vi.fn(() => ({ id: 'text-1' })),
      updateElement: vi.fn(() => ({ id: 'text-1' })),
      exportPNG: vi.fn(() => 'data:image/png;base64,studio'),
      exportSVG: vi.fn(() => '<svg></svg>'),
    };
    const saveSetting = vi.fn(async () => true);
    window.OpenCourseDeck.Canvas = canvasApi;
    window.OpenCourseDeck.UI = window.OpenCourseDeck.UI || {};
    window.OpenCourseDeck.UI.confirm = vi.fn(async () => true);
    window.DB = {
      getSetting: vi.fn(async () => null),
      saveSetting,
    };

    const controller = await window.OpenCourseDeck.Views.studio();
    document.querySelector('[data-studio-tool="select"]').click();
    expect(canvasApi.setTool).toHaveBeenCalledWith('select');
    expect(document.querySelector('[data-studio-status]').textContent).toBe('Select tool active');

    document.querySelector('[data-studio-text]').value = 'Arrhythmia map';
    document.querySelector('[data-studio-add-text]').click();
    await vi.waitFor(() => expect(canvasApi.addText).toHaveBeenCalledWith('Arrhythmia map'));
    expect(saveSetting).toHaveBeenCalledWith('plasma-studio-board', board);
    expect(document.querySelector('[data-studio-status]').textContent).toBe('Note added');

    document.querySelector('[data-studio-add-card]').click();
    await vi.waitFor(() => expect(canvasApi.addCard).toHaveBeenCalled());
    expect(document.querySelector('[data-studio-status]').textContent).toBe('Card added');

    document.querySelector('[data-studio-clear]').click();
    await vi.waitFor(() => expect(canvasApi.clearBoard).toHaveBeenCalled());
    expect(window.OpenCourseDeck.UI.confirm).toHaveBeenCalledWith('Clear the current Studio board?');
    expect(document.querySelector('[data-studio-status]').textContent).toBe('Board cleared');

    controller.unmount();
  });

  it('adds Studio shape and image elements through route controls and autosaves them', async () => {
    await loadApp();
    const board = {
      version: 1,
      layers: [{ id: 'layer-1', name: 'Layer 1', visible: true, locked: false, elements: [] }],
    };
    const saveSetting = vi.fn(async () => true);
    const canvasApi = {
      init: vi.fn(),
      destroy: vi.fn(),
      loadState: vi.fn(),
      serialize: vi.fn(() => board),
      addRectangle: vi.fn(() => ({ id: 'rect-1', type: 'rect' })),
      addCircle: vi.fn(() => ({ id: 'circle-1', type: 'circle' })),
      addArrow: vi.fn(() => ({ id: 'arrow-1', type: 'arrow' })),
      addImage: vi.fn(() => ({ id: 'image-1', type: 'image' })),
      exportPNG: vi.fn(() => 'data:image/png;base64,studio'),
      exportSVG: vi.fn(() => '<svg></svg>'),
    };
    window.OpenCourseDeck.Canvas = canvasApi;
    window.DB = {
      getSetting: vi.fn(async () => null),
      saveSetting,
    };

    const controller = await window.OpenCourseDeck.Views.studio();

    document.querySelector('[data-studio-add-rect]').click();
    await vi.waitFor(() => expect(canvasApi.addRectangle).toHaveBeenCalled());
    expect(document.querySelector('[data-studio-status]').textContent).toBe('Rectangle added');

    document.querySelector('[data-studio-add-circle]').click();
    await vi.waitFor(() => expect(canvasApi.addCircle).toHaveBeenCalled());
    expect(document.querySelector('[data-studio-status]').textContent).toBe('Circle added');

    document.querySelector('[data-studio-add-arrow]').click();
    await vi.waitFor(() => expect(canvasApi.addArrow).toHaveBeenCalled());
    expect(document.querySelector('[data-studio-status]').textContent).toBe('Arrow added');

    document.querySelector('[data-studio-image-url]').value = 'https://cdn.example.test/diagram.png';
    document.querySelector('[data-studio-add-image]').click();
    await vi.waitFor(() => expect(canvasApi.addImage).toHaveBeenCalledWith('https://cdn.example.test/diagram.png'));
    expect(document.querySelector('[data-studio-image-url]').value).toBe('');
    expect(document.querySelector('[data-studio-status]').textContent).toBe('Image added');
    expect(saveSetting).toHaveBeenCalledWith('plasma-studio-board', board);

    controller.unmount();
  });

  it('adds dropped Studio image URLs at the canvas drop point and autosaves them', async () => {
    await loadApp();
    const board = {
      version: 1,
      layers: [{ id: 'layer-1', name: 'Layer 1', visible: true, locked: false, elements: [] }],
    };
    const saveSetting = vi.fn(async () => true);
    const canvasApi = {
      init: vi.fn(),
      destroy: vi.fn(),
      loadState: vi.fn(),
      serialize: vi.fn(() => board),
      getState: vi.fn(() => ({ tool: 'pen' })),
      screenToWorld: vi.fn(() => ({ x: 300, y: 220 })),
      addImage: vi.fn(() => ({ id: 'image-drop', type: 'image' })),
      exportPNG: vi.fn(() => 'data:image/png;base64,studio'),
      exportSVG: vi.fn(() => '<svg></svg>'),
    };
    window.OpenCourseDeck.Canvas = canvasApi;
    window.DB = {
      getSetting: vi.fn(async () => null),
      saveSetting,
    };

    const controller = await window.OpenCourseDeck.Views.studio();
    const canvas = document.getElementById('studio-canvas');
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'clientX', { value: 320 });
    Object.defineProperty(drop, 'clientY', { value: 240 });
    Object.defineProperty(drop, 'dataTransfer', {
      value: {
        files: [],
        getData: vi.fn((type) => (type === 'text/uri-list' ? 'https://cdn.example.test/sketch.png' : '')),
      },
    });

    canvas.dispatchEvent(drop);

    await vi.waitFor(() => expect(canvasApi.addImage).toHaveBeenCalledWith('https://cdn.example.test/sketch.png', {
      x: 160,
      y: 140,
    }));
    expect(saveSetting).toHaveBeenCalledWith('plasma-studio-board', board);
    expect(document.querySelector('[data-studio-status]').textContent).toBe('Dropped image added');

    controller.unmount();
  });

  it('applies Studio templates and opens a print-to-PDF export', async () => {
    await loadApp();
    const board = {
      version: 1,
      activeLayerIdx: 0,
      layers: [{ id: 'layer-template', name: 'Study map', visible: true, locked: false, elements: [] }],
    };
    const saveSetting = vi.fn(async () => true);
    const canvasApi = {
      init: vi.fn(),
      destroy: vi.fn(),
      serialize: vi.fn(() => board),
      loadState: vi.fn(),
      applyTemplate: vi.fn(() => board),
      exportSVG: vi.fn(() => '<svg><text>Study map</text></svg>'),
      exportPNG: vi.fn(() => 'data:image/png;base64,studio'),
    };
    window.OpenCourseDeck.Canvas = canvasApi;
    window.OpenCourseDeck.UI = window.OpenCourseDeck.UI || {};
    window.OpenCourseDeck.UI.confirm = vi.fn(async () => true);
    window.DB = {
      getSetting: vi.fn(async () => null),
      saveSetting,
    };

    const controller = await window.OpenCourseDeck.Views.studio();
    document.querySelector('[data-studio-template]').value = 'cornell';
    document.querySelector('[data-studio-apply-template]').click();

    await vi.waitFor(() => expect(canvasApi.applyTemplate).toHaveBeenCalledWith('cornell'));
    expect(window.OpenCourseDeck.UI.confirm).toHaveBeenCalledWith('Replace the current Studio board with this template?');
    expect(saveSetting).toHaveBeenCalledWith('plasma-studio-board', board);
    expect(document.querySelector('[data-studio-status]').textContent).toBe('Template applied');

    document.querySelector('[data-studio-export-pdf]').click();
    // Printing goes through a hidden same-origin iframe: window.open with
    // the noopener feature returns null in real browsers, so a popup shell
    // can never be written to.
    const printFrame = document.querySelector('iframe[aria-hidden="true"]');
    expect(printFrame).toBeTruthy();
    expect(printFrame.contentDocument.body.innerHTML).toContain('Study map');
    expect(document.querySelector('[data-studio-status]').textContent).toBe('PDF export opened');

    controller.unmount();
  });

  it('renders Studio inspector controls for layers and elements', async () => {
    await loadApp();
    const board = {
      version: 1,
      activeLayerIdx: 0,
      layers: [
        {
          id: 'layer-1',
          name: 'Main layer',
          visible: true,
          locked: false,
          elements: [{ id: 'text-1', type: 'text', text: 'Clinical note' }],
        },
        { id: 'layer-2', name: 'Sketch layer', visible: true, locked: false, elements: [] },
      ],
    };
    const saveSetting = vi.fn(async () => true);
    const canvasApi = {
      init: vi.fn(),
      destroy: vi.fn(),
      loadState: vi.fn(),
      serialize: vi.fn(() => board),
      addText: vi.fn(() => ({ id: 'text-2', type: 'text' })),
      addCard: vi.fn(() => ({ id: 'card-1', type: 'roundRect' })),
      clearBoard: vi.fn(() => board),
      addLayer: vi.fn(() => ({ id: 'layer-3', name: 'Findings', visible: true, locked: false, elements: [] })),
      setActiveLayer: vi.fn(() => board),
      removeLayer: vi.fn(() => ({ id: 'layer-2' })),
      removeElement: vi.fn(() => ({ id: 'text-1' })),
      exportPNG: vi.fn(() => 'data:image/png;base64,studio'),
      exportSVG: vi.fn(() => '<svg></svg>'),
    };
    window.OpenCourseDeck.Canvas = canvasApi;
    window.DB = {
      getSetting: vi.fn(async () => null),
      saveSetting,
    };

    const controller = await window.OpenCourseDeck.Views.studio();

    expect(document.querySelector('[data-studio-layers]').textContent).toContain('Main layer (1)');
    expect(document.querySelector('[data-studio-elements]').textContent).toContain('Clinical note');

    document.querySelector('[data-studio-layer-name]').value = 'Findings';
    document.querySelector('[data-studio-add-layer]').click();
    await vi.waitFor(() => expect(canvasApi.addLayer).toHaveBeenCalledWith('Findings'));
    expect(saveSetting).toHaveBeenCalledWith('plasma-studio-board', board);

    document.querySelector('[data-set-layer="1"]').click();
    await vi.waitFor(() => expect(canvasApi.setActiveLayer).toHaveBeenCalledWith(1));

    document.querySelector('[data-delete-element="text-1"]').click();
    await vi.waitFor(() => expect(canvasApi.removeElement).toHaveBeenCalledWith('text-1'));

    document.querySelector('[data-delete-layer="layer-2"]').click();
    await vi.waitFor(() => expect(canvasApi.removeLayer).toHaveBeenCalledWith('layer-2'));

    controller.unmount();
  });

  it('updates Studio element properties from the inspector', async () => {
    await loadApp();
    const board = {
      version: 1,
      activeLayerIdx: 0,
      layers: [{
        id: 'layer-1',
        name: 'Main',
        visible: true,
        locked: false,
        elements: [{ id: 'text-1', type: 'text', text: 'Before', x: 10, y: 20, fill: '#000000', stroke: '#111111', strokeWidth: 2, fontSize: 18, width: 120, height: 40, linkType: 'course', linkTarget: 'course-1', linkLabel: 'Old course' }],
      }],
    };
    const saveSetting = vi.fn(async () => true);
    const canvasApi = {
      init: vi.fn(),
      destroy: vi.fn(),
      loadState: vi.fn(),
      serialize: vi.fn(() => board),
      addText: vi.fn(() => ({ id: 'text-2', type: 'text' })),
      addCard: vi.fn(() => ({ id: 'card-1', type: 'roundRect' })),
      clearBoard: vi.fn(() => board),
      addLayer: vi.fn(() => ({ id: 'layer-2' })),
      setActiveLayer: vi.fn(() => board),
      removeLayer: vi.fn(() => ({ id: 'layer-2' })),
      removeElement: vi.fn(() => ({ id: 'text-1' })),
      updateElement: vi.fn(() => ({ id: 'text-1', text: 'After' })),
      exportPNG: vi.fn(() => 'data:image/png;base64,studio'),
      exportSVG: vi.fn(() => '<svg></svg>'),
    };
    window.OpenCourseDeck.Canvas = canvasApi;
    window.DB = {
      getSetting: vi.fn(async () => null),
      saveSetting,
    };

    const controller = await window.OpenCourseDeck.Views.studio();
    document.querySelector('[data-inspect-element="text-1"]').click();
    document.querySelector('[data-studio-prop-text]').value = 'After';
    document.querySelector('[data-studio-prop-x]').value = '42';
    document.querySelector('[data-studio-prop-y]').value = '64';
    document.querySelector('[data-studio-prop-fill]').value = '#ffffff';
    document.querySelector('[data-studio-prop-width]').value = '260';
    document.querySelector('[data-studio-prop-stroke-width]').value = '5';
    document.querySelector('[data-studio-prop-font-size]').value = '24';
    document.querySelector('[data-studio-prop-link-type]').value = 'note';
    document.querySelector('[data-studio-prop-link-target]').value = 'note-7';
    document.querySelector('[data-studio-prop-link-label]').value = 'ECG note';
    document.querySelector('[data-studio-apply-props]').click();

    await vi.waitFor(() => expect(canvasApi.updateElement).toHaveBeenCalledWith('text-1', expect.objectContaining({
      text: 'After',
      x: '42',
      y: '64',
      fill: '#ffffff',
      width: '260',
      strokeWidth: '5',
      fontSize: '24',
      linkType: 'note',
      linkTarget: 'note-7',
      linkLabel: 'ECG note',
    })));
    expect(saveSetting).toHaveBeenCalledWith('plasma-studio-board', board);
    expect(document.querySelector('[data-studio-status]').textContent).toBe('Properties updated');

    controller.unmount();
  });

  it('populates Studio link target suggestions from catalog and canonical study data', async () => {
    await loadApp();
    const board = {
      version: 1,
      activeLayerIdx: 0,
      layers: [{
        id: 'layer-1',
        name: 'Main',
        visible: true,
        locked: false,
        elements: [{ id: 'shape-1', type: 'rect', text: 'Linked shape', linkType: 'note' }],
      }],
    };
    const canvasApi = {
      init: vi.fn(),
      destroy: vi.fn(),
      loadState: vi.fn(),
      serialize: vi.fn(() => board),
      updateElement: vi.fn(() => ({ id: 'shape-1' })),
      exportPNG: vi.fn(() => 'data:image/png;base64,studio'),
      exportSVG: vi.fn(() => '<svg></svg>'),
    };
    window.OpenCourseDeck.Canvas = canvasApi;
    window.DataStore = {
      init: vi.fn(async () => {}),
      allCourses: vi.fn(() => [{ id: 'course-1', title: 'Cardiology' }]),
      allTopics: vi.fn(() => [{ topicId: 'topic-pdf', title: 'Rhythm PDF', pdfs: ['rhythm.pdf'] }]),
    };
    window.DB = {
      getSetting: vi.fn(async () => null),
      saveSetting: vi.fn(async () => true),
      getAllNotes: vi.fn(async () => [{ id: 'note-1', title: 'ECG note' }]),
      getAllTimestamps: vi.fn(async () => [{ id: 'ts-1', title: 'Saved video moment' }]),
      getAllAnnotations: vi.fn(async () => [{ id: 'ann-1', docId: 'doc-a', page: 3 }]),
    };

    const controller = await window.OpenCourseDeck.Views.studio();
    document.querySelector('[data-inspect-element="shape-1"]').click();

    await vi.waitFor(() => expect(document.querySelector('#studio-link-target-options option[value="note-1"]')).not.toBeNull());
    expect(document.querySelector('[data-studio-prop-link-target]').getAttribute('list')).toBe('studio-link-target-options');
    expect(document.querySelector('#studio-link-target-options option[value="note-1"]').label).toContain('ECG note');

    document.querySelector('[data-studio-prop-link-type]').value = 'pdf';
    document.querySelector('[data-studio-prop-link-target]').value = 'topic-pdf';
    document.querySelector('[data-studio-prop-link-label]').value = 'Rhythm PDF';
    document.querySelector('[data-studio-apply-props]').click();

    await vi.waitFor(() => expect(canvasApi.updateElement).toHaveBeenCalledWith('shape-1', expect.objectContaining({
      linkType: 'pdf',
      linkTarget: 'topic-pdf',
      linkLabel: 'Rhythm PDF',
    })));

    controller.unmount();
  });

  it('opens linked Studio resources from element rows and inspector actions', async () => {
    await loadApp();
    const board = {
      version: 1,
      activeLayerIdx: 0,
      layers: [{
        id: 'layer-1',
        name: 'Main',
        visible: true,
        locked: false,
        elements: [
          { id: 'ts-link', type: 'rect', text: 'Timestamp', linkType: 'timestamp', linkTarget: 'topic-1', linkLabel: 'Moment' },
          { id: 'url-link', type: 'rect', text: 'External', linkType: 'url', linkTarget: 'https://example.test/resource', linkLabel: 'Resource' },
        ],
      }],
    };
    const canvasApi = {
      init: vi.fn(),
      destroy: vi.fn(),
      loadState: vi.fn(),
      serialize: vi.fn(() => board),
      exportPNG: vi.fn(() => 'data:image/png;base64,studio'),
      exportSVG: vi.fn(() => '<svg></svg>'),
    };
    window.OpenCourseDeck.Canvas = canvasApi;
    window.DB = {
      getSetting: vi.fn(async () => null),
      saveSetting: vi.fn(async () => true),
    };
    window.open = vi.fn();

    const controller = await window.OpenCourseDeck.Views.studio();

    document.querySelector('[data-inspect-element="url-link"]').click();
    document.querySelector('[data-studio-properties] [data-open-studio-link="url-link"]').click();
    expect(window.open).toHaveBeenCalledWith('https://example.test/resource', '_blank', 'noopener,noreferrer');
    expect(document.querySelector('[data-studio-status]').textContent).toBe('Linked URL opened');

    document.querySelector('[data-open-studio-link="ts-link"]').click();
    expect(sessionStorage.getItem('plasma_pending_topic')).toBe('topic-1');
    expect(window.location.hash).toBe('#/courses');
    expect(document.querySelector('[data-studio-status]').textContent).toBe('Opening linked timestamp');

    controller.unmount();
  });

  it('imports a Studio board JSON file and saves the normalized board', async () => {
    await loadApp();
    const importedBoard = {
      version: 1,
      layers: [{ id: 'layer-imported', name: 'Imported', visible: true, locked: false, elements: [] }],
    };
    const normalizedBoard = { ...importedBoard, exportedAt: '2026-05-03T00:00:00.000Z' };
    const canvasApi = {
      init: vi.fn(),
      destroy: vi.fn(),
      loadState: vi.fn(() => normalizedBoard),
      serialize: vi.fn(() => normalizedBoard),
      exportPNG: vi.fn(() => 'data:image/png;base64,studio'),
      exportSVG: vi.fn(() => '<svg></svg>'),
    };
    const saveSetting = vi.fn(async () => true);
    window.OpenCourseDeck.Canvas = canvasApi;
    window.DB = {
      getSetting: vi.fn(async () => null),
      saveSetting,
    };

    const controller = await window.OpenCourseDeck.Views.studio();
    const input = document.querySelector('[data-studio-import-file]');
    const file = new File([JSON.stringify(importedBoard)], 'studio.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change'));

    await vi.waitFor(() => expect(canvasApi.loadState).toHaveBeenCalledWith(importedBoard));
    expect(saveSetting).toHaveBeenCalledWith('plasma-studio-board', normalizedBoard);
    expect(document.querySelector('[data-studio-status]').textContent).toBe('JSON imported');

    controller.unmount();
  });

  it('renders Settings storage health from browser quota and last save issue', async () => {
    await loadApp();
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: vi.fn(async () => ({ usage: 900, quota: 1000 })),
      },
    });
    window.localStorage?.setItem('plasma-test-footprint', 'abc');
    window.OpenCourseDeck.lastStorageIssue = {
      kind: 'progress',
      error: { quota: true },
    };

    const controller = await window.OpenCourseDeck.Views.settings();

    await vi.waitFor(() => expect(document.querySelector('[data-storage-health]').textContent).toContain('Critical'));
    const view = document.querySelector('#view-container .view-settings');

    expect(view.querySelector('[data-storage-status]').textContent).toBe('Critical');
    expect(view.querySelector('[data-storage-percent]').textContent).toBe('90%');
    expect(view.querySelector('[data-storage-health]').textContent).toContain('Available space');
    expect(view.querySelector('[data-storage-health]').textContent).toContain('localStorage footprint');
    expect(view.querySelector('[data-storage-health]').textContent).toContain('Quota error');
    expect(view.querySelector('[data-storage-bar]').closest('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('90');

    controller.unmount();
  });

  it('clears only the selected Settings data scope', async () => {
    await loadApp();
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: vi.fn(async () => ({ usage: 100, quota: 1000 })),
      },
    });
    const clearUserData = vi.fn(async () => ({ scope: 'notes' }));
    window.DB = { clearUserData };
    window.OpenCourseDeck.UI = {};
    window.OpenCourseDeck.UI.confirm = vi.fn(async () => true);
    sessionStorage.setItem('plasma_pending_topic', 'topic-1');

    const controller = await window.OpenCourseDeck.Views.settings();
    document.getElementById('select-clear-scope').value = 'notes';
    document.getElementById('btn-clear-scope').click();

    await vi.waitFor(() => expect(clearUserData).toHaveBeenCalledWith('notes'));
    expect(window.OpenCourseDeck.UI.confirm).toHaveBeenCalledWith(expect.stringContaining('notes, folders, and note settings'));
    expect(sessionStorage.getItem('plasma_pending_topic')).toBe('topic-1');

    controller.unmount();
  });

  it('persists AI visibility, local model, and user-owned API options from Settings', async () => {
    await loadApp();
    const saveSetting = vi.fn(async () => true);
    window.DB = {
      getSetting: vi.fn(async (key) => (key === 'plasma-ai-settings'
        ? { mode: 'hidden', model: 'gemma-local', keyStorage: 'session', hasKey: false }
        : null)),
      saveSetting,
    };

    const controller = await window.OpenCourseDeck.Views.settings();
    await vi.waitFor(() => expect(document.querySelector('[data-ai-status]').textContent).toBe('Hidden'));

    document.querySelector('[data-ai-mode]').value = 'custom-api';
    document.querySelector('[data-ai-model]').value = 'user-model';
    const endpoint = document.querySelector('[data-ai-endpoint]');
    const approval = document.querySelector('[data-ai-approve-endpoint]');
    endpoint.value = 'https://api.example.test/v1/chat/completions';
    endpoint.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-ai-key-storage]').value = 'session';
    document.querySelector('[data-ai-key]').value = 'session-key';
    approval.checked = true;
    approval.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('[data-ai-save]').click();

    await vi.waitFor(() => expect(saveSetting).toHaveBeenCalledWith('plasma-ai-settings', expect.objectContaining({
      mode: 'custom-api',
      model: 'user-model',
      endpoint: 'https://api.example.test/v1/chat/completions',
      keyStorage: 'session',
      hasKey: true,
    })));
    expect(saveSetting.mock.calls.at(-1)[1].apiKey).toBeUndefined();
    expect(sessionStorage.getItem('plasma-ai-api-key-session')).toBe('session-key');
    expect(window.OpenCourseDeck.AISettings.mode).toBe('custom-api');
    expect(document.querySelector('[data-ai-summary]').textContent).toContain('Available for this session');
    expect(document.querySelector('[data-ai-key-storage]').disabled).toBe(true);
    expect(document.querySelector('[data-ai-key-storage]').value).toBe('session');

    document.querySelector('[data-ai-clear-key]').click();
    await vi.waitFor(() => expect(saveSetting).toHaveBeenLastCalledWith('plasma-ai-settings', expect.objectContaining({ hasKey: false })));
    expect(saveSetting.mock.calls.at(-1)[1].apiKey).toBeUndefined();

    controller.unmount();
  });

  it('renders bookmarks from timestamps, notes, and PDF annotations', async () => {
    await loadApp();
    window.DB = {
      getAllTimestamps: vi.fn(async () => [
        { id: 'ts-1', topicId: 'topic-1', title: 'Video point', position: 125, note: '<script>alert(1)</script> Rhythm insight', noteId: 'note-linked', updatedAt: 30 },
      ]),
      getAllNotes: vi.fn(async () => [
        { id: 'note-1', topicId: 'topic-2', title: 'Linked note', updatedAt: 20 },
      ]),
      getAllAnnotations: vi.fn(async () => [
        { id: 'ann-1', docId: 'doc-a', page: 4, updatedAt: 10 },
      ]),
    };

    await window.OpenCourseDeck.Views.bookmarks();

    await vi.waitFor(() => expect(document.querySelectorAll('[data-bookmark-type]')).toHaveLength(3));
    const view = document.querySelector('#view-container .view-bookmarks');

    expect(view.querySelector('[aria-label="Feature status: ready"]').textContent).toBe('Ready');
    expect(view.textContent).not.toContain('planned and not yet interactive');
    expect(view.textContent).toContain('Video timestamps');
    expect(view.textContent).toContain('Total bookmarks');
    expect(view.querySelector('[data-bookmark-type="timestamp"]').textContent).toContain('At 2:05');
    expect(view.querySelector('[data-bookmark-type="timestamp"]').textContent).toContain('Linked note');
    expect(view.querySelector('[data-bookmark-type="timestamp"]').textContent).toContain('Rhythm insight');
    expect(view.querySelector('[data-bookmark-type="timestamp"]').textContent).not.toContain('alert(1)');
    expect(view.querySelector('[data-bookmark-type="timestamp"] script')).toBeNull();
    expect(view.querySelector('[data-bookmark-type="note"]').dataset.topicId).toBe('topic-2');
    expect(view.querySelector('[data-bookmark-type="pdf"]').textContent).toContain('Page 4');
    expect(view.querySelector('[data-bookmark-id="ts-1"] a').getAttribute('href')).toBe('#/courses');

    view.querySelector('[data-bookmark-filter="timestamp"]').click();
    await vi.waitFor(() => expect(view.querySelectorAll('[data-bookmark-type]')).toHaveLength(1));
    expect(view.querySelector('[data-bookmark-type="timestamp"]')).toBeTruthy();
    expect(view.querySelector('[data-bookmark-type="note"]')).toBeNull();
    expect(view.querySelector('[data-bookmark-type="pdf"]')).toBeNull();
  });

  it('deletes timestamp bookmarks from the Bookmarks route after confirmation', async () => {
    await loadApp();
    const deleteTimestamp = vi.fn(async () => true);
    const getAllTimestamps = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'ts-delete', topicId: 'topic-1', title: 'Delete me', position: 12 }])
      .mockResolvedValue([]);
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    window.DB = {
      getAllTimestamps,
      getAllNotes: vi.fn(async () => []),
      getAllAnnotations: vi.fn(async () => []),
      deleteTimestamp,
    };

    await window.OpenCourseDeck.Views.bookmarks();
    await vi.waitFor(() => expect(document.querySelector('[data-delete-timestamp="ts-delete"]')).toBeTruthy());
    document.querySelector('[data-delete-timestamp="ts-delete"]').click();

    await vi.waitFor(() => expect(deleteTimestamp).toHaveBeenCalledWith('ts-delete'));
    expect(window.OpenCourseDeck.UI.confirm).toHaveBeenCalledWith('Delete this timestamp bookmark?');
    await vi.waitFor(() => expect(document.querySelector('[data-bookmark-id="ts-delete"]')).toBeNull());
  });

  it('edits timestamp bookmarks from the Bookmarks route', async () => {
    await loadApp();
    const saveTimestamp = vi.fn(async () => true);
    const getAllTimestamps = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'ts-edit', topicId: 'topic-1', title: 'Original title', position: 12, note: 'Original note', createdAt: 1 }])
      .mockResolvedValue([{ id: 'ts-edit', topicId: 'topic-1', title: 'Edited title', position: 12, note: 'Edited note', updatedAt: 2 }]);
    window.DB = {
      getAllTimestamps,
      getAllNotes: vi.fn(async () => []),
      getAllAnnotations: vi.fn(async () => []),
      saveTimestamp,
    };

    await window.OpenCourseDeck.Views.bookmarks();
    await vi.waitFor(() => expect(document.querySelector('[data-edit-timestamp="ts-edit"]')).toBeTruthy());
    document.querySelector('[data-edit-timestamp="ts-edit"]').click();
    await vi.waitFor(() => expect(document.querySelector('[data-timestamp-edit-form="ts-edit"]')).toBeTruthy());
    document.querySelector('[data-timestamp-edit-form="ts-edit"] input[name="title"]').value = 'Edited title';
    document.querySelector('[data-timestamp-edit-form="ts-edit"] textarea[name="note"]').value = 'Edited note';
    document.querySelector('[data-timestamp-edit-form="ts-edit"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(saveTimestamp).toHaveBeenCalledWith(expect.objectContaining({
      id: 'ts-edit',
      topicId: 'topic-1',
      title: 'Edited title',
      note: 'Edited note',
      position: 12,
    })));
    expect(saveTimestamp.mock.calls[0][0].updatedAt).toEqual(expect.any(Number));
    await vi.waitFor(() => expect(document.querySelector('[data-bookmark-id="ts-edit"]').textContent).toContain('Edited title'));
  });

  it('saves PDF page notes with document and page metadata', async () => {
    await loadApp();
    const saveNote = vi.fn(async note => note);
    window.DB = { saveNote };
    window.PlasmaPDFInit = vi.fn();
    window.PlasmaPDFDestroy = vi.fn();
    window.PlasmaPDFViewer = {
      getSnapshot: vi.fn(() => ({ docId: 'doc-a.pdf', page: 7, totalPages: 20 })),
      saveSelectionToNote: vi.fn(async () => ({ saved: true, page: 7, docId: 'doc-a.pdf' })),
      exportAnnotationsToNotes: vi.fn(async () => ({ total: 2, created: 2, skipped: 0, errors: 0 })),
      refreshAnnotationsFromStorage: vi.fn(async () => [{ id: 'ann-1' }]),
    };

    const controller = await window.OpenCourseDeck.Views.pdf();
    document.querySelector('[data-pdf-page-note-input]').value = '<b>Important rhythm page</b>';
    document.querySelector('[data-pdf-save-page-note]').click();

    await vi.waitFor(() => expect(saveNote).toHaveBeenCalledWith(expect.objectContaining({
      title: 'PDF page 7 note',
      sourceType: 'pdf',
      docId: 'doc-a.pdf',
      pdfDocId: 'doc-a.pdf',
      page: 7,
      pdfPage: 7,
      tags: ['pdf', 'page-note'],
    })));
    expect(saveNote.mock.calls[0][0].content).toContain('&lt;b&gt;Important rhythm page&lt;/b&gt;');
    expect(document.querySelector('[data-pdf-page-note-status]').textContent).toBe('Saved page 7');

    document.querySelector('[data-pdf-export-annotations]').click();
    await vi.waitFor(() => expect(window.PlasmaPDFViewer.exportAnnotationsToNotes).toHaveBeenCalled());
    expect(document.querySelector('[data-pdf-page-note-status]').textContent).toBe('Exported 2 annotations');

    document.querySelector('[data-pdf-save-selection]').click();
    await vi.waitFor(() => expect(window.PlasmaPDFViewer.saveSelectionToNote).toHaveBeenCalled());
    expect(document.querySelector('[data-pdf-page-note-status]').textContent).toBe('Saved selection from page 7');

    window.OpenCourseDeck.bus.emit('sync:message', {
      kind: 'annotation',
      action: 'save',
      record: { docId: 'doc-a.pdf' },
      source: 'external-tab',
    });
    await vi.waitFor(() => expect(window.PlasmaPDFViewer.refreshAnnotationsFromStorage).toHaveBeenCalled());
    expect(document.querySelector('[data-pdf-page-note-status]').textContent).toBe('Annotations refreshed (1)');

    controller.unmount();
    expect(window.PlasmaPDFDestroy).toHaveBeenCalled();
  });

  it('opens PDF-linked bookmarks with pending document and page state', async () => {
    await loadApp();
    window.DB = {
      getAllTimestamps: vi.fn(async () => []),
      getAllNotes: vi.fn(async () => [
        { id: 'note-pdf', title: 'Page note', sourceType: 'pdf', pdfDocId: 'doc-a.pdf', pdfPage: 9, updatedAt: 20 },
      ]),
      getAllAnnotations: vi.fn(async () => [
        { id: 'ann-pdf', docId: 'doc-b.pdf', page: 4, updatedAt: 10 },
      ]),
    };
    window.PlasmaPDFViewer = { goTo: vi.fn() };

    await window.OpenCourseDeck.Views.bookmarks();
    await vi.waitFor(() => expect(document.querySelector('[data-bookmark-id="note-pdf"] a')).toBeTruthy());
    expect(document.querySelector('[data-bookmark-id="note-pdf"]').textContent).toContain('PDF page note');
    document.querySelector('[data-bookmark-id="note-pdf"] a').click();

    expect(sessionStorage.getItem('plasma_pending_pdf_doc')).toBe('doc-a.pdf');
    expect(sessionStorage.getItem('plasma_pending_pdf_page')).toBe('9');
    expect(window.location.hash).toBe('#/pdf');
    expect(window.PlasmaPDFViewer.goTo).toHaveBeenCalledWith(9);
  });

  it('renders a catalog health panel in Help from the active DataStore', async () => {
    await loadApp();
    window.DataStore = {
      init: vi.fn(async () => {}),
      allCourses: vi.fn(() => [{ id: 'course-1' }, { id: 'course-2' }]),
      allTopics: vi.fn(() => [
        { topicId: 'topic-1', courseId: 'course-1', sourceIndex: 0, title: 'Video', videos: ['v1'], pdfs: [] },
        { topicId: 'topic-2', courseId: 'course-1', sourceIndex: 1, title: 'PDF', videos: [], pdfs: ['p1', 'p2'] },
        { topicId: 'topic-3', courseId: 'course-2', sourceIndex: 0, title: 'No media', videos: [], pdfs: [] },
        { topicId: 'topic-4', courseId: 'course-2', sourceIndex: 0, title: '', error: 'HTTP 500', videos: [], pdfs: [] },
      ]),
    };

    await window.OpenCourseDeck.Views.help();

    await vi.waitFor(() => expect(document.querySelector('[data-catalog-health]').textContent).toContain('Topics'));
    const health = document.querySelector('[data-catalog-health]');

    expect(health.textContent).toContain('Courses2');
    expect(health.textContent).toContain('Sources3');
    expect(health.textContent).toContain('Topics4');
    expect(health.textContent).toContain('Videos1');
    expect(health.textContent).toContain('PDFs2');
    expect(health.textContent).toContain('No media topics2');
    expect(health.textContent).toContain('Blank error topics1');
  });

  it('renders Courses AI action rows without stringifying child elements', async () => {
    await loadApp();
    window.DB = {
      getSetting: vi.fn(async () => null),
      getProgress: vi.fn(async () => null),
      saveProgress: vi.fn(async () => true),
    };
    window.DataStore = {
      init: vi.fn(async () => {}),
      allCourses: vi.fn(() => [{ id: 'course-a', title: 'Cardiology' }]),
      allTopics: vi.fn(() => [
        { topicId: 'topic-1', courseId: 'course-a', title: 'Loaded lecture', videos: ['https://example.test/video.mp4'] },
      ]),
    };
    window.OpenCourseDeck.AI = {
      status: vi.fn(async () => ({ available: true })),
    };

    await window.OpenCourseDeck.Views.courses();

    await vi.waitFor(() => expect(document.querySelector('[data-action="summarize-course"]')).toBeTruthy());
    const view = document.querySelector('#view-container .view-courses');
    expect(view.textContent).not.toContain('[object HTMLSpanElement]');
    expect(view.querySelector('[data-course-ai-status]')).toBeTruthy();
  });

  it('links Help to the architecture and canonical storage documentation', async () => {
    await loadApp();

    await window.OpenCourseDeck.Views.help();

    const storageLink = document.querySelector('.help-links a[href="docs/architecture.md"]');
    expect(storageLink).not.toBeNull();
    expect(storageLink.textContent).toContain('Architecture');
    expect(document.querySelector('.help-card').textContent).toContain('First-run checklist');
  });

  it('renders achievements from current progress instead of a planned placeholder', async () => {
    await loadApp();
    window.DB = {
      getAllProgress: vi.fn(async () => [
        { topicId: 'topic-1', courseId: 'course-1', status: 'done', percent: 100, position: 1200 },
        { topicId: 'topic-2', courseId: 'course-1', status: 'done', percent: 100, position: 900 },
        { topicId: 'topic-3', courseId: 'course-2', status: 'in-progress', percent: 20, position: 60 },
      ]),
    };
    window.DataStore = {
      init: vi.fn(async () => {}),
      allTopics: vi.fn(() => [
        { topicId: 'topic-1', courseId: 'course-1' },
        { topicId: 'topic-2', courseId: 'course-1' },
        { topicId: 'topic-3', courseId: 'course-2' },
      ]),
    };

    await window.OpenCourseDeck.Views.achievements();

    await vi.waitFor(() => expect(document.querySelectorAll('[data-achievement-id]')).toHaveLength(6));
    const view = document.querySelector('#view-container .view-achievements');

    expect(view.querySelector('[aria-label="Feature status: ready"]').textContent).toBe('Ready');
    expect(view.textContent).not.toContain('planned and not yet interactive');
    expect(view.textContent).toContain('Touched topics');
    expect(view.textContent).toContain('Completed courses');
    expect(view.querySelector('[data-achievement-id="first-finish"]').dataset.achievementState).toBe('unlocked');
    expect(view.querySelector('[data-achievement-id="deep-focus"]').dataset.achievementState).toBe('unlocked');
    expect(view.querySelector('[data-achievement-id="course-complete"]').dataset.achievementState).toBe('unlocked');
    expect(view.querySelector('[data-achievement-id="collector"]').dataset.achievementState).toBe('locked');
  });

  it('surfaces completed topics that are due for review', async () => {
    vi.setSystemTime(new Date('2026-05-05T00:00:00Z'));
    await loadApp();
    const oldActivity = new Date('2026-03-01T00:00:00Z').getTime();
    const recentActivity = new Date('2026-05-01T00:00:00Z').getTime();
    window.DB = {
      getAllProgress: vi.fn(async () => [
        { topicId: 'topic-old', courseId: 'course-1', status: 'done', percent: 100, updatedAt: oldActivity },
        { topicId: 'topic-recent', courseId: 'course-1', status: 'done', percent: 100, updatedAt: recentActivity },
      ]),
      getAllNotes: vi.fn(async () => [
        { id: 'note-recent', topicId: 'topic-recent', updatedAt: recentActivity },
      ]),
      getAllTimestamps: vi.fn(async () => []),
    };
    window.DataStore = {
      init: vi.fn(async () => {}),
      allTopics: vi.fn(() => [
        { topicId: 'topic-old', courseId: 'course-1', title: 'Old physiology', courseTitle: 'Physiology' },
        { topicId: 'topic-recent', courseId: 'course-1', title: 'Recent physiology', courseTitle: 'Physiology' },
      ]),
    };

    await window.OpenCourseDeck.Views.achievements();

    await vi.waitFor(() => expect(document.querySelector('[data-review-topic-id="topic-old"]')).toBeTruthy());
    const view = document.querySelector('#view-container .view-achievements');
    expect(view.textContent).toContain('Due reviews');
    expect(view.querySelector('[data-review-topic-id="topic-old"]').textContent).toContain('Old physiology');
    expect(view.querySelector('[data-review-topic-id="topic-recent"]')).toBeNull();

    view.querySelector('[data-review-topic="topic-old"]').click();
    expect(sessionStorage.getItem('plasma_pending_topic')).toBe('topic-old');
    expect(window.location.hash).toBe('#/courses');
  });

  it('sends falsy API request bodies instead of dropping them', async () => {
    await loadApp();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    globalThis.fetch = fetchMock;

    await window.OpenCourseDeck.API.post('/zero', 0);
    await window.OpenCourseDeck.API.post('/false', false);
    await window.OpenCourseDeck.API.post('/empty', '');

    expect(fetchMock.mock.calls[0][1].body).toBe('0');
    expect(fetchMock.mock.calls[1][1].body).toBe('false');
    expect(fetchMock.mock.calls[2][1].body).toBe('""');
  });

  it('honors formnovalidate while still blocking invalid validated submits', async () => {
    await loadApp(`
      <div id="plasma-app">
        <main id="view-container"></main>
        <form id="sample-form" data-validate>
          <div class="form-group">
            <input id="required-field" required />
            <div class="form-error"></div>
          </div>
          <button id="normal-submit" type="submit">Save</button>
          <button id="skip-submit" type="submit" formnovalidate>Skip</button>
        </form>
      </div>
    `);
    const form = document.getElementById('sample-form');
    const normal = document.getElementById('normal-submit');
    const skip = document.getElementById('skip-submit');

    const invalidSubmit = new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: normal });
    form.dispatchEvent(invalidSubmit);
    expect(invalidSubmit.defaultPrevented).toBe(true);

    const bypassSubmit = new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: skip });
    form.dispatchEvent(bypassSubmit);
    expect(bypassSubmit.defaultPrevented).toBe(false);
  });

  it('exposes central media URL validation for catalog actions', async () => {
    await loadApp();

    expect(window.OpenCourseDeck.safeMediaUrl('https://plasmato.net/video.mp4')).toBe('https://plasmato.net/video.mp4');
    expect(window.OpenCourseDeck.safeMediaUrl('https://media.example.test/video.mp4')).toBe('https://media.example.test/video.mp4');
    expect(window.OpenCourseDeck.safeMediaUrl('http://media.example.test/video.mp4')).toBe('http://media.example.test/video.mp4');
    expect(window.OpenCourseDeck.safeMediaUrl('/media/local.pdf')).toContain('/media/local.pdf');
    expect(window.OpenCourseDeck.safeMediaUrl('blob:https://example.test/id')).toBe('blob:https://example.test/id');
    expect(window.OpenCourseDeck.safeMediaUrl('javascript:alert(1)')).toBeNull();
    expect(window.OpenCourseDeck.safeMediaUrl('vbscript:msgbox(1)')).toBeNull();
  });

  it('exposes image and frame URL validation helpers', async () => {
    await loadApp();

    expect(window.OpenCourseDeck.safeImageUrl('https://cdn.example.test/image.png')).toBe('https://cdn.example.test/image.png');
    expect(window.OpenCourseDeck.safeImageUrl('/assets/cover.svg')).toContain('/assets/cover.svg');
    expect(window.OpenCourseDeck.safeImageUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
    expect(window.OpenCourseDeck.safeImageUrl('javascript:alert(1)')).toBeNull();

    expect(window.OpenCourseDeck.safeFrameUrl('blob:https://example.test/pdf')).toBe('blob:https://example.test/pdf');
    expect(window.OpenCourseDeck.safeFrameUrl('https://docs.example.test/viewer')).toBe('https://docs.example.test/viewer');
    expect(window.OpenCourseDeck.safeFrameUrl('http://docs.example.test/viewer')).toBe('http://docs.example.test/viewer');
    expect(window.OpenCourseDeck.safeFrameUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(window.OpenCourseDeck.safeFrameUrl('javascript:alert(1)')).toBeNull();
  });

  it('searches catalog, notes, timestamps, and PDF annotations from the topbar', async () => {
    await loadApp(`
      <div id="plasma-app">
        <header class="topbar"><div class="topbar-search"><input data-search-input /></div></header>
        <main id="view-container"></main>
      </div>
    `);
    window.DataStore = {
      init: vi.fn(async () => {}),
      allCourses: vi.fn(() => [{ id: 'course-1', title: 'Cardiology' }]),
      allTopics: vi.fn(() => [{ topicId: 'topic-1', courseId: 'course-1', title: 'Rhythm PDF', pdfs: ['rhythm.pdf'], videos: [] }]),
    };
    window.DB = {
      getAllNotes: vi.fn(async () => [{ id: 'note-1', title: 'Rhythm note', topicId: 'topic-1' }]),
      getAllTimestamps: vi.fn(async () => [{ id: 'ts-1', topicId: 'topic-1', title: 'Saved checkpoint', position: 125 }]),
      getAllAnnotations: vi.fn(async () => [{ id: 'ann-1', docId: 'doc-a', title: 'Rhythm annotation', page: 4 }]),
    };

    const input = document.querySelector('[data-search-input]');
    input.value = 'Rhythm';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(350);

    await vi.waitFor(() => expect(document.querySelectorAll('.search-result-item').length).toBeGreaterThanOrEqual(3));
    const results = [...document.querySelectorAll('.search-result-item')].map((item) => item.textContent).join(' ');
    expect(results).toContain('Rhythm PDF');
    expect(results).toContain('Rhythm note');
    expect(results).toContain('Rhythm annotation');

    input.value = 'Saved checkpoint';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(350);
    await vi.waitFor(() => expect(document.querySelector('.search-result-item')?.textContent).toContain('Saved checkpoint'));
    document.querySelector('.search-result-item').click();

    expect(sessionStorage.getItem('plasma_pending_topic')).toBe('topic-1');
    expect(sessionStorage.getItem('plasma_pending_position')).toBe('125');
    expect(window.location.hash).toBe('#/courses');
  });

  it('shows a resumable mini-player snapshot and routes back to the active topic', async () => {
    await loadApp();

    window.OpenCourseDeck.MiniPlayer.show({
      queue: [
        { title: 'Loaded lecture', topicId: 'topic-1', courseId: 'course-a', courseTitle: 'Cardiology', src: 'https://example.test/a.mp4' },
        { title: 'Second lecture', topicId: 'topic-2', courseId: 'course-a', courseTitle: 'Cardiology', src: 'https://example.test/b.mp4' },
      ],
      queueIndex: 1,
      currentTime: 30,
      duration: 120,
      playing: false,
      playbackRate: 1.25,
    });

    const mini = document.querySelector('[data-mini-player]');
    expect(mini.textContent).toContain('Second lecture');
    expect(mini.textContent).toContain('0:30 / 2:00');
    expect(mini.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('25');

    mini.querySelector('[data-mini-resume]').click();

    expect(sessionStorage.getItem('plasma_pending_topic')).toBe('topic-2');
    expect(sessionStorage.getItem('plasma_pending_position')).toBe('30');
    expect(JSON.parse(sessionStorage.getItem('plasma_pending_course_session'))).toEqual(expect.objectContaining({
      queueIndex: 1,
      currentTime: 30,
      playbackRate: 1.25,
      queue: [expect.objectContaining({ topicId: 'topic-1' }), expect.objectContaining({ topicId: 'topic-2' })],
    }));
    expect(window.location.hash).toBe('#/courses');
    expect(document.querySelector('[data-mini-player]')).toBeNull();
  });

  it('opens saved timestamp bookmarks at their recorded playback position', async () => {
    await loadApp();
    window.DB = {
      getAllTimestamps: vi.fn(async () => [
        { id: 'ts-1', topicId: 'topic-1', title: 'Saved checkpoint', position: 125, updatedAt: 30 },
      ]),
      getAllNotes: vi.fn(async () => []),
      getAllAnnotations: vi.fn(async () => []),
    };

    await window.OpenCourseDeck.Views.bookmarks();
    await vi.waitFor(() => expect(document.querySelector('[data-bookmark-id="ts-1"] a')).toBeTruthy());
    document.querySelector('[data-bookmark-id="ts-1"] a').click();

    expect(sessionStorage.getItem('plasma_pending_topic')).toBe('topic-1');
    expect(sessionStorage.getItem('plasma_pending_position')).toBe('125');
    expect(window.location.hash).toBe('#/courses');
  });

  it('seeks pending course timestamp handoffs after loading the topic', async () => {
    await loadApp();
    sessionStorage.removeItem('plasma_pending_course_session');
    const seekTo = vi.fn();
    const loadPlaylist = vi.fn();
    const media = { addEventListener: vi.fn() };
    window.OpenCourseDeck.Player = {
      init: vi.fn(() => {
        document.getElementById('course-player')._pdPlayer = {
          loadPlaylist,
          seekTo,
          _media: media,
          on: vi.fn(),
          off: vi.fn(),
          queue: [],
          trackIndex: 0,
        };
      }),
      destroyAll: vi.fn(),
    };
    window.DB = { getProgress: vi.fn(async () => null), saveProgress: vi.fn(async () => true) };
    window.DataStore = {
      init: vi.fn(async () => {}),
      allCourses: vi.fn(() => [{ id: 'course-a', title: 'Cardiology' }]),
      allTopics: vi.fn(() => [
        {
          topicId: 'topic-1',
          courseId: 'course-a',
          title: 'Loaded lecture',
          videos: ['https://example.test/video.mp4'],
          chapters: [{ time: 0, title: 'Intro' }],
          transcript: [{ start: 5, text: 'Transcript line' }],
          captions: [{ start: 5, end: 8, text: 'Caption line' }],
          captionTracks: [{ src: 'https://example.test/captions.vtt', label: 'English' }],
        },
      ]),
    };
    sessionStorage.setItem('plasma_pending_topic', 'topic-1');
    sessionStorage.setItem('plasma_pending_position', '95');

    await window.OpenCourseDeck.Views.courses();
    await vi.advanceTimersByTimeAsync(140);

    expect(loadPlaylist).toHaveBeenCalledWith([
      expect.objectContaining({
        topicId: 'topic-1',
        chapters: [{ time: 0, title: 'Intro' }],
        transcript: [{ start: 5, text: 'Transcript line' }],
        captions: [{ start: 5, end: 8, text: 'Caption line' }],
        captionTracks: [{ src: 'https://example.test/captions.vtt', label: 'English' }],
      }),
    ], true);
    expect(seekTo).toHaveBeenCalledWith(95);
    expect(media.addEventListener).toHaveBeenCalledWith('loadedmetadata', expect.any(Function), { once: true });
    expect(sessionStorage.getItem('plasma_pending_topic')).toBeNull();
    expect(sessionStorage.getItem('plasma_pending_position')).toBeNull();
  });

  it('restores pending full course sessions before falling back to single-topic autoplay', async () => {
    await loadApp();
    const restoreSnapshot = vi.fn(() => true);
    window.OpenCourseDeck.Player = {
      init: vi.fn(() => {
        document.getElementById('course-player')._pdPlayer = {
          restoreSnapshot,
          on: vi.fn(),
          off: vi.fn(),
        };
      }),
      destroyAll: vi.fn(),
    };
    window.DB = { getProgress: vi.fn(async () => null), saveProgress: vi.fn(async () => true) };
    window.DataStore = {
      init: vi.fn(async () => {}),
      allCourses: vi.fn(() => [{ id: 'course-a', title: 'Cardiology' }]),
      allTopics: vi.fn(() => [
        { topicId: 'topic-1', courseId: 'course-a', title: 'Loaded lecture', videos: ['https://example.test/video.mp4'] },
        { topicId: 'topic-2', courseId: 'course-a', title: 'Second lecture', videos: ['https://example.test/video-2.mp4'] },
      ]),
    };
    sessionStorage.setItem('plasma_pending_course_session', JSON.stringify({
      queue: [
        { title: 'Loaded lecture', topicId: 'topic-1', courseId: 'course-a', src: 'https://example.test/video.mp4' },
        { title: 'Second lecture', topicId: 'topic-2', courseId: 'course-a', src: 'https://example.test/video-2.mp4' },
      ],
      queueIndex: 1,
      currentTime: 95,
      duration: 300,
      playing: false,
      playbackRate: 1.25,
      track: { title: 'Second lecture', topicId: 'topic-2', courseId: 'course-a' },
    }));

    await window.OpenCourseDeck.Views.courses();
    await vi.advanceTimersByTimeAsync(140);

    expect(restoreSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      queueIndex: 1,
      currentTime: 95,
      playbackRate: 1.25,
      queue: [expect.objectContaining({ topicId: 'topic-1' }), expect.objectContaining({ topicId: 'topic-2' })],
    }));
    expect(sessionStorage.getItem('plasma_pending_course_session')).toBeNull();
  });

  it('hands course player state to the mini-player before destroying route media', async () => {
    await loadApp();
    window.DataStore = {
      init: vi.fn(async () => {}),
      allCourses: vi.fn(() => []),
      allTopics: vi.fn(() => []),
    };
    const snapshot = {
      queue: [{ title: 'Leaving lecture', topicId: 'topic-leave' }],
      queueIndex: 0,
      currentTime: 10,
      duration: 40,
      track: { title: 'Leaving lecture', topicId: 'topic-leave' },
    };
    window.OpenCourseDeck.Player = {
      init: vi.fn(),
      getActiveSnapshot: vi.fn(() => snapshot),
      destroyAll: vi.fn(),
    };

    const controller = await window.OpenCourseDeck.Views.courses();
    controller.unmount();

    expect(window.OpenCourseDeck.Player.getActiveSnapshot).toHaveBeenCalled();
    expect(window.OpenCourseDeck.Player.destroyAll).toHaveBeenCalled();
    expect(document.querySelector('[data-mini-player]').textContent).toContain('Leaving lecture');
  });

  it('keeps the live course player mounted in the mini-player across route changes', async () => {
    await loadApp();
    const destroy = vi.fn();
    const snapshot = {
      queue: [{ title: 'Live lecture', topicId: 'topic-live', courseId: 'course-a' }],
      queueIndex: 0,
      currentTime: 42,
      duration: 120,
      track: { title: 'Live lecture', topicId: 'topic-live', courseId: 'course-a' },
    };
    window.DataStore = {
      init: vi.fn(async () => {}),
      allCourses: vi.fn(() => [{ id: 'course-a', title: 'Cardiology' }]),
      allTopics: vi.fn(() => [{ topicId: 'topic-live', courseId: 'course-a', title: 'Live lecture', videos: ['https://example.test/live.mp4'] }]),
    };
    window.DB = { getProgress: vi.fn(async () => null), saveProgress: vi.fn(async () => true) };
    window.OpenCourseDeck.Player = {
      init: vi.fn(() => {
        document.getElementById('course-player')._pdPlayer = {
          destroy,
          snapshot: vi.fn(() => snapshot),
          on: vi.fn(),
          off: vi.fn(),
        };
      }),
      getActiveSnapshot: vi.fn(() => snapshot),
      destroyAll: vi.fn(),
    };

    const controller = await window.OpenCourseDeck.Views.courses();
    const livePlayer = document.getElementById('course-player');

    controller.unmount();

    expect(window.OpenCourseDeck.Player.destroyAll).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
    expect(document.querySelector('[data-mini-player-live] #course-player')).toBe(livePlayer);
    expect(document.querySelector('[data-mini-player]').textContent).toContain('Live lecture');
  });

  it('reattaches a live mini-player instance when Courses is opened again', async () => {
    await loadApp();
    const livePlayer = document.createElement('div');
    livePlayer.id = 'course-player';
    livePlayer.setAttribute('data-player', '');
    livePlayer._pdPlayer = {
      snapshot: vi.fn(() => ({
        queue: [{ title: 'Live lecture', topicId: 'topic-live', courseId: 'course-a' }],
        queueIndex: 0,
        currentTime: 42,
        duration: 120,
        track: { title: 'Live lecture', topicId: 'topic-live', courseId: 'course-a' },
      })),
      on: vi.fn(),
      off: vi.fn(),
    };
    const dispose = vi.fn();
    livePlayer.dataset.pdProgressBound = 'true';
    window.OpenCourseDeck.MiniPlayer.adoptPlayer(livePlayer, livePlayer._pdPlayer.snapshot(), { dispose });
    window.DataStore = {
      init: vi.fn(async () => {}),
      allCourses: vi.fn(() => [{ id: 'course-a', title: 'Cardiology' }]),
      allTopics: vi.fn(() => [{ topicId: 'topic-live', courseId: 'course-a', title: 'Live lecture', videos: ['https://example.test/live.mp4'] }]),
    };
    window.DB = { getProgress: vi.fn(async () => null), saveProgress: vi.fn(async () => true) };
    window.OpenCourseDeck.Player = {
      init: vi.fn(),
      destroyAll: vi.fn(),
    };

    await window.OpenCourseDeck.Views.courses();

    expect(document.getElementById('course-player')).toBe(livePlayer);
    expect(document.querySelector('[data-mini-player]')).toBeNull();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(livePlayer.dataset.pdProgressBound).toBe('true');
    expect(livePlayer._pdPlayer.on).toHaveBeenCalled();
    expect(window.OpenCourseDeck.Player.init).toHaveBeenCalled();
  });

  it('exposes compact live mini-player queue and transport controls', async () => {
    await loadApp();
    let playing = true;
    const livePlayer = document.createElement('div');
    livePlayer.id = 'course-player';
    livePlayer.setAttribute('data-player', '');
    const queuePanel = document.createElement('div');
    queuePanel.className = 'pd-queue-panel';
    queuePanel.hidden = true;
    livePlayer.appendChild(queuePanel);
    livePlayer._pdPlayer = {
      snapshot: vi.fn(() => ({
        playing,
        queue: [
          { title: 'Live lecture', topicId: 'topic-live', courseId: 'course-a' },
          { title: 'Next lecture', topicId: 'topic-next', courseId: 'course-a' },
        ],
        queueIndex: playing ? 0 : 1,
        currentTime: playing ? 30 : 45,
        duration: 120,
        track: { title: playing ? 'Live lecture' : 'Next lecture', topicId: playing ? 'topic-live' : 'topic-next', courseId: 'course-a' },
      })),
      toggle: vi.fn(() => { playing = !playing; }),
      prev: vi.fn(),
      next: vi.fn(() => { playing = false; }),
      showQueue: vi.fn(() => { queuePanel.hidden = false; }),
      hideQueue: vi.fn(() => { queuePanel.hidden = true; }),
    };

    window.OpenCourseDeck.MiniPlayer.adoptPlayer(livePlayer, livePlayer._pdPlayer.snapshot());

    document.querySelector('[data-mini-next]').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(livePlayer._pdPlayer.next).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-mini-player]').textContent).toContain('Next lecture');

    document.querySelector('[data-mini-play]').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(livePlayer._pdPlayer.toggle).toHaveBeenCalledTimes(1);

    document.querySelector('[data-mini-prev]').click();
    expect(livePlayer._pdPlayer.prev).toHaveBeenCalledTimes(1);

    document.querySelector('[data-mini-queue]').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(livePlayer._pdPlayer.showQueue).toHaveBeenCalledTimes(1);
    document.querySelector('[data-mini-queue]').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(livePlayer._pdPlayer.hideQueue).toHaveBeenCalledTimes(1);
  });

  it('requests Picture-in-Picture when a playing course video scrolls out of view', async () => {
    await loadApp();
    const requestActivePictureInPicture = vi.fn(async () => ({ active: true, supported: true }));
    window.DataStore = {
      init: vi.fn(async () => {}),
      allCourses: vi.fn(() => [{ id: 'course-a', title: 'Cardiology' }]),
      allTopics: vi.fn(() => [{ topicId: 'topic-live', courseId: 'course-a', title: 'Live lecture', videos: ['https://example.test/live.mp4'] }]),
    };
    window.DB = { getProgress: vi.fn(async () => null), saveProgress: vi.fn(async () => true) };
    window.OpenCourseDeck.Player = {
      init: vi.fn(() => {
        document.getElementById('course-player')._pdPlayer = {
          snapshot: vi.fn(() => ({
            playing: true,
            queue: [{ title: 'Live lecture', topicId: 'topic-live', courseId: 'course-a' }],
            queueIndex: 0,
            currentTime: 30,
            duration: 120,
            track: { title: 'Live lecture', topicId: 'topic-live', courseId: 'course-a' },
          })),
          on: vi.fn(),
          off: vi.fn(),
        };
      }),
      requestActivePictureInPicture,
    };

    const controller = await window.OpenCourseDeck.Views.courses();
    const player = document.getElementById('course-player');
    expect(window.IntersectionObserver).toHaveBeenCalled();

    intersectionCallbacks.at(-1)([{ target: player, isIntersecting: false, intersectionRatio: 0 }]);
    await Promise.resolve();
    intersectionCallbacks.at(-1)([{ target: player, isIntersecting: false, intersectionRatio: 0 }]);
    await Promise.resolve();

    expect(requestActivePictureInPicture).toHaveBeenCalledTimes(1);

    intersectionCallbacks.at(-1)([{ target: player, isIntersecting: true, intersectionRatio: 0.8 }]);
    intersectionCallbacks.at(-1)([{ target: player, isIntersecting: false, intersectionRatio: 0 }]);
    await Promise.resolve();

    expect(requestActivePictureInPicture).toHaveBeenCalledTimes(2);
    controller.unmount();
  });

  it('does not auto-request Picture-in-Picture for a paused course video', async () => {
    await loadApp();
    const requestActivePictureInPicture = vi.fn(async () => ({ active: true, supported: true }));
    window.DataStore = {
      init: vi.fn(async () => {}),
      allCourses: vi.fn(() => [{ id: 'course-a', title: 'Cardiology' }]),
      allTopics: vi.fn(() => [{ topicId: 'topic-live', courseId: 'course-a', title: 'Live lecture', videos: ['https://example.test/live.mp4'] }]),
    };
    window.DB = { getProgress: vi.fn(async () => null), saveProgress: vi.fn(async () => true) };
    window.OpenCourseDeck.Player = {
      init: vi.fn(() => {
        document.getElementById('course-player')._pdPlayer = {
          snapshot: vi.fn(() => ({
            playing: false,
            track: { title: 'Live lecture', topicId: 'topic-live', courseId: 'course-a' },
          })),
          on: vi.fn(),
          off: vi.fn(),
        };
      }),
      requestActivePictureInPicture,
    };

    await window.OpenCourseDeck.Views.courses();
    const player = document.getElementById('course-player');
    intersectionCallbacks.at(-1)([{ target: player, isIntersecting: false, intersectionRatio: 0 }]);
    await Promise.resolve();

    expect(requestActivePictureInPicture).not.toHaveBeenCalled();
  });

  it('saves timestamp bookmarks and linked notes from the course player', async () => {
    await loadApp();
    const saveTimestamp = vi.fn(async () => true);
    const saveNote = vi.fn(async () => ({ id: 'note-ts-1' }));
    window.DB = {
      getProgress: vi.fn(async () => null),
      saveTimestamp,
      saveNote,
    };
    window.DataStore = {
      init: vi.fn(async () => {}),
      allCourses: vi.fn(() => [{ id: 'course-a', title: 'Cardiology' }]),
      allTopics: vi.fn(() => [
        { topicId: 'topic-1', courseId: 'course-a', title: 'Loaded lecture', videos: ['https://example.test/video.mp4'] },
      ]),
    };

    await window.OpenCourseDeck.Views.courses();
    const player = document.getElementById('course-player');
    player._pdPlayer = {
      snapshot: vi.fn(() => ({
        track: { title: 'Loaded lecture', topicId: 'topic-1', courseId: 'course-a' },
        currentTime: 95,
        duration: 300,
      })),
      queue: [{ title: 'Loaded lecture', topicId: 'topic-1', courseId: 'course-a' }],
      trackIndex: 0,
      on: vi.fn(),
      off: vi.fn(),
    };

    document.querySelector('[data-timestamp-note-title]').value = 'Key ECG moment';
    document.querySelector('[data-timestamp-note-body]').value = '<script>alert(1)</script>\nWatch the rhythm change.';
    document.querySelector('[data-save-timestamp-note]').click();

    await vi.waitFor(() => expect(saveTimestamp).toHaveBeenCalledTimes(1));
    expect(saveNote).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Key ECG moment',
      topicId: 'topic-1',
      courseId: 'course-a',
      position: 95,
      tags: ['timestamp'],
    }));
    expect(saveNote.mock.calls[0][0].content).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(saveTimestamp).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Key ECG moment',
      topicTitle: 'Loaded lecture',
      topicId: 'topic-1',
      courseId: 'course-a',
      position: 95,
      duration: 300,
      noteId: 'note-ts-1',
    }));
    expect(document.querySelector('[data-timestamp-note-status]').textContent).toContain('1:35');
  });

  it('authors chapter and transcript cues from the course player', async () => {
    await loadApp();
    const saveSetting = vi.fn(async () => true);
    window.DB = {
      getSetting: vi.fn(async () => ({
        'topic-1': {
          chapters: [{ time: 12, title: 'Existing chapter' }],
          transcript: [{ start: 14, text: 'Existing line' }],
        },
      })),
      getProgress: vi.fn(async () => null),
      saveProgress: vi.fn(async () => true),
      saveSetting,
    };
    window.DataStore = {
      init: vi.fn(async () => {}),
      allCourses: vi.fn(() => [{ id: 'course-a', title: 'Cardiology' }]),
      allTopics: vi.fn(() => [
        { topicId: 'topic-1', courseId: 'course-a', title: 'Loaded lecture', videos: ['https://example.test/video.mp4'] },
      ]),
    };

    await window.OpenCourseDeck.Views.courses();
    const activeTrack = {
      title: 'Loaded lecture',
      topicId: 'topic-1',
      courseId: 'course-a',
      chapters: [{ time: 12, title: 'Existing chapter' }],
      transcript: [{ start: 14, text: 'Existing line' }],
    };
    const player = document.getElementById('course-player');
    player._pdPlayer = {
      snapshot: vi.fn(() => ({
        track: activeTrack,
        currentTime: 95,
        duration: 300,
        queueIndex: 0,
      })),
      queue: [activeTrack],
      trackIndex: 0,
      showChapters: vi.fn(),
      showTranscript: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    document.querySelector('[data-learning-marker-text]').value = 'QRS morphology';
    document.querySelector('[data-save-chapter-cue]').click();

    await vi.waitFor(() => expect(saveSetting).toHaveBeenCalledWith('plasma-course-media-cues', expect.objectContaining({
      'topic-1': expect.objectContaining({
        chapters: expect.arrayContaining([expect.objectContaining({ time: 95, title: 'QRS morphology', authored: true })]),
      }),
    })));
    await vi.waitFor(() => expect(activeTrack.chapters).toEqual(expect.arrayContaining([
      expect.objectContaining({ time: 95, title: 'QRS morphology' }),
    ])));
    expect(player._pdPlayer.showChapters).toHaveBeenCalledTimes(1);

    document.querySelector('[data-learning-marker-text]').value = 'Axis deviation becomes clear.';
    document.querySelector('[data-save-transcript-cue]').click();

    await vi.waitFor(() => expect(saveSetting).toHaveBeenLastCalledWith('plasma-course-media-cues', expect.objectContaining({
      'topic-1': expect.objectContaining({
        chapters: expect.arrayContaining([expect.objectContaining({ title: 'QRS morphology' })]),
        transcript: expect.arrayContaining([expect.objectContaining({ start: 95, text: 'Axis deviation becomes clear.', authored: true })]),
      }),
    })));
    await vi.waitFor(() => expect(activeTrack.transcript).toEqual(expect.arrayContaining([
      expect.objectContaining({ start: 95, text: 'Axis deviation becomes clear.' }),
    ])));
    expect(player._pdPlayer.showTranscript).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-learning-marker-status]').textContent).toContain('1:35');

    document.querySelector('[data-review-learning-cues]').click();
    expect(document.querySelector('[data-learning-marker-list]').textContent).toContain('QRS morphology');
    Array.from(document.querySelectorAll('[data-learning-marker-list] [data-delete-learning-cue="chapters"]'))
      .find(button => button.closest('.learning-marker-row')?.textContent.includes('QRS morphology'))
      .click();

    await vi.waitFor(() => expect(saveSetting.mock.calls.at(-1)[1]['topic-1'].chapters).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'QRS morphology' }),
    ])));
    await vi.waitFor(() => expect(activeTrack.chapters).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'QRS morphology' }),
    ])));
    expect(document.querySelector('[data-learning-marker-list]').textContent).not.toContain('QRS morphology');

    document.querySelector('[data-export-learning-cues]').click();
    expect(document.querySelector('[data-learning-marker-json]').value).toContain('Axis deviation becomes clear.');

    document.querySelector('[data-learning-marker-json]').value = JSON.stringify({
      'topic-1': {
        chapters: [{ time: 140, title: 'Imported chapter' }],
        transcript: [{ start: 150, text: 'Imported transcript line' }],
      },
    });
    document.querySelector('[data-import-learning-cues]').click();

    await vi.waitFor(() => expect(saveSetting.mock.calls.at(-1)[1]['topic-1'].chapters).toEqual(expect.arrayContaining([
      expect.objectContaining({ time: 140, title: 'Imported chapter' }),
    ])));
    await vi.waitFor(() => expect(activeTrack.chapters).toEqual(expect.arrayContaining([
      expect.objectContaining({ time: 140, title: 'Imported chapter' }),
    ])));
    expect(activeTrack.transcript).toEqual(expect.arrayContaining([
      expect.objectContaining({ start: 150, text: 'Imported transcript line' }),
    ]));

    document.querySelector('[data-export-active-learning-cues]').click();
    const activeJson = JSON.parse(document.querySelector('[data-learning-marker-json]').value);
    expect(activeJson.topicId).toBe('topic-1');
    expect(activeJson.transcript).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: 'Imported transcript line' }),
    ]));

    document.querySelector('[data-learning-marker-json]').value = JSON.stringify({
      topicId: 'topic-1',
      chapters: [
        { time: 500, title: 'Late chapter' },
        { time: 30, title: 'Bulk chapter' },
        { time: 30, title: 'Bulk chapter' },
        { time: 20, title: ' ' },
      ],
      transcript: [
        { start: 35, text: 'Bulk transcript' },
        { start: 35, text: 'Bulk transcript' },
        { start: -12, text: 'Opening line' },
      ],
    });
    document.querySelector('[data-apply-active-learning-cues]').click();

    await vi.waitFor(() => expect(saveSetting.mock.calls.at(-1)[1]['topic-1']).toEqual(expect.objectContaining({
      chapters: [
        expect.objectContaining({ time: 30, title: 'Bulk chapter' }),
        expect.objectContaining({ time: 300, title: 'Late chapter' }),
      ],
      transcript: [
        expect.objectContaining({ start: 0, text: 'Opening line' }),
        expect.objectContaining({ start: 35, text: 'Bulk transcript' }),
      ],
    })));
    await vi.waitFor(() => expect(activeTrack.chapters).toEqual(expect.arrayContaining([
      expect.objectContaining({ time: 30, title: 'Bulk chapter' }),
      expect.objectContaining({ time: 300, title: 'Late chapter' }),
    ])));
    expect(document.querySelector('[data-learning-marker-list]').textContent).toContain('Bulk transcript');
    expect(document.querySelector('[data-learning-marker-status]').textContent).toContain('duplicates removed');
    expect(document.querySelector('[data-learning-marker-status]').textContent).toContain('time clamped');
    expect(document.querySelector('[data-learning-marker-status]').textContent).toContain('invalid cue skipped');

    window.OpenCourseDeck.bus.emit('sync:message', {
      kind: 'setting',
      action: 'save',
      record: {
        key: 'plasma-course-media-cues',
        value: {
          'topic-1': {
            chapters: [{ time: 45, title: 'Synced chapter', authored: true }],
            transcript: [{ start: 50, text: 'Synced transcript', authored: true }],
          },
        },
      },
      source: 'external-tab',
    });

    await vi.waitFor(() => expect(document.querySelector('[data-learning-marker-status]').textContent).toBe('Learning cues refreshed from another tab.'));
    expect(activeTrack.chapters).toEqual(expect.arrayContaining([
      expect.objectContaining({ time: 45, title: 'Synced chapter' }),
    ]));
    expect(activeTrack.chapters).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Bulk chapter' }),
    ]));
  });

  it('refreshes synced course progress without disturbing the live player queue', async () => {
    await loadApp();
    const progressByTopic = {
      'topic-1': { topicId: 'topic-1', courseId: 'course-a', status: 'not-started', percent: 0 },
    };
    window.DB = {
      getSetting: vi.fn(async () => null),
      getProgress: vi.fn(async topicId => progressByTopic[topicId] || null),
      saveProgress: vi.fn(async () => true),
    };
    window.DataStore = {
      init: vi.fn(async () => {}),
      allCourses: vi.fn(() => [{ id: 'course-a', title: 'Cardiology' }]),
      allTopics: vi.fn(() => [
        { topicId: 'topic-1', courseId: 'course-a', title: 'Loaded lecture', videos: ['https://example.test/video.mp4'] },
        { topicId: 'topic-2', courseId: 'course-a', title: 'Rhythm PDF', pdfs: ['https://example.test/rhythm.pdf'] },
      ]),
    };
    const syncEvents = [];
    window.OpenCourseDeck.bus.on('player:sync-refresh', payload => syncEvents.push(payload));

    const controller = await window.OpenCourseDeck.Views.courses();
    await vi.waitFor(() => expect(document.querySelector('[data-topic-id="topic-1"] [data-status]').textContent).toBe('Not started'));

    const track = { title: 'Loaded lecture', topicId: 'topic-1', courseId: 'course-a' };
    const loadPlaylist = vi.fn();
    const restoreSnapshot = vi.fn();
    document.getElementById('course-player')._pdPlayer = {
      snapshot: vi.fn(() => ({
        track,
        queue: [track, { title: 'Next lecture', topicId: 'topic-2', courseId: 'course-a' }],
        queueIndex: 0,
        currentTime: 42,
        duration: 120,
        playing: true,
      })),
      queue: [track],
      trackIndex: 0,
      loadPlaylist,
      restoreSnapshot,
      on: vi.fn(),
      off: vi.fn(),
    };
    progressByTopic['topic-1'] = { topicId: 'topic-1', courseId: 'course-a', status: 'done', percent: 100 };

    window.OpenCourseDeck.bus.emit('sync:message', {
      kind: 'progress',
      action: 'save',
      record: progressByTopic['topic-1'],
      source: 'external-tab',
    });

    await vi.waitFor(() => expect(document.querySelector('[data-topic-id="topic-1"] [data-status]').textContent).toBe('Done'));
    expect(loadPlaylist).not.toHaveBeenCalled();
    expect(restoreSnapshot).not.toHaveBeenCalled();
    expect(syncEvents.at(-1)).toEqual(expect.objectContaining({
      kind: 'progress',
      topicId: 'topic-1',
      playbackPreserved: true,
      queuePreserved: true,
    }));
    expect(document.querySelector('[data-timestamp-note-status]').textContent).toBe('Progress refreshed from another tab.');

    controller.unmount();
  });

  it('sanitizes route templates without allowing template tags', async () => {
    window.DOMPurify = {
      sanitize: vi.fn((html) => String(html).replace(/<template[\s\S]*?<\/template>/gi, '')),
    };
    await loadApp();

    await window.OpenCourseDeck.Views.help();

    const options = window.DOMPurify.sanitize.mock.calls.at(-1)[1];
    expect(options.ADD_TAGS).toContain('canvas');
    expect(options.ADD_TAGS).not.toContain('template');
    expect(options.FORBID_TAGS).toContain('template');

    delete window.DOMPurify;
  });

  it('uses a defensive route sanitizer when DOMPurify is unavailable', async () => {
    await loadApp();

    window.OpenCourseDeck.Views.notFound(
      '<img src=x onerror="window.__fallbackXss = true"><a href="javascript:alert(1)">bad</a><script>window.__scriptXss = true</script>'
    );

    const view = document.getElementById('view-container');
    const img = view.querySelector('img');
    const link = view.querySelector('a');
    expect(view.querySelector('script')).toBeNull();
    expect(img?.getAttribute('onerror')).toBeNull();
    expect(link?.getAttribute('href')).toBeNull();
    expect(window.__fallbackXss).toBeUndefined();
    expect(window.__scriptXss).toBeUndefined();
  });

  it('uses the hardened PDF route fallback sanitizer when DOMPurify is unavailable', async () => {
    const { sanitizePdfRouteHtml } = await import('../src/views/pdfRoute.js');

    const clean = sanitizePdfRouteHtml(`
      <section onclick="window.__pdfRouteClick = true">
        <template><img src=x onerror="window.__pdfTemplate = true"></template>
        <iframe src="https://example.test/embed"></iframe>
        <a href="javascript:window.__pdfHref = true">Run</a>
        <img src="data:text/html,<script>window.__pdfImg = true</script>" onerror="window.__pdfImgError = true">
        <canvas tabindex="0"></canvas>
      </section>
    `);
    const host = document.createElement('div');
    host.innerHTML = clean;

    expect(host.querySelector('template')).toBeNull();
    expect(host.querySelector('iframe')).toBeNull();
    expect(host.querySelector('[onclick]')).toBeNull();
    expect(host.querySelector('[onerror]')).toBeNull();
    expect(host.querySelector('a')?.getAttribute('href')).toBeNull();
    expect(host.querySelector('img')?.getAttribute('src')).toBeNull();
    expect(host.querySelector('canvas')).not.toBeNull();
  });

  it('rejects unsafe API fetch URLs before calling fetch', async () => {
    await loadApp();
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    await expect(window.OpenCourseDeck.API.get('javascript:alert(1)')).rejects.toThrow('Unsafe fetch URL');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.OpenCourseDeck.safeFetchUrl('', '/api/courses')).toContain('/api/courses');
    expect(window.OpenCourseDeck.safeFetchUrl('', 'javascript:alert(1)')).toBeNull();
  });
  it('service worker update prompt tells the waiting worker to take over', async () => {
    delete document.documentElement.dataset.pdSwBound;
    delete window.__plasmaSwUpdateAccepted;
    delete window.__plasmaSwReloading;
    await loadApp();

    const postMessage = vi.fn();
    const registration = { waiting: { postMessage } };
    document.dispatchEvent(new CustomEvent('plasma:sw-update-ready', { detail: { registration } }));

    const reloadBtn = document.querySelector('[data-sw-reload]');
    expect(reloadBtn).toBeTruthy();

    reloadBtn.click();

    // The worker is generated with skipWaiting:false, so a bare
    // location.reload() would keep the OLD worker in control and the user
    // would reload straight back into the stale build. The click must post
    // SKIP_WAITING and arm the controllerchange reload gate.
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(window.__plasmaSwUpdateAccepted).toBe(true);
  });

  it('does not arm the reload gate when there is no waiting worker', async () => {
    delete document.documentElement.dataset.pdSwBound;
    delete window.__plasmaSwUpdateAccepted;
    delete window.__plasmaSwReloading;
    await loadApp();

    // registration.waiting is absent (update already activated, or the
    // registration went away): the handler must not claim an update was
    // accepted, or the controllerchange gate in src/index.js would reload on
    // an unrelated controller change.
    document.dispatchEvent(new CustomEvent('plasma:sw-update-ready', { detail: { registration: {} } }));
    const reloadBtn = document.querySelector('[data-sw-reload]');
    expect(reloadBtn).toBeTruthy();

    expect(window.__plasmaSwUpdateAccepted).toBeFalsy();
  });
});

