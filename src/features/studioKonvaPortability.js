/**
 * Portable canonical-v1 JSON for the separate Konva editing draft.
 * Never export Konva Stage JSON or convert unsupported legacy board features.
 */
import { planKonvaV1Board } from './studioKonvaAdapter.js';

export const MAX_KONVA_DRAFT_JSON_CHARS = 8 * 1024 * 1024;

function assertSize(text, maxChars) {
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new RangeError('Invalid Studio draft size limit');
  if (text.length > maxChars) throw new RangeError('Studio draft JSON exceeds the size limit');
}

function assertJsonValue(value, visited = new Set(), depth = 0) {
  if (depth > 64) throw new RangeError('Studio draft JSON nesting is unsupported');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object') throw new TypeError('Unsupported non-JSON Studio draft metadata');
  if (visited.has(value)) throw new TypeError('Unsupported cyclic Studio draft metadata');
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) {
    throw new TypeError('Unsupported non-JSON Studio draft object');
  }
  visited.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) {
      throw new TypeError('Unsupported Studio draft metadata key');
    }
    assertJsonValue(child, visited, depth + 1);
  }
  visited.delete(value);
}

function assertCanonicalBoard(board) {
  assertJsonValue(board);
  const gate = planKonvaV1Board(board);
  if (!gate.compatible) throw new TypeError('Incompatible Studio v1 draft: ' + gate.reason);
  return board;
}

/** Return readable portable JSON with exact canonical-v1 data, never renderer state. */
export function exportKonvaV1DraftJSON(board, { maxChars = MAX_KONVA_DRAFT_JSON_CHARS } = {}) {
  assertCanonicalBoard(board);
  const json = JSON.stringify(board, null, 2);
  if (typeof json !== 'string') throw new TypeError('Studio draft could not be serialized');
  assertSize(json, maxChars);
  return json;
}

/** Parse/validate without mutating the current board or writing storage. */
export function importKonvaV1DraftJSON(text, { maxChars = MAX_KONVA_DRAFT_JSON_CHARS } = {}) {
  if (typeof text !== 'string') throw new TypeError('Studio draft JSON must be text');
  assertSize(text, maxChars);
  const board = JSON.parse(text);
  assertCanonicalBoard(board);
  return board;
}
