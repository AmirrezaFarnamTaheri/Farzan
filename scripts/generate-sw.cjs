const { generateSW } = require('workbox-build');
const config = require('./workbox.config.cjs');

generateSW(config)
  .then(({ count, size, warnings = [] }) => {
    for (const warning of warnings) console.warn('[workbox]', warning);
    console.log(`[workbox] precached ${count} URLs, ${(size / (1024 * 1024)).toFixed(1)} MB`);
  })
  .catch((error) => {
    console.error('[workbox] failed', error);
    process.exit(1);
  });
