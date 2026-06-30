/**
 * Knowledge Graph — d3-force pattern force-directed graph of note connections.
 * Canvas-rendered for performance. Nodes = notes, edges = wikilinks.
 *
 * Usage:
 *   const kg = new KnowledgeGraph();
 *   kg.render(container, notes, { onNodeClick: (note) => router.navigate(...) });
 */

import { EventEmitter } from '../lib/eventEmitter.js';

function extractWikilinks(content) {
  if (!content) return [];
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  const links = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1].trim().toLowerCase());
  }
  return links;
}

function wordCount(text) {
  if (!text) return 0;
  return String(text).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(w => w.length > 0).length;
}

const COURSE_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
  '#0ea5e9', '#3b82f6', '#6366f1',
];

function courseColor(courseId, courseMap) {
  if (!courseMap.has(courseId)) courseMap.set(courseId, COURSE_COLORS[courseMap.size % COURSE_COLORS.length]);
  return courseMap.get(courseId);
}

export class KnowledgeGraph extends EventEmitter {
  constructor() {
    super();
    this._canvas = null;
    this._ctx = null;
    this._nodes = [];
    this._edges = [];
    this._simulation = null;
    this._running = false;
    this._animFrame = null;
    this._dragNode = null;
    this._dragOffsetX = 0;
    this._dragOffsetY = 0;
    this._hoverNode = null;
    this._courseMap = new Map();
    this._onNodeClick = null;
    this._filters = {};
    this._tooltip = null;
    this._zoom = { scale: 1, tx: 0, ty: 0 };
    this._minNodeRadius = 4;
    this._maxNodeRadius = 18;
  }

  render(container, notes = [], options = {}) {
    if (typeof container === 'string') container = document.querySelector(container);
    if (!container) return;

    this._onNodeClick = typeof options.onNodeClick === 'function' ? options.onNodeClick : null;
    this._filters = options.filters || {};

    const width = options.width || container.clientWidth || 800;
    const height = options.height || container.clientHeight || 600;

    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width = width * (window.devicePixelRatio || 1);
    canvas.height = height * (window.devicePixelRatio || 1);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.cursor = 'grab';
    container.appendChild(canvas);

    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    this._buildGraph(notes);
    this._initSimulation(width, height);
    this._bindEvents();
    this._start();
  }

  _buildGraph(notes) {
    const noteMap = new Map();
    const filtered = this._filterNotes(notes);

    for (const note of filtered) {
      const id = String(note.id || note.title || '').toLowerCase();
      if (!id) continue;
      noteMap.set(id, note);
    }

    const nodes = [];
    const nodeSet = new Set();
    const edges = [];
    const edgeSet = new Set();
    const wcValues = [];

    for (const note of noteMap.values()) {
      const wc = wordCount(note.content || '');
      wcValues.push(wc);
    }

    const maxWc = Math.max(1, ...wcValues);
    const minWc = Math.min(...wcValues, 0);
    const range = maxWc - minWc || 1;

    let idx = 0;
    for (const note of noteMap.values()) {
      const id = String(note.id || note.title || '').toLowerCase();
      const wc = wordCount(note.content || '');
      const radius = this._minNodeRadius + ((wc - minWc) / range) * (this._maxNodeRadius - this._minNodeRadius);
      const course = note.courseId || note.course || 'uncategorized';

      nodes.push({
        id,
        index: idx++,
        label: String(note.title || id).slice(0, 40),
        radius,
        color: courseColor(course, this._courseMap),
        course,
        tags: note.tags || [],
        note,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      });
      nodeSet.add(id);

      const links = extractWikilinks(note.content || '');
      for (const target of links) {
        const targetId = target.toLowerCase();
        const edgeKey = `${id}->${targetId}`;
        if (!edgeSet.has(edgeKey) && nodeSet.has(targetId)) {
          edges.push({ source: id, target: targetId });
          edgeSet.add(edgeKey);
        }
      }
    }

    this._nodes = nodes;
    this._edges = edges;
  }

  _filterNotes(notes) {
    let result = notes;
    const { tag, course, dateFrom, dateTo } = this._filters;
    if (tag) result = result.filter(n => (n.tags || []).includes(tag));
    if (course) result = result.filter(n => (n.courseId || n.course || '') === course);
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      result = result.filter(n => (n.createdAt || n.updatedAt || 0) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime();
      result = result.filter(n => (n.createdAt || n.updatedAt || 0) <= to);
    }
    return result;
  }

  _initSimulation(width, height) {
    const cx = width / 2;
    const cy = height / 2;
    for (const node of this._nodes) {
      node.x = cx + (Math.random() - 0.5) * width * 0.6;
      node.y = cy + (Math.random() - 0.5) * height * 0.6;
    }
    this._width = width;
    this._height = height;
  }

  _tick() {
    const alpha = 0.3;
    const chargeStrength = -120;
    const linkDistance = 80;
    const centerStrength = 0.05;
    const collisionPadding = 4;

    const nodeMap = new Map();
    for (const node of this._nodes) nodeMap.set(node.id, node);

    for (const node of this._nodes) {
      node.vx += (this._width / 2 - node.x) * centerStrength * alpha;
      node.vy += (this._height / 2 - node.y) * centerStrength * alpha;
    }

    for (let i = 0; i < this._nodes.length; i++) {
      for (let j = i + 1; j < this._nodes.length; j++) {
        const a = this._nodes[i];
        const b = this._nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = chargeStrength * alpha / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    for (const edge of this._edges) {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) continue;
      let dx = target.x - source.x;
      let dy = target.y - source.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - linkDistance) * alpha * 0.05;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      source.vx += fx;
      source.vy += fy;
      target.vx -= fx;
      target.vy -= fy;
    }

    for (let i = 0; i < this._nodes.length; i++) {
      for (let j = i + 1; j < this._nodes.length; j++) {
        const a = this._nodes[i];
        const b = this._nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minDist = a.radius + b.radius + collisionPadding;
        if (dist < minDist) {
          const overlap = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
        }
      }
    }

    for (const node of this._nodes) {
      if (node === this._dragNode) continue;
      node.vx *= 0.85;
      node.vy *= 0.85;
      node.x += node.vx;
      node.y += node.vy;
      node.x = Math.max(node.radius, Math.min(this._width - node.radius, node.x));
      node.y = Math.max(node.radius, Math.min(this._height - node.radius, node.y));
    }
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

    const nodeMap = new Map();
    for (const node of this._nodes) nodeMap.set(node.id, node);

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (const edge of this._edges) {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) continue;
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
    }

    for (const node of this._nodes) {
      const isHover = node === this._hoverNode;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();
      if (isHover) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    if (this._hoverNode) {
      const n = this._hoverNode;
      ctx.font = '12px sans-serif';
      const text = n.label;
      const m = ctx.measureText(text);
      const pad = 6;
      const tx = n.x - m.width / 2 - pad;
      const ty = n.y - n.radius - 22;
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.beginPath();
      ctx.roundRect(tx, ty, m.width + pad * 2, 20, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, n.x, ty + 10);
    }

    ctx.restore();
  }

  _start() {
    if (this._running) return;
    this._running = true;
    let frame = 0;
    const loop = () => {
      if (!this._running) return;
      this._tick();
      this._draw();
      frame++;
      if (frame < 300) {
        this._animFrame = requestAnimationFrame(loop);
      } else {
        this._running = false;
      }
    };
    this._animFrame = requestAnimationFrame(loop);
  }

  _findNodeAt(mx, my) {
    const sx = (mx - this._zoom.tx) / this._zoom.scale;
    const sy = (my - this._zoom.ty) / this._zoom.scale;
    for (let i = this._nodes.length - 1; i >= 0; i--) {
      const node = this._nodes[i];
      const dx = sx - node.x;
      const dy = sy - node.y;
      if (dx * dx + dy * dy <= node.radius * node.radius) return node;
    }
    return null;
  }

  _bindEvents() {
    const canvas = this._canvas;
    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    canvas.addEventListener('pointerdown', (e) => {
      const pos = getPos(e);
      const node = this._findNodeAt(pos.x, pos.y);
      if (node) {
        this._dragNode = node;
        this._dragOffsetX = pos.x - node.x * this._zoom.scale - this._zoom.tx;
        this._dragOffsetY = pos.y - node.y * this._zoom.scale - this._zoom.ty;
        canvas.style.cursor = 'grabbing';
        this._start();
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      const pos = getPos(e);
      if (this._dragNode) {
        const wx = (pos.x - this._dragOffsetX - this._zoom.tx) / this._zoom.scale;
        const wy = (pos.y - this._dragOffsetY - this._zoom.ty) / this._zoom.scale;
        this._dragNode.x = wx;
        this._dragNode.y = wy;
        this._dragNode.vx = 0;
        this._dragNode.vy = 0;
        this._start();
      } else {
        const node = this._findNodeAt(pos.x, pos.y);
        if (node !== this._hoverNode) {
          this._hoverNode = node;
          canvas.style.cursor = node ? 'pointer' : 'grab';
          this._draw();
        }
      }
    });

    canvas.addEventListener('pointerup', () => {
      if (this._dragNode) {
        this._dragNode = null;
        canvas.style.cursor = 'grab';
      }
    });

    canvas.addEventListener('click', (e) => {
      if (this._dragNode) return;
      const pos = getPos(e);
      const node = this._findNodeAt(pos.x, pos.y);
      if (node && this._onNodeClick) {
        this._onNodeClick(node.note, node);
      }
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const pos = getPos(e);
      const delta = -e.deltaY * 0.002;
      const factor = Math.pow(2, delta);
      const newScale = Math.max(0.1, Math.min(10, this._zoom.scale * factor));
      const ratio = newScale / this._zoom.scale;
      this._zoom.tx = pos.x - ratio * (pos.x - this._zoom.tx);
      this._zoom.ty = pos.y - ratio * (pos.y - this._zoom.ty);
      this._zoom.scale = newScale;
      this._draw();
    }, { passive: false });
  }

  updateFilters(filters) {
    this._filters = { ...this._filters, ...filters };
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
    this._running = false;
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    if (this._canvas) this._canvas.remove();
    this._nodes = [];
    this._edges = [];
    this._listeners.clear();
  }
}
