'use strict';
// Import screenshots from a completed Chrome visual-acceptance run without
// changing or regenerating the captured PNG bytes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const source = path.resolve(process.argv[2] || '_visual-capture/artifacts/visual-audit');
const output = path.resolve('screenshots/current');
const screenshotSource = path.join(source, 'screenshots');
const groups = new Map([
  ['desktop', { count: 15, width: 1440, height: 900 }],
  ['tablet', { count: 15, width: 900, height: 1080 }],
  ['mobile', { count: 15, width: 390, height: 844 }],
  ['light-desktop', { count: 15, width: 1440, height: 900 }],
  ['light-mobile', { count: 15, width: 390, height: 844 }],
  ['functional', { count: 26, width: 1280, height: 720 }],
  ['standalone', { count: 6, width: null, height: null }],
]);
const sourceRun = 38177326118;
const pngMagic = Buffer.from([137,80,78,71,13,10,26,10]);
const manifest = {
  edition: 'Farzan Plasmato',
  sourceRun,
  sourceWorkflow: 'Plasmato Visual and Functional Acceptance',
  sourceBranch: 'qa/plasmato-visual-acceptance-20261012',
  captures: [],
  contactSheets: [],
};
const gallery = [
  '# Farzan Plasmato - Actual App Screenshots',
  '',
  'These are unchanged Chrome/Playwright PNG captures from successful [visual acceptance run 38177326118](https://github.com/AmirrezaFarnamTaheri/Farzan/actions/runs/38177326118).',
  'They document actual application states, not concepts, generated mockups, or claims of third-party media availability.',
  'The functional video capture plays a browser-recorded WebM fixture through the native player; it does not prove remote media hosts are reachable.',
  '',
  'There are 107 screenshots across 15 routes and working interaction states, plus seven contact sheets.',
  'The complete SHA-256, dimensions, and byte counts are in [manifest.json](manifest.json).',
  '',
  '## Overview contact sheets',
  '',
];

function digest(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function capture(sourceFile, relative, expected) {
  const bytes = fs.readFileSync(sourceFile);
  assert(bytes.length > 12_000, 'Screenshot unexpectedly small: ' + sourceFile);
  assert(bytes.subarray(0, 8).equals(pngMagic), 'Invalid PNG signature: ' + sourceFile);
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', 'Missing PNG IHDR: ' + sourceFile);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (expected?.width) assert.equal(width, expected.width, 'Wrong screenshot width: ' + sourceFile);
  if (expected?.height) assert.equal(height, expected.height, 'Wrong screenshot height: ' + sourceFile);
  // Contact sheets are composites; their height depends on the number of tiles.
  const minHeight = relative.startsWith('contact-sheets/') ? 400 : 600;
  assert(width >= 320 && height >= minHeight, 'Screenshot dimensions too small: ' + sourceFile);
  const destination = path.join(output, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, bytes);
  return { path: relative.replaceAll(path.sep, '/'), width, height, bytes: bytes.length, sha256: digest(bytes) };
}

assert(fs.existsSync(path.join(source, 'observations.jsonl')), 'Missing visual test observations');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const [group, shape] of groups) {
  const directory = path.join(screenshotSource, group);
  assert(fs.statSync(directory).isDirectory(), 'Missing screenshot group: ' + group);
  const names = fs.readdirSync(directory).filter(name => name.endsWith('.png')).sort();
  assert.equal(names.length, shape.count, 'Incomplete screenshot group: ' + group);
  gallery.push('## ' + group + ' (' + names.length + ')', '');
  for (const name of names) {
    assert(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.png$/.test(name), 'Unsafe screenshot name: ' + name);
    const relative = path.posix.join(group, name);
    const entry = capture(path.join(directory, name), relative, shape);
    manifest.captures.push(entry);
    gallery.push('- [' + name.replace(/\.png$/, '').replace(/-/g, ' ') + '](' + relative + ')');
  }
  gallery.push('');
}
assert.equal(manifest.captures.length, 107, 'Expected exactly 107 accepted screen captures');
for (const group of groups.keys()) {
  const name = 'contact-sheet-' + group + '.png';
  const from = path.join(source, name);
  assert(fs.existsSync(from), 'Missing visual review contact sheet: ' + name);
  const entry = capture(from, path.posix.join('contact-sheets', name));
  manifest.contactSheets.push(entry);
  gallery.splice(gallery.indexOf('## ' + group + ' (' + groups.get(group).count + ')'), 0,
    '### ' + group + ' overview',
    '',
    '![' + group + ' route overview](' + entry.path + ')',
    '');
}
assert.equal(manifest.contactSheets.length, 7, 'Missing contact sheets');
const observationBytes = fs.readFileSync(path.join(source, 'observations.jsonl'));
assert(observationBytes.length > 1000, 'Missing visual acceptance observations');
fs.writeFileSync(path.join(output, 'observations.jsonl'), observationBytes);
manifest.observations = { path: 'observations.jsonl', bytes: observationBytes.length, sha256: digest(observationBytes) };
manifest.totalScreenshots = manifest.captures.length;
manifest.totalContactSheets = manifest.contactSheets.length;
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'README.md'), gallery.join('\n') + '\n');
// Update historical README screenshot paths to show actual up-to-date app UI.
// Keep the redesign research files, architecture drawings, and prototypes intact.
const replacements = new Map([
  ['home.png', '01-home.png'],
  ['courses.png', '02-courses.png'],
  ['notes.png', '05-notes.png'],
  ['pdf.png', '06-pdf.png'],
  ['progress.png', '07-progress.png'],
  ['flashcards.png', '11-flashcards.png'],
  ['studio.png', '12-studio.png'],
  ['settings.png', '14-settings.png'],
]);
for (const [original, name] of replacements) {
  const from = path.join(output, 'desktop', name);
  const to = path.resolve('screenshots', original);
  assert(fs.existsSync(from), 'Missing required README screenshot: ' + from);
  fs.copyFileSync(from, to);
  assert.equal(digest(fs.readFileSync(to)), digest(fs.readFileSync(from)), 'Screenshot copy mismatch: ' + original);
}
console.log('[visual-screenshots] 107 original PNG captures, 7 contact sheets and 8 current app README screenshots verified.');
