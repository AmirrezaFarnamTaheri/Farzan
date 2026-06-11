
import { } from '../lib/dom.js';

export const ThemeManager = {
  _current: 'dark',
  _accent: 'plasma',

  init() {
    this._current = localStorage.getItem('plasma_theme') || 'dark';
    this._accent  = localStorage.getItem('plasma_accent') || 'plasma';
    this.apply();
  },

  set(theme) {
    this._current = theme;
    localStorage.setItem('plasma_theme', theme);
    this.apply();
    window.PlasmaDeck?.bus?.emit('theme:change', { theme });
  },

  setAccent(accent) {
    this._accent = accent;
    localStorage.setItem('plasma_accent', accent);
    this.apply();
    window.PlasmaDeck?.bus?.emit('theme:change', { accent });
  },

  toggle() {
    this.set(this._current === 'dark' ? 'light' : 'dark');
  },

  apply() {
    const root = document.documentElement;
    root.setAttribute('data-theme', this._current);
    root.setAttribute('data-accent', this._accent);
  }
};

export const Prefs = {
  KEYS: {
    sidebarCollapsed: 'plasma_sidebar_collapsed',
    density: 'plasma_density',
    animations: 'plasma_animations_enabled',
  },

  get(key, fallback = null) {
    const val = localStorage.getItem(key);
    if (val === null) return fallback;
    try { return JSON.parse(val); } catch { return val; }
  },

  set(key, val) {
    localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
    window.PlasmaDeck?.bus?.emit('prefs:change', { key, value: val });
    this._apply(key, val);
  },

  init() {
    Object.entries(this.KEYS).forEach(([_, key]) => {
      this._apply(key, this.get(key));
    });
  },

  _apply(key, val) {
    const root = document.documentElement;
    if (key === this.KEYS.sidebarCollapsed) {
      root.classList.toggle('sidebar-collapsed', val === true || val === 'true');
    } else if (key === this.KEYS.density) {
      root.setAttribute('data-density', val || 'comfortable');
    } else if (key === this.KEYS.animations) {
      root.classList.toggle('no-animations', val === false || val === 'false');
    }
  }
};

export const FontScale = {
  _current: 1.0,

  init() {
    this._current = parseFloat(localStorage.getItem('plasma_font_scale') || '1.0');
    this.apply();
  },

  inc()   { this.set(this._current + 0.1); },
  dec()   { this.set(this._current - 0.1); },
  reset() { this.set(1.0); },

  set(val) {
    this._current = Math.max(0.7, Math.min(1.5, val));
    localStorage.setItem('plasma_font_scale', this._current.toFixed(1));
    this.apply();
  },

  apply() {
    document.documentElement.style.setProperty('--font-scale', this._current.toFixed(1));
  }
};

