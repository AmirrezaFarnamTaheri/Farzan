/**
 * Collection Utilities — ported from Ripl packages/utilities/src/collection.ts.
 * Complete implementations, not stubs.
 */

/**
 * Left/inner/right join of two arrays using Map for O(n+m) performance.
 * @template L, R
 * @param {L[]} left
 * @param {R[]} right
 * @param {string|function(L):string} key — property name or key function for left
 * @param {'left'|'inner'|'right'} [type='left']
 * @returns {Array<{left:L|null, right:R|null}>}
 */
export function arrayJoin(left, right, key, type = 'left') {
  const keyFn = typeof key === 'function' ? key : (item) => item?.[key];
  const rightMap = new Map();
  for (const r of right) {
    const k = keyFn(r);
    if (!rightMap.has(k)) rightMap.set(k, []);
    rightMap.get(k).push(r);
  }

  const result = [];
  const matchedRightKeys = new Set();

  if (type === 'left' || type === 'inner') {
    for (const l of left) {
      const k = keyFn(l);
      const matches = rightMap.get(k);
      if (matches && matches.length > 0) {
        matchedRightKeys.add(k);
        for (const r of matches) {
          result.push({ left: l, right: r });
        }
      } else if (type === 'left') {
        result.push({ left: l, right: null });
      }
    }
  }

  if (type === 'right') {
    const leftMap = new Map();
    for (const l of left) {
      const k = keyFn(l);
      if (!leftMap.has(k)) leftMap.set(k, []);
      leftMap.get(k).push(l);
    }
    for (const r of right) {
      const k = keyFn(r);
      const matches = leftMap.get(k);
      if (matches && matches.length > 0) {
        for (const l of matches) {
          result.push({ left: l, right: r });
        }
      } else {
        result.push({ left: null, right: r });
      }
    }
  }

  return result;
}

/**
 * Group array elements by key.
 * @template T
 * @param {T[]} arr
 * @param {function(T):string} keyFn
 * @returns {Map<string, T[]>}
 */
export function arrayGroup(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

/**
 * Array intersection (items in both a and b).
 * @template T
 * @param {T[]} a
 * @param {T[]} b
 * @param {function(T):string} [keyFn]
 * @returns {T[]}
 */
export function arrayIntersection(a, b, keyFn) {
  if (keyFn) {
    const bKeys = new Set(b.map(keyFn));
    return a.filter((item) => bKeys.has(keyFn(item)));
  }
  const bSet = new Set(b);
  return a.filter((item) => bSet.has(item));
}

/**
 * Array difference (items in a but not in b).
 * @template T
 * @param {T[]} a
 * @param {T[]} b
 * @param {function(T):string} [keyFn]
 * @returns {T[]}
 */
export function arrayDifference(a, b, keyFn) {
  if (keyFn) {
    const bKeys = new Set(b.map(keyFn));
    return a.filter((item) => !bKeys.has(keyFn(item)));
  }
  const bSet = new Set(b);
  return a.filter((item) => !bSet.has(item));
}

/**
 * Deduplicate array.
 * @template T
 * @param {T[]} arr
 * @param {function(T):string} [keyFn]
 * @returns {T[]}
 */
export function arrayDedupe(arr, keyFn) {
  if (keyFn) {
    const seen = new Set();
    return arr.filter((item) => {
      const k = keyFn(item);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  return [...new Set(arr)];
}

/**
 * Map a range [start, end) to an array.
 * @template T
 * @param {number} start
 * @param {number} end
 * @param {function(number): T} fn
 * @returns {T[]}
 */
export function arrayMapRange(start, end, fn) {
  const result = [];
  for (let i = start; i < end; i++) {
    result.push(fn(i));
  }
  return result;
}

/**
 * Map object values.
 * @template V, R
 * @param {Object<string, V>} obj
 * @param {function(V, string): R} fn
 * @returns {Object<string, R>}
 */
export function objectMap(obj, fn) {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = fn(v, k);
  }
  return result;
}

/**
 * Reduce object entries.
 * @template V, A
 * @param {Object<string, V>} obj
 * @param {function(A, V, string): A} fn
 * @param {A} initial
 * @returns {A}
 */
export function objectReduce(obj, fn, initial) {
  let acc = initial;
  for (const [k, v] of Object.entries(obj)) {
    acc = fn(acc, v, k);
  }
  return acc;
}

/**
 * Iterate object entries.
 * @template V
 * @param {Object<string, V>} obj
 * @param {function(V, string): void} fn
 */
export function objectForEach(obj, fn) {
  for (const [k, v] of Object.entries(obj)) {
    fn(v, k);
  }
}

/**
 * Map a Set.
 * @template T, R
 * @param {Set<T>} set
 * @param {function(T): R} fn
 * @returns {Set<R>}
 */
export function setMap(set, fn) {
  const result = new Set();
  for (const item of set) {
    result.add(fn(item));
  }
  return result;
}

/**
 * Filter a Set.
 * @template T
 * @param {Set<T>} set
 * @param {function(T): boolean} fn
 * @returns {Set<T>}
 */
export function setFilter(set, fn) {
  const result = new Set();
  for (const item of set) {
    if (fn(item)) result.add(item);
  }
  return result;
}

/**
 * Find in a Set.
 * @template T
 * @param {Set<T>} set
 * @param {function(T): boolean} fn
 * @returns {T|undefined}
 */
export function setFind(set, fn) {
  for (const item of set) {
    if (fn(item)) return item;
  }
  return undefined;
}

/**
 * FlatMap a Set.
 * @template T, R
 * @param {Set<T>} set
 * @param {function(T): Iterable<R>} fn
 * @returns {Set<R>}
 */
export function setFlatMap(set, fn) {
  const result = new Set();
  for (const item of set) {
    for (const mapped of fn(item)) {
      result.add(mapped);
    }
  }
  return result;
}
