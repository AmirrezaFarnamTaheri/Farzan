import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasHeatmap } from '../src/features/canvasCharts/heatmap.js';
import { chartHeatmap } from '../src/features/chartPlugins/heatmap.js';
import { loadVendorScript } from '../src/core/vendorLoader.js';

vi.mock('../src/core/vendorLoader.js', () => ({ loadVendorScript: vi.fn() }));
const oldChart = globalThis.Chart;
afterEach(() => {
  globalThis.Chart = oldChart;
  vi.mocked(loadVendorScript).mockReset();
  vi.restoreAllMocks();
});

function makeHarness() {
  const instance = { data: null, options: null, update: vi.fn(), destroy: vi.fn() };
  const Chart = vi.fn(function ChartMock(canvas, opts) {
    instance.data = opts.data;
    instance.options = opts.options;
    return instance;
  });
  globalThis.Chart = Chart;
  const canvas = document.createElement('canvas');
  return { canvas, Chart, instance };
}

describe('CanvasHeatmap delegates to existing Chart.js heatmap plugin', () => {
  it('preserves calendar-model shape and forwards options to the vendored plugin', () => {
    const { canvas, Chart, instance } = makeHarness();
    const hm = new CanvasHeatmap(canvas, { colorScale: ['#000', '#fff'], cellSize: 10, showMonths: false });
    const data = [{ date: '2026-07-20', value: 2 }, { date: '2026-07-22', value: 9 }];
    hm.render({ data });
    expect(hm._grid.cells.map(cell => cell.date)).toContain('2026-07-22');
    expect(Chart).toHaveBeenCalledOnce();
    const opts = Chart.mock.calls[0][1];
    expect(opts.plugins).toContain(chartHeatmap);
    expect(opts.options.plugins.heatmap).toEqual(expect.objectContaining({
      data, cellSize: 10, colorScale: ['#000', '#fff'],
      labels: expect.objectContaining({ months: false, weekdays: true }),
    }));
    expect(instance.update).not.toHaveBeenCalled();
    hm.destroy();
    expect(instance.destroy).toHaveBeenCalledOnce();
  });

  it('reuses one chart for updates and disposes only once', () => {
    const { canvas, Chart, instance } = makeHarness();
    const hm = new CanvasHeatmap(canvas);
    hm.render([{ date: '2026-07-20', value: 1 }]);
    hm.render([{ date: '2026-07-21', value: 2 }]);
    expect(Chart).toHaveBeenCalledOnce();
    expect(instance.options.plugins.heatmap.data).toEqual([{ date: '2026-07-21', value: 2 }]);
    expect(instance.update).toHaveBeenCalledOnce();
    hm.destroy();
    hm.destroy();
    expect(instance.destroy).toHaveBeenCalledOnce();
  });

  it('does not mount after destruction while the vendored script loads', async () => {
    const { canvas, Chart } = makeHarness();
    let resolve;
    vi.mocked(loadVendorScript).mockReturnValueOnce(new Promise(r => { resolve = r; }));
    globalThis.Chart = undefined;
    const hm = new CanvasHeatmap(canvas);
    const pending = hm.render({ data: [{ date: '2026-07-20', value: 5 }] });
    expect(loadVendorScript).toHaveBeenCalledWith('chartjs');
    hm.destroy();
    resolve(Chart);
    await pending;
    expect(Chart).not.toHaveBeenCalled();
  });
});
