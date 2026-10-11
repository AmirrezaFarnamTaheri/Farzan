'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const root = path.resolve('artifacts/visual-audit');
const imageRoot = path.join(root, 'screenshots');
const routes = ['home', 'courses', 'my-courses', 'materials', 'notes', 'pdf',
  'progress', 'playlists', 'bookmarks', 'tags', 'flashcards', 'studio',
  'achievements', 'settings', 'help'];
// The matrix is deliberately explicit; missing screenshots must fail CI.
const matrix = [
  ['desktop', 15, 1440, 900], ['tablet', 15, 900, 1080],
  ['mobile', 15, 390, 844], ['light-desktop', 15, 1440, 900],
  ['light-mobile', 15, 390, 844], ['functional', 26, 1280, 720],
  ['standalone', 6, null, null],
  ['small-mobile', 15, 320, 740], ['wide-desktop', 15, 1920, 1080],
  ['light-tablet', 15, 900, 1080], ['rtl-desktop', 15, 1440, 900],
  ['rtl-mobile', 15, 390, 844], ['large-type', 15, 1440, 900],
  ['compact-density', 15, 1280, 800],
  ['reduced-motion', 15, 1280, 800],
  ['keyboard-focus', 15, 1280, 800],
  ['full-page', 15, 1440, null],
  ['course-states', 8, 1280, 720],
  ['materials-states', 8, 1280, 720],
  ['notes-states', 6, 1280, 720],
  ['settings-states', 9, 1280, 720],
  ['studio-states', 7, 1280, 720],
  ['study-states', 4, 1280, 720],
  ['standalone-responsive', 9, null, null],
];
const expectedCount = matrix.reduce((sum, item) => sum + item[1], 0);
assert.equal(expectedCount, 308, 'Expected the reviewed 308-capture evidence matrix');
const read = file => fs.readFileSync(path.join(root, file));
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function pngRecord(relative, bounds = {}) {
  const data = read(relative);
  assert(data.length > 12000, 'Image too small: ' + relative);
  assert.deepEqual([...data.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10], 'PNG magic invalid: ' + relative);
  assert.equal(data.toString('ascii', 12, 16), 'IHDR', 'PNG IHDR invalid: ' + relative);
  const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
  assert(width >= 320 && height >= 390, 'Image resolution too small: ' + relative);
  if (bounds.width) assert.equal(width, bounds.width, 'Screenshot width: ' + relative);
  if (bounds.height) assert.equal(height, bounds.height, 'Screenshot height: ' + relative);
  return { path: relative, width, height, bytes: data.length, sha256: digest(data) };
}

const images = [], contactSheets = [];
for (const [group, expected, width, height] of matrix) {
  const directory = path.join(imageRoot, group);
  assert(fs.statSync(directory).isDirectory(), 'Missing screenshot group: ' + group);
  const files = fs.readdirSync(directory).filter(name => name.endsWith('.png')).sort();
  assert.equal(files.length, expected, 'Incomplete screenshot group: ' + group);
  assert(files.every(name => /^[A-Za-z0-9][A-Za-z0-9_.-]*\.png$/.test(name)),
    'Invalid image filename in group: ' + group);
  if (expected === 15) {
    assert.deepEqual(files, routes.map((route, index) =>
      String(index + 1).padStart(2, '0') + '-' + route + '.png'),
    'Missing route screenshot in group: ' + group);
  }
  for (const name of files) {
    images.push(pngRecord(path.posix.join('screenshots', group, name),
      { width, height }));
  }
  contactSheets.push(pngRecord('contact-sheet-' + group + '.png'));
}
assert.equal(images.length, 308);
assert.equal(contactSheets.length, 24);

const observationBytes = read('observations.jsonl');
const observations = observationBytes.toString('utf8').trim().split('\n')
  .map((line, index) => {
    try { return JSON.parse(line); } catch (error) {
      throw new Error('Visual evidence observation line ' + (index + 1) +
        ' is invalid JSON: ' + error.message);
    }
  });
const captures = observations.filter(item => typeof item.file === 'string');
assert.equal(captures.length, expectedCount,
  'A browser observation is missing or screenshot evidence was duplicated');
const failures = observations.filter(item => item.error ||
  (Array.isArray(item.failures) && item.failures.length) ||
  (Array.isArray(item.exceptions) && item.exceptions.length));
assert.equal(failures.length, 0,
  'An accepted screenshot has an associated failed route or browser error');
const seen = new Set(captures.map(item => item.file.replaceAll('\\', '/')));
assert.equal(seen.size, expectedCount, 'Duplicate browser observations');
for (const entry of images) {
  assert(seen.has(entry.path), 'Missing browser proof for ' + entry.path);
}
const manifest = {
  edition: 'Farzan Plasmato Edition', editionVersion: '1.0.3',
  capturedBy: 'real Chrome and Playwright tests',
  commit: process.env.GITHUB_SHA || null,
  totalScreenshots: images.length, totalContactSheets: contactSheets.length,
  routes,
  matrix: matrix.map(([group, count, width, height]) => ({ group, count, width, height })),
  images, contactSheets,
  observations: { path: 'observations.jsonl', bytes: observationBytes.length,
    sha256: digest(observationBytes) },
  limits: [
    'Browser-recorded WebM proves local playback behavior, not remote Plasmato media hosting.',
    'RTL layout stress does not imply Persian translations are available.',
    'Screenshots do not prove screen-reader compatibility or native installer lifecycle.',
  ],
};
fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const report = [
  '# Plasmato Edition 1.0.3 - visual and functional evidence',
  '',
  '**' + images.length + ' accepted browser screenshots and ' +
    contactSheets.length + ' contact sheets** from the production site.',
  '',
  '## Inventory',
  '',
  ...matrix.map(([group, count]) => '- ' + group + ': ' + count + ' PNG captures'),
  '',
  'The companion manifest.json records every image SHA-256, byte size, dimensions,',
  'source commit and associated browser observations.',
  '',
  '## Evidence boundaries',
  '',
  ...manifest.limits.map(line => '- ' + line),
  '',
].join('\n');
fs.writeFileSync(path.join(root, 'VISUAL-REPORT.md'), report);
console.log('[visual-evidence] verified ' + images.length + ' browser screenshots, ' +
  matrix.length + ' groups, ' + contactSheets.length + ' contact sheets');
