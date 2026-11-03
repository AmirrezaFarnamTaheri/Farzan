import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal, Drawer } from '../src/ui/overlays.js';

describe('one-owner overlay document event delegation (#175)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="modal-action" data-modal-open="unused-modal">Open modal</button>
      <button id="drawer-action" data-drawer-open="unused-drawer">Open drawer</button>
    `;
  });

  afterEach(() => {
    Modal.destroy?.();
    Drawer.destroy?.();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('does not dispatch a modal trigger twice after repeated init', () => {
    const open = vi.spyOn(Modal, 'open').mockImplementation(() => {});
    Modal.init();
    Modal.init();
    document.getElementById('modal-action').click();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('unused-modal');
  });

  it('does not dispatch drawer trigger and Escape twice after repeated init', () => {
    const open = vi.spyOn(Drawer, 'open').mockImplementation(() => {});
    const closeAll = vi.spyOn(Drawer, 'closeAll').mockImplementation(() => {});
    Drawer.init();
    Drawer.init();
    document.getElementById('drawer-action').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('unused-drawer');
    expect(closeAll).toHaveBeenCalledTimes(1);
  });

  it('detaches only its own overlay delegation on destroy and allows a new init', () => {
    const modalOpen = vi.spyOn(Modal, 'open').mockImplementation(() => {});
    const drawerOpen = vi.spyOn(Drawer, 'open').mockImplementation(() => {});
    Modal.init();
    Drawer.init();
    Modal.destroy();
    Drawer.destroy();
    document.getElementById('modal-action').click();
    document.getElementById('drawer-action').click();
    expect(modalOpen).not.toHaveBeenCalled();
    expect(drawerOpen).not.toHaveBeenCalled();
    Modal.init();
    Drawer.init();
    document.getElementById('modal-action').click();
    document.getElementById('drawer-action').click();
    expect(modalOpen).toHaveBeenCalledTimes(1);
    expect(drawerOpen).toHaveBeenCalledTimes(1);
  });
});
