import { eventTargetEl } from '../lib/dom.js';

export const Prefs = {
  KEYS: {
    accent: 'ocd_accent',
    density: 'ocd_density',
    fontScale: 'ocd_font_scale',
    dir: 'ocd_dir',
    lang: 'ocd_lang',
  },
  /**
   * The accents that actually have a palette (src/styles/accents.css).
   * A persisted value outside this list — legacy theme names such as
   * "ocean", or a hand-edited localStorage entry — resolves to the default
   * so the shell never renders with an undefined accent.
   */
  ACCENTS: Object.freeze([
    { id: 'lapis', label: 'Lapis', color: '#2563a8' },
    { id: 'violet', label: 'Violet', color: '#7c3aed' },
    { id: 'cyan', label: 'Cyan', color: '#06b6d4' },
    { id: 'amber', label: 'Amber', color: '#f59e0b' },
    { id: 'rose', label: 'Rose', color: '#f43f5e' },
    { id: 'emerald', label: 'Emerald', color: '#10b981' },
    { id: 'sakura', label: 'Sakura', color: '#ec4899' },
  ]),
  DEFAULT_ACCENT: 'lapis',
  get(key, fallback = null) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, String(val)); } catch { /* ignore */ }
    this.applyAll();
  },
  /** Resolve any stored/requested accent id to a supported accent id. */
  resolveAccent(value) {
    const id = String(value || '').trim().toLowerCase();
    return this.ACCENTS.some((accent) => accent.id === id) ? id : this.DEFAULT_ACCENT;
  },
  /**
   * Apply an accent to the shell and persist it.
   *
   * Writes the value directly instead of going through set()/applyAll():
   * applyAll() re-writes density, direction, language and font scale, none of
   * which an accent change touches, so routing through it made every accent
   * click do five unrelated DOM writes.
   *
   * @returns {boolean} true when a supported accent was applied
   */
  setAccent(accent, bus) {
    const requested = String(accent || '').trim().toLowerCase();
    if (!this.ACCENTS.some((entry) => entry.id === requested)) return false;
    const root = document.documentElement;
    // Idempotent: the delegated handler in init() and the Settings picker
    // can both see the same click, so only a real change emits the event.
    const alreadyApplied = root.getAttribute('data-accent') === requested
      && this.get(this.KEYS.accent) === requested;
    root.setAttribute('data-accent', requested);
    try { localStorage.setItem(this.KEYS.accent, requested); } catch { /* ignore */ }
    if (alreadyApplied) return true;
    (bus ?? window.OpenCourseDeck?.bus)?.emit?.('accent:change', { accent: requested });
    return true;
  },
  applyAll() {
    const root = document.documentElement;
    const accent = this.resolveAccent(this.get(this.KEYS.accent, root.getAttribute('data-accent') || this.DEFAULT_ACCENT));
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
    // init() can run more than once (re-boot, tests). Registering the
    // document-level listener each time would apply every accent change
    // twice, so the previous registration is dropped first.
    if (this._clickHandler) document.removeEventListener('click', this._clickHandler);

    const clickHandler = (e) => {
      const target = eventTargetEl(e);
      if (!target) return;

      const themeBtn = target.closest('[data-theme-set]');
      if (themeBtn) effectiveTheme?.apply?.(themeBtn.dataset.themeSet);

      // Accent swatches opt in with data-accent-option. A bare [data-accent]
      // selector used to match the root <html> element, which carries
      // data-accent="lapis" itself: EVERY click in the app resolved to that
      // element and reset the accent to the default, persisting it.
      const accentBtn = target.closest('[data-accent-option]');
      if (accentBtn) this.setAccent(accentBtn.dataset.accentOption, effectiveBus);
    };
    this._clickHandler = clickHandler;
    document.addEventListener('click', clickHandler);

    return () => {
      if (this._clickHandler !== clickHandler) return;
      document.removeEventListener('click', clickHandler);
      this._clickHandler = null;
    };
  },
  /** Remove the delegated document listener registered by init(). */
  dispose() {
    if (!this._clickHandler) return;
    document.removeEventListener('click', this._clickHandler);
    this._clickHandler = null;
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

