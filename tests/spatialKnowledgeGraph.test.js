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
      { id: '1', title: 'Calculus I', type: 'course' },
      { id: '2', title: 'Derivatives Note', type: 'note' },
      { id: '3', title: 'Product Rule', type: 'flashcard' },
    ];

    graph.mount(container, items, { width: 600, height: 400 });

    const canvas = container.querySelector('canvas.spatial-graph-canvas');
    expect(canvas).not.toBeNull();
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toBe('3D Spatial Knowledge Graph');
    expect(canvas.style.touchAction).toBe('none');
    expect(graph.nodes.length).toBeGreaterThanOrEqual(12);
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.coordinateRings.length).toBe(3);

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
