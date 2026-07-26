import { describe, expect, it } from 'vitest';
import { CanvasHeatmap } from '../src/features/canvasCharts/heatmap.js';
import { chartHeatmap } from '../src/features/chartPlugins/heatmap.js';

/**
 * Minimal 2D-context stub: the heatmap only needs measurement plus no-op
 * drawing calls, and we assert on grid geometry rather than pixels.
 */
function stubCanvas({ width = 800, height = 200 } = {}) {
  const ctx = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'measureText') return () => ({ width: 40 });
      if (prop === 'canvas') return canvas;
      if (prop === 'font' || prop === 'fillStyle' || prop === 'textAlign' || prop === 'textBaseline') return '';
      return () => {};
    },
    set() { return true; },
  });
  const canvas = {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    style: {},
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    addEventListener() {},
    removeEventListener() {},
  };
  return canvas;
}

describe('heatmap date parsing (infinite-loop guard)', () => {
  it('ignores ISO datetime strings instead of hanging the grid walk', () => {
    // An Invalid Date is truthy; before the guard it poisoned min/maxDate
    // with NaN, making every loop comparison false so the while-loop never
    // terminated and allocated on each iteration until the tab died.
    const canvas = stubCanvas();
    const hm = new CanvasHeatmap(canvas);

    hm.render({
      data: [
        { date: '2026-07-26T05:00:00Z', value: 4 },
        { date: '2026-07-20', value: 2 },
        { date: '2026-07-22', value: 9 },
      ],
    });

    // Only the two well-formed dates contribute to the grid.
    expect(hm._grid).toBeTruthy();
    expect(hm._grid.maxVal).toBe(9);
    const dates = hm._grid.cells.map(c => c.date);
    expect(dates).toContain('2026-07-20');
    expect(dates).toContain('2026-07-22');
    expect(dates.some(d => d.includes('T'))).toBe(false);
    hm.destroy();
  });

  it('returns an empty grid when every date is malformed', () => {
    const canvas = stubCanvas();
    const hm = new CanvasHeatmap(canvas);
    hm.render({ data: [{ date: 'not-a-date-at-all', value: 1 }, { date: 'x-y-z', value: 2 }] });
    expect(hm._grid.cells).toEqual([]);
    hm.destroy();
  });
});

describe('chartHeatmap plugin', () => {
  function makeChart(data) {
    const draws = { count: 0 };
    // getComputedStyle() is called on ctx.canvas, so it must be a real
    // element in jsdom.
    const realCanvas = document.createElement('canvas');
    const chart = {
      ctx: new Proxy({}, {
        get(_t, prop) {
          if (prop === 'measureText') return () => ({ width: 40 });
          if (prop === 'canvas') return realCanvas;
          return () => {};
        },
        set() { return true; },
      }),
      chartArea: { left: 0, top: 0, right: 800, bottom: 200 },
      options: { plugins: { heatmap: { data } } },
      draw() {
        draws.count += 1;
        chartHeatmap.afterDraw(chart, {}, chart.options.plugins.heatmap);
      },
    };
    return { chart, draws };
  }

  it('caches the built grid across redraws instead of rebuilding per frame', () => {
    const data = [{ date: '2026-07-20', value: 3 }, { date: '2026-07-22', value: 5 }];
    const { chart } = makeChart(data);

    chartHeatmap.afterDraw(chart, {}, chart.options.plugins.heatmap);
    const firstGrid = chart._heatmapGridCache;
    expect(firstGrid).toBeTruthy();

    chartHeatmap.afterDraw(chart, {}, chart.options.plugins.heatmap);
    // Same array identity in, same grid object out -- no rebuild.
    expect(chart._heatmapGridCache).toBe(firstGrid);

    // A new data array invalidates the cache.
    chart.options.plugins.heatmap.data = [{ date: '2026-07-25', value: 1 }];
    chartHeatmap.afterDraw(chart, {}, chart.options.plugins.heatmap);
    expect(chart._heatmapGridCache).not.toBe(firstGrid);
  });

  it('redraws once on mouseout so a stale tooltip is cleared', () => {
    const data = [{ date: '2026-07-20', value: 3 }];
    const { chart, draws } = makeChart(data);
    chartHeatmap.afterDraw(chart, {}, chart.options.plugins.heatmap);

    chart._heatmapTooltip = { x: 1, y: 1, date: '2026-07-20', value: 3 };
    const before = draws.count;
    chartHeatmap.afterEvent(chart, { event: { type: 'mouseout' } });

    expect(chart._heatmapTooltip).toBeNull();
    expect(draws.count).toBe(before + 1);
  });

  it('does not redraw on mouseout when no tooltip was showing', () => {
    const data = [{ date: '2026-07-20', value: 3 }];
    const { chart, draws } = makeChart(data);
    chartHeatmap.afterDraw(chart, {}, chart.options.plugins.heatmap);

    chart._heatmapTooltip = null;
    const before = draws.count;
    chartHeatmap.afterEvent(chart, { event: { type: 'mouseout' } });
    expect(draws.count).toBe(before);
  });
});
