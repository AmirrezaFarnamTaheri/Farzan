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

  it('does not tear down a route that vetoes navigation while its draft is unsafe to leave', async () => {
    window.location.hash = '#/notes';
    const bus = { emit: vi.fn() };
    const beforeLeave = vi.fn(() => false);
    const unmount = vi.fn();
    const home = vi.fn(async () => undefined);
    const router = createRouter({
      $: () => [], bus,
      Progress: { pageBar: { start: vi.fn(), finish: vi.fn() } },
    });
    router.on('#/notes', async () => ({ beforeLeave, unmount }));
    router.on('#/home', home);
    try {
      await router.init();
      router.navigate('#/home');
      await vi.waitFor(() => expect(beforeLeave).toHaveBeenCalledTimes(1));
      await router.ready();
      expect(window.location.hash).toBe('#/notes');
      expect(unmount).not.toHaveBeenCalled();
      expect(home).not.toHaveBeenCalled();

      beforeLeave.mockReturnValue(true);
      router.navigate('#/home');
      await vi.waitFor(() => expect(home).toHaveBeenCalledTimes(1));
      await router.ready();
      expect(unmount).toHaveBeenCalledTimes(1);
      expect(window.location.hash).toBe('#/home');
    } finally {
      router.destroy();
    }
  });

  it('aborts a previous route signal even when its handler returned no controller', async () => {
    window.location.hash = '#/empty';
    let emptySignal;
    const next = vi.fn(async () => undefined);
    const router = createRouter({
      $: () => [],
      bus: { emit: vi.fn() },
      Progress: { pageBar: { start: vi.fn(), finish: vi.fn() } },
    });
    router.on('#/empty', async (_hash, context) => {
      emptySignal = context.signal;
      return undefined;
    });
    router.on('#/next', next);
    try {
      await router.init();
      expect(emptySignal?.aborted).toBe(false);
      router.navigate('#/next');
      await router.refresh();
      expect(next).toHaveBeenCalled();
      expect(emptySignal?.aborted).toBe(true);
    } finally {
      router.destroy();
    }
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
