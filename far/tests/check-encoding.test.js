import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const scriptPath = path.join(root, 'scripts/check-encoding.cjs');
const source = fs.readFileSync(scriptPath, 'utf8');

// Load the real module. Importing it must be side-effect free -- an earlier
// revision ran the whole tree walk (and process.exit) at require time, which
// made it untestable and would have taken the test runner down with it.
const require = createRequire(import.meta.url);
const detector = require(scriptPath);
const {
  createCandidatePattern,
  reverseMojibake,
  findMojibake,
  scan,
  CP1252_OVERRIDES,
} = detector;

/**
 * Produce genuine mojibake: encode to UTF-8, then decode those bytes as
 * Windows-1252 (what an editor or toolchain with the wrong default actually
 * does). Generating fixtures this way means they cannot be typo'd into passing
 * the way a hand-written literal can.
 */
const cp1252 = new TextDecoder('windows-1252');
const utf8 = new TextEncoder();
function mojibake(realText) {
  return cp1252.decode(utf8.encode(realText));
}

/** The latin-1 variant, where bytes 0x80-0x9F stay as C1 control characters. */
function mojibakeLatin1(realText) {
  return Buffer.from(realText, 'utf8').toString('latin1');
}

describe('mojibake detector: corruption is found and named', () => {
  const corruptible = [
    ['em dash', '—'],
    ['en dash', '–'],
    ['ellipsis', '…'],
    ['guillemets', '‹text›'],
    ['curly quotes', '“quoted”'],
    ['multiplication sign', '×'],
    ['non-breaking space', 'a b'],
    ['box drawing light', '────'],
    ['box drawing double', '═══'],
    ['keyboard emoji', '⌨️'],
    ['warning emoji', '⚠️'],
    ['rocket emoji (astral)', '🚀'],
    ['books emoji (astral)', '📚'],
    ['party emoji (astral)', '🎉'],
    ['rightwards arrow', '→'],
    ['bullet', '•'],
    ['euro sign', '€'],
    ['trademark', '™'],
    ['Latin small e acute', 'café'],
    ['Cyrillic', 'Привет'],
    ['CJK', '日本語'],
    ['Persian', 'درس'],
  ];

  it.each(corruptible)('flags CP1252-corrupted %s', (_name, real) => {
    const hits = findMojibake(mojibake(real));
    expect(hits.length).toBeGreaterThan(0);
  });

  it.each(corruptible)('flags latin-1-corrupted %s', (_name, real) => {
    const hits = findMojibake(mojibakeLatin1(real));
    expect(hits.length).toBeGreaterThan(0);
  });

  it.each(corruptible)('reconstructs the original text of %s', (_name, real) => {
    // The point of the reversibility stage is that the detector knows what the
    // text SHOULD have been, not merely that something is wrong. A reviewer can
    // paste the reported replacement straight in.
    const corrupted = mojibake(real);
    const repaired = findMojibake(corrupted).reduce(
      (acc, hit) => acc.replace(hit.found, hit.expected),
      corrupted,
    );
    expect(repaired).toBe(real);
  });

  it('reports the 1-based line number of the corruption', () => {
    const text = `line one\nline two\nconst label = '${mojibake('—')}';\nline four\n`;
    const [hit] = findMojibake(text);
    expect(hit.line).toBe(3);
    expect(hit.expected).toBe('—');
  });

  it('finds every distinct corrupted run, not just the first', () => {
    const text = `a ${mojibake('—')} b ${mojibake('→')} c ${mojibake('🚀')}`;
    expect(findMojibake(text).map((hit) => hit.expected)).toEqual(['—', '→', '🚀']);
  });

  it('honours the per-scan limit', () => {
    const text = `a ${mojibake('—')} b ${mojibake('→')} c ${mojibake('•')}`;
    expect(findMojibake(text, 2)).toHaveLength(2);
  });
});

describe('mojibake detector: legitimate text is left alone', () => {
  const clean = [
    ['ASCII source code', "const x = 'hello world'; // a comment"],
    ['correctly encoded em dash', 'OpenCourseDeck UI — app.js'],
    ['correctly encoded emoji', '📚 Courses'],
    ['correctly encoded box drawing', '// ── Range sliders ───'],
    ['French accents', 'café, naïve, résumé, Noël'],
    ['German umlauts', 'Zürich, München, Grüße'],
    ['Nordic letters', 'Ångström, Ærø, Þingvellir'],
    ['Persian (RTL)', 'درس‌های من — یادداشت'],
    ['Arabic', 'مرحبا بالعالم'],
    ['CJK', '日本語のテキスト'],
    ['math symbols', '∑ ∫ ≤ ≥ ± ∞'],
    ['currency', '€100 £50 ¥300'],
    // The regression that forced the reversibility stage: an accented letter
    // adjacent to a real en dash matches the structural pattern but reverses to
    // the invalid byte pair E9 96, so it must not be reported.
    ['accent followed by en dash', 'Legg–Calvé–Perthes'],
    ['accent followed by NBSP', 'ré sumé'],
    ['accent followed by curly quote', 'café’s'],
    ['accent followed by ellipsis', 'et ceteraé…'],
  ];

  it.each(clean)('does not flag %s', (_name, text) => {
    expect(findMojibake(text)).toEqual([]);
  });

  it('does not flag a lone high character with no continuation', () => {
    expect(findMojibake('é Â ô')).toEqual([]);
  });

  it('reverseMojibake returns null for structurally-similar legitimate text', () => {
    expect(reverseMojibake('é–')).toBeNull();
    expect(reverseMojibake('é ')).toBeNull();
  });
});

describe('mojibake detector: internal tables are correct', () => {
  it('the CP1252 override table matches the platform windows-1252 decoder', () => {
    // Cross-check the hand-maintained table against the ICU decoder rather than
    // trusting it. A single wrong row would make one byte value unrepairable.
    for (const [byte, expected] of CP1252_OVERRIDES) {
      expect(cp1252.decode(new Uint8Array([byte]))).toBe(expected);
    }
  });

  it('covers every non-identity CP1252 position in 0x80-0x9F', () => {
    const nonIdentity = [];
    for (let byte = 0x80; byte <= 0x9f; byte += 1) {
      const decoded = cp1252.decode(new Uint8Array([byte]));
      if (decoded.codePointAt(0) !== byte && decoded !== '�') nonIdentity.push(byte);
    }
    expect(CP1252_OVERRIDES.map(([byte]) => byte)).toEqual(nonIdentity);
  });

  it('every CP1252 override glyph is inside the continuation character class', () => {
    // If a glyph is in the reverse table but not in the regex class, the run
    // gets truncated mid-sequence and reverses to invalid UTF-8: a silent miss.
    const pattern = new RegExp(`^[${detector.MOJIBAKE_CONT}]$`);
    for (const [, ch] of CP1252_OVERRIDES) expect(pattern.test(ch)).toBe(true);
  });

  it('every UTF-8 lead byte 0xC2-0xF4 is inside the lead character class', () => {
    const pattern = new RegExp(`^[${detector.MOJIBAKE_LEAD}]$`);
    for (let byte = 0xc2; byte <= 0xf4; byte += 1) {
      expect(pattern.test(cp1252.decode(new Uint8Array([byte])))).toBe(true);
    }
  });

  it('hands out a fresh regex each call so lastIndex never leaks', () => {
    const a = createCandidatePattern();
    a.exec(mojibake('— —'));
    expect(a.lastIndex).toBeGreaterThan(0);
    expect(createCandidatePattern().lastIndex).toBe(0);
  });
});

describe('mojibake detector: fuzz round-trip', () => {
  it('repairs arbitrary non-ASCII text back to the original', () => {
    // Deterministic LCG so a failure is reproducible from the seed alone.
    let seed = 0x2f6e2b1;
    const nextInt = (bound) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % bound;
    };
    const ranges = [[0x00a1, 0x024f], [0x0370, 0x058f], [0x2000, 0x2bff], [0x3040, 0x30ff], [0x1f300, 0x1f5ff]];

    for (let iteration = 0; iteration < 400; iteration += 1) {
      let real = '';
      const length = 1 + nextInt(8);
      for (let i = 0; i < length; i += 1) {
        const [lo, hi] = ranges[nextInt(ranges.length)];
        real += String.fromCodePoint(lo + nextInt(hi - lo + 1));
      }
      const corrupted = mojibake(real);
      // The windows-1252 decoder substitutes U+FFFD for the five undefined
      // byte positions, which is genuinely lossy -- skip those, they are not
      // recoverable by any tool and the detector correctly declines to guess.
      if (corrupted.includes('�')) continue;
      const repaired = findMojibake(corrupted).reduce(
        (acc, hit) => acc.replace(hit.found, hit.expected),
        corrupted,
      );
      expect(repaired, `seed iteration ${iteration}, input ${JSON.stringify(real)}`).toBe(real);
    }
  });

  it('never claims a repair for text that is already valid UTF-8 prose', () => {
    let seed = 0x51ab33d;
    const nextInt = (bound) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % bound;
    };
    // Latin-1 supplement letters are exactly the characters that make up the
    // structural pattern, so this is the highest-risk false-positive corpus.
    for (let iteration = 0; iteration < 400; iteration += 1) {
      let text = '';
      for (let i = 0; i < 1 + nextInt(10); i += 1) {
        text += String.fromCodePoint(0x00c0 + nextInt(0x40));
        if (nextInt(3) === 0) text += ' ';
      }
      const hits = findMojibake(text);
      for (const hit of hits) {
        // Any hit here must be a genuine reversal, not noise: re-corrupting the
        // claimed original must reproduce exactly what was found.
        expect(mojibake(hit.expected), `iteration ${iteration}`).toBe(hit.found);
      }
    }
  });
});

describe('check-encoding.cjs: the script itself', () => {
  it('is pure ASCII so it cannot be corrupted into a no-op pattern', () => {
    // The detector skips its own file, so a mojibake'd copy of this script
    // would silently stop matching and every gate would go green. Writing the
    // character classes as \u escapes removes that failure mode entirely.
    const offenders = [...source].filter((ch) => ch.codePointAt(0) > 0x7f);
    expect(offenders).toEqual([]);
  });

  it('builds its pattern from character classes, not a list of examples', () => {
    // Three earlier revisions hardcoded literal sequences and each had holes
    // that shipped garbled text to users.
    expect(source).toContain('MOJIBAKE_LEAD');
    expect(source).toContain('MOJIBAKE_CONT');
    expect(source).toMatch(/new RegExp\(/);
  });

  it('only runs the tree walk when invoked as a CLI', () => {
    expect(source).toContain('require.main === module');
  });

  it('reports the repository as clean', () => {
    expect(scan()).toEqual([]);
  });
});
