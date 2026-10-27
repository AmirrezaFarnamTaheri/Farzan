/**
 * Compatibility adapter for Farzan's already-vendored Chart.js heatmap plugin.
 *
 * Previously duplicated the calendar canvas renderer, tooltip hit testing,
 * pointer events, DPR resizing and teardown. The single source of calendar
 * geometry is buildCalendarGrid; Chart.js owns drawing and interaction.
 *
 * Keep the public CanvasHeatmap(canvas, options), render() and destroy()
 * contract and the _grid field used by legacy callers/tests.
 */
import { chartHeatmap } from '../chartPlugins/heatmap.js';
import { buildCalendarGrid } from '../chartPlugins/calendarGrid.js';
import { loadVendorScript } from '../../core/vendorLoader.js';

export class CanvasHeatmap {
  constructor(canvas, options = {}) {
    if (!canvas) throw new TypeError('CanvasHeatmap requires a canvas');
    this._canvas = canvas;
    this._options = { ...options };
    this._data = null;
    this._grid = null;
    this._chart = null;
    this._loading = null;
    this._generation = 0;
    this._destroyed = false;
    this.ready = Promise.resolve();
  }

  render(data) {
    if (this._destroyed) throw new Error('CanvasHeatmap has been destroyed');
    const items = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
    this._data = items;
    this._grid = buildCalendarGrid(items);
    const generation = ++this._generation;

    if (typeof globalThis.Chart !== 'function') {
      this._loading ||= loadVendorScript('chartjs').catch(error => {
        this._loading = null;
        throw error;
      });
      this.ready = this._loading.then(Chart => {
        if (!this._destroyed && generation === this._generation) {
          this._renderWithChart(this._data, Chart);
        }
      });
      return this.ready;
    }

    this._renderWithChart(items, globalThis.Chart);
  }

  _renderWithChart(items, Chart) {
    if (this._destroyed) return;
    if (typeof Chart !== 'function') throw new Error('CanvasHeatmap: Chart.js is unavailable after loading');
    const opts = this._options;
    const config = {
      data: items,
      colorScale: opts.colorScale || ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
      cellSize: Number(opts.cellSize) || 12,
      cellGap: Number(opts.cellGap) || 2,
      labels: {
        months: opts.showMonths !== false,
        weekdays: opts.showWeekdays !== false,
      },
    };
    if (this._chart) {
      // Chart.js resolves options through its proxy. Update the plugin's
      // data rather than creating another canvas controller per render.
      Object.assign(this._chart.options.plugins.heatmap, config);
      this._chart.update('none');
      return;
    }

    this._chart = new Chart(this._canvas, {
      type: 'scatter',
      plugins: [chartHeatmap],
      data: { datasets: [{ data: [] }] },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
          heatmap: config,
        },
        scales: {
          x: { display: false },
          y: { display: false },
        },
      },
    });
  }

  destroy() {
    if (this._destroyed) return;
    ++this._generation;
    this._chart?.destroy();
    this._chart = null;
    this._data = null;
    this._grid = null;
    this._destroyed = true;
  }
}
