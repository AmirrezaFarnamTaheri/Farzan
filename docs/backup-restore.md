# Backup and restore

OpenCourseDeck stores study data in the browser profile and origin you use. Export a backup **before** resetting data, changing a browser profile, or moving to another computer.

## What a JSON backup includes

The current **Progress and Settings** export uses portable JSON format **1.6**. It includes saved progress, notes, folders, timestamps, PDF annotations, watched segments, PDF bookmarks, flashcards, saved playlists, Studio board metadata, personal course outlines (`ocd_my_courses`), course media cues (`ocd_course_media_cues`), user-owned library metadata (`ocd_user_library`), and personal Tags taxonomy/merge aliases (`ocd_tag_taxonomy`), when present.

The optional tag taxonomy field requires a compatible versioned value; malformed or future schemas are rejected before import writes. Tag merges do not rewrite the underlying Notes or catalog labels. Version 1.6 imports remain compatible with supported portable versions 1.0–1.5. The internal database snapshot used to protect an import during rollback is a **different format (version 3)**, not a portable 1.6 file.

**Binary attachment policy: metadata-only.** The export includes a `meta.attachments` manifest containing local-file references and explicitly sets `mode: "metadata-only"` and `binaryIncluded: false`. It does **not** include imported PDF/video bytes from the separate `opencoursedeck-library-files` IndexedDB database. External media links also remain links and may require a network connection. Keep the original local media and any manually edited catalog JSON files when moving devices.

## Export

1. Open the app in the browser profile and at the same address you normally use.
2. Open **Settings** or **Progress** and select the JSON export action.
3. Save the resulting file outside the app's folders. Verify that it exists and keep an additional copy before reinstalling or clearing storage.
4. Copy imported video/PDF originals separately; the JSON file alone cannot restore those binaries.

If storage cannot be read, the export should fail instead of quietly manufacturing an empty backup. Do not treat a missing or unexpectedly small download as proof that your data was exported.

## Optional local-media folder backup (supported browsers)

The portable JSON is deliberately metadata-only and always remains available. For a more complete offline recovery, open **My Courses → Export media folder** in a browser supporting the File System Access API (typically recent desktop Chromium). Pick a new, empty folder and keep it alongside the portable JSON backup. The app writes each locally imported PDF/video as a separate binary file in `media/` without serializing large lectures into JSON; it completes `media-manifest.json` only when every file was saved. A canceled or interrupted export must not be treated as complete.

On another device or browser profile, first import the portable JSON. Then open **My Courses → Restore media folder** and select the exported folder. The app validates the manifest IDs and declared file sizes before attaching missing bytes to *existing* `library-file:` source IDs. It never silently overwrites files already present or attaches unrecognized references. Files omitted from a backup, unsupported external URLs, and files that failed to save remain the user's responsibility. If a restore fails partway, preserve the folder and retry. The manifest checks sizes and safe paths but is not a cryptographic content signature; keep the folder in a trusted location.

This folder workflow is optional and currently unavailable in browsers without directory access. It does not automatically package all app metadata in the media folder: **keep both the JSON backup and media folder**.

## Import

1. Keep the original backup and media files unchanged.
2. Open the intended browser profile and app address.
3. Select **Import JSON** in Settings or Progress, review the preview and confirm.
4. Verify notes, progress, bookmarks and settings after import before discarding the original files.
5. Open **My Courses → Missing local files**. Use **Locate file** beside each missing PDF or video and choose its original file. This relinks the original `library-file:` reference without changing its source ID, so existing course membership, progress and annotations keep their link. The file bytes must be provided separately; a JSON import does not recreate them.

When no missing-file section appears, there are no missing imported file references detected in the current library. A storage read failure must not be interpreted as an empty library; the interface reports an error instead.

The importer prepares a snapshot of existing data for recovery, including course outlines and media cues. Imports containing watch history or PDF bookmarks require an atomic version-3 recovery snapshot; unsupported storage environments should reject those imports rather than risk a partial restore. If a recoverable write fails, the importer attempts to restore original settings and records; if rollback fails it reports that explicitly. An interrupted browser process is not guaranteed to recover an older multi-step import automatically.

## Read-only before/after restore verification (local files only)

After exporting a portable v1.6 app-data JSON file from the original profile, import that
backup into a **different, initially empty** browser profile at the correct origin.
Before deleting or overwriting any original profile, export the restored profile to a
second portable JSON file. With this repository and its Node dependencies available,
run the comparator on your own computer:

```bash
npm run verify:portable-restore -- /path/to/original.json /path/to/restored.json
```

The command reads those two files only; it does **not** access live IndexedDB,
write either backup, transmit data, infer FSRS history, or change an existing
SM-2 schedule. It ignores the export timestamp and calculated JSON file size,
and tolerates record ordering differences for top-level ID-keyed collections.
It compares exact canonical content within each record (including FSRS due
instants and unchanged SM-2 migration archives), per-section counts and
SHA-256 hashes. It prints only generic section names, counts and digests,
never raw saved notes, note identifiers, media paths or flashcard content.
A mismatch exits nonzero and identifies affected *sections*, not record values.

A matching report is **not a certificate of successful recovery**: independently
verify sampled saved notes, PDF annotations, tagged bookmarks, SM-2 and FSRS due
dates, archived original cards, linked media playback and the actual Windows
profile. The portable JSON deliberately excludes imported PDF/video binary
bytes: separately export and restore the media folder, then inspect the missing
local-file list. Keep the original backup and the populated source profile
until these checks are complete. If any section or media file is missing,
**stop** before deleting or upgrading the source profile.

## Clear local data

Clearing all records may involve more than one IndexedDB database. These deletions are **not one transaction across databases**. If clearing one database succeeds but a later operation fails, some data may already be gone. Check the error, preserve your backups, and inspect storage before trying again.

For a manual reset, use the browser's storage/developer-tools panel for your precise app origin:

1. Clear OpenCourseDeck's main IndexedDB database and the separate `opencoursedeck-library-files` database.
2. Clear localStorage and sessionStorage only for that origin.
3. Unregister the service worker and clear its cache if you also want to reset offline files.

Never use a reset action as a substitute for a verified backup.

## Browser origins are separate

These addresses have separate browser storage even on the same computer:

- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `http://localhost:5174`

Keep one address and browser profile for routine use. Changing either can make a saved library appear empty without deleting its original data.
