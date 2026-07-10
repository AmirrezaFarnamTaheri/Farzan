/**
 * Workbox configuration for portable production output in `dist/`.
 * The generated service worker and all precached assets share the same
 * deployment root so the release can be served by any static host.
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
  navigateFallback: './index.html',
  cleanupOutdatedCaches: true,
  ignoreURLParametersMatching: [/^utm_/, /^fbclid$/],
  runtimeCaching: [
    {
      urlPattern: ({ url }) => url.pathname.includes('/data/'),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'opencoursedeck-data',
        networkTimeoutSeconds: 3,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: ({ url }) => url.pathname.includes('/vendor/'),
      handler: 'CacheFirst',
      options: {
        cacheName: 'opencoursedeck-vendor',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: ({ url }) =>
        url.pathname.endsWith('/opencoursedeck.js') || url.pathname.includes('/chunks/'),
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'opencoursedeck-app-bundle',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
    },
  ],
};
