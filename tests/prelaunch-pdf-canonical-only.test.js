import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('pre-release document-scoped PDF identity', () => {
  it('never boots old transport/URL alias migration or obsolete PDF annotation storage', () => {
    for (const file of [
      'pdf.js',
      'src/core/pdfIdentityHardening.js',
      'bridge.js',
      'src/core/backupEngine.js',
      'progress.js',
    ]) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/_deriveLegacyDocIds|annotationAliases|pdf:identity-migrated|pdf:identity-migration-failed/);
      expect(source, file).not.toMatch(/['"]plasma-pdf-annotations(?:-by-document|-by-page)?['"]/);
    }
    expect(fs.readFileSync('src/core/pdfIdentityHardening.js', 'utf8'))
      .toContain('ocd_pdf_annotations_by_page');
    expect(fs.readFileSync('bridge.js', 'utf8'))
      .toContain('ocd_pdf_annotations_by_document');
  });
});
