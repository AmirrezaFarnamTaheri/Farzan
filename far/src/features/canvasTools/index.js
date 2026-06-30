/**
 * Canvas Tools Index — registers all built-in tools.
 * Import this file to register all tools with the registry.
 */

import { registerTool, getTool, getToolNames, hasTool } from './registry.js';
import { createToolBase } from './toolBase.js';
import { pen } from './pen.js';
import { eraser } from './eraser.js';
import { select } from './select.js';
import { rect } from './rect.js';
import { circle } from './circle.js';
import { line } from './line.js';
import { arrow } from './arrow.js';
import { text } from './text.js';
import { fill } from './fill.js';

const builtInTools = [pen, eraser, select, rect, circle, line, arrow, text, fill];

for (const tool of builtInTools) {
  registerTool(tool);
}

export { pen, eraser, select, rect, circle, line, arrow, text, fill };
export { registerTool, getTool, getToolNames, hasTool, createToolBase };

if (typeof window !== 'undefined') {
  window.OpenCourseDeck = window.OpenCourseDeck ?? {};
  window.OpenCourseDeck.CanvasTools = { registerTool, getTool, getToolNames, hasTool };
}
