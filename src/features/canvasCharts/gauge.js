/**
 * Compatibility adapter for the existing Chart.js gauge plugin.
 *
 * Formerly duplicated gauge arc geometry, easing, animation, DPR scaling
 * and RAF lifecycle in a second Canvas2D engine. All display and lifecycle
 * work is now managed by the Chart.js library already bundled with Farzan.
 */
import { chartGauge } from '../chartPlugins/gauge.js';
import { loadVendorScript } from '../../core/vendorLoader.js';

export class CanvasGauge {
  constructor(canvas, options = {}) {
    if (!canvas) throw new TypeError('CanvasGauge requires a canvas');
    this._canvas = canvas;
    this._options = { ...options };
    this._min = Number.isFinite(Number(options.min)) ? Number(options.min) : 0;
    this._max = Number.isFinite(Number(options.max))
      ? Math.max(this._min, Number(options.max)) : 100;
    this._value = this._clamp(options.value ?? 0);
    this._currentDisplay = this._value;
    this._animateDuration = options.duration == null ? 800 : Math.max(0, Number(options.duration) || 0);
    this._destroyed = false;
    this._chart = null;
    if (typeof globalThis.Chart === 'function') {
      this._mount(globalThis.Chart);
      this.ready = Promise.resolve();
    } else {
      this.ready = loadVendorScript('chartjs').then(Chart => {
        if (!this._destroyed) this._mount(Chart);
      });
    }
  }

  _mount(Chart) {
    if (this._destroyed) return;
    if (typeof Chart !== 'function') {
      throw new Error('CanvasGauge: Chart.js is unavailable after the vendor loader completed');
    }
    const options = this._options;
    const gauge = {
      min: this._min,
      max: this._max,
      value: this._value,
      unit: options.unit || '',
      lineWidth: options.lineWidth || 20,
      zones: Array.isArray(options.zones) ? options.zones : [
        { from: 0, to: 33, color: '#ef4444' },
        { from: 33, to: 66, color: '#eab308' },
        { from: 66, to: 100, color: '#22c55e' },
      ],
      color: options.color || '#6366f1',
      needleColor: options.needleColor || '#fff',
      textColor: options.textColor || null,
      fontSize: options.fontSize || null,
    };

    this._chart = new Chart(this._canvas, {
      type: 'doughnut',
      // The installed plugin handles the actual gauge; Chart.js provides
      // layout, responsive redraw, animation and resource cleanup.
      plugins: [chartGauge],
      data: {
        labels: ['Completed', 'Remaining'],
        datasets: [{
          data: [Math.max(0, this._value - this._min), Math.max(0, this._max - this._value)],
          backgroundColor: ['transparent', 'transparent'],
          borderWidth: 0,
          hoverOffset: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: this._animateDuration > 0 ? { duration: this._animateDuration } : false,
        plugins: {
          gauge,
          legend: { display: false },
          tooltip: { enabled: false },
        },
      },
    });
  }

  _clamp(value) {
    const numeric = Number(value);
    return Math.max(this._min, Math.min(this._max, Number.isFinite(numeric) ? numeric : this._min));
  }

  setValue(value, animate = true) {
    if (this._destroyed) return;
    this._value = this._clamp(value);
    this._currentDisplay = this._value;
    if (!this._chart) return; // Vendor loader has not resolved yet.
    this._chart.options.plugins.gauge.value = this._value;
    this._chart.data.datasets[0].data = [
      Math.max(0, this._value - this._min),
      Math.max(0, this._max - this._value),
    ];
    this._chart.update(animate && this._animateDuration > 0 ? undefined : 'none');
  }

  destroy() {
    if (this._destroyed) return;
    this._chart?.destroy();
    this._chart = null;
    this._destroyed = true;
  }
}
