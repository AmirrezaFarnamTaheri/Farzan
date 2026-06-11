## Getting Started

This guide gets a new user from first launch to a useful study session.

### Start The App

For everyday study, prefer the staged native app:

1. Build and stage it if needed:

   ```bash
   npm run ci
   npm run native:package
   node scripts/stage-native-exe.cjs
   ```

2. Open `desktop-dist\PlasmaDeck-Native\PlasmaDeck.exe`, or use the root `..\PlasmaDeck.bat` launcher.

For development or fallback validation, start the local server from the `far/` folder:

```bash
npm install
npm run first-run
npm start
```

Open `http://localhost:5173/`. Keep the terminal running while you use the app.

Windows users can also use `Run-PlasmaDeck.vbs` or `Run-PlasmaDeck.cmd`.

Do not open `index.html` directly. The app needs a native shell or local HTTP server for modules, catalog loading, service-worker assets, and browser storage.

### First Tour

1. Start on Home and use the launch cards to open Courses, Notes, Help, PDF, Studio, or Settings.
2. Press `Tab` once from the top of the page to reveal the skip link.
3. Press `Ctrl+K` to open the command palette and jump to any section.
4. Search the command palette for `backup`, `shortcuts`, or `guide` when you need recovery actions.
5. Open Settings to confirm the storage summary and backup actions.
6. Export a small backup after creating your first note or progress entry. That confirms the browser/native storage path you plan to keep using.

### Add Or Open Content

- Courses come from the active catalog selected in `data/catalog.json`.
- Use Materials for your local content library workflow.
- Use Notes for free-form study notes, tags, folders, import, and export.
- Use PDF when studying documents.
- Use Studio for canvas work.

Keep catalog JSON and local media under the project folder when you want offline-friendly behavior. Remote media and PDF URLs are allowed, but they still require network access unless copied locally.

### Where Your Data Lives

Data is stored in your browser profile for the local origin, usually `http://localhost:5173`.

- Progress and timestamps use IndexedDB when available.
- Preferences use `localStorage`.
- Backup/export creates a JSON file you control.

Changing browser profile, hostname, or port can make the app look like it has no data because browser storage is origin-scoped.

The native app has its own WebView storage area. Treat native and browser fallback as separate storage buckets unless you explicitly export from one and import into the other.

### Keyboard Basics

- `Ctrl+K`: command palette.
- `Ctrl+/`: keyboard shortcuts.
- `Ctrl+B`: sidebar collapse.
- `Ctrl+Shift+D`: theme toggle.
- `Ctrl+=`, `Ctrl+-`, `Ctrl+0`: font scale controls.

Dialogs, drawers, and the command palette trap focus while open and return focus to the opener when closed.

### Development Checks

The npm scripts call local package entry points directly so they keep working even if `node_modules/.bin` shims are missing on Windows. Tests use Vitest's `vmThreads` pool to avoid fork-based worker failures in restricted shells.

```bash
npm run validate
npm test
npm run build
npm run smoke
```

Use `npm run ci` for the combined audit plus HTTP smoke check.

### If Something Looks Wrong

1. Run `npm run first-run`.
2. Reload the app.
3. Open `http://localhost:5173/?debug=1` in browser fallback mode and check `debug.log`.
4. Export a backup before clearing storage.
5. See [troubleshooting.md](troubleshooting.md) for stale bundles, missing assets, port conflicts, and service-worker recovery.

### Newcomer FAQ

**Can I open `index.html` directly?**  
No. Use `npm start` or the Windows launcher. Browser security rules block core features on `file://`.

**Does PlasmaDeck upload my notes or progress?**  
No. The app is local-first and does not upload by default.

**Why did my data disappear after changing ports?**  
Browser storage is scoped to the origin. `localhost:5173` and `localhost:5174` have separate storage.

**What should I back up?**  
Use the in-app export actions for progress and notes. Also keep any custom catalog JSON files you edited outside the app.
