'use strict';

/**
 * Local-only portable backup comparison for a user-consented restore dry run.
 * Does not read a live browser profile, write files, upload data, transform
 * schedules, or assert that a JSON export contains imported media binaries.
 *
 * Usage:
 *   node scripts/verify-portable-backup.cjs before.json restored.json
 */
const { createHash } = require('node:crypto');
const fs = require('node:fs');

const ARRAY_SECTIONS = Object.freeze([
  'progress', 'notes', 'folders', 'annotations', 'timestamps',
  'watchedSegments', 'pdfBookmarks',
]);

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort()
      .filter(key => value[key] !== undefined)
      .map(key => JSON.stringify(key) + ':' + canonical(value[key]))
      .join(',') + '}';
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function sortedRecords(records, section) {
  if (!Array.isArray(records)) throw new TypeError('Portable backup ' + section + ' must be an array');
  const seen = new Set();
  const normalized = records.map(record => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new TypeError('Portable backup ' + section + ' has an invalid record');
    }
    const id = record.id ?? record.topicId ?? record.key;
    if (id !== undefined && id !== null) {
      const key = String(id);
      if (seen.has(key)) throw new TypeError('Portable backup ' + section + ' contains a duplicate stable ID');
      seen.add(key);
    }
    return record;
  });
  return normalized.sort((a, b) => {
    const key = record => String(record.id ?? record.topicId ?? record.key ?? digest(record));
    return key(a).localeCompare(key(b));
  });
}

function summarizePortableBackup(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Portable backup must be a JSON object');
  }
  if (input.version !== '1.6') throw new TypeError('Unsupported portable backup version (require 1.6)');
  if (!input.settings || typeof input.settings !== 'object' || Array.isArray(input.settings)) {
    throw new TypeError('Portable backup settings are unavailable');
  }
  // Every first-party v1.6 app-data export contains all eight canonical
  // settings sections, even when an empty section is explicitly null. Missing
  // fields cannot be interpreted as zero data during recovery certification.
  for (const key of [
    'notes', 'playlists', 'studio', 'flashcards',
    'library', 'myCourses', 'mediaCues', 'tagTaxonomy',
  ]) {
    if (!Object.hasOwn(input.settings, key)) {
      throw new TypeError('Portable backup settings section is missing: ' + key);
    }
  }
  const attachments = input.meta?.attachments;
  if (!attachments || attachments.mode !== 'metadata-only'
    || attachments.binaryIncluded !== false || !Array.isArray(attachments.references)) {
    throw new TypeError('Portable backup attachments manifest is invalid');
  }
  const counts = {};
  const digests = {};
  for (const section of ARRAY_SECTIONS) {
    const records = sortedRecords(input[section], section);
    counts[section] = records.length;
    digests[section] = digest(records);
  }
  const cards = input.settings.flashcards == null ? []
    : sortedRecords(input.settings.flashcards, 'flashcards');
  for (const card of cards) {
    if (card.scheduler != null && !['sm2-v1', 'fsrs-v5'].includes(card.scheduler)) {
      throw new TypeError('Unknown portable backup flashcards scheduler');
    }
    if (card.scheduler === 'fsrs-v5' && (!card.fsrsState || typeof card.fsrsState !== 'object')) {
      throw new TypeError('Invalid portable backup FSRS state');
    }
  }
  counts.flashcards = cards.length;
  counts.fsrsV5 = cards.filter(card => card.scheduler === 'fsrs-v5').length;
  counts.sm2Legacy = cards.length - counts.fsrsV5;
  counts.migrationArchives = cards.filter(card => card.fsrsMigration != null).length;
  digests.flashcards = digest(cards);
  // Compare settings other than flashcards independently, so recovery
  // reports only a section name and never prints private record content.
  const { flashcards: _cards, ...otherSettings } = input.settings;
  void _cards;
  digests.settings = digest(otherSettings);
  counts.attachments = attachments.references.length;
  digests.attachments = digest(sortedRecords(attachments.references, 'attachments'));

  return { version: '1.6', counts, digests };
}

function comparePortableBackups(original, restored) {
  const before = summarizePortableBackup(original);
  const after = summarizePortableBackup(restored);
  const keys = [...new Set([...Object.keys(before.digests), ...Object.keys(after.digests)])].sort();
  const mismatches = keys.filter(key =>
    before.digests[key] !== after.digests[key]);
  return { ok: mismatches.length === 0, mismatches, before, after };
}

function main(argv = process.argv) {
  if (argv.length !== 4) {
    throw new Error('Usage: node scripts/verify-portable-backup.cjs before.json restored.json');
  }
  // Read only from explicitly named local paths. Do not log the paths, JSON
  // records, IDs or note contents, even on invalid input.
  const before = JSON.parse(fs.readFileSync(argv[2], 'utf8'));
  const restored = JSON.parse(fs.readFileSync(argv[3], 'utf8'));
  const report = comparePortableBackups(before, restored);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  try { main(); } catch {
    // JSON.parse errors may quote a fragment of a private note or card.
    // Never echo exception messages, input paths or user content.
    console.error('[backup-verify] Invalid or incompatible backup input; no data was modified.');
    process.exitCode = 1;
  }
}

module.exports = { summarizePortableBackup, comparePortableBackups, main };
