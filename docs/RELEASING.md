# Release Process

## Overview

Production releases are built from an exact commit on `main`, verified completely, bound to an immutable semantic-version tag, and published with checksums, a manifest, and an attestation.

The workflow supports two safe entry points:

1. **Recommended manual release:** dispatch the Release workflow from `main`. Leave the tag field blank. The workflow derives `v<version>` from `far/package.json`, verifies the exact `main` commit, creates the missing tag only after verification succeeds, and publishes the release.
2. **Existing-tag release or retry:** push a `vMAJOR.MINOR.PATCH` tag, or manually provide an existing tag. The workflow reads that tag's own commit and `far/package.json`, verifies that identity against `main` history, and never requires an older tag to match the newer package version currently on `main`.

## Release decision flow

The workflow follows one serialized state machine for the repository:

1. Resolve the package version, requested/default tag, remote tag state, and exact source commit.
2. For an existing tag, validate the package version from the tagged commit itself.
3. Verify the exact commit and continue every independent check that remains safe to run.
4. Fail once at the aggregate gate using a fixed check order, while preserving each command log and annotation.
5. Create a missing default tag only after verification succeeds.
6. Re-check the tag immediately before publication and again after publication.
7. Publish only when no complete release exists; a complete retry must have every expected asset with the same local file size.

All release runs share one concurrency group, so manual and tag-triggered releases cannot publish concurrently. External tag movement is detected before and after publication; an existing tag is never changed by the workflow.

## Recommended release procedure

1. Update `far/package.json` version.
2. Regenerate and commit all required `dist` and `vendor` outputs.
3. Merge the release commit into `main`.
4. Open **Actions → Release → Run workflow**.
5. Select `main` in the branch picker.
6. Leave **Optional existing release tag** blank unless retrying a known existing tag.
7. Run the workflow and review the generated summaries and attached diagnostics.

For example, when `far/package.json` contains `1.1.2`, a blank manual request resolves to `v1.1.2`.

## Existing-tag procedure

An existing tag may still be created explicitly:

```bash
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```

The tag must:

- use `vMAJOR.MINOR.PATCH` format;
- match the `far/package.json` version in its own commit;
- resolve to a commit reachable from `main`;
- remain immutable.

To retry an older existing release after `main` advances, dispatch the workflow from `main` and enter that existing tag. The resolver validates the tag's own commit and package version before rebuilding it.

## Failure and retry behavior

The release workflow is designed to expose all useful evidence in one run:

- dependency installation makes up to three total attempts, meaning at most two retries, for transient registry or network failures;
- browser smoke tests make up to two total attempts, with a warning when the second attempt recovers;
- independent verification checks continue after failures where safe;
- skipped checks are reported as unmet prerequisites;
- a final aggregate gate fails the release when any required check did not succeed; failures are listed in a fixed, deterministic order matching the summary table;
- diagnostics upload even when verification fails;
- a successful release retry becomes a no-op only when the immutable release is not a draft and all expected assets exist with the same file sizes as the newly verified package.

The workflow never moves an existing tag and never overwrites an existing release asset.

## Common failures

### Missing tag during checkout

Do not repeatedly dispatch a nonexistent explicit tag. To create the current package release, run the workflow from `main` and leave the tag field blank. To retry another version, create and push that intended tag first.

### Version mismatch

For a new blank-tag release, update `far/package.json` on `main`. For an existing-tag retry, the tag must match the package version in its own tagged commit. Create a new correctly versioned tag rather than moving an existing one.

### Main advanced after dispatch

Run the workflow again from the current `main`. This prevents a stale blank-tag manual dispatch from releasing an older commit accidentally.

### Generated artifacts changed

Download the diagnostics artifact, inspect the generated diff, regenerate `dist` and `vendor`, commit the changes to `main`, and start a new release.

### Partial existing release

The workflow treats a complete existing release as a successful idempotent retry. It refuses an incomplete, size-mismatched, or draft release so an operator can inspect and repair that exceptional state without silently replacing assets.

## End-to-end publication validation

Pull-request CI validates the complete build, tests, audits, smoke checks, release manifest, attestation, workflow policy, and packaging prerequisites without mutating tags or Releases. GitHub does not provide a harmless simulation of the final tag-creation and Release-publication mutations. The first manual run from merged `main`, with the tag field left blank, is therefore the authoritative end-to-end publication validation. The workflow serializes that mutation, creates the tag only after verification, and re-verifies release identity after publication.

## Required permissions

- Resolution and verification use read-only repository access.
- Publication receives `contents: write` only for creating the missing verified tag and publishing release assets.
- Checkout credentials are never persisted.

## Release artifacts

Each release publishes:

- `opencoursedeck-vMAJOR.MINOR.PATCH.tar.gz`;
- `opencoursedeck-vMAJOR.MINOR.PATCH-manifest.json`;
- `opencoursedeck-vMAJOR.MINOR.PATCH-attestation.json`;
- `SHA256SUMS`.

Consumers should verify downloaded assets:

```bash
sha256sum -c SHA256SUMS
```

## Diagnostics and transparency

Every run produces a GitHub job summary with release identity, check outcomes, publication state, and retry behavior. Detailed command logs and generated-file evidence are retained as workflow artifacts for 14 days. Verified release assets are retained as workflow artifacts for 7 days in addition to the permanent GitHub Release.
