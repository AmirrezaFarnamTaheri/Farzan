/**
 * Read-only CSS ownership inventory. Parses the project-owned import manifest
 * and nested conditional at-rules; never rewrites styles or flattens queries.
 * An identical selector in a DIFFERENT media/supports context is not a
 * duplicate. This is a source-provenance report, not computed-style proof.
 */
const fs = require('node:fs');
const path = require('node:path');

function maskComments(input) {
  return input.replace(/\/\*[\s\S]*?\*\//g, text => text.replace(/[^\n]/g, ' '));
}

function normal(value) {
  return value.trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ');
}

function nextToken(src, start, end) {
  let quote = '', paren = 0, bracket = 0;
  for (let i = start; i < end; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(') paren++;
    if (ch === ')') paren--;
    if (ch === '[') bracket++;
    if (ch === ']') bracket--;
    if (!paren && !bracket && (ch === '{' || ch === ';' || ch === '}')) {
      return { at: i, token: ch };
    }
  }
  return { at: end, token: '' };
}

function closingBrace(src, start, end) {
  let quote = '', depth = 1;
  for (let i = start + 1; i < end; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return i;
  }
  throw new Error('Unbalanced CSS block at offset ' + start);
}

function parseRules(css, file, layer) {
  const source = maskComments(css);
  const result = [];
  function visit(start, end, atRules = []) {
    let i = start;
    while (i < end) {
      while (i < end && /\s|;/.test(source[i])) i++;
      if (i >= end) return;
      const separator = nextToken(source, i, end);
      if (separator.token === '' || separator.token === '}') return;
      if (separator.token === ';') { i = separator.at + 1; continue; }
      const header = normal(source.slice(i, separator.at));
      const close = closingBrace(source, separator.at, end);
      const body = source.slice(separator.at + 1, close);
      if (header.startsWith('@')) {
        if (/^@(media|supports|container|layer|scope|starting-style)\b/i.test(header)) {
          visit(separator.at + 1, close, [...atRules, header]);
        }
        // @keyframes, @font-face and @property are not component selectors.
      } else if (header && !body.includes('{')) {
        result.push({
          file, layer,
          selector: header,
          context: atRules.join(' | '),
          body: normal(body).replace(/\s*:\s*/g, ': ').replace(/\s*;\s*/g, ';').trim(),
          line: source.slice(0, i).split('\n').length,
        });
      }
      i = close + 1;
    }
  }
  visit(0, source.length);
  return result;
}

function inventoryCss(rootDir = path.resolve(__dirname, '..')) {
  const directory = path.join(rootDir, 'src/styles');
  const manifest = fs.readFileSync(path.join(directory, 'index.css'), 'utf8');
  const imports = [...manifest.matchAll(/@import\s+['"]\.\/([^'"]+)['"]\s+layer\(([^)]+)\)\s*;/g)]
    .map(match => ({ file: match[1], layer: match[2] }));
  if (!imports.length) throw new Error('Missing project stylesheet import manifest');
  const stylesheets = [], rules = [];
  for (const item of imports) {
    const filePath = path.join(directory, item.file);
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = parseRules(content, item.file, item.layer);
    stylesheets.push({ ...item, bytes: Buffer.byteLength(content), ruleCount: parsed.length });
    rules.push(...parsed);
  }
  const owners = new Map();
  const identical = new Map();
  for (const rule of rules) {
    const ownerKey = rule.selector + '\u0000' + rule.context;
    owners.set(ownerKey, {
      selector: rule.selector, context: rule.context, file: rule.file,
      layer: rule.layer, line: rule.line,
    });
    const duplicateKey = ownerKey + '\u0000' + rule.body;
    const list = identical.get(duplicateKey) || [];
    list.push(rule);
    identical.set(duplicateKey, list);
  }
  const exactDuplicates = [...identical.values()].filter(group =>
    group.length > 1 && new Set(group.map(rule => rule.file)).size > 1
  ).map(group => ({
    selector: group[0].selector, context: group[0].context, body: group[0].body,
    sources: group.map(rule => ({ file: rule.file, line: rule.line, layer: rule.layer })),
  }));
  return {
    stylesheets,
    sourceBytes: stylesheets.reduce((sum, sheet) => sum + sheet.bytes, 0),
    rules,
    owners: [...owners.values()],
    exactDuplicates,
  };
}

module.exports = { inventoryCss, parseRules };

if (require.main === module) {
  const report = inventoryCss();
  process.stdout.write(JSON.stringify({
    generatedBy: 'scripts/css-owner-inventory.cjs',
    stylesheets: report.stylesheets,
    sourceBytes: report.sourceBytes,
    ruleCount: report.rules.length,
    ownerCount: report.owners.length,
    exactDuplicates: report.exactDuplicates,
  }, null, 2) + '\n');
}
