## Content And Catalog

OpenCourseDeck separates the app shell from the learning catalog. The app reads `data/catalog.json` to find the active catalog file.

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

Catalog fetches intentionally use `cache: 'no-cache'` so the browser can revalidate without breaking offline-friendly runtime caching. Do not switch catalog fetches back to `no-store`; that prevents the service worker from helping with catalog availability. Run `npm run build:sw` after changing `data/catalog.json` so the generated service worker precache reflects the active catalog pointer.

### Safe Editing Workflow

1. Stop the local server if you are doing large catalog edits.
2. Copy the existing catalog JSON before changing it.
3. Update `data/catalog.json` to point at the new file.
4. Run `npm run validate` if the catalog validator covers the changed shape.
5. Run `npm start` and check Courses, Materials, and search.

### Catalog Tips

- Use stable IDs for courses, lessons, and materials. Progress and notes often depend on IDs.
- Prefer relative asset paths so the app remains portable.
- Avoid remote CDN URLs when possible; the project is designed to be self-contained.
- Keep large media outside git unless the repository intentionally tracks it.

### Switching Catalogs

Switching catalog files does not erase browser data, but it can orphan progress or notes if IDs change. If you are experimenting, export a backup before switching.

### Common Problems

- **Courses list is empty:** confirm `currentCatalog` points to an existing JSON file.
- **Media does not load:** confirm the path is reachable from the app origin and the dev server serves that file type.
- **Progress appears mismatched:** check whether course or lesson IDs changed between catalogs.
