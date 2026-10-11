## Getting Started

This guide gets a new user from first launch to a useful study session.

### Start The App

From the repository root:

```bash
npm ci --ignore-scripts --legacy-peer-deps
npm run first-run
npm start
```

Open `http://localhost:5173/`. Keep the terminal running while you use the app.

Windows users can also use `Run-OpenCourseDeck.cmd`.

### First Tour

1. Start on Home, choose a course, or open Notes or PDF from the sidebar.
2. Press `Tab` once from the top of the page to reveal the skip link.
3. Press `Ctrl+K` to search for a page or command.
4. Search the command palette for `backup`, `shortcuts`, or `guide` when you need recovery actions.
5. Open Settings to confirm the storage summary and backup actions.

### Add Or Open Content

- Courses come from the active catalog selected in `data/catalog.json`.
- Use Materials to find the videos and PDFs available in your catalog.
- Use Notes for free-form study notes, tags, folders, import, and export.
- Use PDF when studying documents.
- Use Studio for canvas work.

### Where Your Data Lives

Data is stored in your browser profile for the local origin, usually `http://localhost:5173`.

- Progress and timestamps use IndexedDB when available.
- Preferences use `localStorage`.
- Export creates a portable JSON file of supported app data. The current Progress/Settings export is format 1.5 and includes saved watch segments and PDF page bookmarks. Imported video and PDF file blobs are stored separately and are **not** included: retain the original files for migration.

Changing browser profile, hostname, or port can make the app look like it has no data because browser storage is origin-scoped.

### Keyboard Basics

- `Ctrl+K`: command palette.
- `Ctrl+/`: keyboard shortcuts.
- `Ctrl+B`: sidebar collapse.
- `Ctrl+Shift+D`: theme toggle.
- `Ctrl+=`, `Ctrl+-`, `Ctrl+0`: font scale controls.

Dialogs, drawers, and the command palette trap focus while open and return focus to the opener when closed.

For development and tests, see [CONTRIBUTING.md](../CONTRIBUTING.md).

### Common questions

**Can I open `index.html` directly?**  
No. Use `npm start` or the Windows launcher. Browser security rules block core features on `file://`.

**Does OpenCourseDeck upload my notes or progress?**  
Not by default. Configured AI endpoints receive the content you send to them, and linked external videos or PDFs are requested from their hosts.

**Why did my data disappear after changing ports?**  
Browser storage is scoped to the origin. `localhost:5173` and `localhost:5174` have separate storage.

**What should I back up?**  
Use the JSON export in Settings or Progress, keep a copy outside the app, and retain imported media files and any catalog JSON you edited yourself. See [Backup and restore](backup-restore.md).
