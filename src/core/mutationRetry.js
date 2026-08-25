/**
 * Automatic mutation retry for IndexedDB-backed persistence.
 *
 * IndexedDB mutations fail transiently for reasons outside the caller's
 * control: a version-change event aborts in-flight transactions, quota
 * pressure evicts data mid-write, a tab regains visibility and its stale
 * transaction is already closed. Retrying the whole mutation (fresh
 * transaction) resolves every one of those; surfacing them as hard errors
 * does not. This module classifies which failures are transient, runs an
 * operation again with exponential backoff + full jitter, and reports each
 * retry through an optional hook so callers can log or free storage first.
 *
 * Non-transient failures (bad keys, uncloneable payloads, constraint
 * violations, read-only stores) are re-thrown immediately — retrying them
 * would just burn time on a deterministic error.
 */

const DEFAULTS = Object.freeze({
  retries: 3,
  baseDelayMs: 50,
  maxDelayMs: 2000,
});

/** DOMException names whose failure mode a fresh transaction can clear. */
const RETRYABLE_ERROR_NAMES = new Set([
  'TransactionInactiveError',
  'InvalidStateError',
  'AbortError',
  'QuotaExceededError',
  'UnknownError',
]);

/**
 * Module-level configuration. `beforeRetry` may be replaced at runtime
 * (e.g. mediaStorage registers an evictor that frees blob space when the
 * failure was quota-related); it receives ({ error, attempt }) and may be
 * async — its promise is awaited before the next attempt starts.
 */
let configured = { beforeRetry: null };

export function configureMutationRetry(options = {}) {
  if ('beforeRetry' in options) {
    configured.beforeRetry =
      typeof options.beforeRetry === 'function' ? options.beforeRetry : null;
  }
  return () => {
    configured = { beforeRetry: null };
  };
}

/**
 * True when re-running the same mutation could plausibly succeed.
 * Deliberately conservative: anything unrecognized is treated as permanent.
 */
export function isRetryableMutationError(error) {
  if (!error || typeof error !== 'object') return false;
  const name = error.name || '';
  if (RETRYABLE_ERROR_NAMES.has(name)) return true;
  // Some engines wrap IDB errors; fall back to legacy numeric codes for the
  // well-known quota case (DOMException QUOTA_EXCEEDED_ERR = 22).
  if (name === 'DOMException') {
    return error.code === 22;
  }
  return false;
}

/**
 * Exponential backoff with full jitter, capped at maxDelayMs.
 * attempt 0 → [base/2? no:] base..2*base halved range keeps waits small early:
 * delay = random(baseDelayMs * 2^attempt, min(cap, baseDelayMs * 2^(attempt+1)))
 */
export function computeBackoffDelay(attempt, {
  baseDelayMs = DEFAULTS.baseDelayMs,
  maxDelayMs = DEFAULTS.maxDelayMs,
  random = Math.random,
} = {}) {
  const ceiling = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt + 1));
  const floor = Math.min(ceiling, baseDelayMs * Math.pow(2, attempt));
  return Math.floor(floor + random() * (ceiling - floor));
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Run `operation` (an async function performing ONE logical mutation) with
 * automatic retry on transient failures.
 *
 * @param {() => Promise<any>} operation re-invoked from scratch per attempt
 * @param {object} [options]
 * @param {number}   [options.retries]     extra attempts after the first
 * @param {number}   [options.baseDelayMs] first backoff floor
 * @param {number}   [options.maxDelayMs]  backoff cap
 * @param {(error: any) => boolean} [options.shouldRetry]
 * @param {({attempt:number, error:any, delayMs:number}) => void} [options.onRetry]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<any>} the operation's result
 */
export async function withMutationRetry(operation, options = {}) {
  const retries = Number.isInteger(options.retries) ? options.retries : DEFAULTS.retries;
  const baseDelayMs = options.baseDelayMs ?? DEFAULTS.baseDelayMs;
  const maxDelayMs = options.maxDelayMs ?? DEFAULTS.maxDelayMs;
  const shouldRetry = options.shouldRetry ?? isRetryableMutationError;

  let lastError;
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !shouldRetry(error)) throw error;
    }
    const delayMs = computeBackoffDelay(attempt, { baseDelayMs, maxDelayMs });
    options.onRetry?.({ attempt: attempt + 1, error: lastError, delayMs });
    if (configured.beforeRetry) {
      await configured.beforeRetry({ error: lastError, attempt: attempt + 1 });
    }
    await wait(delayMs, options.signal);
  }
}
