/**
 * OpenCourseDeck — spatialKnowledgeGraph.js
 * Spatial 3D Knowledge Graph & Concept Constellation Engine
 *
 * Implements a high-performance, zero-dependency 3D spatial projection
 * with orbital physics, interactive depth sorting, dynamic bezier spline
 * connectors, and strict memory/RAF cleanup on unmount.
 */

import { EventEmitter } from '../lib/eventEmitter.js';

function getThemeAccentRgb() {
  if (typeof document === 'undefined') return '124, 58, 237';
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim();
    if (raw) return raw;
  } catch {}
  return '124, 58, 237';
}

function shadeColor(color, percent) {
  try {
    const num = parseInt(color.replace('#', ''), 16);
    if (Number.isNaN(num)) return color;
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, Math.max(0, (num >> 16) + amt));
    const B = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amt));
    const G = Math.min(255, Math.max(0, (num & 0x0000ff) + amt));
    return `#${(0x1000000 + R * 0x10000 + B * 0x100 + G).toString(16).slice(1)}`;
  } catch {
    return color;
  }
}

export class SpatialKnowledgeGraph extends EventEmitter {
  constructor() {
    super();
    this.container = null;
    this.canvas = null;
    this.ctx = null;
    this.nodes = [];
    this.edges = [];
    this.rafId = null;
    this.isDisposed = false;

    // 3D Camera / Viewport Transform
    this.camera = {
      x: 0,
      y: 0,
      z: 600,
      fov: 450,
      rotX: 0.15,
      rotY: 0.35,
      targetRotX: 0.15,
      targetRotY: 0.35,
      autoRotateSpeed: 0.003,
    };

    // Interaction State
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.hoveredNode = null;
    this.selectedNode = null;

    this.onResize = this.handleResize.bind(this);
    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
  }

  /**
   * Mount into a DOM container element
   */
  mount(container, items = [], options = {}) {
    if (typeof container === 'string') container = document.querySelector(container);
    if (!container) return;

    this.container = container;
    this.options = options;
    this.container.innerHTML = '';

    const width = options.width || this.container.clientWidth || 800;
    const height = options.height || this.container.clientHeight || 500;

    const canvas = document.createElement('canvas');
    canvas.className = 'spatial-graph-canvas';
    canvas.setAttribute('aria-label', '3D Spatial Knowledge Graph');
    canvas.setAttribute('role', 'img');
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.cursor = 'grab';
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);
    this.width = width;
    this.height = height;
    this.dpr = dpr;

    this.container.appendChild(canvas);

    this.initData(items);
    this.bindEvents();
    this.startLoop();
  }

  initData(items = []) {
    this.nodes = [];
    this.edges = [];

    const total = Math.max(items.length, 12);
    const radius = 220;

    // Procedural Fibonacci Sphere Node Distribution
    for (let i = 0; i < total; i++) {
      const item = items[i] || {
        id: `node_${i}`,
        title: `Concept ${i + 1}`,
        type: i % 3 === 0 ? 'course' : i % 3 === 1 ? 'note' : 'flashcard',
        progress: (i * 17) % 100,
      };

      const phi = Math.acos(1 - 2 * (i + 0.5) / total);
      const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = (radius * Math.cos(phi)) * 0.8;
      const z = radius * Math.sin(phi) * Math.sin(theta);

      this.nodes.push({
        id: item.id || `node_${i}`,
        title: item.title || item.name || `Node ${i + 1}`,
        raw: item,
        x,
        y,
        z,
        baseRadius: item.type === 'course' ? 14 : item.type === 'note' ? 10 : 8,
        color: item.type === 'course' ? '#2563eb' : item.type === 'note' ? '#047857' : '#c2410c',
        screenX: 0,
        screenY: 0,
        screenScale: 1,
        alpha: 1,
      });
    }

    // Connect nodes with dynamic orbital splines
    for (let i = 0; i < this.nodes.length; i++) {
      const targetIdx = (i + 1) % this.nodes.length;
      const crossIdx = (i + 3) % this.nodes.length;
      this.edges.push({ source: this.nodes[i], target: this.nodes[targetIdx] });
      if (i % 2 === 0) {
        this.edges.push({ source: this.nodes[i], target: this.nodes[crossIdx] });
      }
    }

    // Procedural 3D Armillary Gyroscope Coordinate Rings
    const ringRadius = 240;
    const ringSegments = 48;
    this.coordinateRings = [
      // Equatorial Ring (XZ plane, y=0)
      {
        points: Array.from({ length: ringSegments }, (_, idx) => {
          const a = (idx / ringSegments) * Math.PI * 2;
          return { x: ringRadius * Math.cos(a), y: 0, z: ringRadius * Math.sin(a) };
        }),
        colorFactor: 0.2,
      },
      // Polar Meridian Ring (YZ plane, x=0)
      {
        points: Array.from({ length: ringSegments }, (_, idx) => {
          const a = (idx / ringSegments) * Math.PI * 2;
          return { x: 0, y: ringRadius * Math.cos(a) * 0.85, z: ringRadius * Math.sin(a) };
        }),
        colorFactor: 0.16,
      },
      // Oblique Ecliptic Ring (inclined at 35 degrees)
      {
        points: Array.from({ length: ringSegments }, (_, idx) => {
          const a = (idx / ringSegments) * Math.PI * 2;
          const rx = ringRadius * Math.cos(a);
          const rz = ringRadius * Math.sin(a);
          return { x: rx * 0.82, y: rx * 0.58, z: rz };
        }),
        colorFactor: 0.24,
      },
    ];

    // Energetic Signal Pulses flowing across edges
    this.pulses = this.edges.map((edge, idx) => ({
      edge,
      progress: (idx * 0.19) % 1,
      speed: 0.003 + (idx % 4) * 0.0015,
    }));
  }

  bindEvents() {
    window.addEventListener('resize', this.onResize);
    if (!this.canvas) return;

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  handleResize() {
    if (this.isDisposed || !this.container || !this.canvas) return;
    const width = this.options.width || this.container.clientWidth || 800;
    const height = this.options.height || this.container.clientHeight || 500;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.scale(dpr, dpr);
    this.width = width;
    this.height = height;
    this.dpr = dpr;
  }

  handlePointerDown(e) {
    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    if (this.canvas) this.canvas.style.cursor = 'grabbing';
  }

  handlePointerMove(e) {
    if (this.isDragging) {
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;
      this.camera.targetRotY += dx * 0.006;
      this.camera.targetRotX += dy * 0.006;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
    } else if (this.canvas) {
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let closest = null;
      let minDist = 20;

      for (const node of this.nodes) {
        const dist = Math.hypot(node.screenX - mx, node.screenY - my);
        if (dist < minDist * node.screenScale && node.z > -this.camera.fov * 0.5) {
          closest = node;
          minDist = dist;
        }
      }

      if (this.hoveredNode !== closest) {
        this.hoveredNode = closest;
        this.canvas.style.cursor = closest ? 'pointer' : 'grab';
      }
    }
  }

  handlePointerUp() {
    if (this.isDragging) {
      this.isDragging = false;
      if (this.canvas) this.canvas.style.cursor = this.hoveredNode ? 'pointer' : 'grab';
    }
    if (this.hoveredNode && !this.isDragging) {
      this.selectedNode = this.hoveredNode;
      this.emit('node:select', this.selectedNode.raw);
    }
  }

  startLoop() {
    const prefersReducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

    const frame = () => {
      if (this.isDisposed) return;

      if (!prefersReducedMotion && !this.isDragging) {
        this.camera.targetRotY += this.camera.autoRotateSpeed;
      }

      // Smooth Spring Easing for Camera Rotation
      this.camera.rotX += (this.camera.targetRotX - this.camera.rotX) * 0.1;
      this.camera.rotY += (this.camera.targetRotY - this.camera.rotY) * 0.1;

      this.renderScene();
      this.rafId = requestAnimationFrame(frame);
    };

    this.rafId = requestAnimationFrame(frame);
  }

  renderScene() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const fov = this.camera.fov;

    ctx.clearRect(0, 0, this.width, this.height);

    const cosY = Math.cos(this.camera.rotY);
    const sinY = Math.sin(this.camera.rotY);
    const cosX = Math.cos(this.camera.rotX);
    const sinX = Math.sin(this.camera.rotX);

    // Transform and Project Nodes into 3D Space
    for (const node of this.nodes) {
      // Rotate around Y
      const x1 = node.x * cosY + node.z * sinY;
      const z1 = -node.x * sinY + node.z * cosY;

      // Rotate around X
      const y2 = node.y * cosX - z1 * sinX;
      const z2 = node.y * sinX + z1 * cosX;

      const scale = fov / (fov + z2);
      node.screenX = cx + x1 * scale;
      node.screenY = cy + y2 * scale;
      node.screenScale = scale;
      node.transformedZ = z2;
      node.alpha = Math.max(0.15, Math.min(1, (z2 + 250) / 400));
    }

    // Render Background Constellation Dust with 3D Depth Drift & Twinkling
    if (!this.stars) {
      this.stars = Array.from({ length: 48 }, () => ({
        x: (Math.random() - 0.5) * 700,
        y: (Math.random() - 0.5) * 700,
        z: (Math.random() - 0.5) * 500,
        size: Math.random() * 1.5 + 0.6,
        alpha: Math.random() * 0.45 + 0.15,
        twinklePhase: Math.random() * Math.PI * 2,
      }));
    }

    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() * 0.002 : Date.now() * 0.002;

    for (const star of this.stars) {
      if (!prefersReducedMotion) {
        star.z -= 0.25;
        if (star.z < -250) star.z += 500;
      }

      const x1 = star.x * cosY + star.z * sinY;
      const z1 = -star.x * sinY + star.z * cosY;
      const y2 = star.y * cosX - z1 * sinX;
      const z2 = star.y * sinX + z1 * cosX;
      const scale = fov / (fov + z2);
      const sx = cx + x1 * scale;
      const sy = cy + y2 * scale;

      const twinkle = 0.75 + 0.25 * Math.sin(now + star.twinklePhase);
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.5, star.size * scale), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(165, 180, 205, ${Math.max(0.05, star.alpha * scale * twinkle)})`;
      ctx.fill();
    }

    const accentRgb = getThemeAccentRgb();

    // Render 3D Armillary Gyroscope Coordinate Rings
    if (this.coordinateRings) {
      ctx.save();
      ctx.setLineDash([4, 6]);
      for (const ring of this.coordinateRings) {
        ctx.beginPath();
        let started = false;
        for (let i = 0; i <= ring.points.length; i++) {
          const pt = ring.points[i % ring.points.length];
          const x1 = pt.x * cosY + pt.z * sinY;
          const z1 = -pt.x * sinY + pt.z * cosY;
          const y2 = pt.y * cosX - z1 * sinX;
          const z2 = pt.y * sinX + z1 * cosX;
          const scale = fov / (fov + z2);
          const sx = cx + x1 * scale;
          const sy = cy + y2 * scale;
          if (!started) {
            ctx.moveTo(sx, sy);
            started = true;
          } else {
            ctx.lineTo(sx, sy);
          }
        }
        ctx.strokeStyle = `rgba(${accentRgb}, ${ring.colorFactor})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Render 3D Bezier Spline Edges
    for (const edge of this.edges) {
      const s = edge.source;
      const t = edge.target;
      const avgAlpha = (s.alpha + t.alpha) * 0.5;

      ctx.beginPath();
      ctx.moveTo(s.screenX, s.screenY);

      // Curved Spline Midpoint
      const midX = (s.screenX + t.screenX) / 2;
      const midY = (s.screenY + t.screenY) / 2 - 15 * s.screenScale;
      ctx.quadraticCurveTo(midX, midY, t.screenX, t.screenY);

      ctx.strokeStyle = `rgba(${accentRgb}, ${avgAlpha * 0.4})`;
      ctx.lineWidth = Math.max(1, (s.screenScale + t.screenScale) * 0.85);
      ctx.stroke();
    }

    // Render Energetic 3D Pulses along edges
    if (this.pulses && !prefersReducedMotion) {
      for (const pulse of this.pulses) {
        pulse.progress += pulse.speed;
        if (pulse.progress >= 1) pulse.progress -= 1;

        const s = pulse.edge.source;
        const t = pulse.edge.target;
        const tVal = pulse.progress;
        const midX = (s.screenX + t.screenX) / 2;
        const midY = (s.screenY + t.screenY) / 2 - 15 * s.screenScale;

        const px = (1 - tVal) * (1 - tVal) * s.screenX + 2 * (1 - tVal) * tVal * midX + tVal * tVal * t.screenX;
        const py = (1 - tVal) * (1 - tVal) * s.screenY + 2 * (1 - tVal) * tVal * midY + tVal * tVal * t.screenY;
        const pScale = (s.screenScale + t.screenScale) * 0.5;

        ctx.beginPath();
        ctx.arc(px, py, 2.2 * pScale, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py, 5.5 * pScale, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${accentRgb}, 0.35)`;
        ctx.fill();
      }
    }

    // Depth Sorting: Render back to front
    const sortedNodes = [...this.nodes].sort((a, b) => b.transformedZ - a.transformedZ);

    for (const node of sortedNodes) {
      const r = Math.max(3, node.baseRadius * node.screenScale);
      const isHovered = this.hoveredNode === node;
      const isSelected = this.selectedNode === node;

      // Halo / Specular Glow for hovered or selected nodes
      if (isHovered || isSelected) {
        const glowGrad = ctx.createRadialGradient(
          node.screenX,
          node.screenY,
          r * 0.6,
          node.screenX,
          node.screenY,
          r * 2.2
        );
        glowGrad.addColorStop(0, `rgba(${accentRgb}, 0.35)`);
        glowGrad.addColorStop(1, `rgba(${accentRgb}, 0)`);
        ctx.beginPath();
        ctx.arc(node.screenX, node.screenY, r * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = glowGrad;
        ctx.fill();
      }

      // Main Node Body with 3D Spherical Volume & Specular Highlight
      const sphereGrad = ctx.createRadialGradient(
        node.screenX - r * 0.35,
        node.screenY - r * 0.35,
        r * 0.05,
        node.screenX,
        node.screenY,
        r
      );
      sphereGrad.addColorStop(0, '#ffffff');
      sphereGrad.addColorStop(0.25, node.color);
      sphereGrad.addColorStop(1, shadeColor(node.color, -35));

      ctx.beginPath();
      ctx.arc(node.screenX, node.screenY, r, 0, Math.PI * 2);
      ctx.fillStyle = sphereGrad;
      ctx.globalAlpha = isHovered ? 1.0 : Math.max(0.25, node.alpha);
      ctx.fill();

      // Node Rim Light / Specular Edge
      ctx.strokeStyle = isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = isHovered ? 2 : 1.2;
      ctx.stroke();
      ctx.globalAlpha = 1.0;

      // Typography Label for near/focused nodes
      if (node.transformedZ > -80 || isHovered || isSelected) {
        ctx.font = `600 ${Math.floor(11 * node.screenScale)}px var(--font-sans, system-ui, -apple-system, sans-serif)`;
        ctx.fillStyle = isHovered ? '#ffffff' : 'rgba(240, 240, 255, 0.88)';
        ctx.textAlign = 'center';
        ctx.fillText(node.title, node.screenX, node.screenY + r + 14 * node.screenScale);
      }
    }
  }

  /**
   * Release resources, remove event listeners, and stop animation loop
   */
  dispose() {
    this.isDisposed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);

    if (this.canvas?.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.nodes = [];
    this.edges = [];
    this.coordinateRings = [];
    this.pulses = [];
    this.stars = [];
  }
}
