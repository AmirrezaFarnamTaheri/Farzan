'use strict';

const path = require('node:path');

// Local browser data is origin-bound. Using port 0 created a fresh origin on
// every launch, making a saved library look lost despite remaining on disk.
// Do not silently fall back to a random port if this one is busy.
const DESKTOP_PORT = 51628;
const DESKTOP_ORIGIN = `http://127.0.0.1:${DESKTOP_PORT}/`;

function browserProfileDirectory(home) {
  return path.join(home, '.opencoursedeck', 'browser-app');
}

module.exports = { DESKTOP_PORT, DESKTOP_ORIGIN, browserProfileDirectory };
