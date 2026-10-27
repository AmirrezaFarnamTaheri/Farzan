import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasGauge } from '../src/features/canvasCharts/gauge.js';
import { chartGauge } from '../src/features/chartPlugins/gauge.js';

const previous = globalThis.Chart;
afterEach(() => { globalThis.Chart = previous; vi.restoreAllMocks(); });

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

  it('reports a missing bundled chart dependency before displaying an empty gauge', () => {
    globalThis.Chart = undefined;
    expect(() => new CanvasGauge(document.createElement('canvas'))).toThrow(/Chart\.js.*unavailable/);
  });
});
