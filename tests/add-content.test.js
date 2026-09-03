import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initAddContent } from '../src/features/addContent.js';

describe('add content chrome', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="ocd-app">
        <button id="topbar-add-btn">Add</button>
        <button id="theme-toggle-btn">Theme</button>
        <button id="fullscreen-btn">Fullscreen</button>
        <button id="topbar-search-btn">Search</button>
        <input id="sidebar-search" />
        <div id="add-content-menu" aria-hidden="true" role="menu">
          <button data-action="add-video">Add Video</button>
          <button data-action="create-course">Create Course</button>
        </div>
        <input id="file-input-video" type="file" />
        <input id="file-input-pdf" type="file" />
        <input id="file-input-backup" type="file" />
        <div id="aria-announcer"></div>
      </div>
    `;
    window.OpenCourseDeck = {
      ThemeManager: { toggle: vi.fn() },
      Router: { navigate: vi.fn() },
      Toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
      Modal: { create: vi.fn(), close: vi.fn() },
    };
  });

  it('opens the add-content menu and exposes library actions', () => {
    const api = initAddContent(window);
    expect(api.addVideo).toBeTypeOf('function');
    expect(window.OpenCourseDeck.AddContent.createCourse).toBeTypeOf('function');

    document.getElementById('topbar-add-btn').click();
    expect(document.getElementById('add-content-menu').getAttribute('aria-hidden')).toBe('false');
    expect(document.getElementById('topbar-add-btn').getAttribute('aria-expanded')).toBe('true');
  });

  it('wires theme, search, and video file picking', () => {
    initAddContent(window);
    document.getElementById('theme-toggle-btn').click();
    expect(window.OpenCourseDeck.ThemeManager.toggle).toHaveBeenCalled();

    const search = document.getElementById('sidebar-search');
    const focus = vi.spyOn(search, 'focus');
    document.getElementById('topbar-search-btn').click();
    expect(focus).toHaveBeenCalled();

    const input = document.getElementById('file-input-video');
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    document.querySelector('[data-action="add-video"]').click();
    expect(click).toHaveBeenCalled();
    expect(document.getElementById('add-content-menu').getAttribute('aria-hidden')).toBe('true');
  });
});
