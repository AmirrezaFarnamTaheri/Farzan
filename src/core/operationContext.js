/**
 * Operation context for async lifecycle ownership.
 *
 * Every long-lived async action should carry enough identity to reject stale
 * completion after navigation, reload, replacement, or resource mutation.
 */

let nextOperationId = 0;

export function createOperationContext({
  resource = null,
  revision = null,
  generation = 0,
  authority = null,
  signal = null,
} = {}) {
  const id = `op-${Date.now().toString(36)}-${++nextOperationId}`;
  let current = true;

  return {
    id,
    resource,
    revision,
    generation,
    authority,
    signal,
    invalidate() {
      current = false;
    },
    isCurrent() {
      return current && !(signal?.aborted);
    },
    assertCurrent() {
      if (!this.isCurrent()) {
        const error = new Error('Stale operation result rejected');
        error.code = 'STALE_OPERATION';
        throw error;
      }
    },
  };
}

export function isStaleOperation(error) {
  return error?.code === 'STALE_OPERATION';
}

if (typeof window !== 'undefined') {
  window.OpenCourseDeck = window.OpenCourseDeck ?? {};
  window.OpenCourseDeck.createOperationContext = createOperationContext;
}
