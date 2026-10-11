# Integrity and interface remediation — 2026-10-11

Baseline: `main` commit `67474ecb3b484ac26c1b829f96fb7cbd4710c3dc` with security fixes in PR #58 (`bf648dc3c4e6b4fb735db48d46e1816ea69a5a01`). This follow-up is stacked on PR #58, rather than silently merging overlapping PR #55. The security changes and the earlier storage patches should be reviewed independently from the additional improvements below.

## Confirmed defects and invariants

1. **Progress/timestamp canonical storage:** A failed IndexedDB update after migration was reported as successful after writing localStorage. If the canonical record already existed, subsequent reads preferred the stale IndexedDB value. After migration, any IndexedDB write error now rejects without success events or fallback writes. Historical fallback-only records remain readable; canonical records take precedence. Regression: `tests/bridge.test.js`.
2. **Local file import:** With no `indexedDB`, the file-storage helper returned `null`; import returned a new `library-file:` reference even though no blob had been stored. New imports fail before committing metadata. Regression: `tests/user-library.test.js`.
3. **Committed media metadata vs. UI notification:** A thrown overlay refresh/event callback after a successful metadata write could initiate cleanup of now-referenced staged blobs. Noncritical UI observers are isolated *after* durable persistence. Regression: `tests/user-library.test.js`.
4. **Encrypted record honesty:** Missing Web Crypto could silently downgrade an encryption-requested record to plaintext. Missing/wrong passphrases could surface ciphertext envelopes as apparently usable records. Encryption and decryption now reject on missing prerequisites or invalid envelopes, with capped KDF iterations to avoid unbounded CPU work on imported data. Regression: `tests/db.test.js`.
5. **Manual sync package validation:** The unused `_passphrase` option created an appearance of encryption while producing plaintext JSON; arbitrary malformed/unversioned input passed into merge. Nonempty passphrase requests are rejected, incoming records and versions validated and packages bounded. This does *not* implement real multi-device sync or encryption. Regression: `tests/offline-sync.test.js`.
6. **Focus, navigation and visual hierarchy:** The home heading was oversized for the study content; muted captions were hard to read; noninteractive stats mimicked buttons; navigation had no `aria-current`. Rebalanced hero, navigation surfaces, captions, responsive actions, focus states, and explicit current route. Regression: `tests/router.test.js`; browser/manual checks required.

Earlier unmerged storage fixes also cover delete-failure propagation, local same-topic progress serialization, cross-tab locks where supported, backup preflight and rollback status, and backup export transaction lifecycle. Their dedicated tests must run along with the new tests before a merge.

## Execution and limits

The local environment has Node v22.16.0 and no complete `node_modules`. An offline npm install fails for an uncached tarball, and direct registry DNS resolution is unavailable. The following dependency-free gates passed after changes: `npm run check:encoding`, `npm run check:workflows`, `npm run validate`, `npm run audit` (lockfile/internal package metadata consistency only), `npm run check:font-budget`. Changed JavaScript files passed `node --check`; a standalone Node failure-injection smoke harness passed 16 assertions, covering invalid packages, encryption key availability, canonical IDB failure and missing file storage.

The local Chromium/Playwright environment returned `ERR_BLOCKED_BY_ADMINISTRATOR` even for its loopback development server; it could not perform interactive screenshot comparison. Use pull-request CI for Vitest, lint, build, generated assets, and smoke checks, and run supported desktop/mobile browsers, zoom, keyboard navigation, screen readers and Windows Tauri manually where available. Passing CI does not establish universal WCAG 2.2 AA or native install/update correctness.

## Outstanding work (not claimed resolved)

- PR #55 overlaps storage, presentation and releases; reconcile intentionally, not with blind auto-merge.
- No verified atomic cross-tab updates for engines without Web Locks; IndexedDB-based concurrency control is still needed for universal guarantees.
- Legacy backup rollback is not crash-atomic; JSON backup does not include separately stored local video/PDF blobs.
- Persian/RTL remains partially implemented and is not enabled as a fully translated shipped interface.
- Local-Gemma runtime, plugin host, encrypted cross-device sync, and planned smart widgets are not shipped merely because modules or catalog labels exist.
- Real native Windows packaging, PWA offline upgrades with in-progress edits, screen-reader/manual a11y and visual regression remain separate release gates.
