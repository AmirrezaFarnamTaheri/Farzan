import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

describe('authored note content readability', () => {
  it('restores visible ordered and unordered list markers after the global reset', () => {
    const css = readFileSync(new URL('../src/styles/notes-enhancements.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.notes-editor\s+ul\s*\{[^}]*list-style-type:\s*disc/s);
    expect(css).toMatch(/\.notes-editor\s+ol\s*\{[^}]*list-style-type:\s*decimal/s);
  });

  it('uses primary text ink for small flashcard grading labels instead of low-contrast accent ink', () => {
    const css = readFileSync(new URL('../src/styles/enhancements.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\\.fc-grade\\s*\\{[^}]*color:\\s*var\\(--text-primary\\)/s);
  });
});
