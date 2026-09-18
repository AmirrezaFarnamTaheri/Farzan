import { eventTargetEl } from '../lib/dom.js';

export const Prefs = {
  KEYS: {
    accent: 'ocd_accent',
    density: 'ocd_density',
    fontScale: 'ocd_font_scale',
    dir: 'ocd_dir',
    lang: 'ocd_lang',
  },
  get(key, fallback = null) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, String(val)); } catch { /* ignore */ }
    this.applyAll();
  },
  applyAll() {
    const root = document.documentElement;
    const accent = this.get(this.KEYS.accent, root.getAttribute('data-accent') || 'violet');
    const density = this.get(this.KEYS.density, root.getAttribute('data-density') || 'comfortable');
    const fontScale = this.get(this.KEYS.fontScale, root.style.getPropertyValue('--font-scale')?.trim() || '1');
    const dir = this.get(this.KEYS.dir, root.getAttribute('dir') || 'ltr');
    const lang = this.get(this.KEYS.lang, root.getAttribute('lang') || 'en-US');

    root.setAttribute('data-accent', accent);
    root.setAttribute('data-density', density);
    root.setAttribute('dir', dir);
    root.setAttribute('lang', lang);
    root.style.setProperty('--font-scale', String(fontScale));
  },
  init({ ThemeManager, bus } = {}) {
    const effectiveBus = bus ?? window.OpenCourseDeck?.bus;
    const effectiveTheme = ThemeManager ?? window.OpenCourseDeck?.ThemeManager;
    // Ensure DOM reflects persisted settings (in case preboot ran with blocked storage earlier)
    this.applyAll();

    // Theme quick buttons in topbar (index.html)
    document.addEventListener('click', (e) => {
      const target = eventTargetEl(e);
      if (!target) return;

      const themeBtn = target.closest('[data-theme-set]');
      if (themeBtn) effectiveTheme?.apply?.(themeBtn.dataset.themeSet);

      const accentBtn = target.closest('[data-accent]');
      if (accentBtn && accentBtn.dataset.accent) {
        document.documentElement.setAttribute('data-accent', accentBtn.dataset.accent);
        this.set(this.KEYS.accent, accentBtn.dataset.accent);
        effectiveBus?.emit?.('accent:change', { accent: accentBtn.dataset.accent });
      }
    });
  },
};

export const FontScale = {
  min: 0.85,
  max: 1.25,
  step: 0.05,
  clamp(v) { return Math.min(this.max, Math.max(this.min, v)); },
  get() {
    const raw = document.documentElement.style.getPropertyValue('--font-scale')?.trim()
      || Prefs.get(Prefs.KEYS.fontScale, '1')
      || '1';
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : 1;
  },
  set(v, bus) {
    const effectiveBus = bus ?? window.OpenCourseDeck?.bus;
    const val = this.clamp(v);
    document.documentElement.style.setProperty('--font-scale', String(val));
    Prefs.set(Prefs.KEYS.fontScale, String(val));
    effectiveBus?.emit?.('fontScale:change', { value: val });
  },
  inc(bus) { this.set(this.get() + this.step, bus); },
  dec(bus) { this.set(this.get() - this.step, bus); },
  reset(bus) { this.set(1, bus); },
};

