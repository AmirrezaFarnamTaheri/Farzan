# Backup and restore

OpenCourseDeck stores study data in the browser profile and origin you use. Export a backup **before** resetting data, changing a browser profile, or moving to another computer.

## What a JSON backup includes

The current **Progress and Settings** export is portable JSON format **1.5**. It covers supported progress, notes, folders, timestamps, PDF annotations, watched segments, PDF bookmarks and selected settings (including saved library metadata and flashcards where available).

Version 1.5 imports remain compatible with older portable versions 1.0–1.4. The internal database snapshot used to protect an import during rollback is a separate format (version 3); do not confuse its version number with the portable export.

**Not included:** imported video and PDF file *contents*. These are kept in a separate IndexedDB database (`opencoursedeck-library-files`). Course links to external media also remain links and may require a network connection. Keep the original media and any manually edited catalog JSON files when moving devices.

## Export

1. Open the app in the browser profile and at the same address you normally use.
2. Open **Settings** or **Progress** and select the JSON export action.
3. Save the resulting file outside the app's folders. Verify that it exists and keep an additional copy before reinstalling or clearing storage.
4. Copy imported video/PDF originals separately; the JSON file alone cannot restore those binaries.

If storage cannot be read, the export should fail instead of quietly manufacturing an empty backup. Do not treat a missing or unexpectedly small download as proof that your data was exported.

## Import

1. Keep the original backup and media files unchanged.
2. Open the intended browser profile and app address.
3. Select **Import JSON** in Settings or Progress, review the preview and confirm.
4. Verify notes, progress, bookmarks and settings after import before discarding the original files.

The importer prepares a snapshot of existing data for recovery. Imports containing watch history or PDF bookmarks require an atomic version-3 recovery snapshot; unsupported storage environments should reject those imports rather than risk a partial restore. An interrupted browser process is not guaranteed to recover an older multi-step import automatically.

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
