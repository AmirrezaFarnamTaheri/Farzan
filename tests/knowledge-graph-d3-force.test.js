import { describe, expect, it } from 'vitest';
import { KnowledgeGraph } from '../src/features/knowledgeGraph.js';

describe('KnowledgeGraph established force layout compatibility', () => {
  function graphFixture() {
    const graph = new KnowledgeGraph();
    graph._nodes = [
      { id: 'heart', label: 'Heart', radius: 14, x: 200, y: 180, vx: 0, vy: 0 },
      { id: 'vessels', label: 'Vessels', radius: 12, x: 200, y: 180, vx: 0, vy: 0 },
      { id: 'lungs', label: 'Lungs', radius: 10, x: 600, y: 420, vx: 0, vy: 0 },
    ];
    graph._edges = [{ source: 'heart', target: 'vessels' }];
    return graph;
  }

  it('keeps original app-owned links and node identities immutable while using a force simulation', () => {
    const graph = graphFixture();
    graph._initSimulation(800, 600);
    expect(typeof graph._simulation?.tick).toBe('function');
    for (let i = 0; i < 150; i++) graph._tick();
    expect(graph._edges).toEqual([{ source: 'heart', target: 'vessels' }]);
    expect(graph._nodes.map(node => node.id)).toEqual(['heart', 'vessels', 'lungs']);
    for (const node of graph._nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.x).toBeGreaterThanOrEqual(node.radius);
      expect(node.x).toBeLessThanOrEqual(800 - node.radius);
      expect(node.y).toBeGreaterThanOrEqual(node.radius);
      expect(node.y).toBeLessThanOrEqual(600 - node.radius);
    }
    const [heart, vessels] = graph._nodes;
    expect(Math.hypot(heart.x - vessels.x, heart.y - vessels.y))
      .toBeGreaterThanOrEqual(heart.radius + vessels.radius - 2);
    graph.destroy();
  });

  it('uses the established d3-force simulation engine without duplicating its lifecycle', () => {
    const graph = graphFixture();
    graph._initSimulation(800, 600);
    const simulation = graph._simulation;
    expect(typeof simulation.alpha).toBe('function');
    expect(typeof simulation.alphaTarget).toBe('function');
    expect(typeof simulation.nodes).toBe('function');
    expect(simulation.nodes()).toBe(graph._nodes);
    expect(simulation.force('links').links()).toHaveLength(1);
    expect(graph._edges).toEqual([{ source: 'heart', target: 'vessels' }]);
    graph.destroy();
  });

  it('ignores a stale or deleted link without losing valid graph nodes', () => {
    const graph = graphFixture();
    graph._edges.push({ source: 'heart', target: 'deleted-note' });
    expect(() => graph._initSimulation(640, 480)).not.toThrow();
    expect(() => graph._tick()).not.toThrow();
    expect(graph._edges).toHaveLength(2); // Preserve app-owned edge records.
    graph.destroy();
  });

  it('does not stack newly built zero-position nodes at the offscreen origin', () => {
    const graph = graphFixture();
    for (const node of graph._nodes) { node.x = 0; node.y = 0; }
    graph._initSimulation(640, 480);
    expect(graph._nodes.every(node => node.x > 0 && node.y > 0)).toBe(true);
    expect(graph._nodes.some(node => node.x > 100 && node.y > 70)).toBe(true);
    graph.destroy();
  });

  it('rebuilds force state when reinitialized and stops it on destruction', () => {
    const graph = graphFixture();
    graph._initSimulation(500, 500);
    const first = graph._simulation;
    graph._tick();
    graph._initSimulation(300, 200);
    expect(graph._simulation).not.toBe(first);
    expect(graph._simulation.force('charge')).toBeTruthy();
    graph.destroy();
    expect(graph._simulation).toBeNull();
  });

  it('draws saved linked concepts closer than otherwise identical unlinked concepts', () => {
    const distanceAfter = linked => {
      const graph = new KnowledgeGraph();
      graph._nodes = [
        { id: 'a', x: 150, y: 200, vx: 0, vy: 0, radius: 10 },
        { id: 'b', x: 650, y: 200, vx: 0, vy: 0, radius: 10 },
      ];
      graph._edges = linked ? [{ source: 'a', target: 'b' }] : [];
      graph._initSimulation(800, 400);
      for (let i = 0; i < 12; i++) graph._tick();
      const distance = graph._nodes[1].x - graph._nodes[0].x;
      graph.destroy();
      return distance;
    };
    expect(distanceAfter(true)).toBeLessThan(distanceAfter(false));
  });

  it('preserves original notes and wikilink identifiers across force ticks', () => {
    const notes = [
      { id: 'note-1', title: 'Heart', content: '<p>See [[Lungs]]</p>', tags: ['medicine'] },
      { id: 'note-2', title: 'Lungs', content: '<p>Alveoli</p>', tags: ['medicine'] },
    ];
    const before = structuredClone(notes);
    const graph = new KnowledgeGraph();
    graph._buildGraph(notes);
    expect(graph._edges).toEqual([{ source: 'note-1', target: 'note-2' }]);
    graph._initSimulation(800, 600);
    for (let i = 0; i < 20; i++) graph._tick();
    expect(graph._edges).toEqual([{ source: 'note-1', target: 'note-2' }]);
    expect(graph._nodes.map(node => node.id)).toEqual(['note-1', 'note-2']);
    expect(notes).toEqual(before);
    graph.destroy();
  });

  it('pins a dragging node while continuing to simulate neighbours', () => {
    const graph = graphFixture();
    graph._initSimulation(800, 600);
    const dragged = graph._nodes[0];
    dragged.fx = 230;
    dragged.fy = 150;
    for (let i = 0; i < 10; i++) graph._tick();
    expect(dragged.x).toBe(230);
    expect(dragged.y).toBe(150);
    dragged.fx = null;
    dragged.fy = null;
    graph.destroy();
  });

  it('resolves overlaps using D3 collision even when charge and links are disabled', () => {
    const graph = graphFixture();
    graph._nodes = [
      { id: 'a', x: 200, y: 200, vx: 0, vy: 0, radius: 24 },
      { id: 'b', x: 200, y: 200, vx: 0, vy: 0, radius: 24 },
    ];
    graph._edges = [];
    graph._initSimulation(500, 400);
    graph._simulation.force('charge').strength(0);
    // No link force is present and no charge can separate these nodes.
    for (let i = 0; i < 30; i++) graph._tick();
    const distance = Math.hypot(
      graph._nodes[0].x - graph._nodes[1].x,
      graph._nodes[0].y - graph._nodes[1].y,
    );
    expect(graph._nodes.map(node => node.index)).toEqual([0, 1]);
    expect(distance).toBeGreaterThan(40);
    graph.destroy();
  });

  it('initializes numeric D3 indexes for imported nodes before collision', () => {
    const graph = graphFixture();
    for (const node of graph._nodes) delete node.index;
    graph._edges = [];
    graph._initSimulation(800, 600);
    expect(graph._nodes.map(node => node.index)).toEqual([0, 1, 2]);
    for (let i = 0; i < 20; i++) graph._tick();
    expect(graph._nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
    graph.destroy();
  });


});
