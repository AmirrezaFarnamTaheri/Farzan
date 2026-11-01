import { describe, expect, it } from 'vitest';
import { comparePortableBackups, summarizePortableBackup } from '../scripts/verify-portable-backup.cjs';

const before = {
  version: '1.6', exportedAt: '2026-10-31T12:00:00.000Z',
  meta: { sizeBytes: 123, attachments: {
    mode: 'metadata-only', binaryIncluded: false,
    references: [{ id: 'library-file:private', size: 22 }],
  } },
  progress: [{ topicId: 'renal', courseId: 'medicine', percent: 45 }],
  notes: [
    { id: 'n1', html: '<p dir="rtl">یادداشت</p>' },
    { id: 'n2', html: '<p>Heart study</p>' },
  ],
  folders: [{ id: 'default', name: 'My notes' }],
  settings: {
    notes: { density: 'comfortable' },
    playlists: [], library: null, myCourses: [],
    mediaCues: null, tagTaxonomy: null,
    flashcards: [
      { id: 'legacy', nextReviewDate: '2026-11-04', repetitions: 2 },
      { id: 'modern', scheduler: 'fsrs-v5', fsrsState: {
        version: 1, due: '2026-11-01T05:00:00.000Z',
      }, fsrsMigration: { legacyCard: { id: 'modern', nextReviewDate: '2026-10-31' } } },
    ],
    studio: { version: 1, layers: [{ id: 'one', elements: [] }] },
  },
  timestamps: [], annotations: [], watchedSegments: [], pdfBookmarks: [],
};

describe('read-only portable recovery digests', () => {
  it('compares first-party 1.6 exports without leaking raw notes, IDs or changing input', () => {
    const original = structuredClone(before);
    const reopened = structuredClone(before);
    reopened.exportedAt = '2026-11-01T18:00:00.000Z';
    reopened.meta.sizeBytes = 999;
    reopened.notes.reverse();
    const result = comparePortableBackups(before, reopened);
    expect(result.ok).toBe(true);
    expect(result.mismatches).toEqual([]);
    expect(result.before.counts.notes).toBe(2);
    expect(result.before.counts.flashcards).toBe(2);
    expect(result.before.counts.fsrsV5).toBe(1);
    expect(result.before.counts.sm2Legacy).toBe(1);
    expect(result.before.counts.migrationArchives).toBe(1);
    expect(JSON.stringify(result)).not.toMatch(/یادداشت|Heart study|private|medicine|legacy|modern/);
    expect(before).toEqual(original);
  });

  it('detects changed note content, FSRS due timestamp, original archive, and attachment manifest', () => {
    const changed = structuredClone(before);
    changed.notes[0].html = '<p dir="rtl">edited</p>';
    changed.settings.flashcards[1].fsrsState.due = '2026-11-02T05:00:00.000Z';
    changed.settings.flashcards[1].fsrsMigration.legacyCard.nextReviewDate = '2026-11-02';
    changed.meta.attachments.references[0].size = 20;
    const result = comparePortableBackups(before, changed);
    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual(expect.arrayContaining(['notes', 'flashcards', 'attachments']));
    expect(JSON.stringify(result)).not.toMatch(/edited|private|2026-11-02T05/);
  });

  it('refuses to certify two identically truncated app-data backups without mandatory settings sections', () => {
    for (const missing of [
      'notes', 'playlists', 'studio', 'flashcards',
      'library', 'myCourses', 'mediaCues', 'tagTaxonomy',
    ]) {
      const incomplete = structuredClone(before);
      delete incomplete.settings[missing];
      expect(() => summarizePortableBackup(incomplete)).toThrow(/settings|missing/i);
      expect(() => comparePortableBackups(incomplete, incomplete)).toThrow(/settings|missing/i);
    }
    const legitimateEmpty = structuredClone(before);
    legitimateEmpty.settings.flashcards = null;
    expect(summarizePortableBackup(legitimateEmpty).counts.flashcards).toBe(0);
  });

  it('rejects malformed, duplicate-ID, future-version, and missing required snapshot sections', () => {
    expect(() => summarizePortableBackup({ ...before, version: '9.0' })).toThrow(/version/i);
    expect(() => summarizePortableBackup({ ...before, notes: undefined })).toThrow(/notes/i);
    expect(() => summarizePortableBackup({ ...before, notes: [before.notes[0], before.notes[0]] })).toThrow(/duplicate/i);
    expect(() => summarizePortableBackup({
      ...before, settings: { ...before.settings, flashcards: 'invalid' },
    })).toThrow(/flashcards/i);
    expect(() => summarizePortableBackup({ ...before, meta: {
      attachments: { mode: 'metadata-only', binaryIncluded: true, references: [] },
    } })).toThrow(/attachments|binary/i);
  });
});
