import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasGauge } from '../src/features/canvasCharts/gauge.js';
import { loadVendorScript } from '../src/core/vendorLoader.js';
vi.mock('../src/core/vendorLoader.js', () => ({ loadVendorScript: vi.fn() }));
import { chartGauge } from '../src/features/chartPlugins/gauge.js';

const previous = globalThis.Chart;
afterEach(() => { globalThis.Chart = previous; vi.mocked(loadVendorScript).mockReset(); vi.restoreAllMocks(); });

describe('CanvasGauge reuses the installed Chart.js gauge renderer', () => {
  it('delegates the gauge geometry to the registered plugin without duplicating drawing', () => {
    const instance = { data: {}, options: {}, update: vi.fn(), destroy: vi.fn() };
    const Chart = vi.fn(function MockChart(canvas, config) {
      instance.data = config.data;
      instance.options = config.options;
      return instance;
    });
    globalThis.Chart = Chart;
    const canvas = document.createElement('canvas');
    const gauge = new CanvasGauge(canvas, { min: 10, max: 90, value: 30, unit: '%', duration: 0 });
    expect(Chart).toHaveBeenCalledWith(canvas, expect.objectContaining({
      type: 'doughnut',
      plugins: [chartGauge],
      options: expect.objectContaining({ plugins: expect.objectContaining({
        gauge: expect.objectContaining({ min: 10, max: 90, value: 30, unit: '%' }),
      }) }),
    }));
    gauge.setValue(200, false);
    expect(instance.options.plugins.gauge.value).toBe(90);
    expect(instance.update).toHaveBeenCalledWith('none');
    gauge.destroy();
    gauge.destroy();
    expect(instance.destroy).toHaveBeenCalledOnce();
  });

  it('mounts only after on-demand Chart.js resolves and preserves an interim value update', async () => {
    let supplyLibrary;
    vi.mocked(loadVendorScript).mockImplementationOnce(() => new Promise(resolve => { supplyLibrary = resolve; }));
    globalThis.Chart = undefined;
    const fakeChart = { data: { datasets: [{ data: [] }] }, options: { plugins: { gauge: {} } }, update: vi.fn(), destroy: vi.fn() };
    const constructor = vi.fn(function MockChart() { return fakeChart; });
    const gauge = new CanvasGauge(document.createElement('canvas'), { min: 0, max: 100, value: 10 });
    gauge.setValue(84, false);
    expect(loadVendorScript).toHaveBeenCalledWith('chartjs');
    supplyLibrary(constructor);
    await gauge.ready;
    expect(constructor.mock.calls[0][1].options.plugins.gauge.value).toBe(84);
    gauge.destroy();
    expect(fakeChart.destroy).toHaveBeenCalledOnce();
  });

  it('does not leak a chart when its owner is destroyed during vendor loading', async () => {
    let supplyLibrary;
    vi.mocked(loadVendorScript).mockImplementationOnce(() => new Promise(resolve => { supplyLibrary = resolve; }));
    globalThis.Chart = undefined;
    const constructor = vi.fn();
    const gauge = new CanvasGauge(document.createElement('canvas'));
    gauge.destroy();
    supplyLibrary(constructor);
    await gauge.ready;
    expect(constructor).not.toHaveBeenCalled();
  });
});
