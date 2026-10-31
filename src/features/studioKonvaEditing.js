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
    findUnlockedElement(current, id);
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
    return () => {
      node.off('.farzanEdit');
      node.draggable(false);
    };
  }

  return {
    bind,
    commit,
    undo,
    redo,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    flush: () => last,
    getBoard: () => structuredClone(current),
  };
}
