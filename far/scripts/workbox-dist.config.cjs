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
    'pdf-runtime.js',
    'manifest.json',
    'style.css',
    'src/styles/**',
    'opencoursedeck.js',
    'chunks/**',
    'assets/**',
    'vendor/**',
    'data/**',
    'docs/**',
  ],
  swDest: 'dist/sw.js',
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  // Keep a new worker waiting until existing clients naturally release it.
  // This prevents an update from taking control and reloading a page while a
  // note, canvas mutation, backup import, or playback checkpoint is in flight.
  clientsClaim: false,
  skipWaiting: false,
  navigateFallback: './index.html',
  cleanupOutdatedCaches: true,
  ignoreURLParametersMatching: [/^utm_/, /^fbclid$/],
  runtimeCaching: [
    {
      urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/data/'),
      handler: 'NetworkFirst',
      options: {
        cacheName: `opencoursedeck-data-v${pkg.version}`,
        networkTimeoutSeconds: 3,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/vendor/'),
      handler: 'CacheFirst',
      options: {
        cacheName: `opencoursedeck-vendor-v${pkg.version}`,
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: ({ url, sameOrigin }) => sameOrigin && (
        url.pathname.endsWith('/opencoursedeck.js') || url.pathname.includes('/chunks/')
      ),
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: `opencoursedeck-app-bundle-v${pkg.version}`,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
    },
  ],
};
