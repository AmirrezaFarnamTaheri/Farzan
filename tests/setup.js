import { afterEach, beforeEach } from 'vitest';

const CANVAS_AUTOSAVE_KEY = 'plasma-canvas-board';

function resetCanvasSingleton() {
  const canvas = window.OpenCourseDeck?.Canvas;
  try { canvas?.destroy?.(); } catch {}
  try { delete window.OpenCourseDeck?.Canvas; } catch {}
  try { window.localStorage?.removeItem(CANVAS_AUTOSAVE_KEY); } catch {}
}

beforeEach(() => {
  resetCanvasSingleton();
});

afterEach(() => {
  resetCanvasSingleton();
});
