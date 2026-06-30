import { debounce, eventTargetEl, restoreFocus, setAppInert, trapFocus } from '../lib/dom.js';

export function initCommandPalette() {
  const OpenCourseDeck = window.OpenCourseDeck ?? {};

  const cpOverlay = document.getElementById('command-palette-overlay');
  const cpInput = document.getElementById('cp-input');
  const cpResults = document.getElementById('cp-results');
  const cpCats = document.getElementById('cp-categories');
  const cpRoot = document.getElementById('command-palette') ?? cpOverlay;

  if (!cpOverlay || !cpInput || !cpResults || !cpCats || !cpRoot) return;
  if (cpOverlay.dataset.pdCommandPaletteInited === 'true') return;
  cpOverlay.dataset.pdCommandPaletteInited = 'true';

  let cpCleanupFocusTrap = null;
  let cpCleanupFocusGuard = null;
  let cpPrevFocus = null;
  let cpSelectedIdx = -1;
  let cpActiveCat = 'all';

  const app = () => window.OpenCourseDeck ?? OpenCourseDeck;
  const applyTheme = (theme) => {
    const manager = app().ThemeManager;
    if (typeof manager?.apply === 'function') manager.apply(theme);
    else manager?.set?.(theme);
  };

  const cpClose = () => {
    cpOverlay.setAttribute('aria-hidden', 'true');
    cpOverlay.classList.remove('open');
    cpOverlay.removeAttribute('data-open');
    cpInput.setAttribute('aria-expanded', 'false');
    if (typeof cpCleanupFocusTrap === 'function') {
      try { cpCleanupFocusTrap(); } catch { /* ignore */ }
    }
    if (typeof cpCleanupFocusGuard === 'function') {
      try { cpCleanupFocusGuard(); } catch { /* ignore */ }
    }
    cpCleanupFocusTrap = null;
    cpCleanupFocusGuard = null;
    setAppInert(false);
    restoreFocus(cpPrevFocus);
  };

  const cpOpen = () => {
    if (cpOverlay.classList.contains('open')) return;
    cpPrevFocus = document.activeElement;
    cpOverlay.setAttribute('aria-hidden', 'false');
    cpOverlay.classList.add('open');
    cpOverlay.setAttribute('data-open', 'true');
    cpInput.setAttribute('aria-expanded', 'true');
    cpInput.focus();
    cpInput.select();
    setAppInert(true);
    try { cpCleanupFocusTrap = trapFocus(cpRoot, { initialFocus: false }); } catch { /* ignore */ }
    const onFocusIn = (event) => {
      if (!cpOverlay.classList.contains('open')) return;
      if (cpRoot.contains(event.target)) return;
      cpInput.focus({ preventScroll: true });
    };
    document.addEventListener('focusin', onFocusIn);
    cpCleanupFocusGuard = () => document.removeEventListener('focusin', onFocusIn);
  };

  const items = [
    // Navigate
    { label: 'Home', hash: '#/home', cat: 'nav' },
    { label: 'Courses', hash: '#/courses', cat: 'nav' },
    { label: 'Notes', hash: '#/notes', cat: 'nav' },
    { label: 'PDF', hash: '#/pdf', cat: 'nav' },
    { label: 'Studio', hash: '#/studio', cat: 'nav' },
    { label: 'Progress', hash: '#/progress', cat: 'nav' },
    { label: 'Materials', hash: '#/materials', cat: 'nav' },
    { label: 'Help', hash: '#/help', cat: 'nav' },
    { label: 'Settings', hash: '#/settings', cat: 'nav' },
    { label: 'Achievements', hash: '#/achievements', cat: 'nav' },
    { label: 'Bookmarks', hash: '#/bookmarks', cat: 'nav' },
    { label: 'Playlists', hash: '#/playlists', cat: 'nav' },
    { label: 'Tags', hash: '#/tags', cat: 'nav' },
    { label: 'My Courses', hash: '#/my-courses', cat: 'nav' },
    // Theme
    { label: 'Theme: System', action: () => applyTheme('system'), cat: 'theme' },
    { label: 'Theme: Dark', action: () => applyTheme('dark'), cat: 'theme' },
    { label: 'Theme: Light', action: () => applyTheme('light'), cat: 'theme' },
    { label: 'Theme: Midnight', action: () => applyTheme('midnight'), cat: 'theme' },
    { label: 'Theme: Forest', action: () => applyTheme('forest'), cat: 'theme' },
    { label: 'Theme: Ocean', action: () => applyTheme('ocean'), cat: 'theme' },
    { label: 'Theme: Sunset', action: () => applyTheme('sunset'), cat: 'theme' },
    { label: 'Theme: Rose', action: () => applyTheme('rose'), cat: 'theme' },
    { label: 'Theme: Paper', action: () => applyTheme('paper'), cat: 'theme' },
    // Tools (quick UI prefs)
    { label: 'UI: Font size +', action: () => app().FontScale?.inc?.(), cat: 'tools' },
    { label: 'UI: Font size -', action: () => app().FontScale?.dec?.(), cat: 'tools' },
    { label: 'UI: Font size reset', action: () => app().FontScale?.reset?.(), cat: 'tools' },
    { label: 'UI: Density compact', action: () => app().Prefs?.set?.(app().Prefs?.KEYS?.density, 'compact'), cat: 'tools' },
    { label: 'UI: Density comfortable', action: () => app().Prefs?.set?.(app().Prefs?.KEYS?.density, 'comfortable'), cat: 'tools' },
    { label: 'UI: Density spacious', action: () => app().Prefs?.set?.(app().Prefs?.KEYS?.density, 'spacious'), cat: 'tools' },
    // Actions
    { label: 'Export backup', action: () => window.ProgressStats?.exportJSON?.(), cat: 'action' },
    { label: 'Show keyboard shortcuts', action: () => window.OpenCourseDeck?.KeyboardShortcuts?._showHelp?.(), cat: 'action' },
    { label: 'Open first-run guide', hash: '#/help', cat: 'action' },
    { label: 'Reload app', action: () => window.location.reload(), cat: 'action' },
  ];

  const getFiltered = (q = '') => {
    const query = q.trim().toLowerCase();
    const base = (cpActiveCat && cpActiveCat !== 'all') ? items.filter(i => i.cat === cpActiveCat) : items;
    return query ? base.filter(i => (i.label ?? '').toLowerCase().includes(query)) : base;
  };

  const setSelected = (idx) => {
    cpSelectedIdx = idx;
    const rows = [...cpResults.querySelectorAll('.cp-item[data-idx]')];
    rows.forEach((row) => row.setAttribute('aria-selected', 'false'));
    const row = rows.find(r => Number(r.getAttribute('data-idx')) === idx);
    if (row) {
      row.setAttribute('aria-selected', 'true');
      row.scrollIntoView?.({ block: 'nearest' });
    }
  };

  const activateSelected = () => {
    const row = cpResults.querySelector('.cp-item[aria-selected="true"][data-idx]');
    const idx = row ? Number(row.getAttribute('data-idx')) : -1;
    if (idx < 0) return;
    const list = getFiltered(cpInput.value ?? '');
    const item = list[idx];
    if (!item) return;
    if (item.hash) app().Router?.navigate?.(item.hash);
    if (typeof item.action === 'function') {
      try { item.action(); } catch (e) { console.warn('[Command palette] action failed', e); }
    }
    cpClose();
  };

  const renderResults = (q = '') => {
    const filtered = getFiltered(q).slice(0, 25);
    cpResults.replaceChildren();
    if (!filtered.length) {
      const li = document.createElement('li');
      li.className = 'cp-item';
      li.setAttribute('role', 'option');
      li.setAttribute('aria-disabled', 'true');
      li.textContent = 'No results';
      cpResults.appendChild(li);
      setSelected(-1);
      return;
    }

    for (let idx = 0; idx < filtered.length; idx++) {
      const i = filtered[idx];
      const li = document.createElement('li');
      li.className = 'cp-item';
      li.setAttribute('role', 'option');
      li.setAttribute('data-idx', String(idx));
      li.setAttribute('tabindex', '-1');
      li.setAttribute('aria-selected', 'false');
      if (i.hash) li.setAttribute('data-hash', String(i.hash));

      const label = document.createElement('span');
      label.className = 'cp-item-label';
      label.textContent = String(i.label ?? '');
      li.appendChild(label);

      const hint = document.createElement('span');
      hint.className = 'cp-item-hint';
      if (i.hash) {
        const kbd = document.createElement('kbd');
        kbd.textContent = String(i.hash);
        hint.appendChild(kbd);
      }
      li.appendChild(hint);

      cpResults.appendChild(li);
    }
    setSelected(filtered.length ? 0 : -1);
  };

  // Overlay click to close
  cpOverlay.addEventListener('click', (e) => {
    const el = eventTargetEl(e);
    if (el === cpOverlay) cpClose();
  });

  // Esc to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cpOverlay.classList.contains('open')) cpClose();
  });

  // Category click
  cpCats.addEventListener('click', (e) => {
    const el = eventTargetEl(e);
    const btn = el?.closest?.('.cp-cat[data-cat]');
    if (!btn) return;
    const cat = btn.getAttribute('data-cat') || 'all';
    cpActiveCat = cat;
    [...cpCats.querySelectorAll('.cp-cat')].forEach((b) => {
      const isActive = (b.getAttribute('data-cat') || 'all') === cat;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    renderResults(cpInput.value ?? '');
    cpInput.focus();
  });

  // Input
  cpInput.addEventListener('input', () => renderResults(cpInput.value));
  cpInput.addEventListener('keydown', (e) => {
    if (!cpOverlay.classList.contains('open')) return;
    const list = getFiltered(cpInput.value ?? '').slice(0, 25);
    if (e.key === 'Enter') { e.preventDefault(); activateSelected(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!list.length) return;
      setSelected(Math.min(list.length - 1, Math.max(0, cpSelectedIdx + 1)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!list.length) return;
      setSelected(Math.max(0, cpSelectedIdx - 1));
      return;
    }
  });

  // Results click + hover select
  cpResults.addEventListener('click', (e) => {
    const el = eventTargetEl(e);
    const li = el?.closest?.('.cp-item[data-idx]');
    if (!li) return;
    setSelected(Number(li.getAttribute('data-idx')));
    activateSelected();
  });
  cpResults.addEventListener('mousemove', debounce((e) => {
    const el = eventTargetEl(e);
    const li = el?.closest?.('.cp-item[data-idx]');
    if (!li) return;
    setSelected(Number(li.getAttribute('data-idx')));
  }, 25));

  // First render
  renderResults('');

  // Expose open/close + register shortcut button hookup stays in app.js shortcuts system
  OpenCourseDeck.CommandPalette = {
    open: cpOpen,
    close: cpClose,
    refresh: () => renderResults(cpInput.value ?? ''),
  };
  window.OpenCourseDeck = OpenCourseDeck;
}
