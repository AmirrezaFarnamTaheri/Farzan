import { describe, expect, it, vi } from 'vitest';
import { chartArc } from '../src/features/chartPlugins/arc.js';

function makeChart(arc = {}, data = [75, 25]) {
  return {
    options: { plugins: { arc } },
    data: { datasets: [{ data }] },
    getDatasetMeta: () => ({ data: [{ circumference: 1.5 * Math.PI }] }),
    chartArea: { left: 0, right: 200, top: 0, bottom: 200 },
    ctx: {
      save: vi.fn(),
      restore: vi.fn(),
      arc: vi.fn(),
      beginPath: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      canvas: document.createElement('canvas'),
    },
  };
}

describe('Chart.js built-in doughnut completion ring', () => {
  it('uses native Chart.js arcs, dataset colors and built-in animation rather than a custom animation loop', () => {
    const chart = makeChart({ color: '#123456', backgroundColor: '#222222', animate: true, duration: 900 });
    chartArc.beforeInit(chart);
    expect(chart.options).toMatchObject({
      cutout: '78%', rotation: -90, animation: { duration: 900 },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    });
    expect(chart.data.datasets[0]).toMatchObject({
      data: [75, 25],
      backgroundColor: ['#123456', '#222222'],
      borderWidth: 0,
    });
    expect(chartArc.beforeDraw).toBeUndefined();
    expect(chartArc.afterInit).toBeUndefined();
    expect(chartArc.afterDestroy).toBeUndefined();
  });

  it('draws only the center percent label, never another arc over the Chart.js dataset', () => {
    const chart = makeChart({ showText: true, textColor: '#ffffff' });
    chartArc.beforeInit(chart);
    chartArc.afterDatasetDraw(chart, { index: 0 }, chart.options.plugins.arc);
    expect(chart.ctx.arc).not.toHaveBeenCalled();
    expect(chart.ctx.stroke).not.toHaveBeenCalled();
    expect(chart.ctx.fillText).toHaveBeenCalledWith('75%', 100, 100);
    expect(chart.ctx.save).toHaveBeenCalledTimes(1);
    expect(chart.ctx.restore).toHaveBeenCalledTimes(1);
  });

  it('suppresses duplicate labels for additional datasets and honors showText=false', () => {
    const chart = makeChart();
    chartArc.beforeInit(chart);
    chartArc.afterDatasetDraw(chart, { index: 1 }, chart.options.plugins.arc);
    expect(chart.ctx.fillText).not.toHaveBeenCalled();
    chartArc.afterDatasetDraw(chart, { index: 0 }, { showText: false });
    expect(chart.ctx.fillText).not.toHaveBeenCalled();
  });

  it('applies ring colors to datasets replaced after init without overwriting caller styles', () => {
    const chart = makeChart({ color: '#112233', backgroundColor: '#eeeeee' });
    chartArc.beforeInit(chart);
    chart.data.datasets = [{ data: [40, 60] }];
    chartArc.beforeUpdate(chart);
    expect(chart.data.datasets[0]).toMatchObject({
      data: [40, 60], borderWidth: 0, backgroundColor: ['#112233', '#eeeeee'],
    });
    chart.data.datasets = [{ data: [20, 80], backgroundColor: ['#aabbcc', '#ddeeff'], borderWidth: 4 }];
    chartArc.beforeUpdate(chart);
    expect(chart.data.datasets[0].backgroundColor).toEqual(['#aabbcc', '#ddeeff']);
    expect(chart.data.datasets[0].borderWidth).toBe(4);
  });

  it('defaults safely when Chart.js has not initialized arc metadata', () => {
    const chart = makeChart();
    chart.getDatasetMeta = () => ({ data: [] });
    chartArc.beforeInit(chart);
    chartArc.afterDatasetDraw(chart, { index: 0 }, chart.options.plugins.arc);
    expect(chart.ctx.fillText).toHaveBeenCalledWith('75%', 100, 100);
  });
  it('preserves the documented legacy lineWidth without overriding an explicit cutout', () => {
    const chart = makeChart({ lineWidth: 12 });
    chart.width = 200;
    chart.height = 200;
    chartArc.beforeInit(chart);
    // Chart.js's numeric cutout is an inner radius in actual pixels.
    // A scriptable cutout keeps a 12px-wide ring when the chart resizes.
    expect(typeof chart.options.cutout).toBe('function');
    expect(chart.options.cutout({ chart })).toBe(88);
    chart.width = 300;
    chart.height = 300;
    expect(chart.options.cutout({ chart })).toBe(138);

    const explicit = makeChart({ lineWidth: 12 });
    explicit.options.cutout = '55%';
    chartArc.beforeInit(explicit);
    expect(explicit.options.cutout).toBe('55%');
  });

  it('keeps a 75% label for a half-circle doughnut when animated metadata uses radians', () => {
    const chart = makeChart();
    chart.options.circumference = 180;
    chart.getDatasetMeta = () => ({ data: [{ circumference: 0.75 * Math.PI }] });
    chartArc.beforeInit(chart);
    chartArc.afterDatasetDraw(chart, { index: 0 }, chart.options.plugins.arc);
    expect(chart.ctx.fillText).toHaveBeenCalledWith('75%', 100, 100);
  });

  it('keeps explicit native doughnut options and disables animation by default', () => {
    const chart = makeChart();
    chart.options.cutout = '52%';
    chart.options.rotation = 25;
    chart.options.animation = { duration: 250 };
    chartArc.beforeInit(chart);
    expect(chart.options.cutout).toBe('52%');
    expect(chart.options.rotation).toBe(25);
    expect(chart.options.animation).toEqual({ duration: 250 });
    const fresh = makeChart();
    chartArc.beforeInit(fresh);
    expect(fresh.options.animation).toBe(false);
  });

});
