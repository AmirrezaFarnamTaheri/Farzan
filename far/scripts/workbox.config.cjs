/**
 * Workbox config for generating `sw.js` in the project root.
 * Cache names are versioned from package.json so updates bust old precache buckets.
 */
const pkg = require('../package.json');

module.exports = {
  cacheId: `opencoursedeck-v${pkg.version}`,
  globDirectory: '.',
  globPatterns: [
    'index.html',
    'boot.js',
    'pdf-runtime.js',
    'manifest.json',
    'style.css',
    'plasmato_full_*.json',
    'assets/**',
    'vendor/**',
    'dist/**',
    'data/**',
  ],
  swDest: 'sw.js',
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  // Do not take over an active editing session. A new worker remains waiting
  // until clients close/reload and can be activated through the update UI.
  clientsClaim: false,
  skipWaiting: false,
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
      urlPattern: ({ url }) => url.pathname.startsWith('/dist/'),
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'plasma-dist',
        expiration: {
          maxEntries: 20,
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
    },
  ],
};
