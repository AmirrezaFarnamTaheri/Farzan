'use strict';

/**
 * Attribution of bytes emitted by esbuild (not guesses from source imports).
 * "bytesInOutput" reflects contributions to emitted output and must not
 * be interpreted as runtime execution or proof that an API has no consumers.
 */
const fs = require('node:fs');
const path = require('node:path');

function summarizeBundleConsumers(metafile) {
  if (!metafile?.inputs || !metafile?.outputs) {
    throw new TypeError('A complete esbuild metafile is required');
  }
  const js = Object.entries(metafile.outputs).filter(([name]) => name.endsWith('.js'));
  const entryPair = js.find(([name]) => /(?:^|\/)opencoursedeck\.js$/.test(name));
  if (!entryPair) throw new Error('No generated application entry in esbuild metafile');

  function details([file, output]) {
    const topInputs = Object.entries(output.inputs || {})
      .map(([input, record]) => ({ input, bytes: record.bytesInOutput || 0 }))
      .sort((a, b) => b.bytes - a.bytes || a.input.localeCompare(b.input));
    return {
      path: file,
      bytes: output.bytes || 0,
      entryPoint: output.entryPoint || null,
      topInputs: topInputs.slice(0, 25),
      staticImports: (output.imports || []).filter(i => i.kind !== 'dynamic-import' && !i.external).map(i => i.path),
      dynamicImports: (output.imports || []).filter(i => i.kind === 'dynamic-import' && !i.external).map(i => i.path),
    };
  }

  const entry = details(entryPair);
  const otherChunks = js.filter(([name]) => name !== entryPair[0]).map(details)
    .sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
  const inputConsumers = {};
  for (const [source, input] of Object.entries(metafile.inputs)) {
    for (const target of input.imports || []) {
      if (target.external) continue;
      (inputConsumers[target.path] ||= []).push({ importer: source, kind: target.kind });
    }
  }
  for (const consumers of Object.values(inputConsumers)) {
    consumers.sort((a, b) => a.importer.localeCompare(b.importer) || a.kind.localeCompare(b.kind));
  }
  return {
    totalJsBytes: js.reduce((sum, [, output]) => sum + (output.bytes || 0), 0),
    entry,
    lazyChunks: otherChunks.filter(chunk => chunk.entryPoint),
    sharedChunks: otherChunks.filter(chunk => !chunk.entryPoint),
    inputConsumers: Object.fromEntries(Object.entries(inputConsumers).sort(([a], [b]) => a.localeCompare(b))),
  };
}

function main(argv = process.argv) {
  const file = argv[2] || path.join(__dirname, '..', 'reports', 'ci', 'bundle-metafile.json');
  if (!fs.existsSync(file)) throw new Error('No esbuild metafile found; run npm run build:release first');
  const report = summarizeBundleConsumers(JSON.parse(fs.readFileSync(file, 'utf8')));
  console.error('[bundle-consumers] entry', report.entry.bytes, 'bytes; total', report.totalJsBytes,
    'bytes; lazy chunks', report.lazyChunks.length, 'shared chunks', report.sharedChunks.length);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error('[bundle-consumers] failed', error);
    process.exitCode = 1;
  }
}

module.exports = { summarizeBundleConsumers, main };
