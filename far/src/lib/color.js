/**
 * Color Utilities — merged from Splayer + Ripl.
 */

/**
 * Parse hex color to RGB.
 * @param {string} hex — #rgb or #rrggbb
 * @returns {{ r: number, g: number, b: number }}
 */
export function hexToRgb(hex) {
  let h = String(hex).replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Convert RGB to hex string.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string} #rrggbb
 */
export function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/**
 * Convert hex to HSL.
 * @param {string} hex
 * @returns {{ h: number, s: number, l: number }}
 */
export function hexToHsl(hex) {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * Convert HSL to hex.
 * @param {number} h — 0–360
 * @param {number} s — 0–100
 * @param {number} l — 0–100
 * @returns {string} #rrggbb
 */
export function hslToHex(h, s, l) {
  const hn = h / 360, sn = s / 100, ln = l / 100;
  let r, g, b;
  if (sn === 0) {
    r = g = b = ln;
  } else {
    const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
    const p = 2 * ln - q;
    r = hue2rgb(p, q, hn + 1 / 3);
    g = hue2rgb(p, q, hn);
    b = hue2rgb(p, q, hn - 1 / 3);
  }
  return rgbToHex(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

/**
 * Determine if a hex color is dark (for contrast).
 * @param {string} hex
 * @returns {boolean}
 */
export function isDarkColor(hex) {
  const { r, g, b } = hexToRgb(hex);
  // WCAG relative luminance
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma < 0.5;
}

/**
 * Get foreground color (black or white) that contrasts with the given background.
 * @param {string} hex
 * @returns {string} '#ffffff' or '#000000'
 */
export function accentFgFromHex(hex) {
  return isDarkColor(hex) ? '#ffffff' : '#000000';
}

/**
 * Linearly interpolate between two hex colors in RGB space.
 * @param {string} from
 * @param {string} to
 * @param {number} t — 0–1
 * @returns {string} hex
 */
export function interpolateColor(from, to, t) {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return rgbToHex(
    clamp(a.r + (b.r - a.r) * t),
    clamp(a.g + (b.g - a.g) * t),
    clamp(a.b + (b.b - a.b) * t),
  );
}

/**
 * Linearly interpolate between two numbers.
 * @param {number} from
 * @param {number} to
 * @param {number} t — 0–1
 * @returns {number}
 */
export function interpolateNumber(from, to, t) {
  return from + (to - from) * t;
}
