## Backup And Restore

OpenCourseDeck stores user data locally in the browser. Backups are the safest way to move data between machines, browser profiles, or app origins.

### What Is Stored

- Progress and timestamps: IndexedDB through the app storage bridge.
- Notes: notes storage plus compatibility mirrors where needed.
- Preferences: localStorage keys such as theme, accent, density, sidebar state, and font scale.
- Catalog files: normal project files, not browser storage.

### Export A Backup

1. Open OpenCourseDeck from the same origin you normally use.
2. Go to Progress or Settings.
3. Use the JSON export or backup button.
4. Store the exported file somewhere outside the project folder if you are reinstalling.

### Import A Backup

1. Start the app and open the same origin you plan to keep using.
2. Go to Progress or Settings.
3. Use the import action and choose the exported JSON backup.
4. Reload once after import if views do not refresh immediately.

### Reset Local Data

Use the in-app reset button from Settings when possible. It clears the app-controlled local data and reloads the page.

For a manual reset, use browser devtools for `http://localhost:5173`:

1. Application or Storage panel.
2. Clear IndexedDB for OpenCourseDeck.
3. Clear localStorage and sessionStorage for the same origin.
4. Unregister the service worker if you also want to reset offline cache.

### Origin Warning

Browser storage is scoped by protocol, hostname, and port. These are different storage buckets:

- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `http://localhost:5174`

Pick one origin and stick with it.
