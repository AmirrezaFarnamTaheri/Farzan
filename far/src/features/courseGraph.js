/**
 * Course Graph — d3-hierarchy tree of course topics.
 * Canvas-rendered. Nodes = topics, colored by completion status.
 * Expandable/collapsible branches.
 *
 * Usage:
 *   const cg = new CourseGraph();
 *   cg.render(container, course, { onNodeClick: (topic) => ... });
 */

import { EventEmitter } from '../lib/eventEmitter.js';

const STATUS_COLORS = {
  completed: '#22c55e',
  'in-progress': '#f59e0b',
  notStarted: '#6b7280',
  locked: '#374151',
};

function buildTree(topics = [], progressMap = new Map()) {
  const roots = [];
  const nodeMap = new Map();

  for (const topic of topics) {
    const id = topic.topicId || topic.url || topic.id || '';
    if (!id) continue;
    const progress = progressMap.get(id);
    const status = progress?.completed ? 'completed' : progress?.started ? 'in-progress' : 'notStarted';
    const node = {
      id,
      title: String(topic.title || id).slice(0, 50),
      fullTitle: String(topic.title || id),
      status,
      courseId: topic.courseId || '',
      depth: topic.depth || 0,
      parentTopicId: topic.parentTopicId || '',
      children: [],
      expanded: topic.depth < 2,
      x: 0,
      y: 0,
      _raw: topic,
    };
    nodeMap.set(id, node);
  }

  for (const node of nodeMap.values()) {
    if (node.parentTopicId && nodeMap.has(node.parentTopicId)) {
      nodeMap.get(node.parentTopicId).children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function layoutTree(roots, startX, startY, spacingX, spacingY) {
  let currentY = startY;

  function layout(node, x) {
    node.x = x;
    if (!node.expanded || !node.children.length) {
      node.y = currentY;
      currentY += spacingY;
    } else {
      for (const child of node.children) {
        layout(child, x + spacingX);
      }
      const firstChild = node.children[0];
      const lastChild = node.children[node.children.length - 1];
      node.y = (firstChild.y + lastChild.y) / 2;
    }
  }

  for (const root of roots) {
    layout(root, startX);
  }
}

function collectVisibleNodes(roots) {
  const nodes = [];
  function walk(node) {
    nodes.push(node);
    if (node.expanded) {
      for (const child of node.children) walk(child);
    }
  }
  for (const root of roots) walk(root);
  return nodes;
}

function collectEdges(roots) {
  const edges = [];
  function walk(node) {
    if (node.expanded) {
      for (const child of node.children) {
        edges.push({ source: node, target: child });
        walk(child);
      }
    }
  }
  for (const root of roots) walk(root);
  return edges;
}

export class CourseGraph extends EventEmitter {
  constructor() {
    super();
    this._canvas = null;
    this._ctx = null;
    this._roots = [];
    this._nodes = [];
    this._edges = [];
    this._hoverNode = null;
    this._onNodeClick = null;
    this._zoom = { scale: 1, tx: 0, ty: 0 };
    this._spacingX = 200;
    this._spacingY = 36;
    this._nodeRadius = 8;
  }

  render(container, courseData = {}, options = {}) {
    if (typeof container === 'string') container = document.querySelector(container);
    if (!container) return;

    this._onNodeClick = typeof options.onNodeClick === 'function' ? options.onNodeClick : null;
    this._spacingX = Number(options.spacingX) || 200;
    this._spacingY = Number(options.spacingY) || 36;

    const width = options.width || container.clientWidth || 800;
    const height = options.height || container.clientHeight || 600;

    const topics = courseData.topics || [];
    const progressArr = courseData.progress || [];
    const progressMap = new Map();
    for (const p of progressArr) {
      if (p?.topicId) progressMap.set(p.topicId, p);
    }

    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width = width * (window.devicePixelRatio || 1);
    canvas.height = height * (window.devicePixelRatio || 1);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.cursor = 'pointer';
    container.appendChild(canvas);

    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    this._width = width;
    this._height = height;

    this._roots = buildTree(topics, progressMap);
    this._layoutAndDraw();
    this._bindEvents();
  }

  _layoutAndDraw() {
    layoutTree(this._roots, 40, 40, this._spacingX, this._spacingY);
    this._nodes = collectVisibleNodes(this._roots);
    this._edges = collectEdges(this._roots);
    this._draw();
  }

  _draw() {
    const ctx = this._ctx;
    const w = this._width;
    const h = this._height;

    ctx.save();
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.translate(this._zoom.tx, this._zoom.ty);
    ctx.scale(this._zoom.scale, this._zoom.scale);

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1.5;
    for (const edge of this._edges) {
      const { source, target } = edge;
      const midX = (source.x + this._nodeRadius + target.x - this._nodeRadius) / 2;
      ctx.beginPath();
      ctx.moveTo(source.x + this._nodeRadius, source.y);
      ctx.bezierCurveTo(midX, source.y, midX, target.y, target.x - this._nodeRadius, target.y);
      ctx.stroke();
    }

    for (const node of this._nodes) {
      const isHover = node === this._hoverNode;
      const color = STATUS_COLORS[node.status] || STATUS_COLORS.notStarted;

      ctx.beginPath();
      ctx.arc(node.x, node.y, this._nodeRadius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (isHover) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (node.children.length) {
        const expandX = node.x + this._nodeRadius + 8;
        ctx.beginPath();
        ctx.arc(expandX, node.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = node.expanded ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)';
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.expanded ? '−' : '+', expandX, node.y);
      }

      ctx.fillStyle = isHover ? '#fff' : 'rgba(255,255,255,0.8)';
      ctx.font = isHover ? 'bold 12px sans-serif' : '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.title, node.x + this._nodeRadius + (node.children.length ? 20 : 10), node.y);
    }

    if (this._hoverNode) {
      const n = this._hoverNode;
      const text = n.fullTitle;
      ctx.font = '11px sans-serif';
      const m = ctx.measureText(text);
      const pad = 6;
      const tx = n.x - m.width / 2 - pad;
      const ty = n.y - this._nodeRadius - 24;
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.beginPath();
      ctx.roundRect(tx, ty, m.width + pad * 2, 18, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, tx + pad, ty + 9);
    }

    ctx.restore();
  }

  _findNodeAt(mx, my) {
    const sx = (mx - this._zoom.tx) / this._zoom.scale;
    const sy = (my - this._zoom.ty) / this._zoom.scale;
    for (let i = this._nodes.length - 1; i >= 0; i--) {
      const node = this._nodes[i];
      const dx = sx - node.x;
      const dy = sy - node.y;
      if (dx * dx + dy * dy <= (this._nodeRadius + 4) * (this._nodeRadius + 4)) return node;
    }
    return null;
  }

  _bindEvents() {
    const canvas = this._canvas;
    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    canvas.addEventListener('pointermove', (e) => {
      const pos = getPos(e);
      const node = this._findNodeAt(pos.x, pos.y);
      if (node !== this._hoverNode) {
        this._hoverNode = node;
        canvas.style.cursor = node ? 'pointer' : 'default';
        this._draw();
      }
    });

    canvas.addEventListener('click', (e) => {
      const pos = getPos(e);
      const node = this._findNodeAt(pos.x, pos.y);
      if (!node) return;

      const expandX = node.x + this._nodeRadius + 8;
      const sy = pos.y;
      const sx = pos.x;
      const dx = sx - (expandX * this._zoom.scale + this._zoom.tx);
      const dy = sy - (node.y * this._zoom.scale + this._zoom.ty);

      if (node.children.length && Math.sqrt(dx * dx + dy * dy) < 10) {
        node.expanded = !node.expanded;
        this._layoutAndDraw();
      } else if (this._onNodeClick) {
        this._onNodeClick(node._raw, node);
      }
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const pos = getPos(e);
      const delta = -e.deltaY * 0.002;
      const factor = Math.pow(2, delta);
      const newScale = Math.max(0.1, Math.min(5, this._zoom.scale * factor));
      const ratio = newScale / this._zoom.scale;
      this._zoom.tx = pos.x - ratio * (pos.x - this._zoom.tx);
      this._zoom.ty = pos.y - ratio * (pos.y - this._zoom.ty);
      this._zoom.scale = newScale;
      this._draw();
    }, { passive: false });
  }

  resize(width, height) {
    if (!this._canvas) return;
    this._canvas.width = width * (window.devicePixelRatio || 1);
    this._canvas.height = height * (window.devicePixelRatio || 1);
    this._canvas.style.width = `${width}px`;
    this._canvas.style.height = `${height}px`;
    this._ctx = this._canvas.getContext('2d');
    this._ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    this._width = width;
    this._height = height;
    this._draw();
  }

  destroy() {
    if (this._canvas) this._canvas.remove();
    this._roots = [];
    this._nodes = [];
    this._edges = [];
    this._listeners.clear();
  }
}
