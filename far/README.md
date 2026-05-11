## PlasmaDeck Learning Studio

PlasmaDeck is the app inside this repository. The parent folder may be named Farzan Lite, but the runnable product is a self-contained, browser-based learning studio for videos, PDFs, notes, canvas work, bookmarks, progress tracking, and local backups.

It is designed for private study libraries and offline-friendly use. The app runs from a local HTTP server, uses vendored dependencies instead of CDNs, and stores user data in the browser on the current device.

### What You Can Do In 5 Minutes

1. Start the local server and open PlasmaDeck.
2. Browse the bundled catalog from `data/catalog.json`.
3. Open a lesson, PDF, or Studio canvas.
4. Create a note and search it from the Notes view.
5. Export a backup from Settings or Progress.

### Requirements

- Node.js and npm.
- A modern browser with IndexedDB support.
- An HTTP(S) origin. Do not open `index.html` with `file://`; service workers, module loading, and `fetch()` need a server.

### First Run

```bash
npm install
npm run first-run
npm start
```

Open `http://localhost:5173/`.

On Windows, the launchers are often easier:

- `Run-PlasmaDeck.vbs`: app-like launch with no console window.
- `Run-PlasmaDeck.cmd`: launch with console logs visible.
- `Stop-PlasmaDeck.cmd`: stop the local server.

### Regular Run

```bash
npm start
```

If port `5173` is busy, start with another port:

```bash
$env:PORT=5174; npm start
```

### Build And Validate

```bash
npm run build
npm run build:sw
npm test
npm run audit
```

- `npm run build` writes `dist/plasma.js`.
- `npm run build:sw` regenerates `sw.js` with Workbox.
- `npm run vendor` refreshes local vendor assets and fonts.

### Data And Privacy

PlasmaDeck stores data locally in the browser profile for the origin you open, usually `http://localhost:5173`.

- IndexedDB stores progress, timestamps, and database-backed records.
- Some preferences and notes compatibility data may be mirrored in `localStorage`.
- Nothing is uploaded by the app by default.
- Backups are JSON files you export manually.

For details, see [backup-restore.md](docs/backup-restore.md).

### User Guides

- [Getting started](docs/getting-started.md)
- [Content and catalog](docs/content-and-catalog.md)
- [Backup and restore](docs/backup-restore.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Roadmap and backlog](docs/roadmap.md)

The app also includes an in-app Help route at `#/help` with the first-run checklist, storage summary, backup entry, shortcuts entry point, and links to these guides.

### Project Layout

- `index.html`: static app shell, landmarks, overlay roots, vendor script tags, and boot entry.
- `style.css`: global design system and component styles.
- `src/index.js`: ES module entry that bundles the current vanilla modules.
- `app.js`: app shell behavior, routes, views, modal/drawer primitives, settings, and shortcuts.
- `ui.js`: reusable UI helpers.
- `notes.js`, `pdf.js`, `player.js`, `canvas.js`: feature modules.
- `db.js`, `bridge.js`: storage layer and compatibility bridge.
- `data/catalog.json`: selects the active catalog JSON.
- `vendor/`: vendored browser libraries, icons, and fonts.
- `dist/plasma.js`: generated bundle.

### Debugging Boot

Local debug logging is opt-in. Open:

```text
http://localhost:5173/?debug=1
```

The dev server accepts `/__debug` posts and writes `debug.log`. Boot and app timing marks include import time, bundle-to-ready time, and app init time.

### Troubleshooting Shortcuts

- Stuck on `Initializing...`: run `npm run build`, hard refresh, and check `debug.log` with `?debug=1`.
- Missing fonts or icons: run `npm run vendor`.
- Offline/PWA stale state: run `npm run build:sw`, reload once online, or clear the service worker in browser devtools.
- Windows firewall prompt: allow Node.js for local/private networks so the local server can listen.

More detail lives in [troubleshooting.md](docs/troubleshooting.md).
