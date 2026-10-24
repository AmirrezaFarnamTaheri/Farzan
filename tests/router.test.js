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
    router.destroy();
  });

  it('resets persistent shell scroll on route changes without resetting same-view query navigation', async () => {
    const main = document.createElement('main');
    main.id = 'main-content';
    const view = document.createElement('div');
    view.id = 'view-container';
    main.appendChild(view);
    document.body.appendChild(main);
    const bus = { emit: vi.fn() };
    window.location.hash = '#/home';
    const router = createRouter({
      $$: () => [], bus,
      Progress: { pageBar: { start: vi.fn(), finish: vi.fn() } },
    });
    router.on('#/home', async () => undefined);
    router.on('#/notes', async () => undefined);
    try {
      await router.init();
      main.scrollTop = 240;
      view.scrollTop = 180;
      router.navigate('#/notes');
      await vi.waitFor(() => expect(bus.emit).toHaveBeenCalledWith('route:change', { hash: '#/notes' }));
      await router.ready();
      expect(main.scrollTop).toBe(0);
      expect(view.scrollTop).toBe(0);

      main.scrollTop = 165;
      view.scrollTop = 120;
      router.navigate('#/notes?topic=foo');
      await vi.waitFor(() => expect(bus.emit).toHaveBeenCalledWith('route:change', { hash: '#/notes?topic=foo' }));
      await router.ready();
      expect(main.scrollTop).toBe(165);
      expect(view.scrollTop).toBe(120);
    } finally {
      router.destroy();
      main.remove();
    }
  });
});
