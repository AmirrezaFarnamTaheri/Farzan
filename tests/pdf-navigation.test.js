import { describe, expect, it, vi } from 'vitest';
import { openPdfSource, consumePdfSource } from '../src/core/pdfNavigation.js';

describe('route-owned PDF opening', () => {
  it('stores a typed pending request until the destination viewer is mounted', async () => {
    const root = {
      location: { hash: '#/courses' },
      OpenCourseDeck: {},
      PlasmaPDFViewer: { load: vi.fn(async () => true) },
    };
    const router = { navigate: vi.fn() };
    openPdfSource('blob:lecture', { root, router });
    expect(root.PlasmaPDFViewer.load).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith('#/pdf');
    await expect(consumePdfSource(root)).resolves.toBe(true);
    expect(root.PlasmaPDFViewer.load).toHaveBeenCalledWith('blob:lecture');
    await expect(consumePdfSource(root)).resolves.toBe(false);
  });

  it('uses the latest pending request if a second PDF is selected before navigation', async () => {
    const root = {
      location: { hash: '#/courses' },
      OpenCourseDeck: {},
      PlasmaPDFViewer: { load: vi.fn(async () => true) },
    };
    const router = { navigate: vi.fn() };
    openPdfSource('blob:old', { root, router });
    openPdfSource('blob:new', { root, router });
    await consumePdfSource(root);
    expect(root.PlasmaPDFViewer.load).toHaveBeenCalledExactlyOnceWith('blob:new');
  });

  it('opens a replacement PDF immediately when already on the PDF route', async () => {
    const load = vi.fn(async () => true);
    const root = {
      location: { hash: '#/pdf' },
      OpenCourseDeck: {},
      PlasmaPDFViewer: { load },
    };
    root.OpenCourseDeck.consumePdfOpen = () => consumePdfSource(root);
    await openPdfSource('blob:replacement', { root, router: { navigate: vi.fn() } });
    expect(load).toHaveBeenCalledWith('blob:replacement');
  });

  it('does not lose a pending source when the viewer is unavailable', async () => {
    const root = { OpenCourseDeck: {} };
    const router = { navigate: vi.fn() };
    openPdfSource('blob:later', { root, router });
    await expect(consumePdfSource(root)).rejects.toThrow(/viewer/i);
    root.PlasmaPDFViewer = { load: vi.fn(async () => true) };
    await consumePdfSource(root);
    expect(root.PlasmaPDFViewer.load).toHaveBeenCalledWith('blob:later');
  });
});
