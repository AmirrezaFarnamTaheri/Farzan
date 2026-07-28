/**
 * Durable mutation receipt primitives.
 *
 * Persistence layers should return receipts rather than success-shaped values
 * before a commit is known to have completed.
 */

let nextMutationId = 0;

export function createMutationReceipt({
  committed = false,
  revision = null,
  backend = null,
  operation = null,
  error = null,
} = {}) {
  return Object.freeze({
    id: `mutation-${Date.now().toString(36)}-${++nextMutationId}`,
    committed,
    revision,
    backend,
    operation,
    error,
    timestamp: Date.now(),
  });
}

export function committedReceipt(data = {}) {
  return createMutationReceipt({ ...data, committed: true });
}

export function failedReceipt(data = {}) {
  return createMutationReceipt({ ...data, committed: false });
}
