import { afterEach, vi } from 'vitest';

afterEach(() => {
  const canvas = window.OpenCourseDeck?.Canvas;
  if (!vi.isMockFunction(canvas?._scheduleRender)) return;
  try { canvas.destroy?.(); } catch {}
  try { delete window.OpenCourseDeck.Canvas; } catch {}
});
