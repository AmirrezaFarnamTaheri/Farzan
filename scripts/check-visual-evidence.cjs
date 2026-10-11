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
  const minHeight = relative.startsWith('contact-sheet-') ? 200 : 390;
  assert(width >= 320 && height >= minHeight, 'Image resolution too small: ' + relative);
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
        ' is invalid JSON: ' + error.message, { cause: error });
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

// Offline, navigable image gallery makes every actual screenshot inspectable
// without GitHub login, an image-hosting service or a build tool.
const esc = text => String(text).replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');
const navigation = matrix.map(([group, count]) =>
  '<a href="#' + esc(group) + '">' + esc(group) + ' (' + count + ')</a>').join('');
const sections = matrix.map(([group, count]) => {
  const frames = images.filter(item => item.path.startsWith('screenshots/' + group + '/'));
  const sheet = 'contact-sheet-' + group + '.png';
  const tiles = frames.map(frame =>
    '<a class="tile" href="' + esc(frame.path) + '" target="_blank" rel="noopener">' +
    '<img src="' + esc(frame.path) + '" alt="' + esc(frame.path) +
    '" loading="lazy"><span>' + esc(frame.path.split('/').pop()) +
    '</span></a>').join('');
  return '<section id="' + esc(group) + '"><h2>' + esc(group) + ' <small>' +
    count + ' actual browser frames</small></h2>' +
    '<p><a href="' + esc(sheet) + '" target="_blank" rel="noopener">Open contact sheet</a></p>' +
    '<a href="' + esc(sheet) + '" target="_blank" rel="noopener">' +
    '<img class="sheet" src="' + esc(sheet) + '" alt="' + esc(group) +
    ' contact sheet" loading="lazy"></a><div class="tiles">' +
    tiles + '</div></section>';
}).join('');
const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Farzan Plasmato 1.0.3 - verified visual gallery</title>' +
  '<style>body{margin:0;background:#101923;color:#e8eef6;font:15px/1.5 system-ui,sans-serif}' +
  'header{padding:30px clamp(15px,4vw,60px);background:#1b2c40}h1{margin:0}' +
  'nav{display:flex;flex-wrap:wrap;gap:8px;padding:16px;background:#152234;position:sticky;top:0}' +
  'a{color:#a9d7ff}nav a{border:1px solid #445c74;border-radius:20px;padding:3px 12px}' +
  'main{padding:20px clamp(15px,4vw,60px)}section{padding:30px 0;border-bottom:1px solid #445c74}' +
  '.sheet{max-width:min(100%,1350px);max-height:750px;object-fit:contain;border:1px solid #445c74}' +
  '.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:16px;margin-top:18px}' +
  '.tile{display:flex;flex-direction:column;border:1px solid #445c74;border-radius:8px;overflow:hidden;' +
  'background:#1b2c40;text-decoration:none}.tile img{height:145px;width:100%;object-fit:contain}' +
  '.tile span{padding:8px 12px;overflow-wrap:anywhere}small{color:#afbbca}</style></head><body>' +
  '<header><h1>Farzan Plasmato v1.0.3 - Visual Evidence</h1>' +
  '<p>308 actual Chrome captures across 24 groups; no synthetic UI renderings.</p>' +
  '<p><a href="manifest.json">SHA-256 evidence manifest</a> · ' +
  '<a href="VISUAL-REPORT.md">Full coverage and limitations</a></p></header><nav>' +
  navigation + '</nav><main>' + sections + '</main></body></html>';
fs.writeFileSync(path.join(root, 'index.html'), html);
assert.equal((html.match(/class="tile"/g) || []).length, expectedCount,
  'The offline gallery did not include every screenshot');

console.log('[visual-evidence] verified ' + images.length + ' browser screenshots, ' +
  matrix.length + ' groups, ' + contactSheets.length + ' contact sheets');
