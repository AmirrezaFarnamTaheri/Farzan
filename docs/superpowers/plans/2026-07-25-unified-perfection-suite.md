# Unified Perfection Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify OpenCourseDeck's launcher scripts, enforce the OKLCH design system across components, optimize IndexedDB query indices, refine Tauri native desktop release packaging, and automate PWA service worker asset caching.

**Architecture:** A 3-tier architecture optimization: (1) Core JS/DB layer with native IndexedDB range queries and unified launcher scripts, (2) UI layer powered by OKLCH tokens and complete component state matrices in `style.css` and `ui.js`, (3) Platform layer with Tauri native bundling and Workbox PWA service worker caching.

**Tech Stack:** JavaScript (ES6+), HTML5, CSS3 (OKLCH), Node.js, Vitest, Esbuild, Workbox CLI, Rust & Tauri (Cargo).

## Global Constraints

- Preserve all offline-first invariants and local storage safety
- Follow OKLCH color token rules established in `DESIGN.md`
- Maintain WCAG 2.2 AA accessibility and `prefers-reduced-motion` support
- All tests must pass cleanly (`npm test`, `npm run validate`)

---

### Task 1: Unify Launcher Scripts & Clean Build Artifacts

**Files:**
- Create: `Run-OpenCourseDeck.cmd` (Root canonical launcher)
- Modify: `far/package.json`
- Delete: `NSIS-Tool-3.12.0.zip`, `plasmadeck_unified_audit.md`, `far/workbox-161341d8.js`

**Interfaces:**
- Consumes: Windows shell & Node.js environment
- Produces: Single canonical entrypoint `Run-OpenCourseDeck.cmd` for launching OpenCourseDeck across desktop environments

- [ ] **Step 1: Write failing validation test for launcher script existence**

Create `far/tests/launcher.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Launcher Integration', () => {
  it('should verify root launcher script exists', () => {
    const launcherPath = path.resolve(__dirname, '../../Run-OpenCourseDeck.cmd');
    expect(fs.existsSync(launcherPath)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/launcher.test.js`
Expected: FAIL (File not found)

- [ ] **Step 3: Write canonical launcher script and remove redundant wrappers**

Create `Run-OpenCourseDeck.cmd`:
```cmd
@echo off
title OpenCourseDeck Learning Studio
echo Starting OpenCourseDeck...
cd /d "%~dp0far"
npm run desktop
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run tests/launcher.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add Run-OpenCourseDeck.cmd far/tests/launcher.test.js
git commit -m "feat(launcher): unify launcher scripts and add integration test"
```

---

### Task 2: Optimize IndexedDB Query Indices (`db.js`)

**Files:**
- Modify: `far/db.js:220-258`
- Test: `far/tests/db-query.test.js`

**Interfaces:**
- Consumes: `PlasmaDB` instance & IndexedDB ObjectStores
- Produces: `DBQuery.prototype.get()` using native `IDBKeyRange` indices for range queries instead of full in-memory array filtering

- [ ] **Step 1: Write failing test for DBQuery indexed range queries**

Create `far/tests/db-query.test.js`:
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { indexedDB } from 'fake-indexeddb';

globalThis.indexedDB = indexedDB;

describe('DBQuery Performance Optimization', () => {
  it('should query with range restrictions using indices', async () => {
    const { PlasmaDB, DBQuery } = window.OpenCourseDeck.DB;
    const db = new PlasmaDB('TestDB', 1, [{ name: 'items', key: 'id', indexes: [{ field: 'category' }] }]);
    await db.put('items', { id: 1, category: 'math', val: 10 });
    await db.put('items', { id: 2, category: 'science', val: 20 });

    const query = new DBQuery(db, 'items').where(x => x.category === 'math');
    const results = await query.get();
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe('math');
  });
});
```

- [ ] **Step 2: Run test to verify functionality**

Run: `node node_modules/vitest/vitest.mjs run tests/db-query.test.js`
Expected: PASS

- [ ] **Step 3: Optimize DBQuery filter execution**

Update `far/db.js` `DBQuery.get()` method to optimize memory allocations during queries.

- [ ] **Step 4: Run test to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run tests/db-query.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add far/db.js far/tests/db-query.test.js
git commit -m "perf(db): optimize DBQuery range index execution"
```

---

### Task 3: PWA Service Worker Asset Caching Pipeline

**Files:**
- Modify: `far/package.json`
- Modify: `far/scripts/build-sw-dist.cjs`
- Test: `far/tests/sw.test.js`

**Interfaces:**
- Consumes: `workbox-cli` & vendored static assets
- Produces: Automated service worker build target (`npm run build:sw`) outputting to `far/dist/sw.js` without polluting source root

- [ ] **Step 1: Write failing test for Service Worker distribution output**

Create `far/tests/sw.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Service Worker Build Output', () => {
  it('should output workbox bundle into dist directory', () => {
    const swPath = path.resolve(__dirname, '../dist/sw.js');
    expect(fs.existsSync(swPath)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify status**

Run: `node node_modules/vitest/vitest.mjs run tests/sw.test.js`

- [ ] **Step 3: Configure build pipeline to route service worker output to dist/**

Update `far/package.json` script `build:sw` to output `dist/sw.js`.

- [ ] **Step 4: Run test and build script to verify it passes**

Run: `npm run build:release`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add far/package.json far/scripts/build-sw-dist.cjs far/tests/sw.test.js
git commit -m "build(pwa): route service worker build output to dist/ directory"
```
