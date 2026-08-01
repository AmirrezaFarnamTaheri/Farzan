import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { installPdfSecurity } from '../src/core/pdfSecurity.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('PDF.js runtime security contract', () => {
  it('pins the patched ESM package and exposes a mutable lifecycle-compatible facade', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const runtime = fs.readFileSync(path.join(root, 'pdf-runtime.js'), 'utf8');
    const vendorScript = fs.readFileSync(path.join(root, 'scripts/vendor-libs.cjs'), 'utf8');

    expect(pkg.dependencies['pdfjs-dist']).toBe('6.2.108');
    expect(runtime).toContain("import * as pdfjsModule from './vendor/pdf.min.mjs'");
    expect(runtime).toContain('const pdfjsLib = { ...pdfjsModule }');
    expect(runtime).toContain("documentProperty === 'destroy'");
    expect(runtime).toContain('return () => target.destroy()');
    expect(runtime).toContain('pdf.worker.min.mjs');
    expect(vendorScript).toContain("documentProperty === 'destroy'");
    expect(vendorScript).toContain('return () => target.destroy()');
  });

  it('wraps getDocument and always disables PDF evaluation', () => {
    const getDocument = vi.fn(options => options);
    const rootObject = { pdfjsLib: { getDocument } };

    installPdfSecurity(rootObject);
    const result = rootObject.pdfjsLib.getDocument({ data: new Uint8Array([1, 2, 3]) });

    expect(result).toMatchObject({ isEvalSupported: false, stopAtErrors: true, useSystemFonts: false });
    expect(getDocument).toHaveBeenCalledWith(expect.objectContaining({ isEvalSupported: false }));
    expect(rootObject.OpenCourseDeck.PdfSecurity.evalDisabled).toBe(true);
  });
});
