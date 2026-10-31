import { describe, expect, it } from 'vitest';
import { auditSavedNotesForSquire } from '../src/features/notesMigrationAudit.js';

describe('read-only Squire migration readiness audit', () => {
  it('counts compatible and classic-only saved notes without exposing titles, IDs or HTML', () => {
    const notes = [
      { id: 'private-1', title: 'Private Alice', content: '<p>Hello</p>' },
      { id: 'private-2', title: 'Private Bob', content: '<table><tr><td>secret</td></tr></table>' },
      { id: 'private-3', title: 'Private Persian', content: '<p dir="rtl">درس فارسی</p>' },
    ];
    const before = structuredClone(notes);
    const report = auditSavedNotesForSquire(notes);
    expect(report).toMatchObject({ total: 3, compatible: 2, classic: 1 });
    expect(notes).toEqual(before);
    const serialized = JSON.stringify(report);
    for (const privateText of ['Private Alice', 'private-2', 'secret', 'درس فارسی']) {
      expect(serialized).not.toContain(privateText);
    }
  });

  it('fails closed on malformed records and validates the collection before processing', () => {
    const result = auditSavedNotesForSquire([{ content: '' }, null, { content: 4 }]);
    expect(result).toMatchObject({ total: 3, compatible: 1, classic: 2 });
    expect(() => auditSavedNotesForSquire(null)).toThrow(/notes|array/i);
    expect(() => auditSavedNotesForSquire({ items: [] })).toThrow(/notes|array/i);
  });
});
