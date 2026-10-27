import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasAreaChart } from '../src/features/canvasCharts/area.js';
import { loadVendorScript } from '../src/core/vendorLoader.js';
vi.mock('../src/core/vendorLoader.js', () => ({ loadVendorScript: vi.fn() }));

const originalChart = globalThis.Chart;

afterEach(() => {
  globalThis.Chart = originalChart;
  vi.mocked(loadVendorScript).mockReset();
  vi.restoreAllMocks();
});

function harness() {
  const instance = { data: null, update: vi.fn(), destroy: vi.fn() };
  const constructor = vi.fn(function MockChart(canvas, config) {
    instance.data = config.data;
    instance.options = config.options;
    return instance;
  });
  globalThis.Chart = constructor;
  const canvas = document.createElement('canvas');
  return { canvas, instance, constructor };
}

describe('CanvasAreaChart delegates rendering and interaction to the supported Chart.js engine', () => {
  it('converts study series to an accessible native Chart.js line/area configuration', () => {
    const { canvas, instance, constructor } = harness();
    const chart = new CanvasAreaChart(canvas, { smooth: true, fillOpacity: 0.2, showDots: false });
    chart.render({
      labels: ['Monday', 'Tuesday'],
      series: [{ label: 'Study hours', data: [2, 5], color: '#123abc' }],
    });
    expect(constructor).toHaveBeenCalledOnce();
    expect(constructor).toHaveBeenCalledWith(canvas, expect.objectContaining({
      type: 'line',
      data: {
        labels: ['Monday', 'Tuesday'],
        datasets: [expect.objectContaining({
          label: 'Study hours', data: [2, 5], borderColor: '#123abc',
          fill: 'origin', spanGaps: false,
        })],
      },
    }));
    expect(instance.options.plugins.tooltip).toEqual(expect.objectContaining({ mode: 'index', intersect: false }));
    expect(instance.options.elements.point.radius).toBe(0);
    chart.destroy();
    expect(instance.destroy).toHaveBeenCalledOnce();
  });

  it('reuses the Chart.js instance on updates and preserves missing values as gaps', () => {
    const { canvas, instance, constructor } = harness();
    const chart = new CanvasAreaChart(canvas);
    chart.render({ labels: ['a', 'b', 'c'], series: [{ label: 'Review', data: [1, null, '3'] }] });
    expect(instance.data.datasets[0].data).toEqual([1, null, 3]);
    chart.render({ labels: ['x'], series: [{ label: 'Review', data: [4] }] });
    expect(constructor).toHaveBeenCalledOnce();
    expect(instance.data.labels).toEqual(['x']);
    expect(instance.update).toHaveBeenCalledOnce();
    chart.destroy();
    chart.destroy();
    expect(instance.destroy).toHaveBeenCalledOnce();
  });

  it('loads Chart.js on demand and ignores a stale render when destroyed before loading', async () => {
    const { canvas, constructor } = harness();
    let supplyLibrary;
    vi.mocked(loadVendorScript).mockImplementationOnce(() => new Promise(resolve => { supplyLibrary = resolve; }));
    globalThis.Chart = undefined;
    const chart = new CanvasAreaChart(canvas);
    const ready = chart.render({ labels: ['x'], series: [{ label: 'Hours', data: [1] }] });
    expect(loadVendorScript).toHaveBeenCalledWith('chartjs');
    chart.destroy();
    supplyLibrary(constructor);
    await ready;
    expect(constructor).not.toHaveBeenCalled();
  });

  it('uses the latest data if two renders occur before the vendor library loads', async () => {
    const { canvas, constructor, instance } = harness();
    let supplyLibrary;
    vi.mocked(loadVendorScript).mockImplementation(() => new Promise(resolve => { supplyLibrary = resolve; }));
    globalThis.Chart = undefined;
    const chart = new CanvasAreaChart(canvas);
    const first = chart.render({ labels: ['old'], series: [{ data: [1] }] });
    const second = chart.render({ labels: ['new'], series: [{ data: [9] }] });
    supplyLibrary(constructor);
    await Promise.all([first, second]);
    expect(instance.data.labels).toEqual(['new']);
    expect(constructor).toHaveBeenCalledOnce();
    chart.destroy();
  });
});
