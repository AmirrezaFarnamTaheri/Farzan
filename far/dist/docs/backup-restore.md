## Backup And Restore

PlasmaDeck stores user data locally in the browser. Backups are the safest way to move data between machines, browser profiles, or app origins.

### What Is Stored

- Progress and timestamps: IndexedDB through the app storage bridge.
- Notes, note folders, annotations, selected settings, playlists, and Studio boards: database-backed app records, with compatibility mirrors only where needed.
- Preferences: localStorage keys such as theme, accent, density, sidebar state, and font scale.
- Catalog files: normal project files, not browser storage.

Backups are for user data stored by the app. They do not include `data/catalog.json`, active catalog JSON files, generated bundles, local media folders, native executables, or installer output.

### Export A Backup

1. Open PlasmaDeck from the same origin you normally use.
2. Go to Progress or Settings.
3. Use the JSON export or backup button.
4. Store the exported file somewhere outside the project folder if you are reinstalling.

Export before changing catalogs, clearing storage, changing ports, switching between native and browser fallback, or moving to another browser profile.

### Import A Backup

1. Start the app and open the same origin you plan to keep using.
2. Go to Progress or Settings.
3. Use the import action and choose the exported JSON backup.
4. Reload once after import if views do not refresh immediately.
5. Confirm Notes, Progress, PDF annotations, playlists, and Studio content from their routes.

When moving between native and browser fallback, export from the old storage bucket and import into the new one. The two launch paths do not automatically share WebView/browser storage.

### Reset Local Data

Use the in-app reset button from Settings when possible. It clears the app-controlled local data and reloads the page.

For a manual reset, use browser devtools for `http://localhost:5173`:

1. Application or Storage panel.
2. Clear IndexedDB for PlasmaDeck.
3. Clear localStorage and sessionStorage for the same origin.
4. Unregister the service worker if you also want to reset offline cache.

### Origin Warning

Browser storage is scoped by protocol, hostname, and port. These are different storage buckets:

- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `http://localhost:5174`

Pick one origin and stick with it.

The same rule applies to browser profiles. A normal browser window, a different browser, and a private/incognito profile can all have separate storage even when the URL text looks similar.

### Files To Preserve Separately

Keep copies of these project-side files if you customized them:

- `data/catalog.json`
- Active catalog JSON files under `data/`
- Local PDFs, videos, images, or archives referenced by the catalog
- Any native installer or staged executable you want to reuse without rebuilding
