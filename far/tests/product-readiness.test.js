import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enforceProductReadiness } from '../src/core/productReadiness.js';

describe('product readiness gating', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="topbar-add-btn">Add</button>
      <button data-action="add-video">Video</button>
      <button data-action="create-course">Course</button>
    `;
  });

  it('disables unresolved product actions explicitly', () => {
    const receipt = enforceProductReadiness(document);
    const topbar = document.getElementById('topbar-add-btn');
    const addVideo = document.querySelector('[data-action="add-video"]');

    expect(topbar.disabled).toBe(true);
    expect(topbar.getAttribute('aria-disabled')).toBe('true');
    expect(addVideo.disabled).toBe(true);
    expect(addVideo.dataset.capabilityState).toBe('unavailable');
    expect(receipt.unavailableActions).toContain('create-course');
  });

  it('prevents unavailable action handlers from executing', () => {
    const handler = vi.fn();
    const addVideo = document.querySelector('[data-action="add-video"]');
    addVideo.addEventListener('click', handler);
    enforceProductReadiness(document);

    addVideo.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(addVideo.disabled).toBe(true);
  });
});
