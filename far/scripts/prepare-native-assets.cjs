#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = process.cwd();
const source = path.join(root, 'assets', 'icon-192.svg');
const targetDirectory = path.join(root, 'src-tauri', 'icons');
const target = path.join(targetDirectory, 'icon.png');

async function main() {
  if (!fs.existsSync(source)) throw new Error(`Native icon source not found: ${source}`);
  fs.mkdirSync(targetDirectory, { recursive: true });

  const bytes = await sharp(source, { density: 192 })
    .resize(256, 256, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: false,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
    .toBuffer();

  if (bytes.length < 512) throw new Error(`Generated native icon is unexpectedly small: ${bytes.length} bytes`);
  fs.writeFileSync(target, bytes);

  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  console.log(`Prepared ${path.relative(root, target)} (${bytes.length} bytes, sha256:${digest})`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
