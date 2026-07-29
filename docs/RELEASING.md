# Release Process

## Overview

Production releases are built from an exact commit on `main`, verified completely, bound to an immutable semantic-version tag, and published with checksums, a manifest, and an attestation.

The workflow supports two safe entry points:

1. **Recommended manual release:** dispatch the Release workflow from `main`. Leave the tag field blank. The workflow derives `v<version>` from `far/package.json`, verifies the exact `main` commit, creates the missing tag only after verification succeeds, and publishes the release.
2. **Existing-tag release:** push an existing `vMAJOR.MINOR.PATCH` tag. The workflow verifies that the tag matches `far/package.json`, points into `main`, and has not moved.

## Recommended release procedure

1. Update `far/package.json` version.
2. Regenerate and commit all required `dist` and `vendor` outputs.
3. Merge the release commit into `main`.
4. Open **Actions → Release → Run workflow**.
5. Select `main` in the branch picker.
6. Leave **Optional release tag** blank unless retrying a known existing tag.
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
- match the committed `far/package.json` version;
- resolve to a commit reachable from `main`;
- remain immutable.

## Failure and retry behavior

The release workflow is designed to expose all useful evidence in one run:

- dependency installation retries up to three times for transient registry or network failures;
- browser smoke tests receive one bounded retry, with a warning when the retry recovers;
- independent verification checks continue after failures where safe;
- skipped checks are reported as unmet prerequisites;
- a final aggregate gate fails the release when any required check did not succeed;
- diagnostics upload even when verification fails;
- a successful release retry becomes a no-op when the immutable release and all expected assets already exist.

The workflow never moves an existing tag and never overwrites an existing release asset.

## Common failures

### Missing tag during checkout

Do not repeatedly dispatch a nonexistent tag. Run the workflow from `main` and leave the tag field blank. The workflow will derive the correct tag and create it only after the commit passes verification.

### Version mismatch

Update `far/package.json` or request the tag matching its committed version. The workflow refuses to publish a tag whose version differs from the package version.

### Main advanced after dispatch

Run the workflow again from the current `main`. This prevents a stale manual dispatch from releasing an older commit accidentally.

### Generated artifacts changed

Download the diagnostics artifact, inspect the generated diff, regenerate `dist` and `vendor`, commit the changes to `main`, and start a new release.

### Partial existing release

The workflow treats a complete existing release as a successful idempotent retry. It refuses an incomplete or draft release so an operator can inspect and repair that exceptional state without silently replacing assets.

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
