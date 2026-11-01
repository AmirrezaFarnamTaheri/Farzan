import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const early = readFileSync('src/styles/study-polish.css', 'utf8');
const owner = readFileSync('src/styles/workspace.css', 'utf8');
const imports = readFileSync('src/styles/index.css', 'utf8');

function rule(source, selector) {
  const start = source.indexOf(selector + ' {');
  if (start < 0) return null;
  const beginning = source.indexOf('{', start);
  const end = source.indexOf('}', beginning);
  return source.slice(beginning + 1, end);
}

describe('single owner for shared Home panel presentation', () => {
  it('loads authoritative workspace paint after the earlier polish layer', () => {
    expect(imports.indexOf("study-polish.css")).toBeGreaterThan(0);
    expect(imports.indexOf("workspace.css")).toBeGreaterThan(imports.indexOf("study-polish.css"));
    const polish = rule(early, '.home-focus-panel');
    const workspace = rule(owner, '.home-focus-panel');
    expect(polish).not.toMatch(/(?:^|;)\s*(?:background|box-shadow)\s*:/);
    expect(workspace).toMatch(/background:\s*var\(--surface\)/);
    expect(workspace).toMatch(/box-shadow:\s*none/);
  });

  it('keeps Home focus-action min-height and background in the later owner only', () => {
    const polish = rule(early, '.home-focus-action');
    const workspace = rule(owner, '.home-focus-action');
    expect(polish).not.toMatch(/(?:^|;)\s*(?:min-height|background)\s*:/);
    expect(workspace).toMatch(/min-height:\s*44px/);
    expect(workspace).toMatch(/background:\s*var\(--surface-2\)/);
  });

  it('retains Home grid gap and top margin in workspace without an obsolete earlier rule', () => {
    expect(rule(early, '.home-grid')).toBeNull();
    expect(rule(owner, '.home-grid')).toMatch(/margin-top:\s*var\(--space-4\)/);
  });
});
