/**
 * Konva 10 preview renderer for a strict subset of canonical Studio v1 boards.
 *
 * Deliberately never calls Stage.toJSON(): the application-owned v1 board
 * remains the only persistence/export format. Unsupported imported shapes
 * cause a fail-closed preflight, not a partial or lossy board rewrite.
 */
import Konva from 'konva';

const TYPES = new Set(['rect', 'roundRect', 'circle', 'ellipse', 'line', 'arrow', 'polyline', 'polygon', 'text']);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unsupported = reason => ({ compatible: false, reason });

function planShape(item) {
  const type = String(item?.type || '');
  if (!TYPES.has(type)) return unsupported('unsupported-element-' + type);
  if (item?.transform || item?.shadow || item?.linkTarget || item?.linkType || item?.children
    || (type !== 'text' && item?.text)
    || (Array.isArray(item?.dash) && item.dash.length)
    || (type === 'text' && (item.wrap || item.maxWidth != null || item.font
      || (item.align && item.align !== 'left')
      || (item.baseline && item.baseline !== 'alphabetic')))) {
    // Explicitly refuse previews that would silently lose labels, dashes,
    // advanced text layout, or links from canonical saved board elements.
    return unsupported('unsupported-element-metadata');
  }
  const id = String(item.id || '');
  if (!id) return unsupported('missing-element-id');
  const x = finite(item.x, 0), y = finite(item.y, 0);
  const common = {
    id,
    stroke: item.stroke || (['line', 'arrow', 'polyline'].includes(type) ? '#fff' : undefined),
    strokeWidth: finite(item.strokeWidth, type === 'arrow' ? 2 : 1),
    opacity: Math.min(1, Math.max(0, finite(item.opacity, 1))),
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
      attrs = { ...common, x, y, radius: Math.max(0, finite(item.radius)) };
      break;
    case 'ellipse':
      // Native canvas stores ellipse radii directly; width/height do not
      // describe an ellipse and must never replace its saved radiusX/radiusY.
      if (!Number.isFinite(Number(item.radiusX)) || !Number.isFinite(Number(item.radiusY))) {
        return unsupported('invalid-ellipse-radii');
      }
      kind = 'Ellipse';
      attrs = { ...common, x, y, radiusX: Math.abs(finite(item.radiusX)),
        radiusY: Math.abs(finite(item.radiusY)), rotation: finite(item.rotation) };
      break;
    case 'line':
    case 'arrow':
      kind = type === 'arrow' ? 'Arrow' : 'Line';
      attrs = { ...common, x: 0, y: 0,
        points: [finite(item.x1, x), finite(item.y1, y),
          finite(item.x2, x + finite(item.width)), finite(item.y2, y + finite(item.height))] };
      if (type === 'arrow') {
        attrs.pointerLength = finite(item.headSize, 12);
        attrs.pointerWidth = finite(item.headSize, 12);
      }
      break;
    case 'polyline':
      if (!Array.isArray(item.points) || !item.points.every(p => Array.isArray(p) && p.length >= 2)) {
        return unsupported('invalid-pen-points');
      }
      kind = 'Line';
      attrs = { ...common, x: 0, y: 0, points: item.points.flatMap(p => [finite(p[0]), finite(p[1])]),
        lineCap: item.lineCap || 'round', lineJoin: item.lineJoin || 'round' };
      break;
    case 'polygon':
      if (!Array.isArray(item.points) || item.points.length < 3
        || !item.points.every(p => Array.isArray(p) && p.length >= 2
          && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])))) {
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
  if (board.grid?.enabled) return unsupported('grid-renderer-not-parity-tested');
  if (finite(board.viewport?.rotation) !== 0) return unsupported('unsupported-viewport-rotation');
  const layers = [];
  for (const layer of board.layers) {
    if (!layer || !Array.isArray(layer.elements)) return unsupported('invalid-layer');
    const elements = [];
    for (const item of layer.elements) {
      const planned = planShape(item);
      if (!planned.compatible) return planned;
      elements.push({ kind: planned.kind, attrs: planned.attrs });
    }
    layers.push({
      id: String(layer.id || ''), name: String(layer.name || ''),
      visible: layer.visible !== false, locked: layer.locked === true,
      opacity: Math.min(1, Math.max(0, finite(layer.opacity, 1))),
      elements,
    });
  }
  return { compatible: true, reason: null, layers, viewport: {
    x: finite(board.viewport?.offsetX), y: finite(board.viewport?.offsetY),
    zoom: Math.max(0.1, Math.min(4, finite(board.viewport?.zoom, 1))),
  } };
}

export function buildKonvaNodes(layerPlan) {
  return layerPlan.elements.map(({ kind, attrs }) => new Konva[kind](attrs));
}

export function mountKonvaV1Preview({ container, board, width, height }) {
  const plan = planKonvaV1Board(board);
  if (!plan.compatible) throw new Error('Incompatible Studio v1 board: ' + plan.reason);
  if (!container) throw new TypeError('A preview container is required');
  const stage = new Konva.Stage({ container, width, height, listening: false });
  const created = [];
  try {
    for (const layerPlan of plan.layers) {
      const layer = new Konva.Layer({
        id: layerPlan.id,
        visible: layerPlan.visible,
        opacity: layerPlan.opacity,
        listening: false,
      });
      const world = new Konva.Group({
        x: plan.viewport.x, y: plan.viewport.y,
        scaleX: plan.viewport.zoom, scaleY: plan.viewport.zoom,
      });
      for (const node of buildKonvaNodes(layerPlan)) world.add(node);
      layer.add(world);
      stage.add(layer);
      created.push(layer);
    }
    stage.batchDraw();
    return { stage, destroy: () => stage.destroy() };
  } catch (error) {
    stage.destroy();
    throw error;
  }
}
