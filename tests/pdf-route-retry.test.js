import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openPdfSource } from '../src/core/pdfNavigation.js';
import { mountPdfView } from '../src/views/pdfRoute.js';

describe('PDF route retry after a failed handoff', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="view-container"></div>';
    window.OpenCourseDeck = {
      Toast: { success: vi.fn(), error: vi.fn() },
      bus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    };
    window.PlasmaPDFInit = vi.fn();
    window.PlasmaPDFDestroy = vi.fn();
    window.PlasmaPDFViewer = {
      load: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
    };
  });

  it('exposes a retry button and reuses the original PDF source without another file selection', async () => {
    openPdfSource('blob:unavailable', {
      root: window, router: { navigate: vi.fn() },
    });
    const controller = mountPdfView();
    const retry = await vi.waitFor(() => {
      const element = document.querySelector('[data-pdf-retry-pending]');
      expect(element).not.toBeNull();
      expect(element.hidden).toBe(false);
      return element;
    });
    expect(window.OpenCourseDeck.pendingPdfOpen?.source).toBe('blob:unavailable');
    expect(window.PlasmaPDFViewer.load).toHaveBeenCalledTimes(1);

    retry.click();
    await vi.waitFor(() => {
      expect(window.PlasmaPDFViewer.load).toHaveBeenCalledTimes(2);
      expect(window.OpenCourseDeck.pendingPdfOpen).toBeNull();
      expect(retry.hidden).toBe(true);
    });
    expect(window.PlasmaPDFViewer.load).toHaveBeenLastCalledWith('blob:unavailable');
    controller.unmount();
  });
});
