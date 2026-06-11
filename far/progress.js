// ============================================================
// progress.js  — PlasmaDeck bulk progress & export
// ============================================================
'use strict';

const ProgressStats = (() => {

  /* ── helpers ────────────────────────────────────────────── */
  const q  = s => document.querySelector(s);
  const qq = s => [...document.querySelectorAll(s)];
  const fmtDate  = d => new Date(d).toLocaleDateString('fa-IR');
  /** Toast via app shell (avoid bridge App shim). */
  function pdToast(message, type = 'info') {
    const T = window.PlasmaDeck?.Toast;
    if (!T) return;
    const fn = T[type];
    if (typeof fn === 'function') return fn(String(message ?? ''));
    T.show?.({ message: String(message ?? ''), type });
  }
  async function pdConfirm(message) {
    const fn = window.PlasmaDeck?.UI?.confirm;
    if (typeof fn === 'function') return fn(message);
    return window.confirm(String(message ?? 'Are you sure?'));
  }
  const fmtTime  = sec => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
             : `${m}:${String(s).padStart(2,'0')}`;
  };

  /* ══════════════════════════════════════════════════════════
     AGGREGATE STATS
  ══════════════════════════════════════════════════════════ */
  async function getStats() {
    // Ensure catalog is loaded if available (bridge.js provides DataStore.init)
    try { await DataStore?.init?.(); } catch { /* ignore */ }
    const allProgress = await DB.getAllProgress();   // [{ topicId, courseId, position, duration, percent, status, updatedAt }]
    const allTopics   = DataStore.allTopics();

    const totalTopics  = allTopics.length;
    const doneTopics   = allProgress.filter(p => p.status === 'done').length;
    const inProgress   = allProgress.filter(p => p.status === 'in-progress').length;
    const notStarted   = totalTopics - doneTopics - inProgress;

    /* watch-time: sum of position × (position / duration) where duration > 0 */
    let watchedSec = 0;
    allProgress.forEach(p => {
      if (p.duration > 0) watchedSec += Math.min(p.position || 0, p.duration);
    });

    /* per-course breakdown */
    const courses = DataStore.allCourses();
    const byCourse = courses.map(c => {
      const topics   = allTopics.filter(t => t.courseId === c.id);
      const progs    = allProgress.filter(p => p.courseId === c.id);
      const done     = progs.filter(p => p.status === 'done').length;
      const total    = topics.length;
      const pct      = total ? Math.round((done / total) * 100) : 0;
      const watchSec = progs.reduce((a, p) => a + (p.duration > 0 ? Math.min(p.position || 0, p.duration) : 0), 0);
      return {
        courseId   : c.id,
        title      : c.title,
        total,
        done,
        inProgress : progs.filter(p => p.status === 'in-progress').length,
        pct,
        watchedSec : watchSec,
        watchedFmt : fmtTime(watchSec),
        lastUpdated: progs.reduce((a, p) => Math.max(a, p.updatedAt || 0), 0),
      };
    });

    /* streaks: days with at least one topic updated */
    const days = {};
    allProgress.forEach(p => {
      if (p.updatedAt) {
        const d = new Date(p.updatedAt).toDateString();
        days[d] = (days[d] || 0) + 1;
      }
    });
    const streak = _calcStreak(Object.keys(days));

    return {
      totalTopics,
      doneTopics,
      inProgress,
      notStarted,
      watchedSec,
      watchedFmt  : fmtTime(watchedSec),
      completionPct: totalTopics ? Math.round((doneTopics / totalTopics) * 100) : 0,
      byCourse,
      streak,
      activeDays  : Object.keys(days).length,
    };
  }

  function _calcStreak(dateStrings) {
    if (!dateStrings.length) return 0;
    const dates = dateStrings
      .map(d => new Date(d))
      .sort((a, b) => b - a);

    let streak = 0;
    let cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    for (const d of dates) {
      const day = new Date(d);
      day.setHours(0, 0, 0, 0);
      const diff = Math.round((cursor - day) / 86400000);
      if (diff === 0 || diff === 1) {
        streak++;
        cursor = day;
      } else {
        break;
      }
    }
    return streak;
  }

  /* ══════════════════════════════════════════════════════════
     RENDER STATS PAGE
  ══════════════════════════════════════════════════════════ */
  async function renderStatsPage() {
    const stats = await getStats();

    // summary cards
    _setText('#stat-total-topics',      stats.totalTopics);
    _setText('#stat-done-topics',       stats.doneTopics);
    _setText('#stat-in-progress',       stats.inProgress);
    _setText('#stat-completion-pct',    `${stats.completionPct}%`);
    _setText('#stat-watched-time',      stats.watchedFmt);
    _setText('#stat-streak',            `${stats.streak} روز`);
    _setText('#stat-active-days',       `${stats.activeDays} روز`);

    // overall progress bar
    const bar = q('#stat-overall-bar');
    if (bar) bar.style.width = `${stats.completionPct}%`;

    // per-course table
    const tbody = q('#stat-course-table-body');
    if (tbody) {
      tbody.innerHTML = stats.byCourse.map(c => `
        <tr>
          <td>${c.title}</td>
          <td>${c.total}</td>
          <td>${c.done}</td>
          <td>${c.inProgress}</td>
          <td>
            <div class="mini-bar-wrap">
              <div class="mini-bar" style="width:${c.pct}%"></div>
            </div>
            <span class="mini-bar-label">${c.pct}%</span>
          </td>
          <td>${c.watchedFmt}</td>
          <td>${c.lastUpdated ? fmtDate(c.lastUpdated) : '—'}</td>
        </tr>`).join('');
    }

    // chart (if Chart.js available)
    _renderCharts(stats);
  }

  function _renderCharts(stats) {
    if (!window.Chart) return;

    // Destroy previous instances to avoid leaks on re-render
    if (window.__plasmaCharts) {
      try { window.__plasmaCharts.overall?.destroy?.(); } catch {}
      try { window.__plasmaCharts.courses?.destroy?.(); } catch {}
    }
    window.__plasmaCharts = window.__plasmaCharts ?? {};

    // doughnut — overall completion
    const dCtx = q('#chart-overall')?.getContext('2d');
    if (dCtx) {
      window.__plasmaCharts.overall = new Chart(dCtx, {
        type: 'doughnut',
        data: {
          labels: ['تمام‌شده', 'در حال یادگیری', 'شروع‌نشده'],
          datasets: [{
            data: [stats.doneTopics, stats.inProgress, stats.notStarted],
            backgroundColor: ['#4caf50','#2196f3','#bdbdbd'],
          }],
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
      });
    }

    // bar — per-course completion %
    const bCtx = q('#chart-courses')?.getContext('2d');
    if (bCtx) {
      window.__plasmaCharts.courses = new Chart(bCtx, {
        type: 'bar',
        data: {
          labels  : stats.byCourse.map(c => c.title),
          datasets: [{
            label           : 'درصد تکمیل',
            data            : stats.byCourse.map(c => c.pct),
            backgroundColor : '#2196f3',
          }],
        },
        options: {
          responsive: true,
          scales: { y: { min: 0, max: 100 } },
          plugins: { legend: { display: false } },
        },
      });
    }
  }

  /* ══════════════════════════════════════════════════════════
     BULK OPERATIONS
  ══════════════════════════════════════════════════════════ */

  /** Mark all topics in a course as done */
  async function markCourseAllDone(courseId) {
    const topics = DataStore.allTopics().filter(t => t.courseId === courseId);
    await Promise.all(topics.map(t =>
      DB.saveProgress(t.topicId, courseId, {
        status    : 'done',
        percent   : 100,
        updatedAt : Date.now(),
      })
    ));
    pdToast(`تمام سرفصل‌های دوره «تمام‌شده» علامت زده شد ✓`, 'success');
  }

  /** Reset all progress for a course */
  async function resetCourseProgress(courseId) {
    const confirmed = await pdConfirm('تمام پیشرفت این دوره پاک شود؟');
    if (!confirmed) return;
    const topics = DataStore.allTopics().filter(t => t.courseId === courseId);
    await Promise.all(topics.map(t =>
      DB.saveProgress(t.topicId, courseId, {
        status   : 'not-started',
        percent  : 0,
        position : 0,
        updatedAt: Date.now(),
      })
    ));
    pdToast('پیشرفت دوره ریست شد', 'info');
  }

  /** Toggle a single topic's done status */
  async function toggleTopicDone(topicId, courseId) {
    const existing = await DB.getProgress(topicId);
    const isDone   = existing?.status === 'done';
    await DB.saveProgress(topicId, courseId, {
      status   : isDone ? 'not-started' : 'done',
      percent  : isDone ? 0 : 100,
      position : isDone ? 0 : (existing?.position || 0),
      updatedAt: Date.now(),
    });
    return !isDone;
  }

  /* ══════════════════════════════════════════════════════════
     EXPORT
  ══════════════════════════════════════════════════════════ */

  /** Export all progress + notes as JSON backup */
  async function exportJSON() {
    const allProgress  = await DB.getAllProgress();
    const allNotes     = await DB.getAllNotes();
    const allTimestamps= await DB.getAllTimestamps();

    const payload = {
      exportedAt  : new Date().toISOString(),
      version     : '1.0',
      progress    : allProgress,
      notes       : allNotes,
      timestamps  : allTimestamps,
    };
    _downloadJSON(payload, `plasmadeck-backup-${_isoDate()}.json`);
    pdToast('فایل JSON دانلود شد ✓', 'success');
  }

  /** Export progress as CSV */
  async function exportCSV() {
    const allProgress = await DB.getAllProgress();
    const allTopics   = DataStore.allTopics();
    const topicMap    = Object.fromEntries(allTopics.map(t => [t.topicId, t]));

    const rows = [
      ['courseId', 'courseTitle', 'topicId', 'topicTitle', 'status', 'percent', 'position', 'duration', 'updatedAt'],
    ];
    allProgress.forEach(p => {
      const t = topicMap[p.topicId] || {};
      rows.push([
        p.courseId,
        t.courseTitle || '',
        p.topicId,
        t.title || '',
        p.status || 'not-started',
        p.percent ?? 0,
        p.position ?? 0,
        p.duration  ?? 0,
        p.updatedAt ? new Date(p.updatedAt).toISOString() : '',
      ]);
    });

    const csv = rows.map(r => r.map(_csvCell).join(',')).join('\n');
    _downloadText(csv, `plasmadeck-progress-${_isoDate()}.csv`, 'text/csv');
    pdToast('فایل CSV دانلود شد ✓', 'success');
  }

  /** Export notes as Markdown */
  async function exportNotesMarkdown() {
    const allNotes  = await DB.getAllNotes();
    const allTopics = DataStore.allTopics();
    const topicMap  = Object.fromEntries(allTopics.map(t => [t.topicId, t]));

    const lines = [`# PlasmaDeck Notes Export\n_${new Date().toISOString()}_\n`];
    allNotes.forEach(n => {
      const t = topicMap[n.topicId] || {};
      lines.push(`\n## ${t.title || n.topicId}`);
      lines.push(`> دوره: ${t.courseId || n.courseId || '—'}\n`);
      lines.push(_htmlToMarkdown(n.html || '') || n.text || '');
    });

    _downloadText(lines.join('\n'), `plasmadeck-notes-${_isoDate()}.md`, 'text/markdown');
    pdToast('یادداشت‌ها به Markdown دانلود شد ✓', 'success');
  }

  /** Import JSON backup */
  async function importJSON() {
    const input = document.createElement('input');
    input.type  = 'file';
    input.accept= '.json,application/json';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const text    = await file.text();
        const payload = JSON.parse(text);
        if (!payload.progress) throw new Error('فرمت فایل نادرست');

        const confirmed = await pdConfirm(
          `${payload.progress.length} رکورد پیشرفت و ${payload.notes?.length || 0} یادداشت وارد شود؟`
        );
        if (!confirmed) return;

        await Promise.all(payload.progress.map(p =>
          DB.saveProgress(p.topicId, p.courseId, p)
        ));
        // Import notes using DB.saveNote (handles IndexedDB/localStorage abstraction)
          if (payload.notes?.length) {
            const imported = payload.notes.map((n) => ({
              id: n.id ?? `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
              title: n.title ?? (n.topicId ? `Topic ${n.topicId}` : 'Imported note'),
              content: n.content ?? n.html ?? '',
              folderId: n.folderId ?? 'default',
              tags: n.tags ?? [],
              pinned: !!n.pinned,
              color: n.color ?? '',
              createdAt: n.createdAt ?? Date.now(),
              updatedAt: n.updatedAt ?? Date.now(),
              wordCount: n.wordCount ?? 0,
              charCount: n.charCount ?? 0,
              topicId: n.topicId,
              courseId: n.courseId,
              text: n.text,
              html: n.html,
            }));

            for (const n of imported) {
              await DB.saveNote(n);
            }

            // Nudge Notes UI to refresh if open
            try { window.PlasmaNotesApp?.init?.(); } catch { /* ignore */ }
            try { window.PlasmaDeck?.Toast?.success?.(`Imported ${imported.length} notes.`); } catch { /* ignore */ }
          } catch { /* ignore */ }
          try { window.PlasmaDeck?.Toast?.success?.(`Imported ${imported.length} notes.`); } catch { /* ignore */ }
        }
        if (payload.timestamps) {
          await Promise.all(payload.timestamps.map(ts =>
            DB.saveTimestamp(ts)
          ));
        }
        pdToast('وارد کردن داده‌ها با موفقیت انجام شد ✓', 'success');
      } catch (err) {
        console.error('[Progress] import error', err);
        pdToast('خطا در وارد کردن: ' + err.message, 'error');
      }
    };
    input.click();
  }

  /* ══════════════════════════════════════════════════════════
     BIND BUTTONS ON STATS/SETTINGS PAGE
  ══════════════════════════════════════════════════════════ */
  function bindButtons() {
    if (bindButtons._bound) return;
    bindButtons._bound = true;
    _on('#btn-export-json',  'click', exportJSON);
    _on('#btn-export-csv',   'click', exportCSV);
    _on('#btn-export-md',    'click', exportNotesMarkdown);
    _on('#btn-import-json',  'click', importJSON);
    _on('#btn-reset-all',    'click', async () => {
      const ok = await pdConfirm('⚠️ تمام پیشرفت‌ها، یادداشت‌ها و تایم‌استمپ‌ها پاک شوند؟');
      if (!ok) return;
      await DB.clearAll();
      pdToast('تمام داده‌ها پاک شد', 'info');
      renderStatsPage();
    });
  }

  /* ══════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════ */
  function _setText(sel, val) {
    const el = q(sel);
    if (el) el.textContent = val;
  }

  function _on(sel, ev, fn) {
    const el = q(sel);
    if (el) el.addEventListener(ev, fn);
  }

  function _isoDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function _csvCell(val) {
    const s = String(val ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  }

  function _downloadJSON(obj, filename) {
    _downloadText(JSON.stringify(obj, null, 2), filename, 'application/json');
  }

  function _downloadText(text, filename, mime = 'text/plain') {
    const blob = new Blob([text], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* very naive HTML → Markdown — good enough for Quill output */
  function _htmlToMarkdown(html) {
    return html
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi,   '# $1\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi,   '## $1\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi,   '### $1\n')
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>(.*?)<\/b>/gi,     '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi,   '*$1*')
      .replace(/<i[^>]*>(.*?)<\/i>/gi,     '*$1*')
      .replace(/<code[^>]*>(.*?)<\/code>/gi,'`$1`')
      .replace(/<li[^>]*>(.*?)<\/li>/gi,   '- $1\n')
      .replace(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      .replace(/<br\s*\/?>/gi,             '\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi,     '$1\n\n')
      .replace(/<[^>]+>/g,                 '')
      .replace(/&amp;/g,  '&')
      .replace(/&lt;/g,   '<')
      .replace(/&gt;/g,   '>')
      .replace(/&nbsp;/g, ' ')
      .trim();
  }

  /* ── public API ─────────────────────────────────────────── */
  return {
    getStats,
    renderStatsPage,
    bindButtons,
    markCourseAllDone,
    resetCourseProgress,
    toggleTopicDone,
    exportJSON,
    exportCSV,
    exportNotesMarkdown,
    importJSON,
  };
})();

document.addEventListener('DOMContentLoaded', () => ProgressStats.bindButtons());

// Public init helper for SPA route injection
window.PlasmaDeck = window.PlasmaDeck ?? {};
window.PlasmaDeck.ProgressStatsInit = async () => {
  try {
    ProgressStats.bindButtons();
    await ProgressStats.renderStatsPage();
  } catch (e) {
    console.error('[ProgressStatsInit] failed', e);
  }
};

// ============================================================
// progress.js
// Unified Progress, Loading & Animation System
// ============================================================

  const Progress = (() => {

    // ── Shared easing functions ──────────────────────────
    const Ease = {
      linear:      t => t,
      easeIn:      t => t * t,
      easeOut:     t => t * (2 - t),
      easeInOut:   t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
      easeInCubic: t => t * t * t,
      easeOutCubic:t => (--t) * t * t + 1,
      easeInOutCubic: t => t < 0.5 ? 4*t*t*t : (t-1)*(2*t-2)*(2*t-2)+1,
      spring:      t => 1 - Math.cos(t * Math.PI * 4.5) * Math.pow(2, -8 * t),
      bounce:      t => {
        if (t < 1/2.75) return 7.5625 * t * t;
        if (t < 2/2.75) { t -= 1.5/2.75;   return 7.5625*t*t + 0.75; }
        if (t < 2.5/2.75){ t -= 2.25/2.75; return 7.5625*t*t + 0.9375; }
        t -= 2.625/2.75; return 7.5625*t*t + 0.984375;
      },
    };


    // ── 1. Linear progress bars ──────────────────────────
    const LinearBar = {
      /**
       * Set progress bar value (0–100)
       * @param {string|HTMLElement} bar
       * @param {number} value
       */
      set(bar, value) {
        const el = this._resolve(bar);
        if (!el) return;
        const clamped = Math.min(100, Math.max(0, value));
        const fill    = el.querySelector('.progress-fill, [data-progress-fill]');
        const label   = el.querySelector('.progress-label, [data-progress-label]');

        if (fill)  fill.style.width = `${clamped}%`;
        else       el.style.setProperty('--progress', `${clamped}%`);

        if (label) label.textContent = `${Math.round(clamped)}%`;

        el.setAttribute('aria-valuenow', String(Math.round(clamped)));

        // Color thresholds
        el.classList.remove('progress-low', 'progress-mid', 'progress-high', 'progress-full');
        if      (clamped === 100) el.classList.add('progress-full');
        else if (clamped >= 70)   el.classList.add('progress-high');
        else if (clamped >= 35)   el.classList.add('progress-mid');
        else                      el.classList.add('progress-low');
      },

      /**
       * Animate bar from current → target
       * @param {string|HTMLElement} bar
       * @param {number} target         0–100
       * @param {number} duration       ms
       * @param {string} easing
       * @returns {Promise<void>}
       */
      animate(bar, target, duration = 700, easing = 'easeOut') {
        const el = this._resolve(bar);
        if (!el) return Promise.resolve();

        const easeFn  = Ease[easing] ?? Ease.easeOut;
        const fill    = el.querySelector('.progress-fill, [data-progress-fill]');
        const startW  = parseFloat((fill?.style.width) || el.style.getPropertyValue('--progress') || '0');
        const startTs = performance.now();

        return new Promise(resolve => {
          const step = ts => {
            const pct  = Math.min((ts - startTs) / duration, 1);
            const val  = startW + (target - startW) * easeFn(pct);
            this.set(el, val);
            if (pct < 1) requestAnimationFrame(step);
            else resolve();
          };
          requestAnimationFrame(step);
        });
      },

      /**
       * Step progress bar in increments (e.g. multi-step upload)
       */
      step(bar, total, current, duration = 400) {
        const pct = (current / total) * 100;
        return this.animate(bar, pct, duration);
      },

      /**
       * Set bar to indeterminate (shimmer) mode
       */
      indeterminate(bar, on = true) {
        const el = this._resolve(bar);
        if (!el) return;
        el.classList.toggle('progress-indeterminate', on);
        if (on) {
          el.removeAttribute('aria-valuenow');
        }
      },

      _resolve(bar) {
        return typeof bar === 'string' ? document.getElementById(bar) : bar;
      },

      /**
       * Auto-init all [data-progress] elements on page
       */
      init() {
        document.querySelectorAll('[data-progress]').forEach(el => {
          const val = parseFloat(el.dataset.progress ?? '0');
          const animated = el.hasAttribute('data-progress-animate');
          if (animated) this.animate(el, val, 900, 'easeOut');
          else          this.set(el, val);
        });
      },
    };


    // ── 2. Circular / Ring progress ──────────────────────
    const CircularProgress = {
      /**
       * Set SVG circle progress (stroke-dashoffset technique)
       * @param {string|HTMLElement} ring
       * @param {number} value  0–100
       */
      set(ring, value) {
        const el     = this._resolve(ring);
        if (!el) return;
        const circle = el.querySelector('circle.progress-ring-fill, [data-ring-fill]');
        if (!circle) return;

        const r          = parseFloat(circle.getAttribute('r') ?? '36');
        const circumference = 2 * Math.PI * r;
        const clamped    = Math.min(100, Math.max(0, value));
        const offset     = circumference - (clamped / 100) * circumference;

        circle.style.strokeDasharray  = `${circumference}`;
        circle.style.strokeDashoffset = `${offset}`;

        const label = el.querySelector('[data-ring-label]');
        if (label) label.textContent = `${Math.round(clamped)}%`;

        el.setAttribute('aria-valuenow', String(Math.round(clamped)));
      },

      animate(ring, target, duration = 700, easing = 'easeOut') {
        const el = this._resolve(ring);
        if (!el) return Promise.resolve();
        const circle  = el.querySelector('circle.progress-ring-fill, [data-ring-fill]');
        if (!circle) return Promise.resolve();

        const r            = parseFloat(circle.getAttribute('r') ?? '36');
        const circumference = 2 * Math.PI * r;
        const startOffset  = parseFloat(circle.style.strokeDashoffset ?? String(circumference));
        const startPct     = 100 * (1 - startOffset / circumference);
        const easeFn       = Ease[easing] ?? Ease.easeOut;
        const startTs      = performance.now();

        return new Promise(resolve => {
          const step = ts => {
            const pct  = Math.min((ts - startTs) / duration, 1);
            const val  = startPct + (target - startPct) * easeFn(pct);
            this.set(el, val);
            if (pct < 1) requestAnimationFrame(step);
            else resolve();
          };
          requestAnimationFrame(step);
        });
      },

      /**
       * Create a ring SVG element programmatically
       */
      create({ size = 80, strokeWidth = 8, color = '#6366f1',
               trackColor = 'rgba(255,255,255,0.08)', value = 0, label = true } = {}) {
        const r    = (size - strokeWidth) / 2;
        const cx   = size / 2;
        const circ = 2 * Math.PI * r;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
        svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
        svg.setAttribute('role', 'progressbar');
        svg.setAttribute('aria-valuemin', '0');
        svg.setAttribute('aria-valuemax', '100');
        svg.classList.add('progress-ring');

        const mkCircle = (cls, col, dashoffset) => {
          const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          c.setAttribute('cx', cx);
          c.setAttribute('cy', cx);
          c.setAttribute('r', r);
          c.setAttribute('fill', 'none');
          c.setAttribute('stroke', col);
          c.setAttribute('stroke-width', strokeWidth);
          c.style.strokeDasharray  = `${circ}`;
          c.style.strokeDashoffset = `${dashoffset}`;
          c.style.transform        = 'rotate(-90deg)';
          c.style.transformOrigin  = '50% 50%';
          c.classList.add(cls);
          return c;
        };

        svg.appendChild(mkCircle('progress-ring-track', trackColor, 0));
        const fillCircle = mkCircle('progress-ring-fill', color, circ);
        fillCircle.setAttribute('data-ring-fill', '');
        svg.appendChild(fillCircle);

        if (label) {
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('x', '50%');
          text.setAttribute('y', '50%');
          text.setAttribute('dominant-baseline', 'middle');
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('fill', '#f1f5f9');
          text.setAttribute('font-size', `${Math.round(size * 0.18)}px`);
          text.setAttribute('font-family', 'Inter, sans-serif');
          text.setAttribute('data-ring-label', '');
          text.textContent = '0%';
          svg.appendChild(text);
        }

        this.set(svg, value);
        return svg;
      },

      _resolve(el) {
        return typeof el === 'string' ? document.getElementById(el) : el;
      },

      init() {
        document.querySelectorAll('[data-ring-progress]').forEach(el => {
          const val      = parseFloat(el.dataset.ringProgress ?? '0');
          const animated = el.hasAttribute('data-ring-animate');
          if (animated) this.animate(el, val, 900, 'easeOutCubic');
          else          this.set(el, val);
        });
      },
    };


    // ── 3. Page-level loading bar (thin top bar) ─────────
    const PageBar = {
      _el:    null,
      _timer: null,
      _value: 0,

      _ensure() {
        if (this._el) return;
        this._el = document.createElement('div');
        this._el.className = 'page-progress-bar';
        this._el.setAttribute('role', 'progressbar');
        this._el.setAttribute('aria-hidden', 'true');
        this._el.style.cssText = `
          position: fixed; top: 0; left: 0; z-index: 99999;
          height: 3px; width: 0%;
          background: linear-gradient(90deg, #6366f1, #06b6d4);
          border-radius: 0 2px 2px 0;
          transition: width 0.4s ease, opacity 0.3s ease;
          pointer-events: none; opacity: 0;
        `;
        document.body.appendChild(this._el);
      },

      start() {
        this._ensure();
        clearTimeout(this._timer);
        this._value = 0;
        this._el.style.opacity    = '1';
        this._el.style.transition = 'none';
        this._el.style.width      = '0%';

        requestAnimationFrame(() => {
          this._el.style.transition = 'width 8s cubic-bezier(0.05, 0.6, 0.4, 0.9)';
          this._el.style.width      = '82%';
        });
      },

      set(value) {
        this._ensure();
        this._el.style.transition = 'width 0.25s ease';
        this._el.style.width      = `${Math.min(99, value)}%`;
        this._value               = value;
      },

      finish() {
        this._ensure();
        clearTimeout(this._timer);
        this._el.style.transition = 'width 0.2s ease';
        this._el.style.width      = '100%';
        this._timer = setTimeout(() => {
          this._el.style.opacity = '0';
          setTimeout(() => { this._el.style.width = '0%'; }, 300);
        }, 250);
      },

      fail() {
        this._ensure();
        this._el.style.background = '#ef4444';
        this._el.style.width      = '100%';
        this._timer = setTimeout(() => {
          this._el.style.opacity = '0';
          setTimeout(() => {
            this._el.style.background = 'linear-gradient(90deg, #6366f1, #06b6d4)';
            this._el.style.width      = '0%';
          }, 300);
        }, 600);
      },
    };


    // ── 4. Step Wizard Progress ──────────────────────────
    const StepProgress = {
      init() {
        document.querySelectorAll('[data-steps]').forEach(el => {
          const total   = parseInt(el.dataset.steps, 10);
          const current = parseInt(el.dataset.stepCurrent ?? '1', 10);
          this._render(el, total, current);
        });

        document.addEventListener('click', e => {
          const btn = e.target.closest('[data-step-next]');
          if (btn) this._move(btn, 1);
          const back = e.target.closest('[data-step-prev]');
          if (back) this._move(back, -1);
        });
      },

      _move(btn, dir) {
        const wizard  = btn.closest('[data-step-wizard]');
        if (!wizard) return;
        const current = parseInt(wizard.dataset.stepCurrent ?? '1', 10);
        const total   = parseInt(wizard.dataset.steps ?? '1', 10);
        const next    = Math.min(total, Math.max(1, current + dir));

        if (dir > 0) {
          // Validate current step before proceeding
          const panel = wizard.querySelector(`[data-step-panel="${current}"]`);
          if (panel) {
            const inputs = panel.querySelectorAll('input[required], select[required]');
            const valid  = [...inputs].every(i => i.checkValidity());
            if (!valid) {
              inputs.forEach(i => { if (!i.checkValidity()) i.classList.add('is-error'); });
              return;
            }
          }
        }

        this.goTo(wizard, next);
      },

      goTo(wizard, step) {
        const total   = parseInt(wizard.dataset.steps ?? '1', 10);
        const clamped = Math.min(total, Math.max(1, step));
        wizard.dataset.stepCurrent = String(clamped);

        // Update panels
        wizard.querySelectorAll('[data-step-panel]').forEach(panel => {
          const pStep = parseInt(panel.dataset.stepPanel, 10);
          panel.hidden = pStep !== clamped;
          panel.classList.toggle('active', pStep === clamped);
        });

        // Update step indicators
        const tracker = wizard.querySelector('[data-steps]');
        if (tracker) this._render(tracker, total, clamped);

        // Update prev/next buttons
        const prevBtn = wizard.querySelector('[data-step-prev]');
        const nextBtn = wizard.querySelector('[data-step-next]');
        const doneBtn = wizard.querySelector('[data-step-done]');
        if (prevBtn) prevBtn.disabled = clamped === 1;
        if (nextBtn) nextBtn.hidden   = clamped === total;
        if (doneBtn) doneBtn.hidden   = clamped !== total;

        window.PlasmaDeck?.bus?.emit('steps:change', { step: clamped, total, wizard });
      },

      _render(el, total, current) {
        let list = el.querySelector('.step-list');
        if (!list) { list = document.createElement('div'); list.className = 'step-list'; el.appendChild(list); }
        list.innerHTML = '';

        for (let i = 1; i <= total; i++) {
          const item = document.createElement('div');
          item.className = `step-item ${i < current ? 'done' : i === current ? 'active' : ''}`;
          item.innerHTML = `
            <div class="step-dot">${i < current ? '✓' : i}</div>
            ${i < total ? '<div class="step-connector"></div>' : ''}
          `;
          list.appendChild(item);
        }
      },
    };


    // ── 5. Skeleton loader ───────────────────────────────
    const Skeleton = {
      show(container) {
        const el = typeof container === 'string'
          ? document.getElementById(container)
          : container;
        if (!el) return;
        el.classList.add('skeleton-loading');
        el.querySelectorAll('[data-skeleton]').forEach(s => s.removeAttribute('hidden'));
        el.querySelectorAll('[data-content]').forEach(c => c.setAttribute('hidden', ''));
      },

      hide(container, delay = 0) {
        const el = typeof container === 'string'
          ? document.getElementById(container)
          : container;
        if (!el) return;
        const apply = () => {
          el.classList.remove('skeleton-loading');
          el.querySelectorAll('[data-skeleton]').forEach(s => s.setAttribute('hidden', ''));
          el.querySelectorAll('[data-content]').forEach(c => c.removeAttribute('hidden'));
        };
        delay ? setTimeout(apply, delay) : apply();
      },

      /**
       * Create skeleton placeholder HTML
       */
      create({ lines = 3, avatar = false, image = false, imageHeight = 160 } = {}) {
        let html = '';
        if (image)  html += `<div class="skeleton skeleton-image" style="height:${imageHeight}px"></div>`;
        if (avatar) html += `<div class="skeleton-header"><div class="skeleton skeleton-avatar"></div>
                              <div class="skeleton-lines"><div class="skeleton skeleton-line w-50"></div>
                              <div class="skeleton skeleton-line w-30"></div></div></div>`;
        for (let i = 0; i < lines; i++) {
          const w = [100, 90, 75, 85, 60][i % 5];
          html += `<div class="skeleton skeleton-line" style="width:${w}%"></div>`;
        }
        return html;
      },
    };


    // ── 6. General Tween / Animation helper ──────────────
    const Tween = {
      _active: new Set(),

      /**
       * Animate any numeric property
       * @param {Object} target    object to mutate
       * @param {Object} props     { propName: endValue }
       * @param {number} duration  ms
       * @param {string} easing
       * @param {Function} onUpdate  callback each frame
       * @param {Function} onComplete
       * @returns {{ cancel: Function }}
       */
      to(target, props, duration = 400, easing = 'easeOut', onUpdate = null, onComplete = null) {
        const easeFn  = Ease[easing] ?? Ease.easeOut;
        const start   = {};
        for (const k of Object.keys(props)) start[k] = target[k] ?? 0;
        const startTs = performance.now();
        let cancelled = false;

        const step = ts => {
          if (cancelled) return;
          const pct = Math.min((ts - startTs) / duration, 1);
          const t   = easeFn(pct);
          for (const [k, end] of Object.entries(props)) {
            target[k] = start[k] + (end - start[k]) * t;
          }
          onUpdate?.(target, pct);
          if (pct < 1) requestAnimationFrame(step);
          else {
            // Snap to exact end values
            for (const [k, end] of Object.entries(props)) target[k] = end;
            onComplete?.(target);
          }
        };
        requestAnimationFrame(step);

        const handle = { cancel: () => { cancelled = true; } };
        this._active.add(handle);
        return handle;
      },

      /**
       * Count-up animation on a DOM element
       */
      countUp(el, end, duration = 1500, { prefix = '', suffix = '', decimals = 0, easing = 'easeOut' } = {}) {
        const target  = { val: 0 };
        const easeFn  = Ease[easing] ?? Ease.easeOut;
        const startTs = performance.now();
        const fmt     = v => prefix + v.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }) + suffix;

        const step = ts => {
          const pct = Math.min((ts - startTs) / duration, 1);
          const val = end * easeFn(pct);
          el.textContent = fmt(val);
          if (pct < 1) requestAnimationFrame(step);
          else el.textContent = fmt(end);
        };
        requestAnimationFrame(step);
      },

      /**
       * Fade an element in or out
       */
      fade(el, toOpacity, duration = 300, easing = 'easeOut') {
        const fromOpacity = parseFloat(getComputedStyle(el).opacity);
        const obj  = { v: fromOpacity };
        if (toOpacity > 0) { el.style.display = ''; el.style.opacity = fromOpacity; }
        return this.to(
          obj, { v: toOpacity }, duration, easing,
          () => { el.style.opacity = obj.v; },
          () => { if (toOpacity === 0) el.style.display = 'none'; }
        );
      },

      /**
       * Slide-in an element
       */
      slideIn(el, from = 'bottom', distance = 24, duration = 350, easing = 'easeOut') {
        const axis  = (from === 'left' || from === 'right') ? 'X' : 'Y';
        const sign  = (from === 'right' || from === 'bottom') ? 1 : -1;
        const obj   = { v: sign * distance, o: 0 };
        el.style.display  = '';
        el.style.opacity  = '0';
        el.style.transform = `translate${axis}(${obj.v}px)`;
        return this.to(
          obj, { v: 0, o: 1 }, duration, easing,
          () => {
            el.style.transform = `translate${axis}(${obj.v}px)`;
            el.style.opacity   = String(obj.o);
          },
          () => { el.style.transform = ''; el.style.opacity = ''; }
        );
      },
    };


    // ── 7. Observer-triggered animations ─────────────────
    const ScrollReveal = {
      _observer: null,

      init() {
        this._observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el  = entry.target;
            const ani = el.dataset.reveal ?? 'fade';
            const del = parseInt(el.dataset.revealDelay ?? '0', 10);

            setTimeout(() => this._play(el, ani), del);
            this._observer.unobserve(el);
          });
        }, { threshold: 0.15 });

        document.querySelectorAll('[data-reveal]').forEach(el => {
          el.style.opacity   = '0';
          this._observer.observe(el);
        });

        // Also init linear bars, rings, counters
        LinearBar.init();
        CircularProgress.init();
        StepProgress.init();

        document.querySelectorAll('[data-counter]').forEach(el => {
          const countObs = new IntersectionObserver(entries => {
            if (!entries[0].isIntersecting) return;
            const end      = parseFloat(String(el.dataset.counter).replace(/,/g, ''));
            const dur      = parseInt(el.dataset.counterDuration ?? '1500', 10);
            const decimals = parseInt(el.dataset.counterDecimals ?? '0', 10);
            const prefix   = el.dataset.counterPrefix ?? '';
            const suffix   = el.dataset.counterSuffix ?? '';
            Tween.countUp(el, end, dur, { prefix, suffix, decimals });
            countObs.unobserve(el);
          }, { threshold: 0.3 });
          countObs.observe(el);
        });
      },

      _play(el, animation) {
        switch (animation) {
          case 'fade':
            el.style.opacity = '0';
            Tween.fade(el, 1, 500);
            break;
          case 'slide-up':
            Tween.slideIn(el, 'bottom', 28, 500);
            break;
          case 'slide-down':
            Tween.slideIn(el, 'top', 28, 500);
            break;
          case 'slide-left':
            Tween.slideIn(el, 'right', 28, 500);
            break;
          case 'slide-right':
            Tween.slideIn(el, 'left', 28, 500);
            break;
          case 'scale': {
            el.style.transform = 'scale(0.85)';
            el.style.opacity   = '0';
            const obj = { s: 0.85, o: 0 };
            Tween.to(obj, { s: 1, o: 1 }, 450, 'easeOutCubic',
              () => { el.style.transform = `scale(${obj.s})`; el.style.opacity = String(obj.o); },
              () => { el.style.transform = ''; el.style.opacity = ''; }
            );
            break;
          }
          default:
            el.style.opacity = '1';
        }
      },
    };


    // ── Public API ────────────────────────────────────────
    return {
      bar:      LinearBar,
      ring:     CircularProgress,
      page:     PageBar,
      steps:    StepProgress,
      skeleton: Skeleton,
      tween:    Tween,
      reveal:   ScrollReveal,
      ease:     Ease,

      /** Initialize all progress subsystems */
      init() {
        ScrollReveal.init();
      },
    };

  })(); // end Progress IIFE

  window.PlasmaDeck = window.PlasmaDeck ?? {};
  // NOTE: app.js also defines `PlasmaDeck.Progress` for lightweight page-level progress bars.
  // This module's animation/tween/reveal toolkit is exposed as `ProgressUI` to avoid collisions.
  window.PlasmaDeck.ProgressUI = Progress;
  window.Progress = window.Progress ?? Progress;

  // Export the bulk stats/export API too (ProgressStats lives in module scope otherwise)
  window.PlasmaDeck.ProgressStats = ProgressStats;
  window.ProgressStats = window.ProgressStats ?? ProgressStats;
