import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountHelpView } from '../src/views/helpRoute.js';

describe('Help catalog status: explicit recovery without fabricated zeros', () => {
  let originalStore, originalDB;
  const mount = () => mountHelpView({
    setView: html => { document.getElementById('help-host').innerHTML = html; },
  });
  beforeEach(() => {
    originalStore = window.DataStore;
    originalDB = window.DB;
    document.body.innerHTML = '<main id="help-host"></main>';
    window.DB = { saveSetting: vi.fn(), saveNote: vi.fn(), saveProgress: vi.fn() };
  });
  afterEach(() => {
    window.DataStore = originalStore;
    window.DB = originalDB;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('does not claim zero courses when offline catalog initialization fails, then recovers without writing', async () => {
    const topics = [{ topicId: 'topic-one', courseId: 'bio', title: 'Topic One', videos: [] }];
    window.DataStore = {
      init: vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(true),
      allTopics: vi.fn(() => topics),
      allCourses: vi.fn(() => [{ id: 'bio', title: 'Biology' }]),
    };
    mount();
    const root = document.querySelector('[data-catalog-health]');
    const retry = await vi.waitFor(() => {
      const button = root.querySelector('[data-help-catalog-retry]');
      expect(button).not.toBeNull();
      return button;
    });
    const message = root.querySelector('[role="alert"]');
    expect(message.textContent).toMatch(/catalog.*unavailable|could not load.*catalog/i);
    expect(root.textContent).not.toMatch(/0\s*Courses|Courses\s*0/);
    retry.click();
    await vi.waitFor(() => {
      expect(root.textContent).toContain('Courses1');
      expect(root.textContent).toContain('Topics1');
      expect(root.querySelector('[role="alert"]')).toBeNull();
    });
    expect(window.DataStore.init).toHaveBeenCalledTimes(2);
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
    expect(window.DB.saveNote).not.toHaveBeenCalled();
  });

  it('fails closed when the authoritative catalog reader returns non-array data', async () => {
    window.DataStore = {
      init: vi.fn(async () => true),
      allTopics: vi.fn(() => null),
      allCourses: vi.fn(() => [{ id: 'bio' }]),
    };
    mount();
    const root = document.querySelector('[data-catalog-health]');
    await vi.waitFor(() => expect(root.querySelector('[role="alert"]')).not.toBeNull());
    expect(root.querySelector('[data-help-catalog-retry]')).not.toBeNull();
    expect(root.textContent).not.toContain('Topics0');
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
  });

  it('still reports genuine zero counts after a successful empty catalog read', async () => {
    window.DataStore = {
      init: vi.fn(async () => true),
      allTopics: vi.fn(() => []),
      allCourses: vi.fn(() => []),
    };
    mount();
    const root = document.querySelector('[data-catalog-health]');
    await vi.waitFor(() => expect(root.textContent).toContain('Courses0'));
    expect(root.textContent).toContain('Topics0');
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });
});
