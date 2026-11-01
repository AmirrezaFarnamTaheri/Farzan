/**
 * Canonical FSRS-6 scheduler using pinned ts-fsrs 5.4.2.
 *
 * fsrs-v5 names the *package API generation*; fsrs-6 names its scheduling
 * model. Date instances become UTC ISO strings before storage.
 * This module is loaded lazily only for flashcard creation/reviews.
 */
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';

const PACKAGE_VERSION = '5.4.2';
const MODEL = 'fsrs-6';
const CARD_KEYS = [
  'stability', 'difficulty', 'elapsed_days', 'scheduled_days',
  'learning_steps', 'reps', 'lapses', 'state',
];
const RATING_MAP = Object.freeze({
  1: Rating.Again,
  2: Rating.Hard,
  4: Rating.Good,
  5: Rating.Easy,
});

// Deterministic outcomes are essential for replay, test fixtures, backup and
// comparing schedules. Keep explicit short learning steps: they must use exact
// timestamps, never calendar-day approximations.
const scheduler = fsrs({
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ['1m', '10m'],
  relearning_steps: ['10m'],
});

function validDate(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError(`Invalid FSRS ${label}`);
  return date;
}

function iso(value, label) {
  return validDate(value, label).toISOString();
}

export function ratingFromUiGrade(grade) {
  if (!Number.isInteger(grade) || !Object.hasOwn(RATING_MAP, grade)) {
    throw new RangeError('FSRS expects one of Farzan grades 1, 2, 4, 5');
  }
  return RATING_MAP[grade];
}

function serializeCard(card) {
  if (!card || typeof card !== 'object') throw new TypeError('Invalid FSRS card');
  const serialized = {
    due: iso(card.due, 'due time'),
    last_review: card.last_review == null ? null : iso(card.last_review, 'last review'),
  };
  for (const key of CARD_KEYS) {
    const value = card[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new TypeError(`Invalid FSRS field: ${key}`);
    }
    serialized[key] = value;
  }
  if (!Number.isInteger(card.state) || card.state > 3) {
    throw new TypeError('Invalid FSRS card state');
  }
  return serialized;
}

/** Validate the exact persisted envelope without changing it. */
export function assertFsrsV5State(state) {
  if (!state || state.version !== 1 || state.packageVersion !== PACKAGE_VERSION || state.model !== MODEL) {
    throw new TypeError('Unsupported FSRS scheduler snapshot');
  }
  if (!Array.isArray(state.reviewLog)) throw new TypeError('Invalid FSRS review log');
  if (typeof state.card?.due !== 'string' || !state.card.due.endsWith('Z')) {
    throw new TypeError('Invalid stored FSRS UTC due time');
  }
  if (state.card.last_review != null &&
      (typeof state.card.last_review !== 'string' || !state.card.last_review.endsWith('Z'))) {
    throw new TypeError('Invalid stored FSRS last-review time');
  }
  serializeCard(state.card);
  for (const log of state.reviewLog) {
    const review = log?.review;
    const instant = typeof review === 'string' ? Date.parse(review) : NaN;
    // The pinned FSRS adapter serializes review instants with toISOString().
    // An offset or date-only value can parse but must not be silently treated
    // as a canonical UTC review-history record during a backup restore.
    if (!log || ![1, 2, 3, 4].includes(log.rating)
        || !Number.isFinite(instant) || new Date(instant).toISOString() !== review) {
      throw new TypeError('Corrupt FSRS review history');
    }
  }
  return state;
}

function deserializeCard(state) {
  assertFsrsV5State(state);
  const { due, last_review: lastReview, ...numbers } = state.card;
  return {
    ...numbers,
    due: validDate(due, 'due time'),
    ...(lastReview ? { last_review: validDate(lastReview, 'last review') } : {}),
  };
}

export function createFsrsV5State(now = new Date()) {
  const fresh = createEmptyCard(validDate(now, 'creation time'));
  return {
    version: 1,
    packageVersion: PACKAGE_VERSION,
    model: MODEL,
    card: serializeCard(fresh),
    reviewLog: [],
  };
}

export function rateFsrsV5State(state, farzanGrade, now = new Date()) {
  // Validate everything before allowing the upstream scheduling operation.
  const card = deserializeCard(state);
  const grade = ratingFromUiGrade(farzanGrade);
  const instant = validDate(now, 'review time');
  const result = scheduler.next(card, instant, grade);
  const updatedCard = serializeCard(result.card);
  // Library logs contain Date objects; serialize to stable JSON-safe ISO data.
  const log = JSON.parse(JSON.stringify(result.log));
  if (!log || typeof log.review !== 'string' || log.rating !== grade) {
    throw new TypeError('Upstream FSRS returned an invalid review log');
  }
  const next = {
    version: 1,
    packageVersion: PACKAGE_VERSION,
    model: MODEL,
    card: updatedCard,
    reviewLog: [...state.reviewLog, log],
  };
  assertFsrsV5State(next);
  return {
    state: next,
    nextReviewDate: updatedCard.due.slice(0, 10),
  };
}
