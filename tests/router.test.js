import { describe, it, expect, vi } from 'vitest';
import { createRouter } from '../src/router/router.js';

describe('createRouter', () => {
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
