import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initAddContent, isOwnedDropTarget } from '../src/features/addContent.js';

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

  it('moves through add-menu items with the keyboard', () => {
    initAddContent(window);
    const first = document.querySelector('[data-action="add-video"]');
    const second = document.querySelector('[data-action="create-course"]');
    first.focus = vi.fn();
    second.focus = vi.fn();
    document.getElementById('topbar-add-btn').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(first.focus).toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('add-content-menu').getAttribute('aria-hidden')).toBe('true');
  });

  it('marks the closed add menu inert', () => {
    initAddContent(window);
    const menu = document.getElementById('add-content-menu');
    expect(menu.hasAttribute('inert')).toBe(true);
    document.getElementById('topbar-add-btn').click();
    expect(menu.hasAttribute('inert')).toBe(false);
    expect(menu.getAttribute('aria-hidden')).toBe('false');
  });

  it('does not claim owned drop zones', () => {
    initAddContent(window);
    const viewer = document.createElement('div');
    viewer.setAttribute('data-pdf-viewer', '');
    document.body.appendChild(viewer);
    const event = new Event('drop', { bubbles: true });
    Object.defineProperty(event, 'composedPath', { value: () => [viewer, document.body, document] });
    expect(isOwnedDropTarget(event)).toBe(true);

    const stray = new Event('drop', { bubbles: true });
    Object.defineProperty(stray, 'composedPath', { value: () => [document.body, document] });
    expect(isOwnedDropTarget(stray)).toBe(false);
  });

  it('passes the chosen backup file into ProgressStats.importJSON', async () => {
    const importer = vi.fn(async () => {});
    window.ProgressStats = { importJSON: importer };
    initAddContent(window);
    const input = document.getElementById('file-input-backup');
    const file = new File(['{"version":"1.4"}'], 'backup.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(importer).toHaveBeenCalledWith(file));
  });
});

describe('complete creation and notification journeys', () => {
  it('keeps a modal submit button associated with its form when footer is separate', () => {
    window.OpenCourseDeck.Modal.create = vi.fn(({ body, footer }) => {
      const modal = document.createElement('section');
      modal.append(body, footer);
      document.body.append(modal);
      return modal;
    });
    initAddContent(window);
    window.OpenCourseDeck.AddContent.createCourse();
    const form = document.querySelector('form');
    const submit = document.querySelector('.modal-footer button.btn-primary');
    expect(submit).not.toBeNull();
    expect(submit.form).toBe(form);
  });

  it('calls Toast methods with their owner when a file is skipped', async () => {
    const show = vi.fn();
    window.OpenCourseDeck.Toast = {
      show,
      info(message) { this.show({ type: 'info', message }); },
      error: vi.fn(),
    };
    initAddContent(window);
    const input = document.getElementById('file-input-video');
    Object.defineProperty(input, 'files', {
      configurable: true, value: [new File(['plain text'], 'readme.txt', { type: 'text/plain' })],
    });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'info', message: expect.stringContaining('skipped') }),
    ));
  });
});


describe('explicit import destinations', () => {
  it('lets users select an existing personal course before importing', async () => {
    const stored = { version: 1, courses: {
      'course-anatomy': { title: 'Anatomy', sources: [{ label: 'My Library', topics: [] }] },
    } };
    window.DB = {
      getSetting: vi.fn(async (key) => key === 'ocd_user_library' ? stored : null),
      saveSetting: vi.fn(async () => true),
    };
    sessionStorage.removeItem('ocd_active_import_course');
    initAddContent(window);
    document.getElementById('topbar-add-btn').click();
    const selector = await vi.waitFor(() => {
      const element = document.querySelector('[data-add-course-destination]');
      expect(element).not.toBeNull();
      expect([...element.options].some(option => option.value === 'course-anatomy')).toBe(true);
      return element;
    });
    selector.value = 'course-anatomy';
    selector.dispatchEvent(new Event('change', { bubbles: true }));
    expect(sessionStorage.getItem('ocd_active_import_course')).toBe('course-anatomy');
    sessionStorage.removeItem('ocd_active_import_course');
  });
  it('clears deleted course selection when reopening the destination picker', async () => {
    sessionStorage.setItem('ocd_active_import_course', 'course-deleted');
    window.DB = {
      getSetting: vi.fn(async key => key === 'ocd_user_library'
        ? { version: 1, courses: { 'course-current': { title: 'Current', sources: [] } } }
        : null),
      saveSetting: vi.fn(async () => true),
    };
    initAddContent(window);
    document.getElementById('topbar-add-btn').click();
    const selector = await vi.waitFor(() => {
      const el = document.querySelector('[data-add-course-destination]');
      expect(el).not.toBeNull();
      expect([...el.options].map(option => option.value)).toEqual(['', 'course-current']);
      expect(el.value).toBe('');
      return el;
    });
    expect(selector.value).toBe('');
    expect(sessionStorage.getItem('ocd_active_import_course')).toBeNull();
  });
});
