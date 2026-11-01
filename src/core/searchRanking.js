/**
 * Shared low-cost lexical relevance for navigation, saved-content search and
 * the command palette fallback while its vendored Fuse.js bundle is loading.
 * This module does not replace the worker's fuzzy index or its protocol.
 */
export function normalizeSearchQuery(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    // Equivalent Persian/Arabic keyboard spellings should search alike.
    .replace(/[\u064a\u0649]/g, '\u06cc')
    .replace(/\u0643/g, '\u06a9')
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function rankLexicalMatches(items, query, {
  keys = ['label', 'description', 'searchText', 'category', 'tags', 'keywords'],
  limit = 12,
} = {}) {
  if (!Array.isArray(items)) return [];
  const needle = normalizeSearchQuery(query);
  const cap = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : items.length;
  if (!needle) return items.filter(item => item && typeof item === 'object').slice(0, cap);
  return items.map((item, index) => {
    if (!item || typeof item !== 'object') return null;
    const label = normalizeSearchQuery(item.label);
    let score = Infinity;
    if (label === needle) score = 0;
    else if (label.startsWith(needle)) score = 1;
    else if (label.includes(needle)) score = 2;
    if (!Number.isFinite(score)) {
      for (let i = 0; i < keys.length; i += 1) {
        if (keys[i] === 'label') continue;
        if (normalizeSearchQuery(item[keys[i]]).includes(needle)) {
          score = 3 + i;
          break;
        }
      }
    }
    return Number.isFinite(score) ? { item, index, score } : null;
  }).filter(Boolean)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, cap)
    .map(row => row.item);
}

/**
 * Identify a search result by the underlying learning resource, not by a
 * mutable display title or suggestion wrapper. Callers may supply explicit
 * sourceType/sourceId for records that share a category-local identifier.
 * A label-only fallback is deliberately scoped to category + destination.
 */
export function searchResultIdentity(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const sourceType = normalizeSearchQuery(item.sourceType);
  const sourceId = item.sourceId == null ? '' : String(item.sourceId).trim();
  if (sourceType && sourceId) return `source:${sourceType}:${sourceId}`;
  const category = normalizeSearchQuery(item.category || item.cat);
  const id = item.id == null ? '' : String(item.id).trim();
  if (id) return `id:${category}:${id}`;
  const label = normalizeSearchQuery(item.label || item.title);
  const href = typeof item.href === 'string' ? item.href.trim() : '';
  if (!label && !href) return null;
  return `fallback:${category}:${label}:${href}`;
}

/**
 * Preserve first-ranked results, dropping records for the same resource
 * before the final cap. A generic ID is namespaced to its category, while
 * source-specific IDs survive display-title changes and fuzzy suggestions.
 */
export function dedupeSearchResults(items, { limit = 12 } = {}) {
  if (!Array.isArray(items)) return [];
  const cap = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : items.length;
  const results = [];
  const seen = new Set();
  for (const item of items) {
    if (results.length >= cap) break;
    const key = searchResultIdentity(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    results.push(item);
  }
  return results;
}
