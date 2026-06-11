const REGISTRY_KEY = 'plasma-plugins-registry';
const ID_RE = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+){1,}$/;
const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i;
const SAFE_ENTRY_RE = /^[a-z0-9][a-z0-9._/-]*\.m?js$/i;

const PERMISSIONS = new Set(['notes', 'courses', 'progress', 'media', 'studio', 'ai', 'network', 'files', 'commands', 'widgets']);
const EXTENSIONS = new Set(['command', 'noteAction', 'dashboardWidget', 'importer', 'exporter', 'aiProvider', 'studioTool', 'courseMetadata']);
const TYPES = new Set(['declarative', 'worker']);

function err(message) {
  const error = new Error(message);
  error.name = 'PluginManifestError';
  return error;
}

function cleanString(value) {
  return String(value || '').trim();
}

function uniqueAllowed(values, allowed, label) {
  const output = [];
  for (const value of Array.isArray(values) ? values : []) {
    const item = cleanString(value);
    if (!allowed.has(item)) throw err(`Unsupported plugin ${label}: ${item || '(blank)'}`);
    if (!output.includes(item)) output.push(item);
  }
  return output;
}

function validateEntry(entry) {
  const value = cleanString(entry);
  if (!SAFE_ENTRY_RE.test(value) || value.includes('..') || value.startsWith('/') || /^[a-z]+:/i.test(value)) {
    throw err('Plugin entry must be a safe relative JavaScript path');
  }
  return value.replace(/\/+/g, '/');
}

function validateOrigins(network = {}) {
  const origins = Array.isArray(network.allowedOrigins) ? network.allowedOrigins : [];
  return origins.map((origin) => {
    const url = new URL(cleanString(origin));
    if (!['http:', 'https:'].includes(url.protocol) || url.origin === 'null') {
      throw err(`Unsupported plugin network origin: ${origin}`);
    }
    return url.origin;
  }).filter((origin, index, list) => list.indexOf(origin) === index);
}

export function validatePluginManifest(manifest = {}) {
  const id = cleanString(manifest.id).toLowerCase();
  const name = cleanString(manifest.name);
  const version = cleanString(manifest.version);
  const type = TYPES.has(manifest.type) ? manifest.type : 'declarative';
  if (!ID_RE.test(id)) throw err('Plugin id must use a stable dotted or dashed namespace');
  if (!name) throw err('Plugin name is required');
  if (!VERSION_RE.test(version)) throw err('Plugin version must be semantic');
  const permissions = uniqueAllowed(manifest.permissions, PERMISSIONS, 'permission');
  const extensionPoints = uniqueAllowed(manifest.extensionPoints, EXTENSIONS, 'extension point');
  const allowedOrigins = validateOrigins(manifest.network);
  if (allowedOrigins.length && !permissions.includes('network')) {
    throw err('Network origins require the network permission');
  }
  return {
    id,
    name,
    version,
    description: cleanString(manifest.description),
    author: cleanString(manifest.author),
    entry: validateEntry(manifest.entry),
    type,
    permissions,
    extensionPoints,
    network: { allowedOrigins },
  };
}

function normalizeRegistry(value) {
  const plugins = Array.isArray(value?.plugins) ? value.plugins : Array.isArray(value) ? value : [];
  return {
    version: 1,
    plugins: plugins.map((item) => ({
      ...validatePluginManifest(item.manifest || item),
      enabled: item.enabled === true,
      installedAt: Number(item.installedAt) || Date.now(),
      packageHash: cleanString(item.packageHash),
    })),
  };
}

export function createPluginHost(root = window) {
  async function loadRegistry() {
    const saved = await Promise.resolve(root.DB?.getSetting?.(REGISTRY_KEY));
    return normalizeRegistry(saved);
  }

  async function saveRegistry(registry) {
    const clean = normalizeRegistry(registry);
    await Promise.resolve(root.DB?.saveSetting?.(REGISTRY_KEY, clean));
    root.PlasmaDeck?.bus?.emit?.('plugins:registry-changed', { count: clean.plugins.length });
    return clean;
  }

  async function list() {
    return (await loadRegistry()).plugins.map(item => ({ ...item }));
  }

  async function installManifest(manifest, options = {}) {
    const cleanManifest = validatePluginManifest(manifest);
    const registry = await loadRegistry();
    const next = {
      manifest: cleanManifest,
      enabled: options.enabled === true,
      installedAt: Number(options.installedAt) || Date.now(),
      packageHash: cleanString(options.packageHash),
    };
    registry.plugins = registry.plugins.filter(item => item.id !== cleanManifest.id);
    registry.plugins.push(next);
    await saveRegistry(registry);
    return { ...next };
  }

  async function setEnabled(id, enabled) {
    const registry = await loadRegistry();
    const plugin = registry.plugins.find(item => item.id === cleanString(id).toLowerCase());
    if (!plugin) throw err('Plugin is not installed');
    plugin.enabled = enabled === true;
    await saveRegistry(registry);
    return { ...plugin };
  }

  async function uninstall(id) {
    const registry = await loadRegistry();
    const target = cleanString(id).toLowerCase();
    const before = registry.plugins.length;
    registry.plugins = registry.plugins.filter(item => item.id !== target);
    if (registry.plugins.length === before) throw err('Plugin is not installed');
    await saveRegistry(registry);
    return true;
  }

  async function extensions(type = null) {
    const wanted = cleanString(type);
    return (await list()).filter((plugin) => (
      plugin.enabled && (!wanted || plugin.extensionPoints.includes(wanted))
    ));
  }

  return {
    validateManifest: validatePluginManifest,
    loadRegistry,
    list,
    installManifest,
    enable: id => setEnabled(id, true),
    disable: id => setEnabled(id, false),
    uninstall,
    extensions,
  };
}

export function initPluginHost(root = window) {
  const pd = root.PlasmaDeck = root.PlasmaDeck || {};
  if (!pd.PluginHost) pd.PluginHost = createPluginHost(root);
  return pd.PluginHost;
}
