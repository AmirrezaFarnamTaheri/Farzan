const path = require('path');
const { pathToFileURL } = require('url');
const { JSDOM } = require('jsdom');

async function main() {
  const dom = new JSDOM(`
    <!doctype html>
    <html>
      <body>
        <div id="ocd-app">
          <main id="main-content" class="main-content" tabindex="-1">
            <div id="view-container"></div>
          </main>
          <div id="aria-announcer"></div>
        </div>
      </body>
    </html>
  `, {
    url: 'http://127.0.0.1/#/help',
    pretendToBeVisual: true,
  });

  const { window } = dom;
  const runtimeErrors = [];
  const describeRuntimeIssue = (issue) => {
    if (!issue) return 'unknown runtime issue';
    if (issue.message) return issue.message;
    if (issue.reason?.message) return issue.reason.message;
    if (issue.error?.message) return issue.error.message;
    return String(issue.reason || issue.error || issue);
  };
  window.addEventListener('error', (event) => {
    runtimeErrors.push(`error: ${describeRuntimeIssue(event)}`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    runtimeErrors.push(`unhandledrejection: ${describeRuntimeIssue(event)}`);
  });
  Object.defineProperty(window.document, 'readyState', {
    configurable: true,
    get: () => 'complete',
  });
  const previous = {
    window: global.window,
    document: global.document,
    navigator: global.navigator,
    location: global.location,
    HTMLElement: global.HTMLElement,
    HTMLCanvasElement: global.HTMLCanvasElement,
    CustomEvent: global.CustomEvent,
    Event: global.Event,
    HashChangeEvent: global.HashChangeEvent,
    Node: global.Node,
    sessionStorage: global.sessionStorage,
    localStorage: global.localStorage,
    performance: global.performance,
    MutationObserver: global.MutationObserver,
    ResizeObserver: global.ResizeObserver,
    requestAnimationFrame: global.requestAnimationFrame,
    cancelAnimationFrame: global.cancelAnimationFrame,
    getComputedStyle: global.getComputedStyle,
    matchMedia: global.matchMedia,
    IntersectionObserver: global.IntersectionObserver,
  };

  global.window = window;
  global.document = window.document;
  Object.defineProperty(global, 'navigator', { configurable: true, writable: true, value: window.navigator });
  global.location = window.location;
  global.HTMLElement = window.HTMLElement;
  global.HTMLCanvasElement = window.HTMLCanvasElement;
  global.CustomEvent = window.CustomEvent;
  global.Event = window.Event;
  global.HashChangeEvent = window.HashChangeEvent;
  global.Node = window.Node;
  global.sessionStorage = window.sessionStorage;
  global.localStorage = window.localStorage;
  global.performance = window.performance;
  global.MutationObserver = window.MutationObserver;
  global.getComputedStyle = window.getComputedStyle.bind(window);

  global.requestAnimationFrame = window.requestAnimationFrame = (cb) => {
    cb(Date.now());
    return 1;
  };
  global.cancelAnimationFrame = window.cancelAnimationFrame = () => {};
  global.matchMedia = window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  global.IntersectionObserver = window.IntersectionObserver = function IntersectionObserver() {
    this.observe = () => {};
    this.unobserve = () => {};
    this.disconnect = () => {};
  };
  global.ResizeObserver = window.ResizeObserver = function ResizeObserver() {
    this.observe = () => {};
    this.unobserve = () => {};
    this.disconnect = () => {};
  };
  window.HTMLCanvasElement.prototype.getContext = () => ({
    setTransform() {},
    scale() {},
    clearRect() {},
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    arc() {},
    fill() {},
    save() {},
    restore() {},
    translate() {},
  });

  window.PlasmaNotesApp = {
    init() {},
    flushPendingSave() {},
    destroy() {},
  };
  window.PlasmaPDFInit = () => {};
  window.PlasmaPDFDestroy = () => {};
  window.OpenCourseDeck = {
    bus: {
      emit() {},
      on() {},
      off() {},
    },
    loadFeatures: async () => [],
    Canvas: {
      init() {},
      destroy() {},
    },
    ProgressStatsInit() {},
    ProgressStats: {
      destroy() {},
    },
    Player: {
      init() {},
      destroyAll() {},
      getActiveSnapshot() { return null; },
    },
  };
  window.DataStore = {
    init: async () => true,
    allCourses: () => [{ id: 'course-1', title: 'Course One' }],
    allTopics: () => [{
      topicId: 'topic-1',
      courseId: 'course-1',
      courseTitle: 'Course One',
      sourceIndex: 0,
      sourceLabel: 'Source',
      title: 'Topic One',
      videos: ['https://example.test/video.mp4'],
      pdfs: ['https://example.test/doc.pdf'],
    }],
  };
  window.DB = {
    getProgress: async () => null,
    getAllProgress: async () => [],
    getAllNotes: async () => [],
    getAllAnnotations: async () => [],
    getAllTimestamps: async () => [],
    getAllFolders: async () => [],
    getSetting: async () => null,
    saveProgress: async () => true,
  };

  const appUrl = pathToFileURL(path.join(__dirname, '..', 'app.js')).href;
  await import(appUrl);

  const waitFor = async (predicate, label) => {
    const timeout = Date.now() + 5000;
    while (Date.now() < timeout) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const routeRoot = window.document.getElementById('main-content');
    const currentTitle = window.document.querySelector('.page-title')?.textContent || '';
    const announcerText = window.document.getElementById('aria-announcer')?.textContent || '';
    throw new Error(`Timed out waiting for ${label}; hash=${window.location.hash}; title=${currentTitle}; announcer=${announcerText}; main=${String(routeRoot?.innerHTML || '').slice(0, 400)}`);
  };

  await waitFor(() => window.OpenCourseDeck?.Router, 'router');

  const navigate = async (hash, expectedTitle, selector = '.page-title') => {
    window.location.hash = hash;
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    await waitFor(() => window.document.querySelector(selector)?.textContent === expectedTitle, expectedTitle);
  };

  await navigate('#/home', 'Your study command deck is ready.', '.home-title');
  await navigate('#/courses', 'Courses');
  await navigate('#/notes', 'Notes');
  await navigate('#/pdf', 'PDF');
  await navigate('#/studio', 'Studio');
  await navigate('#/progress', 'Progress');
  await navigate('#/help', 'Help');

  const announcer = window.document.getElementById('aria-announcer');
  await waitFor(
    () => announcer && String(announcer.textContent || '').includes('Help'),
    'Help route announcement',
  );

  if (runtimeErrors.length) {
    throw new Error(`Route runtime issue(s): ${runtimeErrors.join(' | ')}`);
  }

  console.log('[browser-smoke] OK — route boot and navigation succeeded.');

  dom.window.close();
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      try { delete global[key]; } catch {}
      continue;
    }
    if (key === 'navigator') {
      Object.defineProperty(global, 'navigator', { configurable: true, writable: true, value });
    } else {
      global[key] = value;
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[browser-smoke] FAIL:', error?.message || error);
    process.exit(1);
  });
}

module.exports = {
  main,
};
