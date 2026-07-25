/**
 * CanvasTreemap — hierarchical rectangles proportional to value.
 * Labels inside rectangles, color by category.
 *
 * Usage:
 *   const tm = new CanvasTreemap(canvas);
 *   tm.render({ children: [{ name: 'A', value: 100, children: [...] }] });
 *   tm.destroy();
 */

export class CanvasTreemap {
  constructor(canvas, options = {}) {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._padding = Number(options.padding) || 2;
    this._labelPadding = Number(options.labelPadding) || 6;
    this._fontFamily = options.fontFamily || 'sans-serif';
    this._baseFontSize = Number(options.fontSize) || 12;
    this._hoverNode = null;
    this._onClick = typeof options.onClick === 'function' ? options.onClick : null;
    this._data = null;
    this._leaves = [];

    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundClick = this._onClickEvent.bind(this);
    this._canvas.addEventListener('mousemove', this._boundMouseMove);
    this._canvas.addEventListener('click', this._boundClick);

    const colors = [
      '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
      '#f43f5e', '#ef4444', '#f97316', '#f59e0b', '#eab308',
      '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
      '#0ea5e9', '#3b82f6', '#6366f1',
    ];
    this._colors = options.colors || colors;
    this._colorMap = new Map();
  }

  render(data) {
    this._data = data;
    this._leaves = [];
    this._colorMap.clear();
    this._assignColors(data, 0);
    this._layout();
    this._draw();
  }

  _assignColors(node, depth) {
    if (!node) return;
    if (!node.children || !node.children.length) {
      if (!this._colorMap.has(node.name)) {
        this._colorMap.set(node.name, this._colors[this._colorMap.size % this._colors.length]);
      }
      return;
    }
    for (const child of node.children) {
      this._assignColors(child, depth + 1);
    }
  }

  _layout() {
    const canvas = this._canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.width / dpr;
    const h = canvas.clientHeight || canvas.height / dpr;
    canvas.width = w * dpr;
    canvas.height = h * dpr;

    this._width = w;
    this._height = h;

    if (!this._data) return;

    const values = [];
    this._flatten(this._data, values);
    this._leaves = values;

    if (!values.length) return;

    const totalValue = values.reduce((s, v) => s + v.value, 0);
    if (totalValue <= 0) return;

    this._squarify(values, { x: 0, y: 0, w, h }, totalValue);
  }

  _flatten(node, result) {
    if (!node) return;
    const children = node.children || [];
    if (!children.length) {
      result.push({
        name: node.name || '?',
        value: Math.max(0, Number(node.value) || 0),
        color: this._colorMap.get(node.name) || '#6366f1',
        x: 0, y: 0, w: 0, h: 0,
        category: node.category || '',
        data: node,
      });
      return;
    }
    for (const child of children) {
      this._flatten(child, result);
    }
  }

  _squarify(items, rect, totalValue) {
    if (!items.length) return;
    items.sort((a, b) => b.value - a.value);
    this._layoutRow(items, rect, totalValue);
  }

  _layoutRow(items, rect, totalValue) {
    if (!items.length) return;
    const { x, y, w, h } = rect;
    const pad = this._padding;

    if (w <= 0 || h <= 0) return;

    const isWide = w >= h;
    const side = isWide ? h : w;

    let row = [items[0]];
    let rowSum = items[0].value;
    let bestRatio = this._worstRatio(row, side, rowSum, totalValue);

    for (let i = 1; i < items.length; i++) {
      row.push(items[i]);
      const nextSum = rowSum + items[i].value;
      const nextRatio = this._worstRatio(row, side, nextSum, totalValue);
      if (nextRatio <= bestRatio) {
        rowSum = nextSum;
        bestRatio = nextRatio;
      } else {
        row.pop();
        break;
      }
    }

    const rowFraction = rowSum / totalValue;
    let offset = 0;

    for (const item of row) {
      const itemFraction = item.value / totalValue;
      const itemSize = (itemFraction / rowFraction);

      if (isWide) {
        item.x = x + pad;
        item.y = y + offset * side + pad;
        item.w = w * rowFraction - pad * 2;
        item.h = side * itemSize - pad * 2;
      } else {
        item.x = x + offset * side + pad;
        item.y = y + pad;
        item.w = side * itemSize - pad * 2;
        item.h = h * rowFraction - pad * 2;
      }

      offset += itemSize;
    }

    const remaining = items.splice(row.length);
    if (!remaining.length) return;

    const remainingTotal = totalValue - rowSum;
    let nextRect;
    if (isWide) {
      nextRect = { x: x + w * rowFraction, y, w: w * (1 - rowFraction), h };
    } else {
      nextRect = { x, y: y + h * rowFraction, w, h: h * (1 - rowFraction) };
    }

    this._squarify(remaining, nextRect, remainingTotal);
  }

  _worstRatio(row, side, rowSum, totalValue) {
    const rowFraction = rowSum / totalValue;
    const rowArea = side * side * rowFraction;
    let worst = 0;
    for (const item of row) {
      const itemFraction = item.value / rowSum;
      const itemArea = rowArea * itemFraction;
      const itemSide = rowArea > 0 ? Math.max(itemArea, rowArea / (itemArea || 1)) : 1;
      worst = Math.max(worst, itemSide);
    }
    return worst;
  }

  _draw() {
    const ctx = this._ctx;
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this._width, this._height);

    if (!this._leaves.length) return;

    for (const leaf of this._leaves) {
      if (leaf.w <= 0 || leaf.h <= 0) continue;

      const isHover = leaf === this._hoverNode;
      ctx.fillStyle = leaf.color;
      ctx.globalAlpha = isHover ? 1 : 0.85;
      ctx.fillRect(leaf.x, leaf.y, leaf.w, leaf.h);

      if (isHover) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(leaf.x, leaf.y, leaf.w, leaf.h);
      }

      ctx.globalAlpha = 1;

      // Label
      if (leaf.w > 30 && leaf.h > 20) {
        const fontSize = Math.min(this._baseFontSize, leaf.h / 3, leaf.w / 6);
        const lp = this._labelPadding;
        ctx.font = `${fontSize}px ${this._fontFamily}`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const maxTextW = leaf.w - lp * 2;
        let text = leaf.name;
        const measured = ctx.measureText(text);
        if (measured.width > maxTextW) {
          while (text.length > 1 && ctx.measureText(text + '…').width > maxTextW) {
            text = text.slice(0, -1);
          }
          text += '…';
        }
        ctx.fillText(text, leaf.x + lp, leaf.y + lp);

        if (leaf.h > 36) {
          ctx.font = `${Math.max(9, fontSize - 2)}px ${this._fontFamily}`;
          ctx.globalAlpha = 0.7;
          ctx.fillText(String(leaf.value), leaf.x + lp, leaf.y + lp + fontSize + 2);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  _onMouseMove(e) {
    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const prev = this._hoverNode;
    this._hoverNode = null;
    for (let i = this._leaves.length - 1; i >= 0; i--) {
      const leaf = this._leaves[i];
      if (mx >= leaf.x && mx <= leaf.x + leaf.w && my >= leaf.y && my <= leaf.y + leaf.h) {
        this._hoverNode = leaf;
        break;
      }
    }
    this._canvas.style.cursor = this._hoverNode ? 'pointer' : 'default';
    if (this._hoverNode !== prev) this._draw();
  }

  _onClickEvent(_e) {
    if (!this._onClick || !this._hoverNode) return;
    this._onClick(this._hoverNode.data, this._hoverNode);
  }

  destroy() {
    this._canvas.removeEventListener('mousemove', this._boundMouseMove);
    this._canvas.removeEventListener('click', this._boundClick);
    this._leaves = [];
    this._data = null;
  }
}
