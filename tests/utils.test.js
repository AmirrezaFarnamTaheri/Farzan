import { describe, expect, it, vi } from 'vitest';
import { Transition } from '../src/lib/transition.js';

describe('Transition', () => {
  it('does not fast-forward after pause/resume', () => {
    const frames = [];
    let nextId = 1;
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return nextId++;
    });
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

    try {
      const seen = [];
      const t = new Transition(1000, 'linear', (v) => seen.push(v));
      t.play();

      // The first frame only establishes the rAF time anchor.
      frames.shift()(1000);
      frames.shift()(1200);
      expect(seen.at(-1)).toBeCloseTo(0.2, 5);

      t.pause();
      // Five seconds of wall-clock pass while paused, then resume.
      t.play();
      frames.shift()(6200);
      frames.shift()(6300);

      // Progress continues from where it paused rather than jumping to the
      // end, because pausing drops the rAF time anchor.
      expect(seen.at(-1)).toBeCloseTo(0.3, 5);
      expect(seen.at(-1)).toBeLessThan(1);
    } finally {
      raf.mockRestore();
      cancel.mockRestore();
    }
  });

  it('cancel() rejects for explicit awaiters', async () => {
    const t = new Transition(500, 'linear', () => {});
    const awaited = t.catch((err) => err);
    t.cancel();
    const err = await awaited;
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AbortError');
  });

  it('cancel() on a fire-and-forget transition does not raise unhandledrejection', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const t = new Transition(500, 'linear', () => {});
      t.cancel();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

