/**
 * Local, versioned Tags taxonomy. Aliases are presentation-only: merging two
 * facets never rewrites Notes, PDF metadata, or upstream catalog records.
 *
 * It is intentionally stored apart from the original tags, so a future
 * migration can always reconstruct the pre-merge source data or roll back
 * this taxonomy by changing one setting.
 */
import { normalizeSearchQuery } from '../core/searchRanking.js';

export const TAG_TAXONOMY_KEY = 'ocd_tag_taxonomy';
const MAX_LABEL_LENGTH = 80;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function normalizeLabel(value) {
  if (typeof value !== 'string') throw new TypeError('A tag label must be text');
  const label = value.trim().replace(/\s+/g, ' ');
  if (!label || label.length > MAX_LABEL_LENGTH) throw new RangeError('A tag label must be 1–80 characters');
  if (Array.from(label).some(char => {
    const code = char.codePointAt(0);
    return code <= 31 || (code >= 127 && code <= 159);
  })) throw new TypeError('Tag labels cannot contain control characters');
  const key = normalizeSearchQuery(label);
  if (!key || UNSAFE_KEYS.has(key)) throw new TypeError('Invalid tag identity');
  return { key, label };
}

function normalizeKey(value) {
  const { key } = normalizeLabel(value);
  if (key !== value) throw new TypeError('Taxonomy identity must be canonical');
  return key;
}

export function resolveTaxonomyKey(taxonomy, rawLabel) {
  const key = normalizeSearchQuery(rawLabel);
  if (!key) return '';
  let current = key;
  const visited = new Set();
  while (Object.prototype.hasOwnProperty.call(taxonomy.aliases, current)) {
    if (visited.has(current)) throw new TypeError('Taxonomy contains an alias cycle');
    visited.add(current);
    current = taxonomy.aliases[current];
  }
  return current;
}

export function parseTagTaxonomy(input) {
  if (input == null) return { version: 1, labels: [], aliases: {} };
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.version !== 1
      || !Array.isArray(input.labels) || !input.aliases
      || typeof input.aliases !== 'object' || Array.isArray(input.aliases)) {
    throw new TypeError('Unsupported tag taxonomy version or structure');
  }
  const labels = [];
  const seenLabels = new Set();
  for (const raw of input.labels) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new TypeError('Invalid taxonomy label record');
    }
    const normalized = normalizeLabel(raw.label);
    if (raw.key !== normalized.key || seenLabels.has(normalized.key)) {
      throw new TypeError('Invalid or duplicate taxonomy label identity');
    }
    seenLabels.add(normalized.key);
    labels.push(normalized);
  }
  const aliases = {};
  for (const [from, to] of Object.entries(input.aliases)) {
    const origin = normalizeKey(from);
    if (typeof to !== 'string') throw new TypeError('Invalid taxonomy alias target');
    const target = normalizeKey(to);
    // Object.fromEntries / defineProperty prevents "__proto__" setter calls.
    Object.defineProperty(aliases, origin, { value: target, enumerable: true, configurable: true, writable: true });
  }
  const taxonomy = { version: 1, labels, aliases };
  for (const key of Object.keys(aliases)) {
    resolveTaxonomyKey(taxonomy, key);
  }
  return taxonomy;
}

export function createTaxonomyTag(current, rawLabel) {
  const taxonomy = parseTagTaxonomy(current);
  const tag = normalizeLabel(rawLabel);
  if (taxonomy.labels.some(label => label.key === tag.key)
      || Object.prototype.hasOwnProperty.call(taxonomy.aliases, tag.key)) {
    throw new TypeError('This tag already exists in the taxonomy');
  }
  return { ...taxonomy, labels: [...taxonomy.labels, tag] };
}

export function mergeTaxonomyTags(current, sourceLabel, destinationLabel) {
  const taxonomy = parseTagTaxonomy(current);
  const source = resolveTaxonomyKey(taxonomy, normalizeLabel(sourceLabel).key);
  const destination = resolveTaxonomyKey(taxonomy, normalizeLabel(destinationLabel).key);
  if (source === destination) throw new TypeError('Cannot merge a tag into itself');
  const aliases = { ...taxonomy.aliases };
  Object.defineProperty(aliases, source, {
    value: destination, enumerable: true, configurable: true, writable: true,
  });
  const labels = taxonomy.labels.some(label => label.key === destination)
    ? taxonomy.labels : [...taxonomy.labels, normalizeLabel(destinationLabel)];
  const result = { ...taxonomy, labels, aliases };
  // Validate all transitive aliases and reject any cycle before persistence.
  return parseTagTaxonomy(result);
}

/**
 * The app's settings DB normally returns a full value. We still verify the
 * canonical read-after-write, because a resolved Promise or a localStorage
 * mirror alone does not prove that a requested mutation was persisted.
 */
export async function persistTagTaxonomy(db, mutate) {
  if (typeof db?.getSetting !== 'function' || typeof db?.saveSetting !== 'function') {
    throw new Error('Canonical tag taxonomy storage is unavailable');
  }
  const current = parseTagTaxonomy(await db.getSetting(TAG_TAXONOMY_KEY));
  const next = parseTagTaxonomy(mutate(current));
  const receipt = await db.saveSetting(TAG_TAXONOMY_KEY, next);
  if (receipt === false || receipt?.committed === false || receipt?.status === 'failed') {
    throw new Error('Tag taxonomy write was not acknowledged');
  }
  const verified = parseTagTaxonomy(await db.getSetting(TAG_TAXONOMY_KEY));
  if (JSON.stringify(verified) !== JSON.stringify(next)) {
    throw new Error('Tag taxonomy was not saved durably');
  }
  return verified;
}
