## Getting Started

This guide gets a new user from first launch to a useful study session.

### Start The App

From the `far/` folder:

```bash
npm install
npm run first-run
npm start
```

Open `http://localhost:5173/`. Keep the terminal running while you use the app.

Windows users can also use `Run-OpenCourseDeck.vbs` or `Run-OpenCourseDeck.cmd`.

### First Tour

1. Start on Home and use the launch cards to open Courses, Notes, Help, PDF, Studio, or Settings.
2. Press `Tab` once from the top of the page to reveal the skip link.
3. Press `Ctrl+K` to open the command palette and jump to any section.
4. Search the command palette for `backup`, `shortcuts`, or `guide` when you need recovery actions.
5. Open Settings to confirm the storage summary and backup actions.

### Add Or Open Content

- Courses come from the active catalog selected in `data/catalog.json`.
- Use Materials for your local content library workflow.
- Use Notes for free-form study notes, tags, folders, import, and export.
- Use PDF when studying documents.
- Use Studio for canvas work.

### Where Your Data Lives

Data is stored in your browser profile for the local origin, usually `http://localhost:5173`.

- Progress and timestamps use IndexedDB when available.
- Preferences use `localStorage`.
- Backup/export creates a JSON file you control.

Changing browser profile, hostname, or port can make the app look like it has no data because browser storage is origin-scoped.

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

### Newcomer FAQ

**Can I open `index.html` directly?**  
No. Use `npm start` or the Windows launcher. Browser security rules block core features on `file://`.

**Does OpenCourseDeck upload my notes or progress?**  
No. The app is local-first and does not upload by default.

**Why did my data disappear after changing ports?**  
Browser storage is scoped to the origin. `localhost:5173` and `localhost:5174` have separate storage.

**What should I back up?**  
Use the in-app export actions for progress and notes. Also keep any custom catalog JSON files you edited outside the app.
