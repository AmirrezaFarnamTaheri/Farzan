# Release, partial-publication recovery, and rollback

## Preconditions

A release is eligible only when the immutable tag resolves to a commit reachable
from `main`, `far/package.json` matches the semantic-version tag, the reusable
verification workflow succeeds, the production browser gate succeeds, release
contents are reverified, and the release archive, checksums, manifest, custom
integrity record, CycloneDX SBOM, and GitHub attestations are generated for the
same commit.

Do not move an existing release tag. Do not replace an existing asset. A retry
must prove that every existing remote asset has the same name, size, and digest
as the locally verified asset before treating publication as complete.

## Standard release

1. Merge reviewed work to `main` and confirm required checks.
2. Update `far/package.json` and lockfile together.
3. Dispatch the Release workflow from `main` with a blank tag, or push an
   existing correctly versioned immutable tag.
4. Review the release identity summary before publication.
5. Download the published assets and verify `SHA256SUMS`.
6. Verify GitHub artifact attestations against the repository and tag.
7. Record the release URL, commit, workflow run, verification artifact, and any
   operational caveats.

## Partial-publication recovery

If a workflow fails after creating the tag or release:

1. Freeze further publication attempts and preserve the failed run logs.
2. Resolve the tag and release target commit independently; stop if they differ.
3. Compare all remote assets with the verified local asset set by name, size,
   and SHA-256 digest.
4. If the release is incomplete but every existing asset matches, rerun the
   workflow against the same immutable tag. The workflow may add only missing
   assets.
5. If any remote asset differs, do not overwrite it. Mark the release as
   compromised, preserve evidence, revoke or delete the draft release when safe,
   and publish a new patch version with a new tag.
6. Reverify the final release identity and attestations after recovery.

## Rollback

A browser release rollback is a forward release from the last known-good source,
not a moved tag. Revert or repair the bad change on `main`, increment the patch
version, run the full verification pipeline, and publish a new immutable tag.

For installed desktop packages, publish a superseding signed installer and state
whether user data or schema state requires special handling. Never silently
replace a previously published installer. If a migration is not backward-safe,
ship and verify an explicit repair migration before recommending downgrade.

## Incident record

For any failed or rolled-back release, record impact, affected versions,
detection source, exact commits and artifacts, containment, repair, verification
evidence, and prevention work. Link the private security advisory when the
incident involved a vulnerability.
