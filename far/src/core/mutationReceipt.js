/**
 * Durable mutation receipt primitives.
 *
 * Persistence layers return immutable receipts only after the authoritative
 * commit, rollback, or failure state is known.
 */

let nextMutationId = 0;

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function freezeDetails(value, seen = new WeakMap()) {
  if (!value || typeof value !== 'object') return value ?? null;
  if (!Array.isArray(value) && !isPlainObject(value)) return value;

  const existing = seen.get(value);
  if (existing) return existing;

  if (Array.isArray(value)) {
    const copy = [];
    seen.set(value, copy);
    for (const item of value) copy.push(freezeDetails(item, seen));
    return Object.freeze(copy);
  }

  const copy = Object.create(Object.getPrototypeOf(value));
  seen.set(value, copy);
  for (const [key, item] of Object.entries(value)) copy[key] = freezeDetails(item, seen);
  return Object.freeze(copy);
}

export function createMutationReceipt({
  committed = false,
  status = committed ? 'committed' : 'failed',
  revision = null,
  previousRevision = null,
  expectedRevision = null,
  backend = null,
  operation = null,
  durable = committed,
  degraded = false,
  error = null,
  details = null,
  rollback = null,
} = {}) {
  return Object.freeze({
    id: `mutation-${Date.now().toString(36)}-${++nextMutationId}`,
    committed: Boolean(committed),
    status,
    revision,
    previousRevision,
    expectedRevision,
    backend,
    operation,
    durable: Boolean(durable),
    degraded: Boolean(degraded),
    error: error == null ? null : String(error),
    details: freezeDetails(details),
    rollback: freezeDetails(rollback),
    timestamp: Date.now(),
  });
}

export function committedReceipt(data = {}) {
  return createMutationReceipt({ ...data, committed: true, status: 'committed', durable: data.durable ?? true });
}

export function failedReceipt(data = {}) {
  return createMutationReceipt({ ...data, committed: false, status: 'failed', durable: false });
}

export function conflictReceipt(data = {}) {
  return createMutationReceipt({ ...data, committed: false, status: 'conflict', durable: false });
}

export function rolledBackReceipt(data = {}) {
  return createMutationReceipt({ ...data, committed: false, status: 'rolled-back', durable: true });
}

export class MutationConflictError extends Error {
  constructor(message, receipt = conflictReceipt()) {
    super(message || 'Mutation revision conflict');
    this.name = 'MutationConflictError';
    this.code = 'MUTATION_CONFLICT';
    this.receipt = receipt;
  }
}
