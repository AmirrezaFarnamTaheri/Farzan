# Release verification checklist

Complete this checklist for each release candidate. Earlier checkmarks are not proof that a newer commit is ready. Attach the exact Git commit and GitHub Actions run URLs when marking an item complete.

## Automated checks

- [ ] Lockfile-based dependency installation succeeds on supported CI runners.
- [ ] Source validation, lint, unit/regression tests, and negative-path storage tests pass.
- [ ] Production build and generated-artifact checks pass without uncommitted drift.
- [ ] Dependency audit, SBOM/manifest/attestation checks, and browser smoke tests pass.
- [ ] Native Windows Cargo check, release build, package staging, and artifact hash verification pass.
- [ ] Release tag, package version, source revision, and uploaded files agree.

## Application behavior

- [ ] Create/edit/delete notes and courses; confirm persistence after reload.
- [ ] Complete a backup/export/import cycle with notes, annotations, bookmarks, and watch history.
- [ ] Test partial failures, rollback, and a full reset that clears the separate local media store.
- [ ] Confirm external media works when online and fails clearly when unavailable.
- [ ] Exercise PDF search, playback, Studio, flashcards, shortcuts, and navigation after refresh.

## Visual and accessibility review

- [ ] Inspect Home, Courses, Notes, PDF, Studio, Progress, Settings, and Help at desktop and phone widths.
- [ ] Verify default dark/light and alternate themes and accents for contrast and readable status text.
- [ ] Verify keyboard focus, dialog focus return, zoom to 200%, and reduced-motion behavior.
- [ ] Test representative screen readers and RTL content on target platforms.
- [ ] Capture any remaining accessibility limitations. Do not describe automated test success as WCAG certification.

## Distribution and recovery

- [ ] Install, launch, update, uninstall, and reinstall the actual Windows build.
- [ ] Verify a previous release can be restored without losing study data.
- [ ] Keep the release files and checksums with the published version.
- [ ] Document verified compatibility limits and outstanding defects.

See [RELEASING.md](RELEASING.md), [release-and-rollback.md](release-and-rollback.md), and the current GitHub Actions run for the applicable revision.
