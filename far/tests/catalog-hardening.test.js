import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installBridgeHardening } from '../src/core/bridgeHardening.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: vi.fn(key => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
    removeItem: vi.fn(key => values.delete(key)),
  };
}

describe('catalog bridge hardening', () => {
  beforeEach(() => {
    document.body.innerHTML = '<p id="splash-status"></p>';
  });

  it('retains the last authoritative catalog across repeated failed retries', async () => {
    let state = { status: 'idle', source: null, lastSuccessfulAt: null };
    let courses = [];
    let topics = [];
    let attempts = 0;
    const init = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        state = { status: 'authoritative', source: './catalog-good.json', lastSuccessfulAt: 100 };
        courses = [{ id: 'real-course' }];
        topics = [{ topicId: 'real-topic' }];
      } else {
        state = { status: 'degraded', source: 'demo-fallback', lastSuccessfulAt: 100 };
        courses = [{ id: 'demo-course' }];
        topics = [{ topicId: 'demo-topic' }];
        document.getElementById('splash-status').style.color = '#ef4444';
      }
      return true;
    });
    const dataStore = {
      init,
      retry: init,
      getState: () => Object.freeze({ ...state, courses: courses.length, topics: topics.length }),
      allCourses: () => courses.slice(),
      allTopics: () => topics.slice(),
      catalogPath: () => state.source,
      isLoaded: () => state.status !== 'idle',
    };
    const root = { document, DataStore: dataStore, OpenCourseDeck: { DataStore: dataStore }, localStorage: createStorage() };

    const { dataStore: hardened } = installBridgeHardening(root);
    await hardened.init();
    await hardened.retry();
    await hardened.retry();

    expect(hardened.allCourses()).toEqual([{ id: 'real-course' }]);
    expect(hardened.allTopics()).toEqual([{ topicId: 'real-topic' }]);
    expect(hardened.catalogPath()).toBe('./catalog-good.json');
    expect(hardened.getState()).toMatchObject({
      status: 'degraded',
      source: './catalog-good.json',
      usingLastKnownGood: true,
      courses: 1,
      topics: 1,
    });
    expect(document.getElementById('splash-status').style.color).toBe('rgb(185, 28, 28)');
  });
});
