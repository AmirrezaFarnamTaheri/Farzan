import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountProgressView } from '../src/views/progressRoute.js';

describe('progress route workspace', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="main-content"></main>';
    window.OpenCourseDeck = {
      ProgressStatsInit: vi.fn(),
      ProgressStats: { destroy: vi.fn() },
    };
  });

  it('preserves every export, import, reset, chart, metric, and table hook', () => {
    const controller = mountProgressView({
      setView: html => { document.getElementById('main-content').innerHTML = html; },
    });

    const requiredIds = [
      'btn-export-json',
      'btn-export-csv',
      'btn-export-md',
      'btn-export-vault',
      'btn-export-vault-archive',
      'btn-export-vault-zip',
      'btn-export-vault-directory',
      'btn-import-json',
      'btn-reset-all',
      'stat-total-topics',
      'stat-done-topics',
      'stat-in-progress',
      'stat-completion-pct',
      'stat-watched-time',
      'stat-streak',
      'stat-active-days',
      'stat-overall-bar',
      'chart-overall',
      'chart-courses',
      'stat-course-table-body',
    ];

    requiredIds.forEach(id => expect(document.getElementById(id), id).not.toBeNull());
    expect(document.querySelectorAll('.progress-metric')).toHaveLength(7);
    expect(document.querySelector('.progress-export-menu')).not.toBeNull();
    expect(document.querySelector('.progress-table-wrap')?.getAttribute('role')).toBe('region');
    expect(window.OpenCourseDeck.ProgressStatsInit).toHaveBeenCalledOnce();

    controller.unmount();
    expect(window.OpenCourseDeck.ProgressStats.destroy).toHaveBeenCalledOnce();
  });
});
