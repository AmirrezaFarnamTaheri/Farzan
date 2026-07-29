import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from '../src/lib/eventEmitter.js';
import { RequestQueue } from '../src/lib/requestQueue.js';
import { RAFLoop } from '../src/lib/rafLoop.js';
import { createEaseInElastic, createEaseOutElastic } from '../src/lib/easing.js';

describe('EventEmitter off/once contract', () => {
  it('off(event, handler) removes a listener registered via once()', () => {
    const bus = new EventEmitter();
    const handler = vi.fn();

    bus.once('data', handler);
    bus.off('data', handler);
    bus.emit('data', 1);

    // Before the fix, off() could not match the internal once-wrapper, so the
    // handler still fired after its owner had torn down.
    expect(handler).not.toHaveBeenCalled();
    expect(bus.listenerCount('data')).toBe(0);
  });

  it('once() still fires exactly once when not removed', () => {
    const bus = new EventEmitter();
    const handler = vi.fn();

    bus.once('data', handler);
    bus.emit('data', 'a');
    bus.emit('data', 'b');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('a');
    expect(bus.listenerCount('data')).toBe(0);
  });

  it('off() leaves unrelated listeners registered', () => {
    const bus = new EventEmitter();
    const keep = vi.fn();
    const drop = vi.fn();

    bus.on('data', keep);
    bus.once('data', drop);
    bus.off('data', drop);
    bus.emit('data');

    expect(keep).toHaveBeenCalledTimes(1);
    expect(drop).not.toHaveBeenCalled();
  });
});

describe('RequestQueue flush safety', () => {
  it('flushes every queued callback even when one calls reset()', () => {
    const queue = new RequestQueue();
    const order = [];

    queue.serve('a', () => { order.push('a'); queue.reset(); });
    queue.serve('b', () => order.push('b'));
    queue.serve('c', () => order.push('c'));

    queue.start();

    // Iterating the live Map meant reset() truncated the loop and silently
    // dropped b and c.
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('does not re-run callbacks on a second start()', () => {
    const queue = new RequestQueue();
    const fn = vi.fn();
    queue.serve('k', fn);

    queue.start();
    queue.start();

    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('RAFLoop resilience', () => {
  it('keeps running after a callback throws, and stop() still works', () => {
    const frames = [];
    let nextId = 1;
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return nextId++;
    });
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      let calls = 0;
      const loop = new RAFLoop(() => {
        calls += 1;
        if (calls === 1) throw new Error('boom');
      });

      loop.start();
      frames.shift()(16);

      // A throwing frame used to skip the re-arm, leaving the loop dead while
      // `running` still reported true.
      expect(loop.running).toBe(true);
      expect(frames.length).toBeGreaterThan(0);

      frames.shift()(32);
      expect(calls).toBe(2);

      loop.stop();
      expect(loop.running).toBe(false);
    } finally {
      raf.mockRestore();
      cancel.mockRestore();
      errorLog.mockRestore();
    }
  });

  it('does not schedule another frame when the callback calls stop()', () => {
    const frames = [];
    let nextId = 1;
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return nextId++;
    });
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

    try {
      let loop;
      loop = new RAFLoop(() => loop.stop());
      loop.start();

      frames.shift()(16);
      expect(frames).toHaveLength(0);
      expect(loop.running).toBe(false);
    } finally {
      raf.mockRestore();
      cancel.mockRestore();
    }
  });
});

describe('elastic easing amplitude guard', () => {
  it('returns finite values for amplitudes below 1', () => {
    // asin(1/a) is out of domain for a < 1 and produced NaN for every frame.
    for (const amplitude of [0.1, 0.5, 0.99]) {
      const easeIn = createEaseInElastic(amplitude);
      const easeOut = createEaseOutElastic(amplitude);
      for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        expect(Number.isFinite(easeIn(t))).toBe(true);
        expect(Number.isFinite(easeOut(t))).toBe(true);
      }
    }
  });

  it('preserves exact endpoints', () => {
    const easeIn = createEaseInElastic(0.5);
    const easeOut = createEaseOutElastic(0.5);
    expect(easeIn(0)).toBe(0);
    expect(easeIn(1)).toBe(1);
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
  });

  it('leaves the default amplitude behaviour unchanged', () => {
    const easeOut = createEaseOutElastic(1);
    expect(easeOut(0.3)).toBeCloseTo(0.875, 10);
  });
});
