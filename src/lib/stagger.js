/**
 * Stagger — grid-aware, center/first/last/random origin from Anime.js.
 * Usage: stagger(100, { from: 'center', easing: 'easeOutQuad' })(index, total)
 */

import { parseEasing } from './easing.js';

/**
 * Create a stagger function that returns staggered values per index.
 * @param {number|[number,number]} value — single value or [min, max]
 * @param {{ start?: number, from?: string|number, grid?: [number,number], axis?: string, easing?: string|Function }} [config]
 * @returns {function(number, number): number}
 */
export function stagger(value, config = {}) {
  const { start = 0, from = 'first', grid, axis = 'x', easing } = config;
  const easingFn = easing ? parseEasing(easing) : null;
  const isRange = Array.isArray(value);
  const min = isRange ? value[0] : 0;
  const max = isRange ? value[1] : value;

  let randomOrigin = null;

  return function getStaggeredValue(index, total) {
    let fromIndex;
    if (typeof from === 'number') {
      fromIndex = from;
    } else {
      switch (from) {
        case 'first': fromIndex = 0; break;
        case 'center': fromIndex = (total - 1) / 2; break;
        case 'last': fromIndex = total - 1; break;
        case 'random':
          // Roll one origin for the whole set so values radiate from a
          // single random element instead of per-element noise.
          if (randomOrigin === null || randomOrigin >= total) {
            randomOrigin = Math.floor(Math.random() * total);
          }
          fromIndex = randomOrigin;
          break;
        default: fromIndex = 0;
      }
    }

    let distance;
    if (grid) {
      const [rows, cols] = grid;
      if (rows <= 0 || cols <= 0) {
        distance = 0;
      } else {
        const fromRow = Math.floor(fromIndex / cols);
        const fromCol = fromIndex % cols;
        const toRow = Math.floor(index / cols);
        const toCol = index % cols;
        if (axis === 'x') {
          distance = Math.abs(toCol - fromCol);
        } else if (axis === 'y') {
          distance = Math.abs(toRow - fromRow);
        } else {
          distance = Math.sqrt((toCol - fromCol) ** 2 + (toRow - fromRow) ** 2);
        }
      }
    } else {
      distance = Math.abs(index - fromIndex);
    }

    const maxDist = grid
      ? (grid[0] <= 0 || grid[1] <= 0) ? 0
        : (axis === 'x' ? (grid[1] - 1) : axis === 'y' ? (grid[0] - 1) : Math.sqrt((grid[1] - 1) ** 2 + (grid[0] - 1) ** 2))
      : Math.max(fromIndex, total - 1 - fromIndex);

    const ratio = maxDist > 0 ? distance / maxDist : 0;
    const easedRatio = easingFn ? easingFn(ratio) : ratio;
    return start + min + (max - min) * easedRatio;
  };
}
