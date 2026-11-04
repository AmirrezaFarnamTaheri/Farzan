/**
 * Konva 10 board-v1 shape mapper for the interactive Studio draft.
 *
 * Deliberately never calls Stage.toJSON(): the application-owned v1 board
 * remains the only persistence/export format. Unsupported imported shapes
 * cause a fail-closed preflight, not a partial or lossy board rewrite.
 */
import Konva from 'konva';

const TYPES = new Set(['rect', 'roundRect', 'circle', 'ellipse', 'line', 'arrow', 'polyline', 'polygon', 'text']);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unsupported = reason => ({ compatible: false, reason });

/*
 * The canonical Canvas v1 format allows caller-defined element properties.
 * The interactive renderer must not ignore one of them silently: some fields
 * affect appearance, while others (links, shadows, metadata) affect exports.
 * Admit only the fields the current Konva stage maps or deliberately preserves.
 */
const COMMON_KEYS = ['id', 'type', 'x', 'y', 'stroke', 'strokeWidth', 'fill', 'opacity'];
const TYPE_KEYS = Object.freeze({
  rect: ['width', 'height'],
  roundRect: ['width', 'height', 'radius'],
  circle: ['radius'],
  ellipse: ['radiusX', 'radiusY', 'rotation'],
  line: ['x1', 'y1', 'x2', 'y2', 'width', 'height', 'lineCap', 'dash'],
  arrow: ['x1', 'y1', 'x2', 'y2', 'width', 'height', 'headSize'],
  polyline: ['points', 'lineCap', 'lineJoin', 'dash'],
  polygon: ['points'],
  // Canonical Canvas-v1 text may carry a finite wrap width; planShape
  // already maps that width to Konva.Text, so the preflight must admit it.
  text: ['text', 'fontSize', 'fontFamily', 'align', 'baseline', 'width'],
});

const CSS_NAMED_COLORS = new Set(`
aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond
blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue
cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey
darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon
darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet
deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen
fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon
lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey
lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey
lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine
mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen
mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod
palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue
purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen
seashell sienna silver skyblue slateblue slategray slategrey snow springgreen
steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow
yellowgreen transparent none
`.trim().split(/\\s+/));

function supportedStandalonePaint(value) {
  if (typeof value !== 'string') return false;
  const paint = value.trim().toLowerCase();
  if (!paint || paint !== value.toLowerCase()) return false;
  if (CSS_NAMED_COLORS.has(paint)) return true;
  if (/^#[0-9a-f]{3}(?:[0-9a-f]{1}|[0-9a-f]{3}(?:[0-9a-f]{2})?)?$/i.test(paint)) return true;
  // Numeric RGB/HSL literals have no dependency on surrounding CSS. Konva
  // cannot resolve CSS variables, URL paint servers, or inherited colors.
  if (/^rgba?\\(\\s*[\\d.%+\\-\\s,]+\\)$/i.test(paint)) return true;
  if (/^hsla?\\(\\s*[\\d.%+\\-\\s,]+(?:deg|rad|turn)?[\\d.%+\\-\\s,]*\\)$/i.test(paint)) return true;
  return false;
}

function validateMappedElement(item, type) {
  const allowed = new Set([...COMMON_KEYS, ...(TYPE_KEYS[type] || [])]);
  for (const key of Object.keys(item)) {
    if (!allowed.has(key)) return unsupported('unsupported-element-attribute-' + key);
  }
  // Konva's paints are CSS colors here, not Canvas gradients/patterns.
  if (item.fill != null && !supportedStandalonePaint(item.fill)) return unsupported('unsupported-fill');
  if (item.stroke != null && !supportedStandalonePaint(item.stroke)) return unsupported('unsupported-stroke');
  // Do not coerce malformed coordinates into a different visible shape.
  const numeric = ['x', 'y', 'x1', 'y1', 'x2', 'y2',
    'width', 'height', 'radius', 'radiusX', 'radiusY', 'rotation',
    'strokeWidth', 'opacity', 'headSize', 'fontSize'];
  for (const name of numeric) {
    // A property absent from older v1 data uses the documented default.
    // An explicitly saved null is NOT absent: Number(null) would silently
    // render it as 0 and change the imported geometry/appearance.
    if (Object.hasOwn(item, name)
      && (typeof item[name] !== 'number' || !Number.isFinite(item[name]))) {
      return unsupported('invalid-element-number-' + name);
    }
  }
  // Do not silently turn out-of-range appearance metadata into a different
  // visual. The renderer can clamp internally, but the migration preflight
  // must reject data it cannot display unchanged.
  if (Object.hasOwn(item, 'opacity') && item.opacity != null
      && (item.opacity < 0 || item.opacity > 1)) {
    return unsupported('invalid-element-opacity-range');
  }
  for (const size of ['strokeWidth', 'radius', 'radiusX', 'radiusY', 'headSize']) {
    if (item[size] != null && item[size] < 0) {
      return unsupported('invalid-element-' + size + '-range');
    }
  }
  if (type === 'text' && item.fontFamily != null
      && (typeof item.fontFamily !== 'string' || !item.fontFamily.trim())) {
    return unsupported('invalid-element-fontFamily');
  }
  for (const name of ['lineCap', 'lineJoin']) {
    if (item[name] == null) continue;
    const allowed = name === 'lineCap'
      ? ['butt', 'round', 'square']
      : ['round', 'bevel', 'miter'];
    if (typeof item[name] !== 'string' || !allowed.includes(item[name])) {
      return unsupported('invalid-element-' + name);
    }
  }
  if (item.dash != null && (!Array.isArray(item.dash) || item.dash.length > 0)) {
    return unsupported('unsupported-element-dash');
  }
  if (type === 'text') {
    for (const [name, expected] of [['align', 'left'], ['baseline', 'alphabetic']]) {
      if (item[name] != null && item[name] !== expected) {
        return unsupported('unsupported-element-' + name);
      }
    }
  }
  if (item.fontSize != null && item.fontSize <= 0) {
    return unsupported('invalid-element-fontSize-range');
  }
  if (type === 'text' && item.width != null && item.width <= 0) {
    return unsupported('invalid-element-text-width-range');
  }
  return { compatible: true };
}


function planShape(item) {
  const type = typeof item?.type === 'string' ? item.type : '';
  if (!TYPES.has(type)) return unsupported('unsupported-element-' + type);
  const mapped = validateMappedElement(item, type);
  if (!mapped.compatible) return mapped;
  if (item?.transform || item?.shadow || item?.linkTarget || item?.linkType || item?.children
    || (type !== 'text' && item?.text)
    || (Array.isArray(item?.dash) && item.dash.length)
    || (type === 'text' && (item.wrap || item.maxWidth != null || item.font
      || (item.align && item.align !== 'left')
      || (item.baseline && item.baseline !== 'alphabetic')))) {
    // Explicitly refuse documents that would silently lose labels, dashes,
    // advanced text layout, or links from canonical saved board elements.
    return unsupported('unsupported-element-metadata');
  }
  if (typeof item.id !== 'string') return unsupported('invalid-element-id');
  const id = item.id;
  if (!id.trim()) return unsupported('missing-element-id');
  if (type === 'text' && item.text != null && typeof item.text !== 'string') {
    return unsupported('invalid-element-text');
  }
  const x = finite(item.x, 0), y = finite(item.y, 0);
  const common = {
    id,
    stroke: item.stroke || (['line', 'arrow', 'polyline'].includes(type) ? '#fff' : undefined),
    strokeWidth: finite(item.strokeWidth, type === 'arrow' ? 2 : 1),
    opacity: finite(item.opacity, 1),
    fill: item.fill == null || item.fill === 'none' ? undefined : item.fill,
  };
  let kind, attrs;
  switch (type) {
    case 'rect':
    case 'roundRect': {
      const width = finite(item.width), height = finite(item.height);
      kind = 'Rect';
      attrs = { ...common, x: width < 0 ? x + width : x,
        y: height < 0 ? y + height : y, width: Math.abs(width), height: Math.abs(height) };
      if (type === 'roundRect') attrs.cornerRadius = finite(item.radius, 12);
      break;
    }
    case 'circle':
      kind = 'Circle';
      attrs = { ...common, x, y, radius: finite(item.radius) };
      break;
    case 'ellipse':
      // Native canvas stores ellipse radii directly; width/height do not
      // describe an ellipse and must never replace its saved radiusX/radiusY.
      if (!Number.isFinite(Number(item.radiusX)) || !Number.isFinite(Number(item.radiusY))) {
        return unsupported('invalid-ellipse-radii');
      }
      kind = 'Ellipse';
      attrs = { ...common, x, y, radiusX: finite(item.radiusX),
        radiusY: finite(item.radiusY), rotation: finite(item.rotation) };
      break;
    case 'line':
    case 'arrow':
      kind = type === 'arrow' ? 'Arrow' : 'Line';
      attrs = { ...common, x: 0, y: 0,
        points: [finite(item.x1, x), finite(item.y1, y),
          finite(item.x2, x + finite(item.width)), finite(item.y2, y + finite(item.height))] };
      if (type === 'line' && item.lineCap) attrs.lineCap = item.lineCap;
      if (type === 'arrow') {
        attrs.pointerLength = finite(item.headSize, 12);
        attrs.pointerWidth = finite(item.headSize, 12);
      }
      break;
    case 'polyline':
      // An imported path must satisfy the same visible, bounded geometry as
      // a newly recorded pen stroke and the canonical SVG exporter. Refuse
      // malformed data; never auto-rewrite a user's old Canvas2D board.
      if (!Array.isArray(item.points) || item.points.length < 2 || item.points.length > 4096
        || !item.points.every(p => Array.isArray(p) && p.length === 2
          && p.every(value => typeof value === 'number' && Number.isFinite(value)))
        || !item.points.some(([x, y]) => x !== item.points[0][0] || y !== item.points[0][1])) {
        return unsupported('invalid-pen-points');
      }
      kind = 'Line';
      attrs = { ...common, x: 0, y: 0, points: item.points.flatMap(p => [finite(p[0]), finite(p[1])]),
        lineCap: item.lineCap || 'round', lineJoin: item.lineJoin || 'round' };
      break;
    case 'polygon':
      if (!Array.isArray(item.points) || item.points.length < 3
        || !item.points.every(p => Array.isArray(p) && p.length === 2
          && p.every(value => typeof value === 'number' && Number.isFinite(value)))) {
        return unsupported('invalid-polygon-points');
      }
      kind = 'Line';
      attrs = { ...common, x: 0, y: 0,
        points: item.points.flatMap(p => [Number(p[0]), Number(p[1])]),
        closed: true };
      break;
    case 'text':
      kind = 'Text';
      attrs = { ...common, x, y: y - finite(item.fontSize, 18),
        text: String(item.text || ''), fontSize: finite(item.fontSize, 18),
        fontFamily: String(item.fontFamily || 'Inter'), width: item.width === undefined ? undefined : finite(item.width) };
      break;
    default: return unsupported('unsupported-element-' + type);
  }
  return { compatible: true, kind, attrs };
}

export function planKonvaV1Board(board) {
  if (!board || board.version !== 1 || !Array.isArray(board.layers)) return unsupported('invalid-v1-board');
  if (Object.hasOwn(board, 'activeLayerIdx') && (!Number.isInteger(board.activeLayerIdx)
    || board.activeLayerIdx < 0 || board.activeLayerIdx >= board.layers.length)) {
    return unsupported('invalid-active-layer');
  }
  // An explicitly saved viewport must be a record. Treating a malformed
  // null/array/string/number as an omitted viewport silently renders the
  // wrong pan and zoom when importing an existing board.
  if (Object.hasOwn(board, 'viewport')
    && (!board.viewport || typeof board.viewport !== 'object'
      || Array.isArray(board.viewport))) {
    return unsupported('invalid-viewport-record');
  }
  if (Object.hasOwn(board, 'grid')
    && (!board.grid || typeof board.grid !== 'object' || Array.isArray(board.grid))) {
    return unsupported('invalid-grid-record');
  }
  if (board.grid && Object.hasOwn(board.grid, 'enabled')
    && typeof board.grid.enabled !== 'boolean') {
    return unsupported('invalid-grid-enabled');
  }
  if (board.grid?.enabled) return unsupported('grid-renderer-not-parity-tested');
  // Do not silently coerce corrupt viewport data into a different visible
  // position or zoom. Omitted legacy fields still use the canonical defaults.
  for (const key of ['offsetX', 'offsetY', 'zoom', 'rotation']) {
    const value = board.viewport?.[key];
    // Reject explicit null in an imported viewport; only omitted fields
    // may inherit canonical offsets/zoom without changing stored geometry.
    if (board.viewport != null && Object.hasOwn(board.viewport, key)
      && (typeof value !== 'number' || !Number.isFinite(value))) {
      return unsupported('invalid-viewport-' + key);
    }
  }
  if (finite(board.viewport?.rotation) !== 0) return unsupported('unsupported-viewport-rotation');
  const zoom = board.viewport?.zoom ?? 1;
  if (zoom < 0.1 || zoom > 4) return unsupported('invalid-viewport-zoom-range');
  const layers = [];
  const seenLayers = new Set();
  const seenElements = new Set();
  for (const layer of board.layers) {
    if (!layer || !Array.isArray(layer.elements)) return unsupported('invalid-layer');
    if (typeof layer.id !== 'string') return unsupported('invalid-layer-id');
    const layerId = layer.id;
    if (!layerId.trim()) return unsupported('missing-layer-id');
    if (seenLayers.has(layerId)) return unsupported('duplicate-layer-id');
    seenLayers.add(layerId);
    if (Object.hasOwn(layer, 'name') && typeof layer.name !== 'string') {
      return unsupported('invalid-layer-name');
    }
    // The isolated Konva draft only maps opacity, visibility, lock and
    // ordinary board-v1 layer order. Appearance-altering layer metadata
    // must retain the classic Canvas2D engine rather than render a misleading
    // scene. Harmless unknown custom data stays intact in canonical v1.
    for (const key of [
      'blendMode', 'compositeOperation', 'clipPath',
      'transform', 'filters', 'shadow',
    ]) {
      if (Object.hasOwn(layer, key)) {
        return unsupported('unsupported-layer-attribute-' + key);
      }
    }
    // Nonboolean imported lock/visibility values must not turn a protected
    // layer into an editable one (or render a hidden layer). Refuse the Konva
    // stage rather than coercing or rewriting canonical Canvas-v1 data.
    for (const flag of ['visible', 'locked']) {
      if (Object.hasOwn(layer, flag) && typeof layer[flag] !== 'boolean') {
        return unsupported('invalid-layer-' + flag);
      }
    }
    if (Object.hasOwn(layer, 'opacity')
      && (typeof layer.opacity !== 'number' || !Number.isFinite(layer.opacity)
        || layer.opacity < 0 || layer.opacity > 1)) {
      return unsupported('invalid-layer-opacity-range');
    }
    const elements = [];
    for (const item of layer.elements) {
      const planned = planShape(item);
      if (!planned.compatible) return planned;
      const elementId = planned.attrs.id;
      if (seenElements.has(elementId)) return unsupported('duplicate-element-id');
      seenElements.add(elementId);
      elements.push({ kind: planned.kind, attrs: planned.attrs });
    }
    layers.push({
      id: layerId, name: String(layer.name || ''),
      visible: layer.visible !== false, locked: layer.locked === true,
      opacity: finite(layer.opacity, 1),
      elements,
    });
  }
  return { compatible: true, reason: null, layers, viewport: {
    x: finite(board.viewport?.offsetX), y: finite(board.viewport?.offsetY),
    zoom: finite(board.viewport?.zoom, 1),
  } };
}

export function buildKonvaNodes(layerPlan) {
  return layerPlan.elements.map(({ kind, attrs }) => new Konva[kind](attrs));
}
