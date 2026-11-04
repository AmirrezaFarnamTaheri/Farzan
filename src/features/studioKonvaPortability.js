/**
 * Portable canonical-v1 JSON for the separate Konva editing draft.
 * Never export Konva Stage JSON or convert unsupported legacy board features.
 */
import { planKonvaV1Board } from './studioKonvaAdapter.js';
import { isStandalonePaint } from './studioStandalonePaint.js';

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

/**
 * SVG is a *viewport preview*, never canonical Studio storage. All shapes
 * originate from the same fail-closed board-v1 mapping used by the live Konva
 * draft scene; no renderer-specific JSON or remote SVG assets are emitted.
 *
 * Text with a finite wrap width is intentionally refused: plain SVG text
 * does not reproduce Konva's wrapping, so exporting it would lie about the
 * user's saved layout.
 */
const xml = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[char]);
const safeNumber = value => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('Invalid SVG geometry');
  }
  return String(Object.is(value, -0) ? 0 : value);
};
function safeSvgPaint(value, fallback = 'none') {
  if (value == null || value === '') return fallback;
  // Konva rendering and standalone SVG export must accept exactly the same
  // self-contained CSS colors; unknown syntax cannot be reconstructed safely.
  if (!isStandalonePaint(value)) {
    throw new TypeError('Unsupported SVG paint/color without a standalone context');
  }
  return xml(value);
}
function svgAttributes(attrs) {
  return ' data-board-id="' + xml(attrs.id) + '"'
    + ' opacity="' + safeNumber(attrs.opacity ?? 1) + '"'
    + ' fill="' + safeSvgPaint(attrs.fill) + '"'
    + ' stroke="' + safeSvgPaint(attrs.stroke) + '"'
    + ' stroke-width="' + safeNumber(attrs.strokeWidth ?? 1) + '"';
}
function svgLinePoints(points) {
  if (!Array.isArray(points) || points.length < 4 || points.length % 2 !== 0) {
    throw new TypeError('Invalid SVG line points');
  }
  return points.map(safeNumber);
}
function mappedSvgShape({ kind, attrs }) {
  const common = svgAttributes(attrs);
  switch (kind) {
    case 'Rect':
      return '<rect x="' + safeNumber(attrs.x) + '" y="' + safeNumber(attrs.y)
        + '" width="' + safeNumber(attrs.width) + '" height="' + safeNumber(attrs.height)
        + '"' + (attrs.cornerRadius != null ? ' rx="' + safeNumber(attrs.cornerRadius) + '"' : '')
        + common + '/>';
    case 'Circle':
      return '<circle cx="' + safeNumber(attrs.x) + '" cy="' + safeNumber(attrs.y)
        + '" r="' + safeNumber(attrs.radius) + '"' + common + '/>';
    case 'Ellipse':
      return '<ellipse cx="' + safeNumber(attrs.x) + '" cy="' + safeNumber(attrs.y)
        + '" rx="' + safeNumber(attrs.radiusX) + '" ry="' + safeNumber(attrs.radiusY)
        + '" transform="rotate(' + [attrs.rotation ?? 0, attrs.x, attrs.y].map(safeNumber).join(' ')
        + ')"' + common + '/>';
    case 'Line': {
      const values = svgLinePoints(attrs.points);
      const pairs = [];
      for (let i = 0; i < values.length; i += 2) pairs.push(values[i] + ',' + values[i + 1]);
      const name = attrs.closed ? 'polygon' : 'polyline';
      const cap = attrs.lineCap ? ' stroke-linecap="' + xml(attrs.lineCap) + '"' : '';
      const join = attrs.lineJoin ? ' stroke-linejoin="' + xml(attrs.lineJoin) + '"' : '';
      return '<' + name + ' points="' + pairs.join(' ') + '"' + common + cap + join + '/>';
    }
    case 'Arrow': {
      const points = svgLinePoints(attrs.points);
      if (points.length !== 4) throw new TypeError('Unsupported SVG arrow geometry');
      const [x1, y1, x2, y2] = points.map(Number);
      const magnitude = Math.hypot(x2 - x1, y2 - y1);
      const length = attrs.pointerLength ?? 12;
      const width = attrs.pointerWidth ?? 12;
      const line = '<line x1="' + safeNumber(x1) + '" y1="' + safeNumber(y1)
        + '" x2="' + safeNumber(x2) + '" y2="' + safeNumber(y2) + '"' + common + '/>';
      if (!magnitude || length === 0 || width === 0) return '<g>' + line + '</g>';
      const ux = (x2 - x1) / magnitude, uy = (y2 - y1) / magnitude;
      const bx = x2 - ux * length, by = y2 - uy * length;
      const corners = [
        [x2, y2], [bx - uy * width / 2, by + ux * width / 2],
        [bx + uy * width / 2, by - ux * width / 2],
      ].map(point => point.map(safeNumber).join(',')).join(' ');
      // Konva Arrow uses the stroke color for its head, not a remote asset.
      const headPaint = safeSvgPaint(attrs.stroke, 'none');
      return '<g>' + line + '<polygon points="' + corners
        + '" fill="' + headPaint + '" stroke="' + headPaint
        + '" stroke-width="' + safeNumber(attrs.strokeWidth ?? 1) + '"/></g>';
    }
    case 'Text': {
      if (attrs.width != null || /[\r\n]/.test(attrs.text)) {
        throw new TypeError('Unsupported wrapped or multiline SVG text preview');
      }
      const baselineY = attrs.y + attrs.fontSize;
      return '<text x="' + safeNumber(attrs.x) + '" y="' + safeNumber(baselineY)
        + '" font-size="' + safeNumber(attrs.fontSize) + '" font-family="'
        + xml(attrs.fontFamily) + '" xml:space="preserve"' + common + '>'
        + xml(attrs.text) + '</text>';
    }
    default: throw new TypeError('Unsupported SVG shape ' + kind);
  }
}

/** Bounded vector image of the current visible, compatible Konva viewport. */
export function exportKonvaV1DraftSVG(board, {
  width = 800, height = 600, maxChars = MAX_KONVA_DRAFT_JSON_CHARS,
} = {}) {
  assertCanonicalBoard(board);
  if (!Number.isInteger(width) || width < 1 || width > 16384
    || !Number.isInteger(height) || height < 1 || height > 16384) {
    throw new RangeError('Invalid SVG viewport dimensions');
  }
  const plan = planKonvaV1Board(board);
  const output = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + width
    + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">'];
  for (const layer of plan.layers) {
    if (!layer.visible) continue;
    output.push('<g data-board-layer="' + xml(layer.id) + '" opacity="'
      + safeNumber(layer.opacity) + '" transform="translate(' + safeNumber(plan.viewport.x)
      + ' ' + safeNumber(plan.viewport.y) + ') scale('
      + safeNumber(plan.viewport.zoom) + ')">');
    for (const shape of layer.elements) output.push(mappedSvgShape(shape));
    output.push('</g>');
  }
  output.push('</svg>');
  const svg = output.join('');
  assertSize(svg, maxChars);
  return svg;
}
