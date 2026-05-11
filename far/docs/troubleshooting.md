## Troubleshooting

### App Stays On `Initializing...`

Most causes are a missing or stale bundle.

1. Run `npm run build`.
2. Hard refresh the browser.
3. Open `http://localhost:5173/?debug=1`.
4. Check `debug.log` for boot errors and timing entries.

If `dist/plasma.js` is missing, the boot script cannot import the app.

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

### Windows Firewall Prompt

Allow Node.js on local/private networks. The dev server binds to `127.0.0.1`, but Windows can still ask for permission the first time.

### Offline Or Service Worker Looks Stale

Local dev unregisters the service worker once per session. Production-like serving registers `sw.js`.

Try:

1. Run `npm run build:sw`.
2. Reload once online.
3. Use browser devtools to unregister the service worker if old files persist.

### PDF Search Is Slow

Large PDFs can be slow because the current search path scans page text. See [roadmap.md](roadmap.md) for the planned cached, cancelable search index.

### Notes Feel Slow With Many Items

The current notes list can rebuild broad portions of the list. The roadmap tracks excerpt caching and incremental row updates.

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
