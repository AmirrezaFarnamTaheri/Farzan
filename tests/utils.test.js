import { describe, expect, it, vi } from 'vitest';
import { stagger } from '../src/lib/stagger.js';
import { Transition } from '../src/lib/transition.js';
import { Timeline } from '../src/lib/timeline.js';

describe('stagger', () => {
  it('spreads values linearly from the first element by default', () => {
    const delay = stagger(100);
    expect(delay(0, 5)).toBe(0);
    expect(delay(2, 5)).toBe(50);
    expect(delay(4, 5)).toBe(100);
  });

  it('radiates from the centre when from:"center"', () => {
    const delay = stagger(100, { from: 'center' });
    expect(delay(2, 5)).toBe(0);
    expect(delay(0, 5)).toBe(100);
    expect(delay(4, 5)).toBe(100);
  });

  it('applies a start offset and honours [min,max] ranges', () => {
    const delay = stagger([10, 50], { start: 5 });
    expect(delay(0, 3)).toBe(15);
    expect(delay(2, 3)).toBe(55);
  });

  it('uses ONE random origin for the whole set, not one per element', () => {
    // With a per-element origin, every index is its own origin and so every
    // value would be 0. A single shared origin yields exactly one zero.
    const delay = stagger(100, { from: 'random' });
    const total = 8;
    const values = Array.from({ length: total }, (_, i) => delay(i, total));
    expect(values.filter(v => v === 0)).toHaveLength(1);

    // The same instance keeps its origin across repeated passes.
    expect(Array.from({ length: total }, (_, i) => delay(i, total))).toEqual(values);
  });

  it('returns 0 offsets when a grid dimension is degenerate', () => {
    const delay = stagger(100, { grid: [0, 0] });
    expect(delay(3, 9)).toBe(0);
  });
});

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

describe('Timeline', () => {
  it('does not re-fire call() entries when resuming from pause', () => {
    const frames = [];
    let nextId = 1;
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return nextId++;
    });
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

    try {
      const sideEffect = vi.fn();
      const tl = new Timeline();
      tl.call(sideEffect, 0);
      tl.add(null, { duration: 1000 }, 0);

      tl.play();
      frames.shift()(1000);
      expect(sideEffect).toHaveBeenCalledTimes(1);
      frames.shift()(1300); // advance to t=300ms
      expect(sideEffect).toHaveBeenCalledTimes(1);

      tl.pause();
      tl.play();
      frames.shift()(9000);

      // Resuming must not clear _firedCalls, or every call/set entry before
      // the pause point would run a second time.
      expect(sideEffect).toHaveBeenCalledTimes(1);
    } finally {
      raf.mockRestore();
      cancel.mockRestore();
    }
  });

  it('replays call() entries on a fresh play after completion', () => {
    const frames = [];
    let nextId = 1;
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return nextId++;
    });
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

    try {
      const sideEffect = vi.fn();
      const tl = new Timeline();
      tl.call(sideEffect, 0);
      tl.add(null, { duration: 100 }, 0);

      tl.play();
      // Non-zero timestamps: _tick anchors with `if (!this._startTime)`, so a
      // literal 0 would be treated as "unanchored" and re-anchor each frame.
      frames.shift()(1000);
      expect(sideEffect).toHaveBeenCalledTimes(1);
      frames.shift()(1500); // past the 100ms duration -> completes
      expect(sideEffect).toHaveBeenCalledTimes(1);

      // A fresh play() after completion re-arms call entries.
      tl.play();
      frames.shift()(2000);
      expect(sideEffect).toHaveBeenCalledTimes(2);
    } finally {
      raf.mockRestore();
      cancel.mockRestore();
    }
  });
});
