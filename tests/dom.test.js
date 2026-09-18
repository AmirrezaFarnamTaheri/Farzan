import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  debounce,
  eventTargetEl,
  restoreFocus,
  setAppInert,
  trapFocus,
} from '../src/lib/dom.js';

describe('dom utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounce delays invocation until quiet period', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    d();
    d();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throttle invokes immediately and replays the trailing call', async () => {
    const { throttle } = await import('../src/lib/dom.js');
    const fn = vi.fn();
    const t = throttle(fn, 100);
    t('a');
    t('b');
    t('c');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith('a');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('c');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('eventTargetEl returns element for Element targets', () => {
    const el = document.createElement('button');
    const ev = { target: el };
    expect(eventTargetEl(ev)).toBe(el);
  });

  it('eventTargetEl maps Text nodes to parent element', () => {
    const el = document.createElement('p');
    const text = document.createTextNode('hi');
    el.appendChild(text);
    const ev = { target: text };
    expect(eventTargetEl(ev)).toBe(el);
  });

  it('eventTargetEl returns null for missing target', () => {
    expect(eventTargetEl({})).toBeNull();
  });

  it('trapFocus wraps tab navigation inside a container', () => {
    document.body.innerHTML = `
      <div id="dialog" tabindex="-1">
        <button id="first">First</button>
        <button id="last">Last</button>
      </div>
    `;
    const dialog = document.getElementById('dialog');
    const first = document.getElementById('first');
    const last = document.getElementById('last');
    const cleanup = trapFocus(dialog);

    expect(document.activeElement).toBe(first);
    last.focus();
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(first);

    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(last);
    cleanup();
  });

  it('restoreFocus returns to a live focusable opener', () => {
    document.body.innerHTML = '<button id="opener">Open</button><main id="main-content" tabindex="-1"></main>';
    const opener = document.getElementById('opener');
    opener.focus();
    expect(restoreFocus(opener)).toBe(true);
    expect(document.activeElement).toBe(opener);
  });

  it('setAppInert reference-counts app background inert state', () => {
    document.body.innerHTML = '<div id="ocd-app"></div>';
    const app = document.getElementById('ocd-app');

    setAppInert(true, app);
    setAppInert(true, app);
    expect(app.hasAttribute('inert')).toBe(true);
    expect(app.getAttribute('aria-hidden')).toBe('true');

    setAppInert(false, app);
    expect(app.hasAttribute('inert')).toBe(true);

    setAppInert(false, app);
    expect(app.hasAttribute('inert')).toBe(false);
    expect(app.hasAttribute('aria-hidden')).toBe(false);
  });

  it('uid generates prefixed unique identifiers using crypto.randomUUID or fallback', async () => {
    const { uid } = await import('../src/lib/dom.js');
    const id1 = uid('item');
    const id2 = uid('item');
    expect(id1).toMatch(/^item-[a-z0-9-]+$/);
    expect(id2).toMatch(/^item-[a-z0-9-]+$/);
    expect(id1).not.toBe(id2);
  });
});
