import { throttle } from './dom.js';

export class VirtualList {
  constructor({ container, itemHeight = 40, renderItem, items = [], buffer = 5 }) {
    this._container = container;
    this._itemHeight = itemHeight;
    this._renderItem = renderItem;
    this._items = items;
    this._buffer = buffer;
    this._scrollTop = 0;
    this._height = 0;
    this._measuredHeights = new Map();
    this._estimatedHeight = itemHeight;
    this._offsetCache = [];
    this._totalHeight = 0;

    this._viewport = document.createElement('div');
    this._viewport.style.cssText = 'overflow-y:auto;position:relative;width:100%;height:100%;';
    this._viewport.setAttribute('role', 'list');
    this._viewport.setAttribute('aria-label', 'Virtual list');

    this._sentinel = document.createElement('div');
    this._sentinel.style.cssText = 'pointer-events:none;';
    this._viewport.appendChild(this._sentinel);

    this._fragment = document.createDocumentFragment();
    this._renderedRange = { start: -1, end: -1 };
    this._renderedNodes = new Map();
    this._offsetSyncScheduled = false;
    this._destroyed = false;

    this._onScroll = throttle(() => {
      this._scrollTop = this._viewport.scrollTop;
      this._render();
    }, 16);

    this._viewport.addEventListener('scroll', this._onScroll, { passive: true });

    this._resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(entries => {
          for (const entry of entries) {
            if (entry.target === this._container) {
              this._height = entry.contentRect.height;
              this._render();
            }
          }
        })
      : null;

    this._container.appendChild(this._viewport);
    if (this._resizeObserver) this._resizeObserver.observe(this._container);
    this._height = this._container.clientHeight || 400;
    this._rebuildOffsetCache();
    this._render();
  }

  setItems(items) {
    const oldItems = this._items;
    this._items = items || [];
    if (oldItems.length !== this._items.length) {
      this._measuredHeights.clear();
    } else {
      for (let i = 0; i < this._items.length; i++) {
        if (this._items[i] !== oldItems[i]) {
          this._measuredHeights.delete(i);
        }
      }
    }
    this._rebuildOffsetCache();
    this._updateSentinel();
    this._render();
  }

  scrollToIndex(index) {
    if (index < 0 || index >= this._items.length) return;
    const offset = this._getItemOffset(index);
    this._viewport.scrollTop = offset;
    this._scrollTop = offset;
    this._render();
  }

  resize() {
    this._height = this._container.clientHeight || 400;
    this._rebuildOffsetCache();
    this._render();
  }

  _rebuildOffsetCache() {
    const n = this._items.length;
    const cache = new Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      cache[i] = sum;
      sum += this._measuredHeights.get(i) || this._estimatedHeight;
    }
    this._offsetCache = cache;
    this._totalHeight = sum;
  }

  _getItemOffset(index) {
    if (index < this._offsetCache.length) return this._offsetCache[index];
    let offset = this._totalHeight;
    for (let i = this._offsetCache.length; i < index && i < this._items.length; i++) {
      offset += this._measuredHeights.get(i) || this._estimatedHeight;
    }
    return offset;
  }

  _getTotalHeight() {
    return this._totalHeight;
  }

  _getVisibleRange() {
    const scrollTop = this._scrollTop;
    const viewportHeight = this._height;
    let start = 0;
    let offset = 0;

    for (let i = 0; i < this._items.length; i++) {
      const h = this._measuredHeights.get(i) || this._estimatedHeight;
      if (offset + h > scrollTop) {
        start = i;
        break;
      }
      offset += h;
      if (i === this._items.length - 1) start = i;
    }

    let end = start;
    let visibleBottom = offset;
    for (let i = start; i < this._items.length; i++) {
      const h = this._measuredHeights.get(i) || this._estimatedHeight;
      visibleBottom += h;
      end = i;
      if (visibleBottom >= scrollTop + viewportHeight) break;
    }

    const bufferedStart = Math.max(0, start - this._buffer);
    const bufferedEnd = Math.min(this._items.length - 1, end + this._buffer);

    return { start: bufferedStart, end: bufferedEnd, topOffset: this._getItemOffset(bufferedStart) };
  }

  _updateSentinel() {
    this._sentinel.style.height = `${this._getTotalHeight()}px`;
  }

  _render() {
    const range = this._getVisibleRange();

    if (range.start === this._renderedRange.start && range.end === this._renderedRange.end) return;

    const newNodes = new Map();
    const toRemove = [];

    for (const [index, node] of this._renderedNodes) {
      if (index < range.start || index > range.end) {
        toRemove.push(node);
      } else {
        newNodes.set(index, node);
      }
    }

    toRemove.forEach(node => node.remove());

    const insertBefore = (node, index) => {
      const nextNode = this._renderedNodes.get(index + 1) || this._sentinel;
      this._viewport.insertBefore(node, nextNode);
    };

    for (let i = range.start; i <= range.end; i++) {
      if (newNodes.has(i)) continue;
      const item = this._items[i];
      if (!item) continue;

      const node = this._renderItem(item, i);
      if (!(node instanceof HTMLElement)) continue;

      node.style.position = 'absolute';
      node.style.left = '0';
      node.style.right = '0';
      node.style.top = `${this._getItemOffset(i)}px`;
      node.setAttribute('role', 'listitem');
      node.setAttribute('aria-setsize', String(this._items.length));
      node.setAttribute('aria-posinset', String(i + 1));

      const existingHeight = this._measuredHeights.get(i);
      if (!existingHeight) {
        requestAnimationFrame(() => {
          if (node.isConnected) {
            const measured = node.offsetHeight;
            if (measured > 0 && measured !== this._measuredHeights.get(i)) {
              this._measuredHeights.set(i, measured);
              this._estimatedHeight = Math.round(
                (this._estimatedHeight * 0.9) + (measured * 0.1)
              );
              this._scheduleOffsetSync();
            }
          }
        });
      }

      newNodes.set(i, node);
      insertBefore(node, i);
    }

    this._renderedNodes = newNodes;
    this._renderedRange = range;
    this._updateSentinel();
  }

  /**
   * Measured heights shift every offset after the measured row, so retained
   * nodes must be repositioned and the sentinel resized — otherwise rows
   * overlap until the visible range changes. Batched via rAF so a burst of
   * measurements triggers one layout pass.
   * @internal
   */
  _scheduleOffsetSync() {
    if (this._offsetSyncScheduled) return;
    this._offsetSyncScheduled = true;
    requestAnimationFrame(() => {
      this._offsetSyncScheduled = false;
      if (this._destroyed) return;
      this._rebuildOffsetCache();
      for (const [index, node] of this._renderedNodes) {
        node.style.top = `${this._getItemOffset(index)}px`;
      }
      this._updateSentinel();
      this._renderedRange = { start: -1, end: -1 };
      this._render();
    });
  }

  destroy() {
    this._destroyed = true;
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this._viewport.removeEventListener('scroll', this._onScroll);
    this._viewport.remove();
    this._renderedNodes.clear();
    this._measuredHeights.clear();
    this._offsetCache = [];
  }
}
