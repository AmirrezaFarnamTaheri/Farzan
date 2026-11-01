import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, eventTargetEl } from '../src/lib/dom.js';
import { createToast, createTooltips, createUiTooltip } from '../src/ui/notificationPrimitives.js';

const icon = name => createElement('span', { 'data-icon': name });

describe('shared toast and tooltip owners (#175)', () => {
  let owner;
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
    owner = {
      config: { toastDuration: 4000, toastMaxStack: 2 },
      state: { activeToasts: [] },
      bus: { emit: vi.fn() },
    };
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('preserves app-shell toast API and renders message/actions as text, not HTML', () => {
    const toast = createToast({ OpenCourseDeck: owner, createElement, spriteIcon: icon });
    const raw = '<img src=x onerror=alert(1)>';
    const node = toast.show({ title: raw, message: raw, action: raw, duration: 0 });
    expect(node.getAttribute('role')).toBe('status');
    expect(node.querySelector('.toast-title')?.textContent).toBe(raw);
    expect(node.querySelector('.toast-message')?.textContent).toBe(raw);
    expect(node.querySelector('.toast-action')?.textContent).toBe(raw);
    expect(node.querySelector('img')).toBeNull();
    expect(owner.state.activeToasts).toEqual([node]);
    toast.dismiss(node);
    node.dispatchEvent(new Event('animationend'));
    expect(node.isConnected).toBe(false);
    expect(owner.state.activeToasts).toHaveLength(0);
  });

  it('keeps one bounded stack and exposes the existing convenience methods', () => {
    const toast = createToast({ OpenCourseDeck: owner, createElement, spriteIcon: icon });
    toast.info('one', { duration: 0 });
    toast.success('two', { duration: 0 });
    toast.warning('three', { duration: 0 });
    expect(document.querySelectorAll('.toast')).toHaveLength(2);
    expect(owner.state.activeToasts).toHaveLength(2);
  });

  it('shows a keyboard-focused tooltip without HTML injection', () => {
    const tip = createTooltips({ createElement, eventTargetEl });
    tip.init();
    const anchor = createElement('button', { 'data-tip-js': '<bdi>سلام</bdi>', type: 'button' });
    document.body.appendChild(anchor);
    anchor.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    const shown = document.querySelector('[role="tooltip"]');
    expect(shown?.textContent).toBe('<bdi>سلام</bdi>');
    expect(shown?.querySelector('bdi')).toBeNull();
    anchor.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('preserves accessible UI.tooltip overlays and restores prior descriptions', () => {
    const tooltip = createUiTooltip();
    const anchor = createElement('button', { type: 'button', 'data-tooltip': 'شرح فارسی' });
    anchor.setAttribute('aria-describedby', 'existing-note');
    document.body.appendChild(anchor);
    tooltip.init();
    anchor.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(document.getElementById('ocd-ui-tooltip')?.textContent).toBe('شرح فارسی');
    expect(anchor.getAttribute('aria-describedby')).toBe('existing-note ocd-ui-tooltip');
    anchor.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(anchor.getAttribute('aria-describedby')).toBe('existing-note');
    tooltip.destroy();
    expect(document.getElementById('ocd-ui-tooltip')).toBeNull();
  });

  it('keeps app.js a consumer, not a duplicate owner of notifications', () => {
    const app = fs.readFileSync('app.js', 'utf8');
    expect(app).toMatch(/import \{ createToast, createTooltips \} from '\.\/src\/ui\/notificationPrimitives\.js'/);
    expect(app).not.toMatch(/const Toast = \{/);
    expect(app).not.toMatch(/const Tooltips = \{/);
    const ui = fs.readFileSync('ui.js', 'utf8');
    expect(ui).toMatch(/import \{ createUiTooltip \} from '\.\/src\/ui\/notificationPrimitives\.js'/);
    expect(ui).not.toMatch(/const Tooltip = \{/);
  });
});
