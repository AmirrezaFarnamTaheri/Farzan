import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const studio = fs.readFileSync('src/views/studioRoute.js', 'utf8');
const finalCss = fs.readFileSync('src/styles/farzan-redesign.css', 'utf8');
const metricsCss = fs.readFileSync('src/styles/progress-enhancements.css', 'utf8');

describe('Studio and Progress visual hierarchy', () => {
  it('shows a distinct pressed tool and reserves the primary action for Save', () => {
    expect(studio).toContain('class="btn btn-ghost btn-sm" data-studio-add-text');
    expect(studio).toContain('data-studio-tool="pen" aria-pressed="true"');
    expect(finalCss).toContain('.view-studio [data-studio-tool][aria-pressed="true"]');
  });

  it('presents completion as a static metric instead of a selected filter', () => {
    expect(metricsCss).toMatch(/\.progress-metric-featured\s*\{[^}]*border-color:\s*var\(--glass-border\);/s);
    expect(metricsCss).toMatch(/\.progress-metric-featured\s*\{[^}]*background:\s*var\(--surface-2\);/s);
  });
});
