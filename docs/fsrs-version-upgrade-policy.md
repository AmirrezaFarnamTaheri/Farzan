# FSRS scheduler upgrade, migration and rollback policy

Status: release-gating policy (2026-11-01). **Not** approval to migrate existing cards, change scheduling versions, remove SM-2, or publish a release.

## Current contract

- New cards explicitly opt into `scheduler: "fsrs-v5"` with state envelope `version: 1`, `packageVersion: "5.4.2"`, and `model: "fsrs-6"`; source package `ts-fsrs@5.4.2` is pinned in the package and lockfile.
- Existing pre-versioned cards and `sm2-v1` retain their original date-only SM-2 review semantics. They are **not** automatically moved to FSRS; the default remains SM-2 unless the user chooses otherwise.
- Each consented SM-2 to FSRS conversion preserves an exact, reviewable archive of the original complete record in `fsrsMigration.legacyCard`. A rollback uses that archive verbatim, even if subsequent FSRS reviews have occurred. Unknown or corrupt scheduler envelopes fail closed.
- FSRS due calculations use exact UTC timestamps; SM-2 due calculations stay date-only. No cross-model synthetic history or guessed review counts.
- JSON backup format 1.6 includes flashcards, archives and settings but **does not** contain user-imported PDF/video binary bytes. Keep the separate media folder/export; preserve original backups throughout migration.

## Required evidence before any scheduling engine upgrade

1. **Decision record:** Pin the candidate package, model, retention policy and release identity. A move to a different package API or model (including hypothetical FSRS-7) must use a **distinct persisted scheduler version** and document what old cards mean. Never relabel old envelopes as new-model states.
2. **Compatibility matrix:** Replay read-only fixtures from legacy SM-2, native FSRS-v5 and consented migrated/rolled-back records across old and new app versions. Include UTF-8/RTL labels, short learning steps, due-time/day boundaries, and malformed and unknown envelope versions.
3. **Consent and backup:** Verify a user-visible preview, explicit per-card consent or a separately approved batch opt-in, exported portable JSON, offline media backup where applicable, complete original-record archive, and a cancelled-consent no-write path. No silent bulk conversion.
4. **Storage transaction:** Demonstrate acknowledged canonical writes, read-after-write equivalence, serialized concurrent edits, cross-tab conflicts and failure rollback. A failed write must never change the displayed scheduler or report success. Never clear a legacy store until verified records are recoverable from the new canonical store and backup.
5. **Real recovery dry run:** On an explicitly consenting, representative populated local profile, export, inspect manifest and card counts, restore into a separate empty browser profile, verify each sampled SM-2, FSRS and rollback archive record and due timestamp, then exercise rollback/reopen. Do not use synthetic tests as a replacement for this step. Do not send private card content to CI.
6. **Acceptance:** Run the full exact-head CI, production/offline Chromium browser flows, mobile and RTL text/keyboard behavior, native Windows installer/profile restore, and exact-`main` release gates. Record before/after counts, checksums, artifact URLs, and any intentionally unsupported records. Require a rollback release plan before promotion.

## Safe rollout sequence

- Phase A: retain dual read support and existing SM-2 as-is; add a separately versioned candidate adapter and immutable compatibility fixtures.
- Phase B: opt-in pilot on a copy of consenting user data, comparing old/new exact due counts and the archived original cards, without overwriting the only working backup.
- Phase C: gradual promotion only after review/consent, with old records readable and an explicit reversion tool.
- Phase D: remove legacy *runtime write paths* only when representative restore, offline/Windows acceptance and the public-API consumer audit prove retirement is safe. Keep historical backup readers or ship a separate, verified conversion utility for every supported released backup version.

## Blocking release rules

A candidate **must not** mark issue #129 complete or remove legacy code when any model-version support, backup-replay parity, user consent, recovery dry run or Windows/offline verification is missing. Never reinterpret a database-migration checkpoint or unit-test fixture as proof that a real user's saved study library was fully migrated.

Related records: #129; PRs #166, #168, #177, #189, #195; `docs/backup-restore.md` and `docs/release-and-rollback.md`.
