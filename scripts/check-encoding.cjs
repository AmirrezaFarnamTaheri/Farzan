/**
 * Fail fast on common UTF-8 mojibake signatures that corrupt UI glyphs.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ignored = new Set(['node_modules', 'dist', '.git', '.npm-cache', 'src-tauri', 'tauri-dev', 'electron-builder-master', 'Electron.NET-main']);
const pattern = /(?:ðŸ|Ã¢â‚¬|Ã°)/;
const extensions = new Set(['.js', '.cjs', '.css', '.html', '.md', '.json']);
const failures = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.isFile() || !extensions.has(path.extname(entry.name))) continue;
    const text = fs.readFileSync(full, 'utf8');
    if (full === __filename) continue;
    const match = pattern.exec(text);
    if (match) {
      failures.push(`${path.relative(root, full)}: ${match[0]}`);
    }
  }
}

walk(root);

if (failures.length) {
  console.error('[encoding] possible mojibake found:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log('[encoding] OK');
