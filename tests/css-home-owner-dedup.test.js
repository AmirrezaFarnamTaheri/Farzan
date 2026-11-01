import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const workspace = fs.readFileSync('src/styles/workspace.css', 'utf8');
const polish = fs.readFileSync('src/styles/study-polish.css', 'utf8');
const manifest = fs.readFileSync('src/styles/index.css', 'utf8');

function declarations(css, selector) {
  const start = css.indexOf(selector + ' {');
  if (start < 0) throw new Error('Missing CSS owner: ' + selector);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

describe('Home workspace override ownership (#175)', () => {
  it('keeps only the later property owner for duplicated Home declarations', () => {
    expect(manifest.indexOf('study-polish.css')).toBeLessThan(manifest.indexOf('workspace.css'));
    const redundant = [
      ['.home-hero', 'align-items: stretch;'],
      ['.home-hero', 'background: var(--surface-2);'],
      ['.home-title', 'text-wrap: balance;'],
      ['.home-subtitle', 'color: var(--text-secondary);'],
      ['.home-actions', 'gap: var(--space-2);'],
      ['.home-command-strip', 'padding-top: var(--space-4);'],
      ['.home-focus-status', 'background: var(--accent-muted);'],
      ['.home-focus-meta', 'color: var(--text-secondary);'],
      ['.home-focus-action:hover', 'background: var(--surface-hover);'],
      ['.home-focus-action:hover', 'transform: none;'],
      ['.home-pulse-item:hover', 'transform: none;'],
      ['.home-pulse-item:hover', 'box-shadow: none;'],
    ];
    for (const [selector, property] of redundant) {
      expect(declarations(polish, selector), selector + ' earlier duplicate').not.toContain(property);
      expect(declarations(workspace, selector), selector + ' final owner').toContain(property);
    }
  });
  it('keeps the unique workspace border, type and focus styles', () => {
    expect(declarations(workspace, '.home-hero')).toContain('border: 1px solid var(--workspace-rule)');
    expect(declarations(workspace, '.home-title')).toContain('letter-spacing: -0.052em');
    expect(declarations(workspace, '.home-focus-action:hover')).toContain('border-color: var(--workspace-rule-strong)');
    expect(declarations(workspace, '.home-pulse-item:hover')).toContain('border-color: var(--workspace-rule)');
  });
});
