import { afterEach, beforeEach } from 'vitest';

const CANVAS_AUTOSAVE_KEY = 'ocd_canvas_board';

// Node >= 25 ships an experimental `localStorage` global on globalThis that
// returns `undefined` unless --localstorage-file is passed. Vitest's jsdom
// environment copies the jsdom window's keys onto globalThis but skips keys
// that already exist there — so on modern Node, Node's broken getter shadows
// jsdom's storage (bare `localStorage` and `window.localStorage` both fail)
// while CI (Node 20/22) is unaffected. Detect that state and rebind the
// global to a real Storage from a scratch jsdom window.
async function rebindNodeStorageShims() {
  const broken = typeof globalThis.localStorage === 'undefined'
    && Object.getOwnPropertyDescriptor(globalThis, 'localStorage')?.get != null;
  if (!broken) return;
  try {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!DOCTYPE html>', { url: 'http://localhost:3000/' });
    // Install Storage and localStorage from the same jsdom so prototype-level
    // spies (vi.spyOn(Storage.prototype, 'setItem')) still intercept writes.
    if (dom.window.Storage) {
      Object.defineProperty(globalThis, 'Storage', {
        configurable: true,
        writable: true,
        enumerable: true,
        value: dom.window.Storage,
      });
    }
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      enumerable: true,
      value: dom.window.localStorage,
    });
  } catch {
    // jsdom unavailable — leave Node's shim in place; tests will surface it.
  }
}
await rebindNodeStorageShims();

function resetCanvasSingleton() {
  if (typeof window === 'undefined') return;
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
