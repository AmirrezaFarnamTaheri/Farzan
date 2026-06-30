/**
 * Canvas Tool Registry — register/get tools dynamically.
 */

const _tools = new Map();

/**
 * Register a tool.
 * @param {Object} tool — must have { name }
 */
export function registerTool(tool) {
  if (!tool?.name) throw new Error('Tool must have a name');
  _tools.set(tool.name, tool);
}

/**
 * Get a tool by name.
 * @param {string} name
 * @returns {Object|undefined}
 */
export function getTool(name) {
  return _tools.get(name);
}

/**
 * Get all registered tool names.
 * @returns {string[]}
 */
export function getToolNames() {
  return [..._tools.keys()];
}

/**
 * Check if a tool is registered.
 * @param {string} name
 * @returns {boolean}
 */
export function hasTool(name) {
  return _tools.has(name);
}
