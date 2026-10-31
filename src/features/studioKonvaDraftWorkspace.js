/**
 * Explicitly opt-in Konva editing laboratory for a separate canonical-v1
 * draft. This module is lazy-loaded only after the Studio user opts in.
 *
 * This is NOT the main whiteboard renderer or a board migration: writes must
 * target the dedicated draft key, and never the live ocd_studio_board key.
 */
import Konva from 'konva';
import { planKonvaV1Board, buildKonvaNodes } from './studioKonvaAdapter.js';
import { createKonvaV1MoveSession } from './studioKonvaEditing.js';

export const DRAFT_KEY = 'ocd_studio_konva_draft';

export function isKonvaDraftCompatible(board) {
  return planKonvaV1Board(board).compatible;
}

function sceneSize(container) {
  return {
    width: Math.max(320, Math.floor(container.clientWidth || 640)),
    height: Math.max(280, Math.floor(container.clientHeight || 440)),
  };
}

/** Real Konva stage; injected scene factories in unit tests exercise state IO. */
function mountDraftScene({ container, board, bind, onSelect, onGesture }) {
  const plan = planKonvaV1Board(board);
  if (!plan.compatible) throw new Error('Incompatible Studio v1 board: ' + plan.reason);

  const stage = new Konva.Stage({
    container, ...sceneSize(container), listening: true,
  });
  const map = new Map();
  const transformers = [];
  const releases = [];
  try {
    for (const layerPlan of plan.layers) {
      const editable = layerPlan.visible && !layerPlan.locked;
      const layer = new Konva.Layer({
        id: layerPlan.id,
        visible: layerPlan.visible,
        opacity: layerPlan.opacity,
        listening: editable,
      });
      const world = new Konva.Group({
        x: plan.viewport.x, y: plan.viewport.y,
        scaleX: plan.viewport.zoom, scaleY: plan.viewport.zoom,
      });
      const transformer = new Konva.Transformer({
        rotateEnabled: false,
        flipEnabled: false,
        enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
        boundBoxFunc: (previous, candidate) =>
          candidate.width >= 8 && candidate.height >= 8 ? candidate : previous,
      });
      for (const node of buildKonvaNodes(layerPlan)) {
        world.add(node);
        if (editable) {
          releases.push(bind(node, node.id()));
          // Move/transform handlers from the canonical session run first;
          // redraw from the acknowledged v1 document after they settle.
          node.on('dragend.farzanDraft transformend.farzanDraft', onGesture);
          map.set(node.id(), { node, transformer });
        }
      }
      world.add(transformer);
      transformers.push(transformer);
      layer.add(world);
      stage.add(layer);
    }

    stage.on('click.farzanDraft tap.farzanDraft', event => {
      if (event.target === stage) onSelect(null);
    });
    const resize = () => stage.size(sceneSize(container));
    window.addEventListener('resize', resize);
    stage.batchDraw();
    return {
      select(id) {
        for (const transformer of transformers) transformer.nodes([]);
        const target = map.get(id);
        if (target && target.node.getClassName() === 'Rect') {
          target.transformer.nodes([target.node]);
        }
        stage.batchDraw();
      },
      destroy() {
        window.removeEventListener('resize', resize);
        releases.forEach(release => release());
        stage.destroy();
      },
    };
  } catch (error) {
    releases.forEach(release => release());
    stage.destroy();
    throw error;
  }
}

/**
 * The caller MUST provide a durable, isolated saveDraft(board) receipt.
 * A return value other than true rejects the change; saved board-v1 JSON,
 * not Stage.toJSON(), is the only document format.
 */
export function createStudioKonvaDraftWorkspace({
  container, board, saveDraft, onSelect = () => {},
  onStatus = () => {}, onError = () => {},
  sceneFactory = mountDraftScene,
} = {}) {
  if (!container) throw new TypeError('Konva draft container is required');
  if (typeof saveDraft !== 'function') throw new TypeError('Durable draft writer is required');
  const plan = planKonvaV1Board(board);
  if (!plan.compatible) throw new TypeError('Incompatible Studio v1 board: ' + plan.reason);

  let disposed = false;
  let selectedId = null;
  let scene = null;
  const session = createKonvaV1MoveSession({
    board,
    onChange: async next => {
      if (disposed) throw new Error('Konva draft workspace closed');
      const receipt = await saveDraft(structuredClone(next));
      if (receipt !== true) throw new Error('Konva draft write was not acknowledged');
      if (disposed) throw new Error('Konva draft workspace closed');
      return true;
    },
    onSelect: id => {
      selectedId = id;
      scene?.select?.(id);
      onSelect(id);
    },
  });

  const notifyError = error => {
    if (!disposed) onError(error);
  };
  const redraw = () => {
    if (disposed) return;
    scene?.destroy();
    scene = null;
    scene = sceneFactory({
      container,
      board: session.getBoard(),
      bind: (node, id) => session.bind(node, id),
      onSelect: id => {
        selectedId = id;
        scene?.select?.(id);
        onSelect(id);
      },
      onGesture: () => {
        // The canonical session's drag/transform handler has queued its write.
        session.flush().then(() => {
          if (!disposed) {
            redraw();
            onStatus('Experimental draft saved');
          }
        }).catch(notifyError);
      },
    });
    scene?.select?.(selectedId);
  };
  redraw();

  const run = async work => {
    if (disposed) throw new Error('Konva draft workspace closed');
    try {
      const result = await work();
      if (!disposed && result !== false) {
        redraw();
        onStatus('Experimental draft saved');
      }
      return result;
    } catch (error) {
      notifyError(error);
      throw error;
    }
  };

  return {
    getBoard: () => session.getBoard(),
    select(id) {
      if (disposed) return;
      selectedId = id || null;
      scene?.select?.(selectedId);
      onSelect(selectedId);
    },
    move: (id, dx, dy) => run(() => session.commit(id, dx, dy)),
    resize: (id, bounds) => run(() => session.resize(id, bounds)),
    undo: () => run(() => session.undo()),
    redo: () => run(() => session.redo()),
    canUndo: () => session.canUndo(),
    canRedo: () => session.canRedo(),
    flush: () => session.flush(),
    destroy() {
      if (disposed) return;
      disposed = true;
      scene?.destroy();
      scene = null;
    },
  };
}
