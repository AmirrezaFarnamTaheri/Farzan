import { describe, expect, it, vi } from 'vitest';
import { chartSparkline } from '../src/features/chartPlugins/sparkline.js';

function fixture(options = {}) {
  return {
    options: {
      plugins: {
        sparkline: { lineColor: '#123456', fillColor: '#abcdef', lineWidth: 3, ...options },
      },
    },
    data: { datasets: [{ data: [2, 4, 1, 5, 3] }] },
  };
}

describe('Chart.js native sparkline compatibility', () => {
  it('uses built-in line geometry instead of drawing duplicate custom strokes', () => {
    const chart = fixture();
    const ctx = { beginPath: vi.fn(), bezierCurveTo: vi.fn(), stroke: vi.fn(), fill: vi.fn() };
    chart.ctx = ctx;
    chartSparkline.beforeInit(chart);
    expect(chartSparkline.afterDatasetDraw).toBeUndefined();
    expect(ctx.beginPath).not.toHaveBeenCalled();
    expect(chart.data.datasets[0]).toMatchObject({
      data: [2, 4, 1, 5, 3],
      borderColor: '#123456',
      backgroundColor: '#abcdef',
      borderWidth: 3,
      pointRadius: 0,
      fill: 'origin',
    });
    expect(chart.options.scales).toEqual({
      x: { display: false },
      y: { display: false },
    });
    expect(chart.options.plugins.legend).toEqual({ display: false });
    expect(chart.options.plugins.tooltip).toEqual({ enabled: false });
  });

  it('retains caller-provided dataset styles and avoids fill when not configured', () => {
    const chart = fixture({ fillColor: null });
    chart.data.datasets[0] = {
      data: [1, 2], borderColor: '#fedcba', borderWidth: 5, fill: false,
    };
    chartSparkline.beforeInit(chart);
    expect(chart.data.datasets[0]).toMatchObject({
      borderColor: '#fedcba', borderWidth: 5, fill: false, pointRadius: 0,
    });
  });
});
