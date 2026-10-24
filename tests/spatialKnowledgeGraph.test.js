import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpatialKnowledgeGraph } from '../src/features/spatialKnowledgeGraph.js';

describe('SpatialKnowledgeGraph', () => {
  let container;
  let mockCtx;

  beforeEach(() => {
    container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true });
    document.body.appendChild(container);

    mockCtx = {
      scale: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      setLineDash: vi.fn(),
      fillText: vi.fn(),
      createRadialGradient: vi.fn(() => ({
        addColorStop: vi.fn(),
      })),
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
      font: '',
      textAlign: '',
    };

    HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCtx);
    window.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 16));
    window.cancelAnimationFrame = vi.fn((id) => clearTimeout(id));
  });

  afterEach(() => {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.restoreAllMocks();
  });

  it('initializes with default camera and interaction state', () => {
    const graph = new SpatialKnowledgeGraph();
    expect(graph.camera.fov).toBe(450);
    expect(graph.camera.z).toBe(600);
    expect(graph.isDragging).toBe(false);
    expect(graph.isDisposed).toBe(false);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  it('mounts into container and creates canvas with accessibility attributes', () => {
    const graph = new SpatialKnowledgeGraph();
    const items = [
      { id: '1', title: 'Calculus I', type: 'course', relatedIds: ['2'] },
      { id: '2', title: 'Derivatives Note', type: 'note' },
      { id: '3', title: 'Product Rule', type: 'flashcard' },
    ];

    graph.mount(container, items, { width: 600, height: 400 });

    const canvas = container.querySelector('canvas.spatial-graph-canvas');
    expect(canvas).not.toBeNull();
    expect(canvas.getAttribute('role')).toBe('application');
    expect(canvas.tabIndex).toBe(0);
    expect(canvas.getAttribute('aria-label')).toContain('arrow keys');
    expect(canvas.style.touchAction).toBe('none');
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.coordinateRings.length).toBe(3);

    graph.dispose();
  });

  it('cycles through graph concepts with the keyboard and exposes each target to screen readers', () => {
    const graph = new SpatialKnowledgeGraph();
    graph.mount(container, [
      { id: 'algebra', title: 'Algebra', type: 'course' },
      { id: 'geometry', title: 'Geometry', type: 'note' },
    ]);
    const select = vi.fn();
    graph.on('node:select', select);
    const key = (value) => graph.canvas.dispatchEvent(new KeyboardEvent('keydown', {
      key: value, bubbles: true, cancelable: true,
    }));

    expect(graph.canvas.getAttribute('aria-label')).toContain('Algebra');
    key('ArrowRight');
    expect(graph.canvas.getAttribute('aria-label')).toContain('Geometry');
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain('Geometry');
    key('Enter');
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: 'geometry' }));
    key('ArrowLeft');
    key(' ');
    expect(select).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'algebra' }));
    key('ArrowLeft');
    expect(graph.keyboardNodeIndex).toBe(graph.nodes.length - 1);

    graph.dispose();
    expect(container.querySelector('[aria-live="polite"]')).toBeNull();
  });

  it('does not invent concepts or relationships for an empty workspace', () => {
    const graph = new SpatialKnowledgeGraph();
    graph.mount(container, []);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(container.textContent).toContain('Add notes');
    graph.dispose();
  });

  it('only draws links when source records explicitly declare a relationship', () => {
    const graph = new SpatialKnowledgeGraph();
    graph.mount(container, [
      { id: 'note-a', title: 'A', type: 'note' },
      { id: 'note-b', title: 'B', type: 'note' },
      { id: 'note-c', title: 'C', type: 'note', relatedIds: ['note-a'] },
    ]);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].source.id).toBe('note-c');
    expect(graph.edges[0].target.id).toBe('note-a');
    graph.dispose();
  });

  it('disposes cleanly removing event listeners, canvas, and animation loop', () => {
    const graph = new SpatialKnowledgeGraph();
    graph.mount(container, []);

    expect(container.querySelector('canvas')).not.toBeNull();
    graph.dispose();

    expect(graph.isDisposed).toBe(true);
    expect(graph.canvas).toBeNull();
    expect(graph.ctx).toBeNull();
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.coordinateRings).toEqual([]);
    expect(graph.pulses).toEqual([]);
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('emits node:select event when node is selected via pointer interaction', () => {
    const graph = new SpatialKnowledgeGraph();
    graph.mount(container, [{ id: 'test_node', title: 'Selected Concept', type: 'course' }]);

    const selectSpy = vi.fn();
    graph.on('node:select', selectSpy);

    graph.hoveredNode = graph.nodes[0];
    graph.handlePointerUp();

    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(selectSpy).toHaveBeenCalledWith(graph.nodes[0].raw);

    graph.dispose();
  });
});
