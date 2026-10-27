/** Canonical calendar geometry for Farzan's Canvas and Chart.js heatmap surfaces. */
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

function parseDate(str) {
  const parts = String(str).split('-');
  if (parts.length !== 3 || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const [year, month, day] = parts.map(Number);
  const date = new Date(year, month - 1, day);
  // Date constructor normalizes invalid dates (February 30 -> March 2).
  // Do not fabricate a different activity date from malformed user data.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  // An Invalid Date (e.g. an ISO datetime string) is still truthy, so
  // callers must explicitly reject it — otherwise it poisons min/maxDate
  // with NaN and the grid-walk loop below never terminates.
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildCalendarGrid(data) {
  const grid = new Map();
  let minDate = null;
  let maxDate = null;
  let maxVal = 0;

  for (const item of data) {
    const date = parseDate(item.date);
    if (!date) continue;
    const rawValue = Number(item.value);
    const val = Number.isFinite(rawValue) ? Math.max(0, rawValue) : 0;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    grid.set(key, val);
    if (!minDate || date < minDate) minDate = date;
    if (!maxDate || date > maxDate) maxDate = date;
    if (val > maxVal) maxVal = val;
  }

  if (!minDate || !maxDate) return { cells: [], months: [], maxVal: 0, weeks: 0 };

  const cells = [];
  const months = [];
  const startOfWeek = new Date(minDate);
  startOfWeek.setDate(startOfWeek.getDate() - (startOfWeek.getDay() === 0 ? 6 : startOfWeek.getDay() - 1));

  let current = new Date(startOfWeek);
  let weekIdx = 0;
  let lastMonth = -1;

  // Iteration cap as defense-in-depth against a future loop-condition bug.
  const maxIterations = 7 * 400;
  let iterations = 0;
  while ((current <= maxDate || current.getDay() !== 1) && iterations++ < maxIterations) {
    const dayOfWeek = current.getDay() === 0 ? 6 : current.getDay() - 1;
    const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
    const val = grid.get(key) || 0;

    if (current >= minDate && current <= maxDate) {
      cells.push({
        week: weekIdx,
        day: dayOfWeek,
        value: val,
        date: key,
      });
    }

    if (current.getMonth() !== lastMonth) {
      months.push({ week: weekIdx, label: MONTH_NAMES[current.getMonth()] });
      lastMonth = current.getMonth();
    }

    current.setDate(current.getDate() + 1);
    if (current.getDay() === 1 && current > maxDate) break;
    if (current.getDay() === 1) weekIdx++;
  }

  return { cells, months, maxVal, weeks: weekIdx + 1 };
}
