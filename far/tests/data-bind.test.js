import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('DataBind safe DOM binding', () => {
  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="target"></div>';
    window.PlasmaDeck = { bus: { emit: vi.fn() } };
    await import('../data.js');
  });

  it('downgrades innerHTML bindings to textContent', () => {
    const store = new window.PlasmaDeck.Data.Store({
      state: { title: '<img src=x onerror="window.__bindXss = true">' },
    });

    window.PlasmaDeck.Data.DataBind.bind(store, 'title', '#target', 'innerHTML');

    const target = document.getElementById('target');
    expect(target.textContent).toContain('<img');
    expect(target.querySelector('img')).toBeNull();
    expect(window.__bindXss).toBeUndefined();
  });

  it('rejects unsafe DataBind URL and event attributes', () => {
    const store = new window.PlasmaDeck.Data.Store({
      state: {
        link: 'javascript:window.__bindUrlXss = true',
        handler: 'window.__bindHandlerXss = true',
      },
    });
    const target = document.getElementById('target');
    target.setAttribute('href', 'https://safe.example.test/');
    target.setAttribute('onclick', 'window.__oldHandler = true');

    window.PlasmaDeck.Data.DataBind.bind(store, 'link', '#target', 'href');
    window.PlasmaDeck.Data.DataBind.bind(store, 'handler', '#target', 'onclick');

    expect(target.hasAttribute('href')).toBe(false);
    expect(target.hasAttribute('onclick')).toBe(false);
    expect(window.__bindUrlXss).toBeUndefined();
    expect(window.__bindHandlerXss).toBeUndefined();
  });

  it('applies DataBind style objects but ignores raw style strings', () => {
    const store = new window.PlasmaDeck.Data.Store({
      state: {
        safeStyle: { color: 'rgb(255, 0, 0)' },
        unsafeStyle: 'background-image:url(javascript:window.__bindStyleXss=true)',
      },
    });
    const target = document.getElementById('target');

    window.PlasmaDeck.Data.DataBind.bind(store, 'safeStyle', target, 'style');
    expect(target.style.color).toBe('rgb(255, 0, 0)');

    window.PlasmaDeck.Data.DataBind.bind(store, 'unsafeStyle', target, 'style');
    expect(target.style.backgroundImage).toBe('');
    expect(window.__bindStyleXss).toBeUndefined();
  });
});
