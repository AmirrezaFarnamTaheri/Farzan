import { describe, expect, it } from 'vitest';
import { buildCalendarGrid } from '../src/features/chartPlugins/calendarGrid.js';

describe('shared calendar grid for both existing heatmap presentations', () => {
  it('supports leap days and Monday-first week positions with one canonical calendar', () => {
    const grid = buildCalendarGrid([
      { date: '2028-02-28', value: 1 },
      { date: '2028-02-29', value: 3 },
      { date: '2028-03-01', value: 2 },
    ]);
    expect(grid.cells.map(cell => cell.date)).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
    expect(grid.cells.map(cell => cell.day)).toEqual([0, 1, 2]);
    expect(grid.maxVal).toBe(3);
    expect(grid.months.map(month => month.label)).toContain('Feb');
    expect(grid.months.map(month => month.label)).toContain('Mar');
  });

  it('rejects impossible dates, timestamps and non-finite values without normalizing them', () => {
    const grid = buildCalendarGrid([
      { date: '2026-02-30', value: 9 },
      { date: '2026-02-28T10:00:00Z', value: 11 },
      { date: '2026-02-28', value: Infinity },
      { date: '2026-03-01', value: -5 },
    ]);
    expect(grid.cells.map(cell => cell.date)).toEqual(['2026-02-28', '2026-03-01']);
    expect(grid.cells.every(cell => cell.value === 0)).toBe(true);
    expect(grid.maxVal).toBe(0);
  });

  it('has an empty safe result on invalid or absent data', () => {
    expect(buildCalendarGrid([{ date: 'invalid', value: 1 }])).toEqual({
      cells: [], months: [], maxVal: 0, weeks: 0,
    });
    expect(buildCalendarGrid([]).cells).toEqual([]);
  });
});
