/**
 * Workbox configuration for deployable production output in `dist/`.
 * This intentionally differs from the root-level development configuration:
 * the generated service worker and every precached URL live under the same
 * deployment root, so static hosts such as Vercel can serve the app offline.
 */
const pkg = require('../package.json');

module.exports = {
  cacheId: `opencoursedeck-v${pkg.version}`,
  globDirectory: 'dist',
  globPatterns: [
    'index.html',
    'boot.js',
    'manifest.json',
    'style.css',
    'opencoursedeck.js',
    'opencoursedeck.js.map',
    'chunks/**',
    'assets/**',
    'vendor/**',
    'data/**',
    'docs/**',
  ],
  swDest: 'dist/sw.js',
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  clientsClaim: true,
  skipWaiting: true,
  navigateFallback: '/index.html',
  cleanupOutdatedCaches: true,
  ignoreURLParametersMatching: [/^utm_/, /^fbclid$/],
  runtimeCaching: [
    {
      urlPattern: ({ url }) => url.pathname.startsWith('/data/'),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'plasma-data',
        networkTimeoutSeconds: 3,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: ({ url }) => url.pathname.startsWith('/vendor/'),
      handler: 'CacheFirst',
      options: {
        cacheName: 'plasma-vendor',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: ({ url }) =>
        url.pathname === '/opencoursedeck.js' || url.pathname.startsWith('/chunks/'),
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'plasma-app-bundle',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
    },
  ],
};
