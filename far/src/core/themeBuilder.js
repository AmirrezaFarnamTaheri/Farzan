/**
 * Theme Builder — generate full CSS variable set from 4 base colors.
 * Based on Splayer themes.ts.
 */

import { hexToHsl, hslToHex, isDarkColor, accentFgFromHex } from '../lib/color.js';

function lighten(hex, amount) {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, Math.min(100, l + amount));
}

function darken(hex, amount) {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, Math.max(0, l - amount));
}

function adjustSaturation(hex, amount) {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, Math.max(0, Math.min(100, s + amount)), l);
}

/**
 * Build a complete CSS variable set from 4 base colors.
 * @param {string} bg — background hex
 * @param {string} panel — panel/surface hex
 * @param {string} text — primary text hex
 * @param {string} accent — accent hex
 * @returns {Object<string, string>} CSS variable name → value
 */
export function buildUserThemeVars(bg, panel, text, accent) {
  const dark = isDarkColor(bg);
  const dir = dark ? 1 : -1; // positive = lighten for dark themes, darken for light

  const vars = {};

  // Backgrounds
  vars['--bg'] = bg;
  vars['--bg-secondary'] = dir > 0 ? lighten(bg, 3) : darken(bg, 3);

  // Surfaces
  vars['--surface-1'] = panel;
  vars['--surface-2'] = dir > 0 ? lighten(panel, 5) : darken(panel, 5);
  vars['--surface-3'] = dir > 0 ? lighten(panel, 10) : darken(panel, 10);
  vars['--surface-4'] = dir > 0 ? lighten(panel, 15) : darken(panel, 15);

  // Text
  vars['--text-primary'] = text;
  vars['--text-secondary'] = dir > 0 ? darken(text, 15) : lighten(text, 15);
  vars['--text-tertiary'] = dir > 0 ? darken(text, 30) : lighten(text, 30);
  vars['--text-disabled'] = dir > 0 ? darken(text, 50) : lighten(text, 50);

  // Borders
  vars['--border'] = dir > 0 ? lighten(bg, 12) : darken(bg, 12);
  vars['--border-strong'] = dir > 0 ? lighten(bg, 20) : darken(bg, 20);

  // Shadows
  const shadowColor = dark ? 'rgba(0,0,0,' : 'rgba(0,0,0,';
  vars['--shadow-sm'] = `0 1px 2px ${shadowColor}0.05)`;
  vars['--shadow-md'] = `0 4px 6px -1px ${shadowColor}0.1), 0 2px 4px -2px ${shadowColor}0.1)`;
  vars['--shadow-lg'] = `0 10px 15px -3px ${shadowColor}0.1), 0 4px 6px -4px ${shadowColor}0.1)`;
  vars['--shadow-xl'] = `0 20px 25px -5px ${shadowColor}0.1), 0 8px 10px -6px ${shadowColor}0.1)`;

  // Accent
  vars['--accent'] = accent;
  vars['--accent-hover'] = dir > 0 ? lighten(accent, 8) : darken(accent, 8);
  vars['--accent-active'] = dir > 0 ? darken(accent, 8) : lighten(accent, 8);
  vars['--accent-fg'] = accentFgFromHex(accent);
  vars['--accent-muted'] = dir > 0
    ? adjustSaturation(accent, -30)
    : adjustSaturation(accent, -30);

  // Focus ring
  vars['--focus-ring'] = `0 0 0 2px ${accent}66`;

  return vars;
}
