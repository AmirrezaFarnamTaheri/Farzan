# FSRS scheduler model contract (pre-launch)

Status: Farzan has never shipped to end users. **FSRS is the only flashcard scheduler.** Historical SM-2 conversion, consent-dialog migration, and rollback archives are intentionally removed from the application.

## Current model and persistence

- All new and imported cards use `scheduler: "fsrs-v5"` with a validated `fsrsState` envelope (`version: 1`, `packageVersion: "5.4.2"`, `model: "fsrs-6"`). The maintained upstream `ts-fsrs@5.4.2` remains pinned to the package lockfile.
- The original four keyboard/rating actions 1/2/4/5 are mapped explicitly to library ratings 1/2/3/4, not passed through as arbitrary integers.
- Due checks use exact UTC ISO timestamps, including short learning steps. The YYYY-MM-DD label may be displayed for convenience but never determines due membership.
- Persist canonical flashcards under the `ocd_flashcards` setting. An IndexedDB write failure or explicit refusal cannot be treated as a successful fallback save.
- Portable backup JSON includes FSRS state and review logs, but does not contain imported PDF/video binary bytes. Export/import validation must reject unknown scheduler versions, missing state and obsolete SM-2 fields rather than changing dates.
- Startup does not perform retroactive browser-data conversion. User-initiated export, import, recovery and atomic rollback after a failed import remain available.

## Changing the scheduling model after launch

A future FSRS version must introduce a distinct version identifier and a documented state transformation rather than relabeling existing envelopes. Before any such change, test UTC due times, review-log consistency, key input, canonical write acknowledgement, read-after-write, offline behavior, cross-tab conflicts and partial import failure. From the first public release onward, treat prior released exports as supported user data and require an explicit migration/backup plan before removing readers.

## Pre-release qualification

Run full exact-commit unit/integration tests, Chromium offline/keyboard/RTL/mobile tests and a native Windows release. Confirm fresh-profile card creation, grading, Anki import, export/import and due metrics, and do not promote the release with unknown/legacy records silently accepted.

Related: issue #129 and PR #295.
