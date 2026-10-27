import { describe, expect, it, vi } from 'vitest';
import { chartGauge } from '../src/features/chartPlugins/gauge.js';

function makeChart(fraction) {
  const painted = [];
  const ctx = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'fillText') return value => painted.push(String(value));
      if (prop === 'canvas') return document.createElement('canvas');
      return () => {};
    },
    set() { return true; },
  });
  return {
    painted,
    chart: {
      ctx,
      chartArea: { left: 0, top: 0, right: 500, bottom: 300 },
      getDatasetMeta: vi.fn(() => ({ data: [{ circumference: Math.PI * fraction }] })),
    },
  };
}

describe('Chart.js gauge transition parity', () => {
  it('uses the animated ArcElement circumference for interim needle/text value', () => {
    const { chart, painted } = makeChart(0.42);
    chartGauge.afterDraw(chart, {}, {
      min: 0, max: 100, value: 90, unit: '%',
      trackDatasetAnimation: true, textColor: '#fff', zones: [],
    });
    expect(painted).toContain('42%');
    expect(painted).not.toContain('90%');
  });

  it('preserves explicit value for legacy chartGauge consumers', () => {
    const { chart, painted } = makeChart(0.42);
    chartGauge.afterDraw(chart, {}, {
      min: 0, max: 100, value: 90, unit: '%', textColor: '#fff', zones: [],
    });
    expect(painted).toContain('90%');
  });
});
