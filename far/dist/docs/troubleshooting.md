## Troubleshooting

### App Stays On `Initializing...`

Most causes are a missing or stale bundle.

1. Run `npm run build`.
2. Hard refresh the browser.
3. Open `http://localhost:5173/?debug=1`.
4. Check `debug.log` for boot errors and timing entries.

If `dist/plasma.js` is missing, the boot script cannot import the app.

If you are using the native app, rebuild and restage the frontend before packaging again:

```bash
npm run ci
npm run native:package
node scripts/stage-native-exe.cjs
```

### Fonts Or Icons Are Missing

Run:

```bash
npm run vendor
```

The app expects local files under `vendor/fonts` and `vendor/fontawesome`.

### Port Conflict

The default port is `5173`. Use another port if it is taken:

```bash
$env:PORT=5174; npm start
```

Remember that changing port changes the browser storage origin.

If your data appears empty after changing the port, restart on the old port or import a backup into the new origin.

### Native App Does Not Launch

1. Confirm `desktop-dist\PlasmaDeck-Native\PlasmaDeck.exe` exists.
2. Run `npm run native:preflight`.
3. Run `npm run ci` to ensure the web shell builds cleanly.
4. Run `npm run native:package`, then `node scripts/stage-native-exe.cjs`.
5. If Windows blocks the executable, unblock it from file Properties or rebuild locally.

The root `..\PlasmaDeck.bat` launcher falls back to the local-server flow when the staged native executable is missing.

### Windows Firewall Prompt

Allow Node.js on local/private networks. The dev server binds to `127.0.0.1`, but Windows can still ask for permission the first time.

### Offline Or Service Worker Looks Stale

Local development and production-like serving intentionally behave differently:

- `http://localhost` and `http://127.0.0.1` are treated as development origins. On those origins, `index.html` unregisters the service worker once per browser session so generated files do not stay stuck behind an old cache while you are editing.
- Non-localhost HTTP(S) origins register `sw.js` for PWA/offline behavior.
- `sw.js` is generated output. Rebuild it with `npm run build:sw` after changing app files, vendor assets, docs, the catalog pointer, or the active catalog file.
- When a new service worker is waiting, PlasmaDeck shows an update toast with a reload action. Reload once online to activate the new cache.
- The boot failure screen includes a "Clear service worker and reload" action for cases where an old cache prevents the bundle from loading.

Try:

1. Run `npm run build:sw`.
2. Reload once online.
3. Use browser devtools to unregister the service worker if old files persist.

Browser fallback on localhost unregisters the service worker once per session during development. That is expected and keeps generated files from hiding behind stale caches while you edit.

### PDF Search Is Slow

Large PDFs can still take time on the first search because each page must be read once, but searches are now cached per document and newer searches cancel stale scans. If results look out of date, load the PDF again or reload the app so the active document fingerprint and page-text cache reset cleanly.

### Notes Feel Slow With Many Items

The notes list renders in batches, patches edited rows when possible, and caches plain-text excerpts/search text. If it still feels slow, narrow the search or folder filter first, then reload the app to clear any stale in-memory render queue.

### Data Appears Missing

Check the storage bucket before clearing anything:

1. Confirm whether you are in native app, `localhost`, `127.0.0.1`, or another port.
2. Return to the origin you used before.
3. Check the browser profile. Private windows and different browsers use separate storage.
4. Import your latest JSON backup if you intentionally changed launch path or origin.
5. Preserve custom catalog and media files separately; user-data backup files do not include them.

### Debug Log

Open with `?debug=1` to enable the dev server debug endpoint:

```text
http://localhost:5173/?debug=1
```

Useful boot timing names:

- `pd:boot:import`
- `pd:boot:total_to_import`
- `pd:bundle_to_ready`
- `pd:app:init`
