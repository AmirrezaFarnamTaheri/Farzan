import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

describe('Flashcards assurance workflow coverage', () => {
  it.each([
    ['Native Windows', '.github/workflows/native-windows.yml'],
    ['Design Visual QA', '.github/workflows/farzan-design-visual.yml'],
  ])('runs %s when the root flashcards.js UI module changes', (_name, filename) => {
    const source = fs.readFileSync(path.join(root, filename), 'utf8');
    const pathsBlock = source.split(/\n    paths:\s*\n/)[1]?.split(/\n\S/)[0] ?? '';
    expect(pathsBlock).toMatch(/^\s*- 'flashcards\.js'\s*$/m);
  });
});
