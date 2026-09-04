import { describe, expect, it, vi } from 'vitest';

async function loadApp() {
  // Detach the previous instance's hashchange listener (see app-core.test.js).
  try { window.OpenCourseDeck?.Router?.destroy?.(); } catch {}
  vi.resetModules();
  document.body.innerHTML = `
    <div id="ocd-app">
      <main id="main-content" tabindex="-1">
        <div id="view-container"></div>
      </main>
      <div id="aria-announcer"></div>
    </div>
  `;
  window.location.hash = '#/';
  
  // Mock necessary globals
  window.matchMedia = vi.fn(() => ({ 
    matches: false, 
    addEventListener: vi.fn(), 
    removeEventListener: vi.fn() 
  }));
  window.requestAnimationFrame = vi.fn(cb => { cb(); return 1; });
  window.cancelAnimationFrame = vi.fn();
  window.IntersectionObserver = vi.fn(function() { 
    this.observe = vi.fn(); 
    this.unobserve = vi.fn(); 
    this.disconnect = vi.fn(); 
  });
  
  window.DataStore = {
    init: vi.fn(async () => true),
    allCourses: vi.fn(() => [{ id: 'course-1', title: 'Course One' }]),
    allTopics: vi.fn(() => [{ 
      topicId: 'topic-1', 
      courseId: 'course-1', 
      title: 'Topic One',
      videos: [],
      pdfs: []
    }]),
  };
  
  window.DB = {
    getProgress: vi.fn(async () => null),
    getAllProgress: vi.fn(async () => []),
    getAllNotes: vi.fn(async () => []),
    getAllTimestamps: vi.fn(async () => []),
    getSetting: vi.fn(async () => null),
    saveSetting: vi.fn(async () => true),
    saveProgress: vi.fn(async () => true),
    saveTimestamp: vi.fn(async () => true),
    saveNote: vi.fn(async (n) => n),
    clearAll: vi.fn(async () => true),
    save: vi.fn(async () => true),
    get: vi.fn(async () => null),
  };

  // Ensure localStorage exists
  if (!window.localStorage) {
    const store = {};
    window.localStorage = {
      getItem: vi.fn((key) => store[key] ?? null),
      setItem: vi.fn((key, val) => { store[key] = String(val); }),
      removeItem: vi.fn((key) => { delete store[key]; }),
      clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
      get length() { return Object.keys(store).length; },
      key: vi.fn((i) => Object.keys(store)[i] ?? null),
    };
  }

  // Mock DOMPurify
  window.DOMPurify = { sanitize: (s) => s };

  await import('../app.js');
  // Allow app.js up to 3s to initialize Router; fallback mock will be set up if it times out
  await vi.waitFor(() => expect(window.OpenCourseDeck.Router).toBeTruthy(), { timeout: 3000 });
}

async function navigate(hash) {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));

  // Wait for route:ready if the real bus is available (app.js initialized properly)
  const bus = window.OpenCourseDeck?.bus;
  const isMockBus = bus && typeof bus.on === 'function' && bus.on.mock;
  if (bus && typeof bus.on === 'function' && !isMockBus) {
    await new Promise(resolve => {
      const handler = (data) => {
        if (data.hash === hash) {
          bus.off('route:ready', handler);
          resolve();
        }
      };
      bus.on('route:ready', handler);
    });
    return;
  }

  // Fallback: give the DOM time to render
  await new Promise(r => setTimeout(r, 100));
}

describe('Route Health Suite', () => {
  const routes = [
    '#/home',
    '#/courses',
    '#/notes',
    '#/pdf',
    '#/studio',
    '#/progress',
    '#/help',
    '#/settings',
    '#/my-courses',
    '#/materials',
    '#/tags',
    '#/playlists',
    '#/bookmarks',
    '#/achievements'
  ];

  it('renders every major route without console errors or DOM coercion leaks', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Attempt to load the app, fallback to Router mock if app.js init fails
    try {
      await loadApp();
    } catch (initErr) {
      console.warn('[route-health] app.js init failed, using Router mock:', initErr);
      // Ensure Router is available for navigation tests
      if (!window.OpenCourseDeck?.Router) {
        window.OpenCourseDeck = window.OpenCourseDeck || {};
        window.OpenCourseDeck.Router = { navigate: vi.fn() };
        window.OpenCourseDeck.bus = window.OpenCourseDeck.bus || {
          on: vi.fn(),
          off: vi.fn(),
          emit: vi.fn(),
        };
      }
    }

    for (const route of routes) {
      await navigate(route);
      const container = document.getElementById('view-container');
      
      expect(container.innerHTML).not.toContain('[object HTML');
      expect(container.innerHTML).not.toContain('undefined');
      expect(container.innerHTML).not.toContain('null');
      expect(container.children.length).toBeGreaterThan(0);
    }

    if (errorSpy.mock.calls.length > 0) {
      console.error('Captured console errors during route health check:', errorSpy.mock.calls);
    }
    expect(errorSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  }, 30000);
});
