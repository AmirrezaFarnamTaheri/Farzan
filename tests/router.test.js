import { describe, it, expect, vi } from 'vitest';
import { createRouter } from '../src/router/router.js';

describe('createRouter', () => {
  it('marks the active navigation item for assistive technologies', async () => {
    window.location.hash = '#/home';
    const home = document.createElement('a');
    home.className = 'nav-item';
    home.href = '#/home';
    const courses = document.createElement('a');
    courses.className = 'nav-item';
    courses.href = '#/courses';
    const router = createRouter({
      $$: () => [home, courses],
      bus: { emit: vi.fn() },
      Progress: { pageBar: { start: vi.fn(), finish: vi.fn() } },
    });
    router.on('#/home', async () => undefined);
    router.on('#/courses', async () => undefined);
    await router.init();
    expect(home.getAttribute('aria-current')).toBe('page');
    expect(courses.hasAttribute('aria-current')).toBe(false);
    router.navigate('#/courses');
    await router.refresh();
    expect(courses.getAttribute('aria-current')).toBe('page');
    expect(home.hasAttribute('aria-current')).toBe(false);
    router.destroy();
  });

  it('runs registered handler for the current hash on init', async () => {
    window.location.hash = '#/test-route';
    const handler = vi.fn().mockResolvedValue(undefined);
    const busEmit = vi.fn();
    const router = createRouter({
      $$: () => [],
      Progress: { pageBar: { start: vi.fn(), finish: vi.fn() } },
      bus: { emit: busEmit },
      getNotFoundView: () => () => {},
    });
    router.on('#/test-route', handler);
    router.init();

    await vi.waitFor(() => expect(handler).toHaveBeenCalled());
    expect(busEmit).toHaveBeenCalledWith('route:change', { hash: '#/test-route' });
  });
});
