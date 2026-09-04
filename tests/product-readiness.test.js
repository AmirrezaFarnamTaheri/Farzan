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

  it('keeps library creation actions available', () => {
    const receipt = enforceProductReadiness(document);
    const topbar = document.getElementById('topbar-add-btn');
    const addVideo = document.querySelector('[data-action="add-video"]');

    expect(topbar.disabled).toBe(false);
    expect(topbar.getAttribute('aria-disabled')).not.toBe('true');
    expect(addVideo.disabled).toBe(false);
    expect(addVideo.dataset.capabilityState).not.toBe('unavailable');
    expect(receipt.unavailableActions).toEqual([]);
  });

  it('does not intercept add-content clicks', () => {
    const handler = vi.fn();
    const addVideo = document.querySelector('[data-action="add-video"]');
    addVideo.addEventListener('click', handler);
    enforceProductReadiness(document);

    addVideo.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(handler).toHaveBeenCalled();
    expect(addVideo.disabled).toBe(false);
  });
});
