/**
 * OpenCourseDeck — knowledgeTrail.js
 * Connected Knowledge Trail Engine
 *
 * Renders active SVG bezier spline connectors linking lecture timestamps
 * directly to Cornell cues, unresolved inquiries, and scheduled SM-2 flashcard reviews.
 */

export class KnowledgeTrail {
  /**
   * Generates an SVG bezier spline between two rectangular element bounding boxes
   * @param {DOMRect} sourceRect
   * @param {DOMRect} targetRect
   * @param {object} [options]
   * @returns {string} SVG path data 'M ... C ...'
   */
  static computeSplinePath(sourceRect, targetRect, options = {}) {
    const isHorizontal = options.orientation !== 'vertical';

    let startX, startY, endX, endY, cp1X, cp1Y, cp2X, cp2Y;

    if (isHorizontal) {
      startX = sourceRect.right;
      startY = sourceRect.top + sourceRect.height / 2;
      endX = targetRect.left;
      endY = targetRect.top + targetRect.height / 2;

      const deltaX = Math.abs(endX - startX) * 0.5;
      cp1X = startX + deltaX;
      cp1Y = startY;
      cp2X = endX - deltaX;
      cp2Y = endY;
    } else {
      startX = sourceRect.left + sourceRect.width / 2;
      startY = sourceRect.bottom;
      endX = targetRect.left + targetRect.width / 2;
      endY = targetRect.top;

      const deltaY = Math.abs(endY - startY) * 0.5;
      cp1X = startX;
      cp1Y = startY + deltaY;
      cp2X = endX;
      cp2Y = endY - deltaY;
    }

    return `M ${startX.toFixed(1)} ${startY.toFixed(1)} C ${cp1X.toFixed(1)} ${cp1Y.toFixed(1)}, ${cp2X.toFixed(1)} ${cp2Y.toFixed(1)}, ${endX.toFixed(1)} ${endY.toFixed(1)}`;
  }

  /**
   * Renders the complete Knowledge Trail overlay in a container
   * @param {HTMLElement} container
   * @param {Array<{fromEl: HTMLElement, toEl: HTMLElement, status?: string}>} connections
   */
  static renderTrailOverlay(container, connections = []) {
    if (!container || !connections.length) return;

    let svg = container.querySelector('.knowledge-trail-overlay');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'knowledge-trail-overlay');
      svg.setAttribute('aria-hidden', 'true');
      svg.style.position = 'absolute';
      svg.style.inset = '0';
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.style.pointerEvents = 'none';
      svg.style.zIndex = '5';
      container.appendChild(svg);
    }

    svg.innerHTML = '';
    const containerRect = container.getBoundingClientRect();

    connections.forEach(({ fromEl, toEl, status = 'active' }) => {
      if (!fromEl || !toEl) return;
      const r1 = fromEl.getBoundingClientRect();
      const r2 = toEl.getBoundingClientRect();

      // Normalize relative to container
      const sRect = {
        left: r1.left - containerRect.left,
        right: r1.right - containerRect.left,
        top: r1.top - containerRect.top,
        bottom: r1.bottom - containerRect.top,
        width: r1.width,
        height: r1.height
      };
      const tRect = {
        left: r2.left - containerRect.left,
        right: r2.right - containerRect.left,
        top: r2.top - containerRect.top,
        bottom: r2.bottom - containerRect.top,
        width: r2.width,
        height: r2.height
      };

      const d = this.computeSplinePath(sRect, tRect);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', status === 'mastered' ? '#047857' : status === 'due' ? '#c2410c' : '#2563eb');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-dasharray', status === 'due' ? '4 3' : 'none');
      path.setAttribute('opacity', '0.75');

      svg.appendChild(path);
    });
  }
}
