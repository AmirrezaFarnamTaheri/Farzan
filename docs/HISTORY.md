# Repository History & Provenance

## Naming lineage

This project has carried three names:

| Era | Name | Notes |
|---|---|---|
| 2025 – mid 2026 | **Farzan** | Original personal build (named after the owner's brother, for whom it was created). The folder name `Farzan` and the repo URL preserve this era. |
| mid 2026 | **PlasmaDeck / Plasmato era** | Working product name; course content was sourced from Plasmato. Storage keys, the database class (`PlasmaDB`), DOM anchors (`#plasma-app`), and audit documents from this period are documented below. |
| 2026-07-25 → today | **OpenCourseDeck** | General-purpose, content-agnostic courseware platform. Commit `c60a997c` ("promote far/ to project root") marks the restructuring; branding strings were removed through 2026-08-01. |

## Git history boundary

The oldest commit reachable in this repository is `a4e3d222` (2026-07-13), a merge
of pull request #8. Everything before that date — including the original
Farzan-era commits — is not present in this clone's history. It predates a
history reset/re-import whose original refs are no longer available here.
Pre-2026-07-13 facts in these docs come from surviving documents, not commits.

## Deliberately retained legacy identifiers

Some storage identifiers keep their historical names on purpose. They are part
of migration bookkeeping or data-erasure lists, where renaming would either
re-trigger migrations or silently stop wiping old data:

- `bridge.js`: `plasma_progress_v1`, `plasma_timestamps_v1`, `plasma_migrated_v2`,
  `plasma_migrated_ids`, `plasma_migration_report_v3` — versioned localStorage→IndexedDB
  migration checkpoints.
- `plasma-pdf-annotations*` keys (bridge.js, src/core/bridgeHardening.js,
  src/core/pdfIdentityHardening.js) — superseded annotation formats still read,
  wiped, and tested as legacy inputs.
- Legacy key literals inside the erasure lists of `src/core/storageSafety.js` and
  `bridge.js` — they must name every key ever written so a full reset removes all of them.

Everything else was migrated to the neutral `ocd_*` namespace in August 2026:
preferences, notes/folders mirrors, IDB settings records (playlists, studio/canvas
boards, AI settings, notes settings), flashcard storage, pending-session keys,
custom DOM events (`ocd:*`), the app root anchor (`#ocd-app`), the accent id
(`violet`, formerly `plasma`), and the backup file-picker extension (`.ocdbackup`,
with `.plasmabackup` still accepted for old exports).
