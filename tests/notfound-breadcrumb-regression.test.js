import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = fs.readFileSync('app.js', 'utf8');
const knownRoutes = fs.readFileSync('src/views/notFoundRoute.js', 'utf8');

describe('missing-route navigation', () => {
  it('preserves Home as a breadcrumb parent on desktop unknown URLs', () => {
    // Only Home itself and narrow viewports should render a single crumb.
    expect(app).not.toContain("isHome || title === 'Page not found'");
    expect(app).toContain("createElement('a', { href: '#/home', class: 'breadcrumb-link' }, 'Home')");
    expect(knownRoutes).toContain('data-missing-route');
  });
});
