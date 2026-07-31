#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = process.cwd();
const source = path.join(root, 'assets', 'icon-192.svg');
const targetDirectory = path.join(root, 'src-tauri', 'icons');
const pngTarget = path.join(targetDirectory, 'icon.png');
const icoTarget = path.join(targetDirectory, 'icon.ico');

function createPngBackedIco(pngBytes) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // image type: icon
  header.writeUInt16LE(1, 4); // one image

  const entry = Buffer.alloc(16);
  entry.writeUInt8(0, 0); // 256px width is encoded as 0
  entry.writeUInt8(0, 1); // 256px height is encoded as 0
  entry.writeUInt8(0, 2); // palette colors
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBytes.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, pngBytes]);
}

function verifyIco(bytes) {
  if (bytes.length < 512) throw new Error(`Generated native ICO is unexpectedly small: ${bytes.length} bytes`);
  if (bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1 || bytes.readUInt16LE(4) !== 1) {
    throw new Error('Generated native ICO has an invalid ICONDIR header');
  }
  const imageOffset = bytes.readUInt32LE(18);
  if (imageOffset !== 22 || !bytes.subarray(imageOffset, imageOffset + 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('Generated native ICO does not contain the expected PNG payload');
  }
}

async function main() {
  if (!fs.existsSync(source)) throw new Error(`Native icon source not found: ${source}`);
  fs.mkdirSync(targetDirectory, { recursive: true });

  const pngBytes = await sharp(source, { density: 192 })
    .resize(256, 256, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: false,
    })
    .ensureAlpha(1)
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
    .toBuffer();

  if (pngBytes.length < 512) throw new Error(`Generated native icon is unexpectedly small: ${pngBytes.length} bytes`);
  const metadata = await sharp(pngBytes).metadata();
  if (metadata.width !== 256 || metadata.height !== 256 || metadata.channels !== 4) {
    throw new Error(`Generated native icon must be 256x256 RGBA; received ${metadata.width}x${metadata.height} with ${metadata.channels} channels`);
  }

  const icoBytes = createPngBackedIco(pngBytes);
  verifyIco(icoBytes);
  fs.writeFileSync(pngTarget, pngBytes);
  fs.writeFileSync(icoTarget, icoBytes);

  for (const [target, bytes] of [[pngTarget, pngBytes], [icoTarget, icoBytes]]) {
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    console.log(`Prepared ${path.relative(root, target)} (${bytes.length} bytes, sha256:${digest})`);
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
