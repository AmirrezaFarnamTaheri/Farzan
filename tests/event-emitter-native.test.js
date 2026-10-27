import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from '../src/lib/eventEmitter.js';
import { CourseGraph } from '../src/features/courseGraph.js';
import { KnowledgeGraph } from '../src/features/knowledgeGraph.js';

afterEach(() => vi.restoreAllMocks());

describe('EventEmitter WHATWG EventTarget interoperability', () => {
  it('uses the active window EventTarget realm for browser CustomEvent dispatch', () => {
    // Browser smoke runs in Node with jsdom: Node's EventTarget cannot accept
    // jsdom's CustomEvent even though both individually implement Event.
    const emitter = new EventEmitter();
    expect(emitter).toBeInstanceOf(window.EventTarget);
    const listener = vi.fn();
    emitter.on('browser:ready', listener);
    expect(() => emitter.dispatchEvent(new window.CustomEvent('browser:ready', {
      detail: ['from-dom'],
    }))).not.toThrow();
    expect(listener).toHaveBeenCalledWith('from-dom');
    expect(() => emitter.emit('browser:ready', 'from-emitter')).not.toThrow();
    expect(listener).toHaveBeenCalledWith('from-emitter');
  });

  it('delivers standard dispatchEvent payloads to fluent on() listeners', () => {
    const emitter = new EventEmitter();
    const listener = vi.fn();
    emitter.on('topic:changed', listener);
    expect(emitter.dispatchEvent(new CustomEvent('topic:changed', { detail: ['a', 2] }))).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('a', 2);
  });

  it('delivers fluent emit() to both standard DOM listeners and fluent listeners once', () => {
    const emitter = new EventEmitter();
    const fluent = vi.fn();
    const native = vi.fn();
    emitter.on('course:ready', fluent);
    emitter.addEventListener('course:ready', native);
    expect(emitter.emit('course:ready', 'abc', 4)).toBe(emitter);
    expect(fluent).toHaveBeenCalledTimes(1);
    expect(fluent).toHaveBeenCalledWith('abc', 4);
    expect(native).toHaveBeenCalledTimes(1);
    expect(native.mock.calls[0][0]).toBeInstanceOf(CustomEvent);
    expect(native.mock.calls[0][0].detail).toEqual(['abc', 4]);
  });

  it('keeps once/off semantics across both native and fluent dispatch paths', () => {
    const emitter = new EventEmitter();
    const oneShot = vi.fn();
    emitter.once('save', oneShot);
    emitter.dispatchEvent(new CustomEvent('save', { detail: [1] }));
    emitter.emit('save', 2);
    expect(oneShot).toHaveBeenCalledTimes(1);
    expect(oneShot).toHaveBeenCalledWith(1);
    expect(emitter.listenerCount('save')).toBe(0);

    const removed = vi.fn();
    emitter.once('save', removed);
    emitter.once('save', removed);
    expect(emitter.listenerCount('save')).toBe(2);
    emitter.off('save', removed);
    emitter.dispatchEvent(new CustomEvent('save', { detail: [3] }));
    expect(removed).not.toHaveBeenCalled();
  });

  it('preserves duplicate suppression for on(), wildcard payloads and clear()', () => {
    const emitter = new EventEmitter();
    const a = vi.fn();
    const wildcard = vi.fn();
    emitter.on('notes', a).on('notes', a).on('*', wildcard);
    expect(emitter.eventNames()).toEqual(['notes', '*']);
    expect(emitter.listenerCount()).toBe(2);
    emitter.emit('notes', 1, 2);
    expect(a).toHaveBeenCalledOnce();
    expect(wildcard).toHaveBeenCalledTimes(1);
    expect(wildcard).toHaveBeenCalledWith({ type: 'notes', args: [1, 2] });
    emitter.clear();
    emitter.emit('notes', 3);
    emitter.dispatchEvent(new CustomEvent('notes', { detail: [4] }));
    expect(a).toHaveBeenCalledOnce();
    expect(wildcard).toHaveBeenCalledOnce();
    expect(emitter.listenerCount()).toBe(0);
  });

  it('does not allow a throwing fluent listener to suppress subsequent handlers', () => {
    const emitter = new EventEmitter();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const healthy = vi.fn();
    emitter.on('update', () => { throw new Error('handler failed'); });
    emitter.on('update', healthy);
    expect(() => emitter.emit('update', 'still-running')).not.toThrow();
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledWith('still-running');
    expect(log).toHaveBeenCalledTimes(1);
  });
});


describe('EventTarget-backed graph teardown', () => {
  for (const [name, Graph] of [['CourseGraph', CourseGraph], ['KnowledgeGraph', KnowledgeGraph]]) {
    it(`${name}.destroy() detaches fluent callbacks from native EventTarget`, () => {
      const graph = new Graph();
      const callback = vi.fn();
      graph.on('graph:disposed', callback);
      graph.destroy();
      graph.dispatchEvent(new CustomEvent('graph:disposed', { detail: [1] }));
      expect(graph.listenerCount('graph:disposed')).toBe(0);
      expect(callback).not.toHaveBeenCalled();
    });
  }
});
