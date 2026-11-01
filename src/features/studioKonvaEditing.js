/**
 * Lossless board-v1 movement commands for the future Konva editor.
 *
 * This never persists Konva JSON or bypasses the strict legacy preflight.
 * Caller retains responsibility for acknowledging a durable board write.
 */
import { planKonvaV1Board } from './studioKonvaAdapter.js';

function validBoard(board) {
  const result = planKonvaV1Board(board);
  if (!result.compatible) throw new TypeError('Incompatible Studio v1 board: ' + result.reason);
}

function findUnlockedElement(board, id) {
  for (const layer of board.layers) {
    const index = layer.elements.findIndex(item => item.id === id);
    if (index < 0) continue;
    if (layer.visible === false || layer.locked === true) {
      throw new Error('Cannot edit a locked or hidden Studio layer');
    }
    return { layer, index };
  }
  throw new Error('Studio element not found: ' + id);
}

function addFinite(object, key, delta) {
  const before = object[key] ?? 0;
  if (typeof before !== 'number') throw new TypeError('Invalid Studio coordinate: ' + key);
  const next = before + delta;
  if (!Number.isFinite(next)) throw new RangeError('Studio coordinate overflow: ' + key);
  object[key] = next;
}

function translateLineAxis(item, initial, final, baseline, delta) {
  const startExplicit = Object.hasOwn(item, initial);
  const endExplicit = Object.hasOwn(item, final);
  if (startExplicit) addFinite(item, initial, delta);
  if (endExplicit) addFinite(item, final, delta);
  // Legacy lines can mix explicit endpoints and x/y + width/height
  // fallbacks. Move that origin alongside the explicit endpoint(s).
  if (!startExplicit || !endExplicit) addFinite(item, baseline, delta);
}

/** Return a new complete canonical board with only one shape translated. */
export function translateKonvaV1Element(board, id, dx, dy) {
  if (typeof dx !== 'number' || !Number.isFinite(dx)
      || typeof dy !== 'number' || !Number.isFinite(dy)) {
    throw new TypeError('Konva movement delta must be finite numbers');
  }
  validBoard(board);
  findUnlockedElement(board, id);
  const next = structuredClone(board);
  const { layer, index } = findUnlockedElement(next, id);
  const item = layer.elements[index];
  switch (item.type) {
    case 'rect':
    case 'roundRect':
    case 'circle':
    case 'ellipse':
    case 'text':
      addFinite(item, 'x', dx);
      addFinite(item, 'y', dy);
      break;
    case 'line':
    case 'arrow':
      translateLineAxis(item, 'x1', 'x2', 'x', dx);
      translateLineAxis(item, 'y1', 'y2', 'y', dy);
      break;
    case 'polyline':
    case 'polygon':
      item.points = item.points.map(([x, y]) => {
        const point = { x, y };
        addFinite(point, 'x', dx);
        addFinite(point, 'y', dy);
        return [point.x, point.y];
      });
      break;
    default:
      throw new TypeError('Unsupported Studio element for Konva editing');
  }
  // Recheck the *output*, not only the original: overflow and unsupported
  // transforms must fail before a caller persists anything.
  validBoard(next);
  return next;
}

/**
 * Convert positive-size Konva Rect display bounds into canonical Studio v1
 * geometry. Legacy negative width/height are orientation metadata: preserve
 * their sign while keeping the exact same displayed bounding rectangle.
 *
 * Bounds use the node's *local* scene coordinates; the parent Konva group
 * owns viewport pan/zoom. Flips, rotation and unsupported elements must be
 * rejected rather than rewriting saved v1 boards to a lossy approximation.
 */
export function resizeKonvaV1Element(board, id, bounds) {
  if (!bounds || typeof bounds !== 'object'
    || !['x', 'y', 'width', 'height'].every(key =>
      typeof bounds[key] === 'number' && Number.isFinite(bounds[key]))) {
    throw new TypeError('Konva resize bounds must contain finite numeric x/y/width/height');
  }
  if (bounds.width <= 0 || bounds.height <= 0) {
    throw new RangeError('Konva resize dimensions must be positive (flips are unsupported)');
  }
  validBoard(board);
  const next = structuredClone(board);
  const { layer, index } = findUnlockedElement(next, id);
  const item = layer.elements[index];
  if (item.type === 'circle') {
    // Circle geometry is a center and a radius in board-v1. A nonuniform
    // Konva Transformer must not be flattened into a different saved shape.
    if (Math.abs(bounds.width - bounds.height) >
      Math.max(1e-7, Math.max(bounds.width, bounds.height) * 1e-7)) {
      throw new RangeError('Konva circle resize requires uniform width and height');
    }
    const radius = bounds.width / 2;
    const x = bounds.x + radius, y = bounds.y + radius;
    if (![x, y, radius].every(Number.isFinite) || radius <= 0) {
      throw new RangeError('Konva circle resize produced invalid geometry');
    }
    item.x = x;
    item.y = y;
    item.radius = radius;
    validBoard(next);
    return next;
  }
  if (item.type !== 'rect' && item.type !== 'roundRect') {
    throw new TypeError('Unsupported Studio element for Konva resizing: ' + item.type);
  }
  const x = item.width < 0 ? bounds.x + bounds.width : bounds.x;
  const y = item.height < 0 ? bounds.y + bounds.height : bounds.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new RangeError('Konva resized geometry overflow');
  }
  item.x = x;
  item.y = y;
  item.width = item.width < 0 ? -bounds.width : bounds.width;
  item.height = item.height < 0 ? -bounds.height : bounds.height;
  validBoard(next);
  return next;
}

/**
 * Change z-order by one slot within the *same* unlocked, visible layer.
 * The array order is the canonical Canvas-v1 painter order; Konva scene
 * nodes are never the storage format. Protected layers and missing IDs
 * reject before even cloning the board. Other elements stay byte-equivalent.
 */
export function reorderKonvaV1Element(board, id, direction) {
  if (direction !== 'forward' && direction !== 'backward') {
    throw new TypeError('Unsupported Konva stacking direction');
  }
  validBoard(board);
  const { layer, index } = findUnlockedElement(board, id);
  const nextIndex = index + (direction === 'forward' ? 1 : -1);
  if (nextIndex < 0 || nextIndex >= layer.elements.length) return structuredClone(board);
  const next = structuredClone(board);
  const target = findUnlockedElement(next, id);
  const elements = target.layer.elements;
  [elements[index], elements[nextIndex]] = [elements[nextIndex], elements[index]];
  validBoard(next);
  return next;
}

/**
 * Edit the literal Unicode content of one supported text shape in a complete
 * canonical Studio-v1 document. Preserve its geometry, paint, font, layer,
 * viewport and application metadata. Konva never owns the stored HTML/JSON.
 */
export function setKonvaV1Text(board, id, content) {
  if (typeof content !== 'string' || content.length > 32768) {
    throw new TypeError('Studio text content must be a string no longer than 32768 code units');
  }
  validBoard(board);
  const target = findUnlockedElement(board, id);
  if (target.layer.elements[target.index].type !== 'text') {
    throw new TypeError('Unsupported Studio element for Konva text editing');
  }
  const next = structuredClone(board);
  const { layer, index } = findUnlockedElement(next, id);
  layer.elements[index].text = content;
  validBoard(next);
  return next;
}

/**
 * Create exactly one legacy Studio-v1 pen stroke. The application board
 * remains canonical: never store Konva node or Stage JSON. A stroke is
 * validated completely before a caller is allowed to write it.
 */
export function appendKonvaV1Stroke(board, id, points) {
  validBoard(board);
  if (typeof id !== 'string' || !id.trim()) {
    throw new TypeError('Studio stroke ID is required');
  }
  if (board.layers.some(layer => layer.elements.some(item => item.id === id))) {
    throw new Error('Duplicate Studio stroke ID: ' + id);
  }
  if (!Array.isArray(points) || points.length < 2 || points.length > 4096
    || !points.every(point => Array.isArray(point) && point.length === 2
      && point.every(value => typeof value === 'number' && Number.isFinite(value)))) {
    throw new TypeError('Studio pen path requires 2–4096 finite x/y pairs');
  }
  if (!points.some(([x, y]) => x !== points[0][0] || y !== points[0][1])) {
    throw new RangeError('Studio pen path has no visible length');
  }
  const index = board.activeLayerIdx ?? 0;
  if (!Number.isInteger(index) || index < 0 || index >= board.layers.length) {
    throw new RangeError('Studio active drawing layer is invalid');
  }
  const layer = board.layers[index];
  if (layer.locked === true) throw new Error('Cannot draw on a locked Studio layer');
  if (layer.visible === false) throw new Error('Cannot draw on a hidden Studio layer');

  const style = board.style || {};
  const width = style.strokeWidth ?? 2;
  if (typeof width !== 'number' || !Number.isFinite(width) || width < 1) {
    throw new TypeError('Studio pen strokeWidth must be a finite positive number');
  }
  const stroke = style.strokeColor ?? '#6366f1';
  if (typeof stroke !== 'string' || !stroke.trim()) {
    throw new TypeError('Studio pen stroke color must be a nonempty string');
  }
  const lineCap = style.lineCap ?? 'round';
  const lineJoin = style.lineJoin ?? 'round';
  if (!['round', 'butt', 'square'].includes(lineCap)
    || !['round', 'bevel', 'miter'].includes(lineJoin)) {
    throw new TypeError('Studio pen line cap/join is unsupported');
  }

  const next = structuredClone(board);
  next.layers[index].elements.push({
    id, type: 'polyline',
    points: structuredClone(points),
    stroke, strokeWidth: width, fill: null, lineCap, lineJoin,
  });
  validBoard(next);
  return next;
}

/**
 * Wires real Konva click/tap/drag lifecycle events to canonical board writes.
 * A rejected commit restores the node and preserves the last accepted board.
 * No editing route is switched to this controller until interaction parity.
 */
export function createKonvaV1MoveSession({
  board, onChange, onSelect = () => {}, historyLimit = 100,
} = {}) {
  validBoard(board);
  if (typeof onChange !== 'function') {
    throw new TypeError('A confirmed canonical board writer is required');
  }
  if (typeof onSelect !== 'function') throw new TypeError('onSelect must be a function');
  const limit = Number.isInteger(historyLimit) && historyLimit > 0
    ? Math.min(historyLimit, 500) : 100;
  let current = structuredClone(board);
  let tail = Promise.resolve();
  let last = Promise.resolve();
  const undoStack = [];
  const redoStack = [];

  const push = (stack, snapshot) => {
    stack.push(structuredClone(snapshot));
    if (stack.length > limit) stack.shift();
  };
  const enqueue = action => {
    const operation = tail.then(action);
    // A rejected canonical write must not poison later independent actions.
    tail = operation.then(() => {}, () => {});
    last = operation;
    return operation;
  };
  const persist = async next => {
    const receipt = await onChange(structuredClone(next));
    // Require an affirmative durable-commit receipt. A missing return is not
    // proof that a canonical database write succeeded.
    if (receipt !== true) throw new Error('Studio board write was not acknowledged');
  };
  const commit = (id, dx, dy) => enqueue(async () => {
    if (dx === 0 && dy === 0) return structuredClone(current);
    const next = translateKonvaV1Element(current, id, dx, dy);
    await persist(next);
    push(undoStack, current);
    redoStack.length = 0;
    current = next;
    return structuredClone(current);
  });

  const reorder = (id, direction) => enqueue(async () => {
    const next = reorderKonvaV1Element(current, id, direction);
    const { layer, index } = findUnlockedElement(current, id);
    if ((direction === 'backward' && index === 0)
      || (direction === 'forward' && index === layer.elements.length - 1)) {
      return structuredClone(current);
    }
    await persist(next);
    push(undoStack, current);
    redoStack.length = 0;
    current = next;
    return structuredClone(current);
  });

  const updateText = (id, content) => enqueue(async () => {
    const next = setKonvaV1Text(current, id, content);
    const before = findUnlockedElement(current, id);
    if (before.layer.elements[before.index].text === content) {
      return structuredClone(current);
    }
    await persist(next);
    push(undoStack, current);
    redoStack.length = 0;
    current = next;
    return structuredClone(current);
  });

  let strokeSequence = 0;
  const addStroke = points => enqueue(async () => {
    const uuid = globalThis.crypto?.randomUUID?.();
    const id = 'path-' + (uuid || Date.now().toString(36) + '-' + (++strokeSequence).toString(36));
    const next = appendKonvaV1Stroke(current, id, points);
    await persist(next);
    push(undoStack, current);
    redoStack.length = 0;
    current = next;
    return structuredClone(current);
  });

  const resize = (id, bounds) => enqueue(async () => {
    const next = resizeKonvaV1Element(current, id, bounds);
    const before = findUnlockedElement(current, id);
    const after = findUnlockedElement(next, id);
    const oldShape = before.layer.elements[before.index];
    const newShape = after.layer.elements[after.index];
    // A stationary Transformer must not create a fake edit or storage write.
    if (['x', 'y', 'width', 'height', 'radius'].every(key => oldShape[key] === newShape[key])) {
      return structuredClone(current);
    }
    await persist(next);
    push(undoStack, current);
    redoStack.length = 0;
    current = next;
    return structuredClone(current);
  });

  // Undo/redo replay whole canonical board snapshots, never Konva's own JSON.
  // The route must redraw nodes from the returned document after replay; this
  // data-only controller must not mutate a live scene before a durable write.
  const undo = () => enqueue(async () => {
    if (!undoStack.length) return false;
    const next = structuredClone(undoStack[undoStack.length - 1]);
    await persist(next);
    undoStack.pop();
    push(redoStack, current);
    current = next;
    return structuredClone(current);
  });
  const redo = () => enqueue(async () => {
    if (!redoStack.length) return false;
    const next = structuredClone(redoStack[redoStack.length - 1]);
    await persist(next);
    redoStack.pop();
    push(undoStack, current);
    current = next;
    return structuredClone(current);
  });

  function bind(node, id) {
    if (!node || typeof node.on !== 'function' || typeof node.off !== 'function') {
      throw new TypeError('A Konva shape node is required');
    }
    const target = findUnlockedElement(current, id);
    let origin = { x: node.x(), y: node.y() };
    node.draggable(true);
    node.on('click.farzanEdit tap.farzanEdit', () => onSelect(id));
    node.on('dragstart.farzanEdit', () => {
      origin = { x: node.x(), y: node.y() };
    });
    node.on('dragend.farzanEdit', () => {
      const dx = node.x() - origin.x;
      const dy = node.y() - origin.y;
      last = commit(id, dx, dy).catch(error => {
        node.position(origin);
        node.getLayer()?.batchDraw();
        throw error;
      });
      // Event sources do not await handlers. Keep flush() rejection visible
      // to callers without emitting an unhandled Promise rejection.
      last.catch(() => {});
    });

    // Transform only geometries that board-v1 can represent losslessly:
    // signed rectangles and uniformly scaled circles. Never store Konva JSON.
    const shapeType = target.layer.elements[target.index].type;
    const isCircle = shapeType === 'circle' && node.getClassName?.() === 'Circle';
    const canResize = (['rect', 'roundRect'].includes(shapeType)
      && node.getClassName?.() === 'Rect') || isCircle;
    if (canResize) {
      let transformOrigin = null;
      const snapshotNode = () => ({
        x: node.x(), y: node.y(),
        ...(isCircle ? { radius: node.radius() } : { width: node.width(), height: node.height() }),
        scaleX: node.scaleX(), scaleY: node.scaleY(), rotation: node.rotation(),
      });
      const applyNode = attrs => {
        node.setAttrs(attrs);
        node.getLayer()?.batchDraw();
      };
      node.on('transformstart.farzanEdit', () => {
        transformOrigin = snapshotNode();
      });
      node.on('transformend.farzanEdit', () => {
        const before = transformOrigin;
        transformOrigin = null;
        if (!before) return;
        let bounds;
        try {
          const scaleX = node.scaleX(), scaleY = node.scaleY();
          if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)
            || scaleX <= 0 || scaleY <= 0) {
            throw new RangeError('Konva transform requires positive finite scales; flips are unsupported');
          }
          if (node.rotation() !== 0 || before.rotation !== 0) {
            throw new RangeError('Konva transform rotation is unsupported by canonical v1 resize');
          }
          const width = node.width() * scaleX, height = node.height() * scaleY;
          bounds = isCircle
            ? { x: node.x() - width / 2, y: node.y() - height / 2, width, height }
            : { x: node.x(), y: node.y(), width, height };
          // This synchronous validation also guards against infinity from
          // multiplying finite dimensions and scales.
          if (!Object.values(bounds).every(Number.isFinite)
            || bounds.width <= 0 || bounds.height <= 0) {
            throw new RangeError('Konva transform produced invalid resize bounds');
          }
        } catch (error) {
          applyNode(before);
          last = Promise.reject(error);
          last.catch(() => {});
          return;
        }
        last = resize(id, bounds).then(result => {
          // Clear transient scaling only after board-v1 persistence confirms
          // the edit. Circle positions are centers, unlike rectangle corners.
          applyNode(isCircle
            ? {
              x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2,
              radius: bounds.width / 2, scaleX: 1, scaleY: 1,
            }
            : { ...bounds, scaleX: 1, scaleY: 1 });
          return result;
        }).catch(error => {
          applyNode(before);
          throw error;
        });
        last.catch(() => {});
      });
    }
    return () => {
      node.off('.farzanEdit');
      node.draggable(false);
    };
  }

  return {
    bind,
    commit,
    reorder,
    resize,
    addStroke,
    updateText,
    undo,
    redo,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    flush: () => last,
    getBoard: () => structuredClone(current),
  };
}
