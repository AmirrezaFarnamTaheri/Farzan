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
  keys = ['label', 'description', 'searchText', 'category'],
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
