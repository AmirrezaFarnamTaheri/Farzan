import { $, $$, eventTargetEl } from '../lib/dom.js';

export const ThemeManager = {
  // Keep in sync with src/core/storageMigrate.js + index pre-boot.
  STORAGE_KEY: 'ocd_theme',
  SYSTEM_QUERY: window.matchMedia('(prefers-color-scheme: dark)'),

  /**
   * Determine effective theme ('dark' | 'light')
   */
  getEffective(theme = window.OpenCourseDeck?.state?.theme) {
    if (theme === 'system') {
      return this.SYSTEM_QUERY.matches ? 'dark' : 'light';
    }
    return theme || 'dark';
  },

  /**
   * Apply a theme to <html>
   */
  apply(theme) {
    const OpenCourseDeck = window.OpenCourseDeck ?? {};

    // IMPORTANT:
    // - Our CSS supports multiple themes via [data-theme="..."] (dark/light/midnight/forest/ocean/sunset/rose/paper)
    // - Only 'system' should resolve to an effective light/dark value.
    const effective = this.getEffective(theme);
    const isSystem = theme === 'system';
    const appliedTheme = isSystem ? effective : theme;

    document.documentElement.setAttribute('data-theme', appliedTheme);

    // Coarse light/dark classes for components that still key off .light / .dark.
    const isLightTheme = appliedTheme === 'light' || appliedTheme === 'paper';
    document.documentElement.classList.toggle('light', isLightTheme);
    document.documentElement.classList.toggle('dark', !isLightTheme);

    OpenCourseDeck.state = OpenCourseDeck.state ?? {};
    OpenCourseDeck.state.theme = theme;
    window.OpenCourseDeck = OpenCourseDeck;

    try { localStorage.setItem(this.STORAGE_KEY, theme); } catch { /* ignore */ }

    // Update all toggle buttons
    // Key off the coarse light/dark classification, not `effective === 'dark'`:
    // getEffective() returns the theme NAME, so midnight/forest/ocean/sunset/
    // rose (all dark) would otherwise be labelled as light and show the wrong
    // icon and aria-label.
    $$('[data-theme-toggle]').forEach((btn) => {
      const icon = $('[data-theme-icon]', btn);
      if (icon) icon.textContent = isLightTheme ? '🌙' : '☀️';
      btn.setAttribute('aria-label', isLightTheme ? 'Switch to dark mode' : 'Switch to light mode');
      btn.setAttribute('data-current-theme', effective);
    });

    // Update theme-selector buttons/radios
    $$('[data-theme-option]').forEach((el) => {
      const isActive = el.dataset.themeOption === theme;
      el.classList.toggle('active', isActive);
      el.setAttribute('aria-pressed', String(isActive));
    });

    OpenCourseDeck.bus?.emit?.('theme:change', { theme, effective });
  },

  /**
   * Toggle between dark and light
   */
  toggle() {
    const effective = this.getEffective();
    // Same classification as apply(): a user on a named dark theme
    // (midnight/forest/ocean/sunset/rose) pressing the toggle expects light
    // mode, but `effective === 'dark'` was false for all of them, so the
    // toggle just swapped one dark theme for another.
    const isLight = effective === 'light' || effective === 'paper';
    this.apply(isLight ? 'dark' : 'light');
  },

  /**
   * Load saved theme or default
   */
  init() {
    const OpenCourseDeck = window.OpenCourseDeck ?? {};
    const saved = (() => {
      try {
        return localStorage.getItem(this.STORAGE_KEY) ?? 'dark';
      } catch {
        return 'dark';
      }
    })();

    this.apply(saved);

    // React to OS-level changes when theme = 'system'
    this.SYSTEM_QUERY.addEventListener('change', () => {
      if (OpenCourseDeck.state?.theme === 'system') this.apply('system');
    });

    // Wire toggle buttons
    document.addEventListener('click', (e) => {
      const target = eventTargetEl(e);
      if (!target) return;
      const btn = target.closest('[data-theme-toggle]');
      if (btn) this.toggle();

      const opt = target.closest('[data-theme-option]');
      if (opt) this.apply(opt.dataset.themeOption);
    });

    window.OpenCourseDeck = OpenCourseDeck;
  },
};

