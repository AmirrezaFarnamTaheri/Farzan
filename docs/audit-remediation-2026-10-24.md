# Farzan audit remediation and acceptance register (2026-10-24)

This is the source-facing handoff for [PR #73](https://github.com/AmirrezaFarnamTaheri/Farzan/pull/73), based on *Farzan-Product-Architecture-Audit-2026-10-23.md* (18 grouped findings, audited source SHA `414b38e6b3b77f7929da66c304234b788a563a0e`). The status below distinguishes a code change from a verified user-facing or release acceptance. A passing CI suite alone does not qualify a Windows upgrade or production release.

## Ownership and trust boundaries

- **Canonical study metadata:** the main IndexedDB settings/records; `localStorage` is a compatibility mirror, not an equally authoritative mutation result once canonical storage exists.
- **Owned binary media:** a separate `opencoursedeck-library-files` IndexedDB database; public portable JSON 1.6 is **metadata-only** and does not include those bytes.
- **Course identity:** existing saved course IDs are required for explicit imports; a deleted destination cannot be silently recreated. PDF/video `library-file:` references retain their IDs during relinking.
- **Route handoff:** the destination owns PDF loading and reports failure; queue serialization, retry, and the viewer's own generation guard prevent stale document completion from replacing a newer selection.
- **Review and study metrics:** scheduled flashcards determine due counts; watched interval coverage is never inferred from a playback seek.
- **Release identity:** a passing pull request build is not a signed installer or a published artifact. Edition and standard release channels have separate tag and version authorities.

## Findings and disposition

| ID | Finding | Remediation in PR #73 | Further acceptance or limitation |
|---|---|---|---|
| F01 | Add actions, modal form submit, Toast method context | Connect submit and owner-bound notifications; fix menu click propagation; interaction regressions | Recheck real first-run workflow on each supported device |
| F02 | Annotation mirrors resurrect deletions and cross-document data | Trust canonical DB after migration; scope legacy fallbacks; clear mirrors on reset/restore | Historical migrated profiles need device/profile replay |
| F03 | Nonatomic annotation replacement after invalid key | Validate IDs, abort/reject transaction safely; regression tests | Fault-injection coverage for additional malformed stored shapes |
| F04 | Flashcard false durable success and stale restore | Await canonical writes, reject failed reads and false receipts; hydrate due queries; invalidate restore cache; preserve edits and schedule | Quota/interrupted-profile recovery and concurrency load testing |
| F05 | Incomplete metadata recovery; no source relink | Portable JSON 1.6 includes custom outlines, media cues and attachment manifest; missing-file discovery and stable-ID relink; rollback includes both settings keys | Media bytes remain **excluded by design**; user must provide original files or a future explicit bundle |
| F06 | Imported media does not follow selected personal course | Explicit destination picker, per-course Add media, source-context propagation; reject stale/deleted course destination | Full topic move/rename and reconciliation of `ocd_my_courses` versus `ocd_user_library` remain product/data-migration work |
| F07 | Wrong resume bookmark; cold PDF source dropped | Use focused-topic position; route-owned PDF load, explicit success receipts, generation-safe serialized load and Retry PDF | Browser E2E with truly slow worker and missing assets on live fixtures |
| F08 | Hash collisions misrepresented as semantic relevance | Unicode lexical-overlap scoring; remove confidence-like matches and query-triggered writes; label as related keywords | Learned multilingual semantic retrieval not shipped or claimed |
| F09 | Model install/cache controls without inference runtime | Disclose extractive-only local summaries; hide inoperative model installation controls | Verified on-device generative inference remains intentionally unshipped |
| F10 | Graph invents concepts/relationships | Remove synthetic nodes/edges; show only stored nodes and explicit links | Additional relationship provenance UI may be valuable later |
| F11 | Misleading review/watched metrics; disconnected card/queue tools | Due-card schedule and tracked video intervals; edit/delete flashcards; saved playlist player handoff | A unified cross-feature activity ledger and complete source linkage remain future consolidation |
| F12 | Release SHA, tag, platform and assets do not match promises | Retain verified standard release gates; remove duplicate mutable-action desktop publisher; inspect edition release state | **OPEN: cannot mark release accepted.** The published `plasmato-edition-v1.0.4` release includes web ZIP + visual ZIP + their checksums but **no Windows installer or Windows checksum** in the current release asset list. A new immutable version, validated installer, artifact checksums, download verification, and upgrade acceptance are required |
| F13 | Stale pinned action hashes and incomplete workflow verification | Enumerate all YAML workflows, enforce immutable SHA and consistency, allow reviewed version rotations; remove duplicate publisher | Validate dependency bot PR/update workflow against actual vendor regeneration |
| F14 | Desktop wrappers change storage origin | Constant loopback origin and persistent browser-app profile for optional launchers | Actual Windows install/restart/upgrade and old random-port profile migration are **not** verified |
| F15 | Farzan/OpenCourseDeck/edition identity; incomplete Persian | No forced renaming or wholesale translation without product authority; retain separate edition identifiers | **OPEN product decision** on primary brand/audience and complete Persian/RTL translation, glossary and locale QA |
| F16 | Notes list clipping, invisible list markers, contrast | Responsive Notes fixes, list style restoration, grading label legibility | Comprehensive keyboard/screen-reader/mobile WCAG audit still required |
| F17 | Search rewrites on queries; global annotation DB scan | Stop search-time index writes and use document-indexed annotation reads on migrated profiles | Benchmark large user profiles; consider batch/index lifecycle later |
| F18 | Vulnerable sanitizer and remotely fetched note images | Upgrade/lock/vendor DOMPurify 3.4.17; sanitize and block off-origin note images until session opt-in | Real browser network-request check and supported dependency advisory review before release |

The findings marked **OPEN** are not closed by a green PR. Do not move an existing release tag or relabel old evidence as proof of a new installer.

## Release and pilot acceptance checklist

1. Run repository verification and production-browser assurance on the **same immutable candidate commit**, then inspect run conclusions and uploaded diagnostics. Separately validate locked Rust/Windows build.
2. Before release, decide whether the primary deliverable is the standard OpenCourseDeck product, the Plasmato edition, or both. Maintain independent identity, version and release asset contracts for each.
3. For a new edition release, use a **new immutable version/tag** and require the web package, Windows NSIS installer, the matching SHA-256 files, and the expected evidence archive. Fetch the published release assets back and verify their content digests.
4. Test a clean Windows installation, cold launch, persist/restart, upgrade retaining prior local data, rollback/recovery, and documented uninstall. Automation compilation alone does not establish these outcomes.
5. Test import and restore against a real existing profile, including mixed local and linked PDF/video media, oversized files, missing files, annotation legacy mirrors, concurrent tabs, and intentionally blocked storage. Confirm which data is recoverable and which media must be relinked.
6. Run representative Persian/RTL, accessibility and narrow-screen user journeys. Do not claim a fully Persian product or conformance solely from static UI screenshots.
7. Collect independent review of this large integration branch. PR #73 includes edition content not present on main, so audit the effective merged delta and edition ownership before merging.

## Verification evidence and caution

Previously validated branch revision `ff4efe668530a1b94515f9734e6441aa9946e050` passed repository CI, Browser Assurance and Native Windows Assurance. Follow-up fault-injection checks uncovered additional real rollback, PDF and flashcard correctness issues; those were subsequently corrected with regression tests. **Consult the latest three GitHub Actions results for the final branch SHA before marking this PR accepted**. No post-merge production release or physical Windows upgrade is claimed here.
