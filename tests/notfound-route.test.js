import { describe, expect, it } from 'vitest';
import { mountNotFoundView } from '../src/views/notFoundRoute.js';

describe('missing route', () => {
  it('shows a useful recovery route and treats unknown addresses as text', () => {
    document.body.innerHTML = '<main id="main-content"></main>';
    const requested = '#/<img src=x onerror=alert(1)>';
    mountNotFoundView({
      hash: requested,
      setView: html => { document.getElementById('main-content').innerHTML = html; },
    });
    expect(document.querySelector('[data-missing-route]').textContent).toBe(requested);
    expect(document.querySelector('.view-notfound img')).toBeNull();
    expect(document.querySelector('.view-notfound a[href="#/"]')).not.toBeNull();
  });
});
