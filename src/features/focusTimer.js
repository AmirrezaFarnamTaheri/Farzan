/* Independent, local-only focus blocks. No flashcard/progress or legacy data mutation. */
export const FOCUS_STORAGE_KEY = 'farzan_focus_timer_v1';
const DURATIONS = Object.freeze({
  classic: Object.freeze({ focus: 25 * 60000, short: 5 * 60000, long: 15 * 60000 }),
  deep: Object.freeze({ focus: 50 * 60000, short: 10 * 60000, long: 20 * 60000 }),
});
const PHASES = ['focus', 'short', 'long'];
const STATUSES = ['ready', 'running', 'paused', 'complete'];
const MAX_FOCUS_COUNT = 1000000;

export function createFocusTimer(preset = 'classic') {
  if (!Object.hasOwn(DURATIONS, preset)) throw new TypeError('Unknown focus preset');
  return { version: 1, preset, phase: 'focus', status: 'ready',
    remainingMs: DURATIONS[preset].focus, deadline: null, focusCount: 0, revision: 0 };
}

export function parseFocusTimer(serialized) {
  const state = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
  if (!state || typeof state !== 'object' || Array.isArray(state)
    || state.version !== 1 || !Object.hasOwn(DURATIONS, state.preset)
    || !PHASES.includes(state.phase) || !STATUSES.includes(state.status)
    || !Number.isSafeInteger(state.remainingMs) || state.remainingMs < 0
    || state.remainingMs > DURATIONS[state.preset][state.phase]
    || !Number.isSafeInteger(state.focusCount) || state.focusCount < 0 || state.focusCount > MAX_FOCUS_COUNT
    || !Number.isSafeInteger(state.revision) || state.revision < 0
    || (state.deadline !== null && (!Number.isSafeInteger(state.deadline) || state.deadline <= 0))
    || (state.status === 'running' && (!state.deadline || state.remainingMs === 0))
    || (state.status !== 'running' && state.deadline !== null)
    || (state.status === 'complete' && state.remainingMs !== 0)
    || (state.status === 'ready' && state.remainingMs !== DURATIONS[state.preset][state.phase])
  ) throw new TypeError('Unsupported or invalid saved focus timer');
  return {
    version: 1, preset: state.preset, phase: state.phase, status: state.status,
    remainingMs: state.remainingMs, deadline: state.deadline,
    focusCount: state.focusCount, revision: state.revision,
  };
}

export function remainingFocusMs(state, now = Date.now()) {
  if (state.status !== 'running') return state.remainingMs;
  return Math.max(0, Math.min(state.remainingMs, state.deadline - now));
}

export function advanceFocusTimer(state, now = Date.now()) {
  if (state.status !== 'running' || remainingFocusMs(state, now) > 0) return state;
  return {
    ...state, status: 'complete', deadline: null, remainingMs: 0,
    focusCount: state.focusCount + (state.phase === 'focus' ? 1 : 0),
    revision: state.revision + 1,
  };
}

export function transitionFocusTimer(input, action, now = Date.now(), value) {
  const state = advanceFocusTimer(input, now);
  if (!Number.isSafeInteger(now) || now < 0) throw new TypeError('Invalid clock');
  if (action === 'preset') {
    if (state.status === 'running') throw new Error('Pause the running timer before changing presets');
    return { ...createFocusTimer(value), focusCount: state.focusCount, revision: state.revision + 1 };
  }
  if (action === 'reset') {
    return { ...createFocusTimer(state.preset), revision: state.revision + 1 };
  }
  if (action === 'next') {
    if (state.status !== 'complete') throw new Error('Finish the block before moving to the next phase');
    const phase = state.phase === 'focus'
      ? (state.focusCount % 4 === 0 ? 'long' : 'short') : 'focus';
    return { ...state, phase, status: 'ready', deadline: null,
      remainingMs: DURATIONS[state.preset][phase], revision: state.revision + 1 };
  }
  if (action === 'pause') {
    if (state.status !== 'running') throw new Error('Timer is not running');
    return { ...state, status: 'paused', deadline: null,
      remainingMs: remainingFocusMs(state, now), revision: state.revision + 1 };
  }
  if (action === 'start') {
    if (!['ready', 'paused'].includes(state.status)) throw new Error('Finish this block first');
    return { ...state, status: 'running', deadline: now + state.remainingMs,
      revision: state.revision + 1 };
  }
  throw new TypeError('Unknown focus timer action');
}

const PHASE_LABEL = { focus: 'Focus', short: 'Short break', long: 'Long break' };
function formatClock(ms) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/* Mount only on Home, after the Home JS route is imported. A removed view
   stops its ticking timer; saved state is never rewritten during hydration. */
export function mountFocusTimerWidget() {
  const root = document.querySelector('[data-focus-widget]');
  if (!root) return;
  const clock = root.querySelector('[data-focus-clock]');
  const message = root.querySelector('[data-focus-message]');
  const phase = root.querySelector('[data-focus-phase]');
  const sessions = root.querySelector('[data-focus-count]');
  const start = root.querySelector('[data-focus-start]');
  const next = root.querySelector('[data-focus-next]');
  const reset = root.querySelector('[data-focus-reset]');
  const preset = root.querySelector('[data-focus-preset]');
  const ring = root.querySelector('[data-focus-ring]');
  let state = createFocusTimer();
  let lastRaw = null;
  let blocked = false;
  let notice = '';

  const markBlocked = (why) => {
    blocked = true;
    notice = why;
    render();
  };
  const hydrate = () => {
    try {
      lastRaw = window.localStorage.getItem(FOCUS_STORAGE_KEY);
      state = lastRaw === null ? createFocusTimer() : parseFocusTimer(lastRaw);
      blocked = false;
      return true;
    } catch {
      markBlocked('Saved focus session is unavailable or unsupported. No data was changed.');
      return false;
    }
  };
  const render = () => {
    if (!root.isConnected) return;
    const remaining = remainingFocusMs(state);
    clock.textContent = formatClock(remaining);
    phase.textContent = PHASE_LABEL[state.phase];
    sessions.textContent = String(state.focusCount);
    preset.value = state.preset;
    start.disabled = blocked || state.status === 'complete';
    start.textContent = state.status === 'running' ? 'Pause' : state.status === 'paused' ? 'Resume' : 'Start';
    next.hidden = state.status !== 'complete';
    next.disabled = blocked;
    reset.disabled = blocked;
    preset.disabled = blocked || state.status === 'running';
    ring.style.setProperty('--focus-progress', String(Math.round(100 * (1 - remaining / DURATIONS[state.preset][state.phase]))).concat('%'));
    const base = state.status === 'complete'
      ? (state.phase === 'focus' ? 'Focus complete. Choose your break.' : 'Break finished. Ready for focus.')
      : state.status === 'running' ? 'Timer running' : state.status === 'paused' ? 'Timer paused' : 'Ready when you are';
    message.textContent = notice || base;
  };
  const persist = (nextState) => {
    try {
      const current = window.localStorage.getItem(FOCUS_STORAGE_KEY);
      if (current !== lastRaw) {
        if (hydrate()) notice = 'Updated in another tab. Review the latest timer before continuing.';
        render();
        return false;
      }
      const serialized = JSON.stringify(nextState);
      window.localStorage.setItem(FOCUS_STORAGE_KEY, serialized);
      if (window.localStorage.getItem(FOCUS_STORAGE_KEY) !== serialized) {
        markBlocked('Focus timer could not be saved. No session was confirmed.');
        return false;
      }
      state = nextState;
      lastRaw = serialized;
      notice = '';
      render();
      return true;
    } catch {
      markBlocked('Focus timer could not be saved. Check browser storage before continuing.');
      return false;
    }
  };
  const perform = (action, value) => {
    if (blocked) return;
    try {
      const settled = advanceFocusTimer(state, Date.now());
      if (settled !== state && !persist(settled)) return;
      persist(transitionFocusTimer(state, action, Date.now(), value));
    } catch (error) {
      notice = error?.message || 'Timer action was not completed';
      render();
    }
  };
  start.addEventListener('click', () => perform(state.status === 'running' ? 'pause' : 'start'));
  next.addEventListener('click', () => perform('next'));
  reset.addEventListener('click', () => perform('reset'));
  preset.addEventListener('change', () => perform('preset', preset.value));

  let tick;
  const onStorage = (event) => {
    if (event.key !== FOCUS_STORAGE_KEY) return;
    if (hydrate()) notice = 'Focus timer updated from another tab.';
    render();
  };
  const cleanup = () => {
    if (tick !== undefined) window.clearInterval(tick);
    window.removeEventListener('storage', onStorage);
  };
  const ready = hydrate();
  root.dataset.focusInitialized = 'true';
  render();
  if (!ready) return;
  window.addEventListener('storage', onStorage);
  tick = window.setInterval(() => {
    if (!root.isConnected) { cleanup(); return; }
    if (blocked) return;
    const settled = advanceFocusTimer(state);
    if (settled !== state) persist(settled);
    else if (state.status === 'running') render();
  }, 1000);
}
