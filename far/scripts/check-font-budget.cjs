const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const fontRoot = path.join(root, 'vendor', 'fonts');
const MAX_FONT_FILES = 90;
const MAX_FONT_BYTES = 3 * 1024 * 1024;

function walk(dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, output);
    else if (entry.isFile()) output.push(file);
  }
  return output;
}

function checkFontBudget(directory = fontRoot) {
  const files = walk(directory);
  const binaryFonts = files.filter((file) => /\.woff2?$/.test(file));
  const legacy = binaryFonts.filter((file) => file.endsWith('.woff'));
  const bytes = binaryFonts.reduce((sum, file) => sum + fs.statSync(file).size, 0);
  const errors = [];
  if (legacy.length) errors.push(`legacy WOFF files are forbidden: ${legacy.map((file) => path.relative(root, file)).join(', ')}`);
  if (binaryFonts.length > MAX_FONT_FILES) errors.push(`font file count ${binaryFonts.length} exceeds ${MAX_FONT_FILES}`);
  if (bytes > MAX_FONT_BYTES) errors.push(`font bytes ${bytes} exceed ${MAX_FONT_BYTES}`);
  if (errors.length) throw new Error(errors.join('\n'));
  return { bytes, count: binaryFonts.length };
}

if (require.main === module) {
  try {
    const result = checkFontBudget();
    console.log(`[font-budget] ${result.count} WOFF2 files, ${result.bytes} bytes`);
  } catch (error) {
    console.error('[font-budget] failed', error);
    process.exit(1);
  }
}

module.exports = { MAX_FONT_BYTES, MAX_FONT_FILES, checkFontBudget };
