import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('greenfield Squire-only editor ownership', () => {
  it('has no orphaned unshipped Tiptap adapter, migration audit or preview flags', () => {
    for (const removed of [
      'src/features/notesEditorCompatibility.js',
      'src/features/notesMigrationAudit.js',
      'tests/notes-tiptap-adapter.test.js',
      'tests/notes-tiptap-compatibility.test.js',
      'tests/notes-migration-audit.test.js',
      'tests/help-notes-audit.test.js',
    ]) expect(fs.existsSync(removed), removed).toBe(false);
    for (const required of [
      'src/features/notesHtmlStructuralGate.js',
      'tests/notes-squire-adapter.test.js',
      'tests/notes-html-structural-gate.test.js',
    ]) expect(fs.existsSync(required), required).toBe(true);
    const notes = fs.readFileSync('notes.js', 'utf8');
    expect(notes).not.toMatch(/_tiptap|Tiptap|ProseMirror/);
    expect(notes).toContain('_squire');
    const adapter = fs.readFileSync('src/features/notesSquireAdapter.js', 'utf8');
    expect(adapter).not.toContain('createTiptapNoteEditor');
    const help = fs.readFileSync('src/views/helpRoute.js', 'utf8');
    expect(help).not.toMatch(/notesMigrationAudit|data-help-notes-audit|loadNotesAudit/);
    const browser = fs.readFileSync('tests/e2e/workspace-redesign.spec.js', 'utf8');
    expect(browser).not.toContain('notesTiptapPreview');
  });

  it('retains fail-closed saved HTML validation in the new production owner', async () => {
    const { assessNoteForSquire } = await import('../src/features/notesSquireCompatibility.js');
    expect(assessNoteForSquire('<p lang="fa">درس</p>').compatible).toBe(false);
    expect(assessNoteForSquire('<p dir="rtl">درس فارسی</p>').compatible).toBe(true);
    expect(assessNoteForSquire('<p>Safe</p><script>danger</script>').compatible).toBe(false);
  });
});
