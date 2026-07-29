# Release Process

## Overview

Production releases are created only from version tags (`vMAJOR.MINOR.PATCH`). The release workflow verifies the tag, builds the exact tagged commit, generates release provenance, and publishes immutable assets.

## Creating a release

1. Update `far/package.json` version.
2. Commit and merge the change into `main`.
3. Create an annotated tag matching the package version:

```bash
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```

4. Monitor the GitHub Actions Release workflow.

## Manual release execution

Manual dispatch is intended for operational retries and controlled publishing.

Requirements:

- Run from `main`.
- The tag must already exist.
- The tag must resolve to the intended commit.
- The tag must match `package.json` version.

The workflow will refuse:

- non-semver tags;
- tags pointing outside `main`;
- moved tags;
- version mismatches;
- failed verification steps.

## Required permissions

The build phase requires read-only repository access.

The publication phase requires `contents: write` only for creating/updating GitHub Release assets.

## Release artifacts

Each release publishes:

- compressed production archive;
- SHA-256 checksums;
- release manifest;
- verification attestation.

Consumers should verify assets before use:

```bash
sha256sum -c SHA256SUMS
```

## Artifact retention

GitHub Actions artifacts are cleaned weekly. Artifacts older than the configured retention window are removed automatically. Historical workflow runs are managed separately through GitHub administrative APIs.
