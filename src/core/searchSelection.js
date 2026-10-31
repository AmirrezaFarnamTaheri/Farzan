/**
 * Shared keyboard selection for the command palette and topbar results.
 *
 * Only currently rendered options may be selected. Keep DOM focus on the
 * combobox input and reflect its active option through aria-activedescendant.
 */
export function nextSearchSelectionIndex(current, count, key) {
  const size = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  if (!size) return -1;
  const index = Number.isInteger(current) ? current : -1;
  if (key === 'ArrowDown') return Math.min(size - 1, Math.max(0, index + 1));
  if (key === 'ArrowUp') return Math.max(0, Math.min(size - 1, index - 1));
  return index >= 0 && index < size ? index : -1;
}

export function reflectSearchSelection(input, rows, index) {
  const options = Array.isArray(rows) ? rows : Array.from(rows || []);
  const selected = Number.isInteger(index) && index >= 0 && index < options.length ? index : -1;
  for (let i = 0; i < options.length; i += 1) {
    options[i]?.setAttribute?.('aria-selected', i === selected ? 'true' : 'false');
  }
  const active = selected >= 0 ? options[selected] : null;
  if (active?.id) {
    input?.setAttribute?.('aria-activedescendant', active.id);
    active.scrollIntoView?.({ block: 'nearest' });
  } else {
    input?.removeAttribute?.('aria-activedescendant');
  }
  return selected;
}
