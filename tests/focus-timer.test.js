import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FOCUS_STORAGE_KEY,
  createFocusTimer,
  remainingFocusMs,
  advanceFocusTimer,
  transitionFocusTimer,
  parseFocusTimer,
} from '../src/features/focusTimer.js';
import { mountHomeView } from '../src/views/homeRoute.js';

describe('offline Pomodoro session model', () => {
  it('runs against wall-clock deadlines so sleep and delayed intervals do not extend a block', () => {
    const fresh = createFocusTimer();
    expect(fresh).toMatchObject({ version: 1, phase: 'focus', preset: 'classic', status: 'ready', remainingMs: 1500000, focusCount: 0 });
    const started = transitionFocusTimer(fresh, 'start', 1000);
    expect(started.deadline).toBe(1501000);
    expect(remainingFocusMs(started, 61000)).toBe(1440000);
    const paused = transitionFocusTimer(started, 'pause', 61000);
    expect(paused).toMatchObject({ status: 'paused', remainingMs: 1440000, deadline: null });
    const resumed = transitionFocusTimer(paused, 'start', 91000);
    expect(resumed.deadline).toBe(1531000);
    expect(remainingFocusMs(resumed, 1000000)).toBe(531000);
  });

  it('settles an expired focus block exactly once, without auto-starting a break', () => {
    const running = transitionFocusTimer(createFocusTimer(), 'start', 0);
    const finished = advanceFocusTimer(running, 3000000);
    expect(finished).toMatchObject({ phase: 'focus', status: 'complete', remainingMs: 0, deadline: null, focusCount: 1 });
    expect(advanceFocusTimer(finished, 9000000)).toEqual(finished);
    const next = transitionFocusTimer(finished, 'next', 9000000);
    expect(next).toMatchObject({ phase: 'short', status: 'ready', remainingMs: 300000, focusCount: 1 });
  });

  it('offers a long break after every fourth completed focus block', () => {
    let state = createFocusTimer();
    let now = 100;
    for (let i = 0; i < 4; i += 1) {
      state = transitionFocusTimer(state, 'start', now);
      now += 4_000_000;
      state = advanceFocusTimer(state, now);
      expect(state.focusCount).toBe(i + 1);
      state = transitionFocusTimer(state, 'next', now);
      expect(state.phase).toBe(i === 3 ? 'long' : 'short');
      if (i < 3) {
        state = transitionFocusTimer(state, 'start', now);
        now += 4_000_000;
        state = advanceFocusTimer(state, now);
        expect(state.focusCount).toBe(i + 1);
        state = transitionFocusTimer(state, 'next', now);
        expect(state.phase).toBe('focus');
      }
    }
    expect(state.remainingMs).toBe(900000);
  });

  it('respects a deep-work preset without changing unrelated study records', () => {
    const initial = createFocusTimer();
    const changed = transitionFocusTimer(initial, 'preset', 100, 'deep');
    expect(changed).toMatchObject({ phase: 'focus', status: 'ready', preset: 'deep', remainingMs: 3000000 });
    const running = transitionFocusTimer(changed, 'start', 1000);
    expect(() => transitionFocusTimer(running, 'preset', 2000, 'classic')).toThrow(/pause|running/i);
    const reset = transitionFocusTimer(running, 'reset', 2000);
    expect(reset).toMatchObject({ status: 'ready', remainingMs: 3000000, focusCount: 0, deadline: null });
  });

  it('fails closed on malformed or unsupported saved timers', () => {
    expect(() => parseFocusTimer('{bad json')).toThrow();
    expect(() => parseFocusTimer(JSON.stringify({ version: 2 }))).toThrow();
    expect(() => parseFocusTimer(JSON.stringify({ ...createFocusTimer(), focusCount: -1 }))).toThrow();
    expect(() => parseFocusTimer({ ...createFocusTimer(), deadline: Infinity })).toThrow();
  });
});

beforeEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

function showHome() {
  document.body.innerHTML = '<main id="main-content"></main>';
  window.DataStore = { init: async () => true, allCourses: () => [], allTopics: () => [] };
  window.DB = {
    getAllProgress: async () => [], getAllNotes: async () => [],
    getAllTimestamps: async () => [], getSetting: async () => null,
  };
  mountHomeView({
    setView: html => { document.getElementById('main-content').innerHTML = html; },
    Router: { navigate: vi.fn() },
    setPendingCourseMedia: vi.fn(),
  });
}

describe('Home focus timer widget', () => {
  it('renders native keyboard controls and persists only its isolated timer key', async () => {
    showHome();
    await vi.waitFor(() => expect(document.querySelector('[data-focus-widget]')?.dataset.focusInitialized).toBe('true'));
    const widget = document.querySelector('[data-focus-widget]');
    expect(widget.querySelector('[data-focus-clock]').textContent).toBe('25:00');
    expect(widget.querySelector('[data-focus-clock]').getAttribute('aria-live')).toBe('off');
    expect(widget.querySelector('[data-focus-message]').getAttribute('role')).toBe('status');
    expect(widget.querySelector('[data-focus-start]').tagName).toBe('BUTTON');
    widget.querySelector('[data-focus-start]').click();
    const stored = JSON.parse(localStorage.getItem(FOCUS_STORAGE_KEY));
    expect(stored).toMatchObject({ version: 1, status: 'running', phase: 'focus' });
    expect(stored.deadline).toBeGreaterThan(Date.now());
    expect(widget.querySelector('[data-focus-start]').textContent).toMatch(/Pause/i);
    expect(localStorage.length).toBe(1);
    widget.querySelector('[data-focus-start]').click();
    expect(JSON.parse(localStorage.getItem(FOCUS_STORAGE_KEY)).status).toBe('paused');
  });

  it('will not overwrite a newer timer written by another tab', async () => {
    showHome();
    await vi.waitFor(() => expect(document.querySelector('[data-focus-widget]')?.dataset.focusInitialized).toBe('true'));
    const widget = document.querySelector('[data-focus-widget]');
    const newer = { ...createFocusTimer('deep'), focusCount: 3 };
    localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(newer));
    widget.querySelector('[data-focus-start]').click();
    expect(JSON.parse(localStorage.getItem(FOCUS_STORAGE_KEY))).toEqual(newer);
    expect(widget.querySelector('[data-focus-message]').textContent).toMatch(/another tab|updated|latest/i);
    expect(widget.querySelector('[data-focus-clock]').textContent).toBe('50:00');
  });

  it('preserves unrecognized saved focus data rather than silently rewriting it', async () => {
    const corrupt = '{"version":9,"historic":"keep"}';
    localStorage.setItem(FOCUS_STORAGE_KEY, corrupt);
    showHome();
    await vi.waitFor(() => expect(document.querySelector('[data-focus-message]')?.textContent).toMatch(/unavailable|could not|unsupported/i));
    expect(document.querySelector('[data-focus-start]').disabled).toBe(true);
    expect(localStorage.getItem(FOCUS_STORAGE_KEY)).toBe(corrupt);
  });
});
