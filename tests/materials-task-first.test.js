import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, eventTargetEl } from '../src/lib/dom.js';
import { mountMaterialsView } from '../src/views/materialsRoute.js';

const topics = [
  { topicId: 'no-1', title: 'Unlinked introduction', courseId: 'c1', courseTitle: 'Course', sourceLabel: 'Source', videos: [], pdfs: [] },
  { topicId: 'pdf-1', title: 'Reading', courseId: 'c1', courseTitle: 'Course', sourceLabel: 'Source', videos: [], pdfs: ['https://example.org/reading.pdf'] },
  { topicId: 'video-1', title: 'Lecture', courseId: 'c1', courseTitle: 'Course', sourceLabel: 'Source', videos: ['https://example.org/lecture.mp4'], pdfs: [] },
  { topicId: 'both-1', title: 'Workshop', courseId: 'c1', courseTitle: 'Course', sourceLabel: 'Source', videos: ['https://example.org/workshop.mp4'], pdfs: ['https://example.org/workshop.pdf'] },
  { topicId: 'no-2', title: 'Unlinked recap', courseId: 'c1', courseTitle: 'Course', sourceLabel: 'Source', videos: [], pdfs: [] },
];

describe('Materials task-first browsing', () => {
  let originalDataStore;
  let originalUserLibrary;
  let cleanup;
  beforeEach(() => {
    originalDataStore = window.DataStore;
    window.OpenCourseDeck ??= {};
    originalUserLibrary = window.OpenCourseDeck.UserLibrary;
    window.DataStore = { init: vi.fn(async () => {}), allTopics: () => topics.slice() };
    window.OpenCourseDeck.UserLibrary = { overlay: async () => {} };
    document.body.innerHTML = '<div id="mount"></div>';
  });
  afterEach(() => {
    cleanup?.unmount?.();
    cleanup = null;
    window.DataStore = originalDataStore;
    window.OpenCourseDeck.UserLibrary = originalUserLibrary;
    document.body.innerHTML = '';
  });

  async function mount() {
    cleanup = await mountMaterialsView({
      setView: html => { document.body.innerHTML = html; },
      createElement,
      eventTargetEl,
      safeMediaUrl: value => typeof value === 'string' && value.startsWith('https://') ? value : null,
      Router: { navigate: vi.fn() },
      setPendingCourseMedia: vi.fn(),
      Paginator: {
        paginate(items, state) {
          const pages = Math.max(1, Math.ceil(items.length / state.perPage));
          const page = Math.min(state.page, pages);
          return { page, pages, perPage: state.perPage, total: items.length,
            slice: items.slice((page - 1) * state.perPage, page * state.perPage) };
        },
        renderControls(root, { total }) { root.textContent = `${total} materials`; },
      },
    });
  }

  it('places topics with attached video and PDFs ahead of unlinked catalog records without dropping anything', async () => {
    await mount();
    expect([...document.querySelectorAll('#materials-list [data-topic-id]')].map(el => el.dataset.topicId))
      .toEqual(['both-1', 'video-1', 'pdf-1', 'no-1', 'no-2']);
    document.querySelector('[data-material-filter="none"]').click();
    expect([...document.querySelectorAll('#materials-list [data-topic-id]')].map(el => el.dataset.topicId))
      .toEqual(['no-1', 'no-2']);
    expect(document.querySelector('[data-material-filter="none"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps course/source selectors accessible but collapsed until the user needs them', async () => {
    await mount();
    const optional = document.querySelector('details.materials-more-filters');
    expect(optional).not.toBeNull();
    expect(optional.open).toBe(false);
    expect(optional.querySelector('summary')?.textContent).toMatch(/course|filter/i);
    expect(optional.querySelector('#materials-course-filter')).not.toBeNull();
    expect(optional.querySelector('#materials-source-filter')).not.toBeNull();
    optional.open = true;
    expect(optional.querySelector('#materials-course-filter option[value="c1"]')).not.toBeNull();
  });

  it('uses Persian course/source reading order while keeping English material names and controls LTR', async () => {
    window.DataStore.allTopics = () => [
      {
        topicId: 'embryology-ectoderm', courseId: 'embryology',
        title: 'Ectoderm', courseTitle: 'دوره جامع جنین‌شناسی پزشکی',
        sourceLabel: 'شروع این دوره',
        videos: ['https://example.org/ectoderm.mp4'],
        pdfs: ['https://example.org/ectoderm.pdf'],
      },
      {
        topicId: 'english-only', courseId: 'english-course',
        title: 'Cell Anatomy', courseTitle: 'English course',
        sourceLabel: 'Introduction', videos: [], pdfs: [],
      },
    ];
    await mount();
    const rtl = document.querySelector('[data-topic-id="embryology-ectoderm"]');
    expect(rtl?.getAttribute('dir')).toBe('rtl');
    expect(rtl.querySelector('.topic-title')?.getAttribute('dir')).toBe('auto');
    expect(rtl.querySelector('.topic-title')?.textContent).toBe('Ectoderm');
    expect(rtl.querySelector('.topic-submeta')?.textContent).toContain('دوره جامع');
    expect(rtl.querySelector('.topic-meta')?.getAttribute('dir')).toBe('ltr');
    expect(rtl.querySelector('.topic-actions')?.getAttribute('dir')).toBe('ltr');
    expect([...rtl.querySelectorAll('.topic-actions button')].map(btn => btn.dataset.action))
      .toEqual(['play-video', 'open-pdf']);
    expect(document.querySelector('[data-topic-id="english-only"]')?.getAttribute('dir')).toBe('ltr');
  });

});
