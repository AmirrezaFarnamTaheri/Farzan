import { describe, expect, it, vi } from 'vitest';
import { mountHelpView } from '../src/views/helpRoute.js';

describe('end-user Help workspace', () => {
  it('shows actionable first-run steps without developer commands in the visible guide', () => {
    document.body.innerHTML = '<main id="main-content"></main>';
    window.DataStore = { init: vi.fn(async () => true), allTopics: vi.fn(() => []) };
    mountHelpView({
      setView: html => { document.querySelector('main').innerHTML = html; },
    });
    const checklist = document.querySelector('.help-checklist');
    expect(checklist).toBeTruthy();
    expect(checklist.textContent).toMatch(/Courses|Notes|backup/i);
    expect(checklist.textContent).not.toMatch(/npm|localhost|terminal|command line/i);
    const advanced = document.querySelector('details[data-help-developer]');
    expect(advanced).toBeTruthy();
    expect(advanced.open).toBe(false);
    expect(advanced.querySelector('summary').textContent).toMatch(/developer|advanced/i);
    expect(advanced.textContent).toMatch(/npm|localhost/i);
    const troubleshooting = document.querySelector('.help-recovery-list');
    expect(troubleshooting.textContent).not.toMatch(/npm run|devtools|localhost/i);
  });
});
