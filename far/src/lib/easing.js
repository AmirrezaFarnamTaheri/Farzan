/**
 * Easing Library — merged from Anime.js + Ripl + Motion Canvas.
 * All functions: (t: number) => number where t ∈ [0,1], returns [0,1].
 */

const PI = Math.PI;
const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;
const c4 = (2 * PI) / 3;
const c5 = (2 * PI) / 4.5;
const n1 = 7.5625;
const d1 = 2.75;

export const linear = (t) => t;

export const easeInQuad = (t) => t * t;
export const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
export const easeInOutQuad = (t) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

export const easeInCubic = (t) => t * t * t;
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

export const easeInQuart = (t) => t * t * t * t;
export const easeOutQuart = (t) => 1 - (1 - t) ** 4;
export const easeInOutQuart = (t) => t < 0.5 ? 8 * t * t * t * t : 1 - (-2 * t + 2) ** 4 / 2;

export const easeInQuint = (t) => t * t * t * t * t;
export const easeOutQuint = (t) => 1 - (1 - t) ** 5;
export const easeInOutQuint = (t) => t < 0.5 ? 16 * t * t * t * t * t : 1 - (-2 * t + 2) ** 5 / 2;

export const easeInSine = (t) => 1 - Math.cos((t * PI) / 2);
export const easeOutSine = (t) => Math.sin((t * PI) / 2);
export const easeInOutSine = (t) => -(Math.cos(PI * t) - 1) / 2;

export const easeInExpo = (t) => (t === 0 ? 0 : 2 ** (10 * t - 10));
export const easeOutExpo = (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t));
export const easeInOutExpo = (t) => {
  if (t === 0) return 0;
  if (t === 1) return 1;
  if (t < 0.5) return 2 ** (20 * t - 10) / 2;
  return (2 - 2 ** (-20 * t + 10)) / 2;
};

export const easeInCirc = (t) => 1 - Math.sqrt(1 - t * t);
export const easeOutCirc = (t) => Math.sqrt(1 - (t - 1) ** 2);
export const easeInOutCirc = (t) =>
  t < 0.5 ? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2 : (Math.sqrt(1 - (-2 * t + 2) ** 2) + 1) / 2;

export const easeInBack = (t) => c3 * t * t * t - c1 * t * t;
export const easeOutBack = (t) => 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
export const easeInOutBack = (t) =>
  t < 0.5
    ? ((2 * t) ** 2 * ((c2 + 1) * 2 * t - c2)) / 2
    : ((2 * t - 2) ** 2 * ((c2 + 1) * (2 * t - 2) + c2) + 2) / 2;

export const easeInElastic = (t) => {
  if (t === 0) return 0;
  if (t === 1) return 1;
  return -(2 ** (10 * t - 10)) * Math.sin((10 * t - 10.75) * c4);
};

export const easeOutElastic = (t) => {
  if (t === 0) return 0;
  if (t === 1) return 1;
  return 2 ** (-10 * t) * Math.sin((10 * t - 0.75) * c4) + 1;
};

export const easeInOutElastic = (t) => {
  if (t === 0) return 0;
  if (t === 1) return 1;
  if (t < 0.5) return -(2 ** (20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2;
  return (2 ** (-20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
};

export const easeInBounce = (t) => 1 - easeOutBounce(1 - t);

export const easeOutBounce = (t) => {
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

export const easeInOutBounce = (t) =>
  t < 0.5 ? (1 - easeOutBounce(1 - 2 * t)) / 2 : (1 + easeOutBounce(2 * t - 1)) / 2;

// ─── Factory functions (Motion Canvas parameterized) ───

export function createEaseInBack(s = c1) {
  return (t) => (s + 1) * t * t * t - s * t * t;
}

export function createEaseOutBack(s = c1) {
  return (t) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
}

export function createEaseInElastic(a = 1, p = 0.3) {
  const s = (p / (2 * PI)) * Math.asin(1 / (a || 1));
  return (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return -(a * 2 ** (10 * (t - 1))) * Math.sin(((t - 1) - s) * (2 * PI) / p);
  };
}

export function createEaseOutElastic(a = 1, p = 0.3) {
  const s = (p / (2 * PI)) * Math.asin(1 / (a || 1));
  return (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return a * 2 ** (-10 * t) * Math.sin((t - s) * (2 * PI) / p) + 1;
  };
}

export function createEaseOutBounce(bounces = 4) {
  const b = Math.max(1, bounces);
  return (t) => {
    if (t < 1 / b) return (b * b) * t * t;
    if (t < 2 / b) { t -= 1.5 / b; return (b * b) * t * t + 0.75; }
    if (t < 2.5 / b) { t -= 2.25 / b; return (b * b) * t * t + 0.9375; }
    t -= 2.625 / b; return (b * b) * t * t + 0.984375;
  };
}

// ─── Cubic Bezier Solver ───

export function cubicBezier(x1, y1, x2, y2) {
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
    throw new RangeError('cubicBezier x values must be in [0,1]');
  }

  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  function sampleX(t) {
    return ((ax * t + bx) * t + cx) * t;
  }

  function sampleY(t) {
    return ((ay * t + by) * t + cy) * t;
  }

  function sampleDerivX(t) {
    return (3 * ax * t + 2 * bx) * t + cx;
  }

  function solveCurveX(x, epsilon = 1e-6) {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < epsilon) return t;
      const d = sampleDerivX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    // Fallback: bisection
    let lo = 0, hi = 1;
    t = x;
    while (lo < hi) {
      const xGuess = sampleX(t);
      if (Math.abs(xGuess - x) < epsilon) return t;
      if (x > xGuess) lo = t; else hi = t;
      t = (hi - lo) / 2 + lo;
    }
    return t;
  }

  return function bezierEasing(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return sampleY(solveCurveX(x));
  };
}

// ─── Spring Solver ───

export function spring({ stiffness = 100, damping = 10, mass = 1, velocity = 0 } = {}) {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const wd = w0 * Math.sqrt(Math.max(0, 1 - zeta * zeta));
  const A = 1;
  const B = zeta < 1 ? (zeta * w0 + velocity) / wd : velocity / w0 + 1;

  return function springEasing(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    if (zeta < 1) {
      // Underdamped
      const decay = Math.exp(-zeta * w0 * t);
      return 1 - decay * (A * Math.cos(wd * t) + B * Math.sin(wd * t));
    }
    if (zeta === 1) {
      // Critically damped
      const decay = Math.exp(-w0 * t);
      return 1 - decay * (A + (B + A * w0) * t);
    }
    // Overdamped
    const s1 = -w0 * (zeta + Math.sqrt(zeta * zeta - 1));
    const s2 = -w0 * (zeta - Math.sqrt(zeta * zeta - 1));
    const c2 = (velocity + A * s1) / (s2 - s1);
    const c1 = A - c2;
    return 1 - c1 * Math.exp(s1 * t) - c2 * Math.exp(s2 * t);
  };
}

// ─── Registry ───

const registry = new Map();

function registerDefaults() {
  const presets = {
    linear,
    easeInQuad, easeOutQuad, easeInOutQuad,
    easeInCubic, easeOutCubic, easeInOutCubic,
    easeInQuart, easeOutQuart, easeInOutQuart,
    easeInQuint, easeOutQuint, easeInOutQuint,
    easeInSine, easeOutSine, easeInOutSine,
    easeInExpo, easeOutExpo, easeInOutExpo,
    easeInCirc, easeOutCirc, easeInOutCirc,
    easeInBack, easeOutBack, easeInOutBack,
    easeInElastic, easeOutElastic, easeInOutElastic,
    easeInBounce, easeOutBounce, easeInOutBounce,
  };
  for (const [name, fn] of Object.entries(presets)) {
    registry.set(name, fn);
  }
  registry.set('ease', cubicBezier(0.25, 0.1, 0.25, 1));
  registry.set('ease-in', cubicBezier(0.42, 0, 1, 1));
  registry.set('ease-out', cubicBezier(0, 0, 0.58, 1));
  registry.set('ease-in-out', cubicBezier(0.42, 0, 0.58, 1));
}

registerDefaults();

/**
 * Register a custom easing function.
 * @param {string} name
 * @param {Function} fn
 */
export function registerEasing(name, fn) {
  registry.set(name, fn);
}

/**
 * Look up an easing function by name.
 * @param {string} name
 * @returns {Function|undefined}
 */
export function getEasing(name) {
  return registry.get(name);
}

/**
 * Parse easing input: string name, function, or cubic-bezier params.
 * @param {string|Function|[number,number,number,number]} input
 * @returns {Function}
 */
export function parseEasing(input) {
  if (typeof input === 'function') return input;
  if (typeof input === 'string') {
    const found = registry.get(input);
    if (found) return found;
    // Try cubic-bezier(x1,y1,x2,y2) syntax
    const m = input.match(/^cubic-bezier\(\s*([\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*([\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/);
    if (m) return cubicBezier(+m[1], +m[2], +m[3], +m[4]);
    throw new RangeError(`Unknown easing: ${input}`);
  }
  if (Array.isArray(input) && input.length === 4) {
    return cubicBezier(input[0], input[1], input[2], input[3]);
  }
  throw new TypeError('Invalid easing input');
}
