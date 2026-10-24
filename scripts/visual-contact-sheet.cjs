'use strict';
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve('artifacts/visual-audit');
const screenshots = path.join(root, 'screenshots');

async function make(group) {
  const dir = path.join(screenshots, group);
  const files = fs.readdirSync(dir).filter(file => file.endsWith('.png')).sort();
  if (!files.length) return;
  const cols = /(?:states|functional|standalone)/.test(group) ? 4 : 5;
  const w = 310, h = 246;
  const layers = [];
  for (let i = 0; i < files.length; i++) {
    const thumb = await sharp(path.join(dir, files[i]))
      .resize({ width: 286, height: 210, fit: 'contain', background: '#101820' })
      .png().toBuffer();
    const label = files[i].replace(/\.png$/, '').replace(/[^a-zA-Z0-9 _.()-]/g, '');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="26">' +
      '<text x="7" y="18" font-family="Arial" font-size="13" fill="#263a50">' +
      label + '</text></svg>');
    const x = (i % cols) * w + 14, y = Math.floor(i / cols) * h + 10;
    layers.push({ input: thumb, left: x, top: y },
      { input: svg, left: x, top: y + 211 });
  }
  const target = path.join(root, 'contact-sheet-' + group + '.png');
  await sharp({ create: {
    width: cols * w + 22, height: Math.ceil(files.length / cols) * h + 24,
    channels: 3, background: '#f1f5f8',
  } }).composite(layers).png().toFile(target);
  console.log('[visual-audit] ' + group + ': ' + files.length + ' captures => ' + target);
}

(async () => {
  if (!fs.existsSync(screenshots)) {
    console.warn('[visual-audit] No screenshots were captured before the failed build');
    return;
  }
  const groups = fs.readdirSync(screenshots, { withFileTypes: true })
    .filter(e => e.isDirectory()).map(e => e.name).sort();
  if (!groups.length) throw new Error('No screenshot groups');
  for (const group of groups) await make(group);
})().catch(error => { console.error(error); process.exitCode = 1; });
