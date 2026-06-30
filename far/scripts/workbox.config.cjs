/**
 * Workbox config for generating `sw.js` in the project root.
 * Cache names are versioned from package.json so updates bust old precache buckets.
 */
const pkg = require('../package.json');

module.exports = {
  /** Bumps Workbox cache namespace whenever app version changes — avoids stale precache. */
  cacheId: `opencoursedeck-v${pkg.version}`,
  globDirectory: '.',
  globPatterns: [
    'index.html',
    'boot.js',
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
  clientsClaim: true,
  skipWaiting: true,
  cleanupOutdatedCaches: true,
  // In case older builds referenced removed files (e.g. dist/index.js),
  // don't keep them cached forever.
  ignoreURLParametersMatching: [/^utm_/, /^fbclid$/],
  // Leave runtimeCaching minimal for now; Phase 7 will finalize.
  runtimeCaching: [
    {
      urlPattern: ({ url }) => url.pathname.startsWith('/data/'),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'plasma-data',
        networkTimeoutSeconds: 3,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60, // 1 day
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
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
      },
    },
    {
      // Ensure app bundle updates reflect quickly in production.
      urlPattern: ({ url }) => url.pathname.startsWith('/dist/'),
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'plasma-dist',
        expiration: {
          maxEntries: 20,
          maxAgeSeconds: 24 * 60 * 60, // 1 day
        },
      },
    },
  ],
};

