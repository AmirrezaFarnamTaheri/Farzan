/**
 * Fail fast on UTF-8 text that was re-decoded as Windows-1252/Latin-1
 * ("mojibake"), which silently corrupts dashes, quotes, box drawing and emoji
 * in shipped source.
 *
 * Detection is two-stage, deliberately:
 *
 *   1. STRUCTURAL CANDIDATE MATCH. When UTF-8 is misread as CP1252, one
 *      multi-byte character becomes a LEAD character (the glyph for the UTF-8
 *      lead byte 0xC2-0xF4) followed by one or more CONTINUATION characters
 *      (the glyphs for bytes 0x80-0xBF).
 *
 *   2. REVERSIBILITY PROOF. A candidate is only reported if mapping it back
 *      through CP1252 to bytes yields a VALID UTF-8 sequence. This is what
 *      separates real corruption from legitimate text: an accented letter
 *      followed by a real en dash matches stage 1, but reverses to the invalid
 *      byte pair E9 96, so it is correctly ignored. A corrupted keyboard emoji
 *      reverses to E2 8C A8 = U+2328, so it is correctly reported.
 *
 * Three earlier revisions of this check used a hand-written list of literal
 * sequences and every one of them had holes -- including a revision whose own
 * pattern was itself mojibake-corrupted. Do not replace this with a literal
 * list, and do not "simplify" the escapes below into literal glyphs: they are
 * written as \u escapes precisely so that this file survives a round-trip
 * through a mis-configured editor with its detection power intact. The file is
 * pure ASCII and a lint rule (no non-ASCII in this file) is cheap to add if it
 * ever regresses.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');


const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.npm-cache',
  '.cargo',
  'src-tauri',
  'tauri-dev',
  'electron-builder-master',
  'Electron.NET-main',
  '.edge-cdp3',
  '.edge-cdp4',
  // Local reference-material trees: third-party repos we mine for ideas.
  // They are not shipped and their bytes are upstream-owned, never ours.
  '.toport',
  'TO PORT FARZAN',
]);

// Browser-profile scratch dirs are numbered (.edge-cdp3, .edge-cdp4, ...) and
// have already recurred once; ignore them by prefix instead of enumerating.
const IGNORED_DIR_PREFIXES = ['.edge-'];

// These files are byte-for-byte or deterministically generated third-party
// minified artifacts. Scanning them reports upstream byte sequences that
// OpenCourseDeck neither authors nor safely rewrites. App-authored compatibility
// wrappers such as vendor/pdf.min.js remain in scope.
const IGNORED_FILES = new Set([
  'vendor/chart.umd.js',
  'vendor/fontawesome/css/all.min.css',
  'vendor/fuse.min.js',
  'vendor/pdf.min.mjs',
  'vendor/pdf.worker.min.mjs',
  'vendor/purify.min.js',
]);

const EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.css', '.html', '.md', '.json', '.yml', '.yaml']);

/** Max distinct corrupted runs reported per file before truncating. */
const MAX_REPORTS_PER_FILE = 3;

/**
 * UTF-8 lead bytes 0xC2-0xF4. Under both CP1252 and Latin-1 these map to the
 * identical code points U+00C2-U+00F4, so one range covers both decodings.
 */
const MOJIBAKE_LEAD = '\u00c2-\u00f4';

/**
 * UTF-8 continuation bytes 0x80-0xBF. Latin-1 leaves 0x80-0x9F as C1 controls
 * (U+0080-U+009F); CP1252 remaps them to punctuation glyphs. Both decodings
 * are covered so the check works regardless of which one produced the damage.
 * 0xA0-0xBF is identical under both.
 */
const MOJIBAKE_CONT = '\u0080-\u00bf'
  + '\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d'
  + '\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178';

/**
 * Byte value -> code point for the 27 CP1252 positions in 0x80-0x9F that are
 * NOT identity-mapped. Written as an explicit table rather than index
 * arithmetic over a string literal, because the five undefined CP1252 slots
 * (0x81, 0x8D, 0x8F, 0x90, 0x9D) make positional indexing silently wrong if a
 * placeholder is ever dropped.
 */
const CP1252_OVERRIDES = [
  [0x80, '\u20ac'], [0x82, '\u201a'], [0x83, '\u0192'], [0x84, '\u201e'],
  [0x85, '\u2026'], [0x86, '\u2020'], [0x87, '\u2021'], [0x88, '\u02c6'],
  [0x89, '\u2030'], [0x8a, '\u0160'], [0x8b, '\u2039'], [0x8c, '\u0152'],
  [0x8e, '\u017d'], [0x91, '\u2018'], [0x92, '\u2019'], [0x93, '\u201c'],
  [0x94, '\u201d'], [0x95, '\u2022'], [0x96, '\u2013'], [0x97, '\u2014'],
  [0x98, '\u02dc'], [0x99, '\u2122'], [0x9a, '\u0161'], [0x9b, '\u203a'],
  [0x9c, '\u0153'], [0x9e, '\u017e'], [0x9f, '\u0178'],
];

/** Code point -> byte, for reversing a CP1252 re-decoding. */
const CP1252_TO_BYTE = new Map(CP1252_OVERRIDES.map(([byte, ch]) => [ch, byte]));

const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * Build a fresh global candidate matcher. Returned per-call rather than shared,
 * because a `g` regex carries mutable `lastIndex` and a shared instance leaks
 * scan position between callers.
 * @returns {RegExp}
 */
function createCandidatePattern() {
  return new RegExp(`[${MOJIBAKE_LEAD}][${MOJIBAKE_CONT}]+`, 'g');
}

/**
 * Map a candidate run back to the bytes it would have come from, then check
 * those bytes are valid UTF-8. Returns the repaired text, or null when the run
 * is legitimate text that merely resembles mojibake.
 * @param {string} run
 * @returns {string|null}
 */
function reverseMojibake(run) {
  const bytes = new Uint8Array(run.length);
  for (let i = 0; i < run.length; i += 1) {
    const ch = run[i];
    const code = ch.codePointAt(0);
    if (CP1252_TO_BYTE.has(ch)) bytes[i] = CP1252_TO_BYTE.get(ch);
    else if (code <= 0xff) bytes[i] = code;
    else return null;
  }
  try {
    const decoded = strictUtf8.decode(bytes);
    // A single-byte run cannot be mojibake: it round-trips to itself.
    return decoded === run ? null : decoded;
  } catch {
    return null;
  }
}

/**
 * Scan one blob of text for provably-reversible mojibake.
 * @param {string} text
 * @param {number} [limit] max findings to return
 * @returns {Array<{ index: number, line: number, found: string, expected: string }>}
 */
function findMojibake(text, limit = Infinity) {
  const pattern = createCandidatePattern();
  const found = [];
  let match;
  while (found.length < limit && (match = pattern.exec(text)) !== null) {
    const repaired = reverseMojibake(match[0]);
    if (repaired === null) continue;
    found.push({
      index: match.index,
      line: text.slice(0, match.index).split('\n').length,
      found: match[0],
      expected: repaired,
    });
  }
  return found;
}

function relativeFile(full) {
  return path.relative(root, full).split(path.sep).join('/');
}

/**
 * Walk a directory tree and collect mojibake findings from every text file.
 * @param {string} dir
 * @param {string[]} sink relative-path failure strings
 */
function walk(dir, sink) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    sink.push(`${path.relative(root, dir)}: unreadable directory (${error.message})`);
    return;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    if (IGNORED_DIR_PREFIXES.some((prefix) => entry.name.startsWith(prefix))) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, sink);
      continue;
    }
    if (!entry.isFile() || !EXTENSIONS.has(path.extname(entry.name))) continue;
    if (full === __filename) continue;
    const relative = relativeFile(full);
    if (IGNORED_FILES.has(relative)) continue;
    let text;
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch (error) {
      sink.push(`${relative}: unreadable file (${error.message})`);
      continue;
    }
    for (const hit of findMojibake(text, MAX_REPORTS_PER_FILE)) {
      sink.push(
        `${relative}:${hit.line}: `
        + `${JSON.stringify(hit.found)} should be ${JSON.stringify(hit.expected)}`,
      );
    }
  }
}

/**
 * @param {string} [target] directory to scan
 * @returns {string[]} failure lines (empty when clean)
 */
function scan(target = root) {
  const sink = [];
  walk(target, sink);
  return sink;
}

function main() {
  const failures = scan();
  if (failures.length) {
    console.error('[encoding] mojibake found (UTF-8 re-decoded as Windows-1252):');
    for (const failure of failures) console.error(`  ${failure}`);
    console.error('  Fix: re-save the file as UTF-8, or replace the sequence with the character shown.');
    return 1;
  }
  console.log('[encoding] OK');
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = {
  createCandidatePattern,
  reverseMojibake,
  findMojibake,
  scan,
  main,
  MOJIBAKE_LEAD,
  MOJIBAKE_CONT,
  CP1252_OVERRIDES,
  EXTENSIONS,
  IGNORED_DIRS,
  IGNORED_DIR_PREFIXES,
  IGNORED_FILES,
};