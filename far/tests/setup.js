import { afterEach, beforeEach } from 'vitest';

function resetCanvasSingleton() {
  const canvas = window.OpenCourseDeck?.Canvas;
  try { canvas?.destroy?.(); } catch {}
  try { delete window.OpenCourseDeck?.Canvas; } catch {}
}

beforeEach(() => {
  resetCanvasSingleton();
});

afterEach(() => {
  resetCanvasSingleton();
});
