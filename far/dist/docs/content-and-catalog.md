## Content And Catalog

PlasmaDeck separates the app shell from the learning catalog. The app reads `data/catalog.json` to find the active catalog file.

### Active Catalog Pointer

`data/catalog.json` currently looks like this:

```json
{
  "version": 1,
  "generatedAt": "2026-04-20T00:00:00.000Z",
  "currentCatalog": "plasmato_full_2026-04-11.json",
  "fallbackCatalogs": []
}
```

`currentCatalog` is resolved relative to the app root unless the data loader says otherwise. Keep catalog files inside the project if you want offline-friendly behavior.

The loader fetches both the pointer and the active catalog with `cache: 'no-cache'`. That mode lets the browser and service worker reuse cached catalog files while still checking for updates when the app is online. Do not switch catalog fetches back to `no-store`; doing so bypasses the offline cache and makes the PWA less useful.

Catalog files are normal project files. They are not part of IndexedDB, localStorage, or exported user backups. If you edit a catalog or add local media, keep your own copy of those files when moving machines or reinstalling.

For offline-friendly catalogs:

- Keep `data/catalog.json` and the active catalog JSON under the app root.
- Run `npm run build:sw` after changing `data/catalog.json` or the active catalog file.
- Media strategy is hybrid: keep catalog JSON and any locally copied media offline-friendly, while allowing remote video/PDF/image domains without a host allowlist. Catalog JSON can be cached locally, but remote video/PDF files still need network access unless copied into the app.
- Prefer stable topic IDs and source ordering because progress, notes, annotations, and exports refer back to catalog IDs.

Remote media and PDF domains are intentionally unrestricted. Use that flexibility for public course material, private intranet media, or locally served files, but remember that the app cannot make remote assets available offline unless the files are copied under the app and referenced by local paths.

### Safe Editing Workflow

1. Stop the local server if you are doing large catalog edits.
2. Copy the existing catalog JSON before changing it.
3. Update `data/catalog.json` to point at the new file.
4. Keep IDs stable when you are replacing URLs, titles, or media arrays for existing lessons.
5. Run `npm run validate` if the catalog validator covers the changed shape.
6. Run `npm run build:sw` if the catalog should be available through the offline/PWA cache.
7. Run `npm start` and check Courses, Materials, search, PDF loading, and a lesson with progress.

### Catalog Tips

- Use stable IDs for courses, lessons, and materials. Progress and notes often depend on IDs.
- Prefer relative asset paths so the app remains portable.
- Prefer relative asset paths for content that must work offline, and use remote media URLs freely when online access is acceptable.
- Keep large media outside git unless the repository intentionally tracks it.

### Switching Catalogs

Switching catalog files does not erase browser data, but it can orphan progress or notes if IDs change. If you are experimenting, export a backup before switching.

If progress looks wrong after a catalog switch, compare the old and new course/topic IDs first. The most common cause is not deleted data; it is a catalog entry that now has a different identifier.

### Common Problems

- **Courses list is empty:** confirm `currentCatalog` points to an existing JSON file.
- **Media does not load:** confirm the path is reachable from the app origin and the dev server serves that file type.
- **Progress appears mismatched:** check whether course or lesson IDs changed between catalogs.
