import { describe, expect, it, vi } from 'vitest';

async function loadApp() {
  vi.resetModules();
  document.body.innerHTML = `
    <div id="plasma-app">
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
    saveProgress: vi.fn(async () => true),
    saveTimestamp: vi.fn(async () => true),
    saveNote: vi.fn(async (n) => n),
  };

  // Mock DOMPurify
  window.DOMPurify = { sanitize: (s) => s };

  await import('../app.js');
  await vi.waitFor(() => expect(window.OpenCourseDeck.Router).toBeTruthy());
}

async function navigate(hash) {
  const ready = new Promise(resolve => {
    const handler = (data) => {
      if (data.hash === hash) {
        window.OpenCourseDeck.bus.off('route:ready', handler);
        resolve();
      }
    };
    window.OpenCourseDeck.bus.on('route:ready', handler);
  });
  
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await ready;
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
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await loadApp();

    for (const route of routes) {
      await navigate(route);
      const container = document.getElementById('view-container');
      
      expect(container.innerHTML).not.toContain('[object HTML');
      expect(container.innerHTML).not.toContain('undefined');
      expect(container.innerHTML).not.toContain('null');
      expect(container.children.length).toBeGreaterThan(0);
    }

    if (consoleSpy.mock.calls.length > 0) {
      console.error('Captured console errors during route health check:', consoleSpy.mock.calls);
    }
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
