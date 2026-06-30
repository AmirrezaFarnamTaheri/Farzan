/**
 * Clipboard — state machine with system clipboard integration.
 * Based on x-spreadsheet clipboard pattern.
 * States: clear → copy/cut
 * Supports clipboard history, TSV format, cross-subsystem paste.
 */

const MAX_HISTORY = 10;

export class Clipboard {
  constructor() {
    this._state = 'clear'; // 'clear' | 'copy' | 'cut'
    this._data = null;
    this._dataType = ''; // 'elements' | 'text' | 'tsv'
    /** @type {Array<{state:string, data:*, type:string, timestamp:number}>} */
    this._history = [];
  }

  /**
   * Copy data to clipboard.
   * @param {*} data
   * @param {string} [type='elements']
   */
  copy(data, type = 'elements') {
    this._state = 'copy';
    this._data = this._cloneData(data);
    this._dataType = type;
    this._pushHistory();
    this._writeSystemClipboard(this._data, type);
  }

  /**
   * Cut data to clipboard.
   * @param {*} data
   * @param {string} [type='elements']
   */
  cut(data, type = 'elements') {
    this._state = 'cut';
    this._data = this._cloneData(data);
    this._dataType = type;
    this._pushHistory();
    this._writeSystemClipboard(this._data, type);
  }

  /**
   * Clear clipboard state.
   */
  clear() {
    this._state = 'clear';
    this._data = null;
    this._dataType = '';
  }

  /** @returns {boolean} */
  isCopy() { return this._state === 'copy'; }

  /** @returns {boolean} */
  isCut() { return this._state === 'cut'; }

  /** @returns {boolean} */
  isClear() { return this._state === 'clear'; }

  /**
   * Get current clipboard data.
   * @returns {{ state: string, data: *, type: string }}
   */
  getData() {
    return {
      state: this._state,
      data: this._cloneData(this._data),
      type: this._dataType,
    };
  }

  /**
   * Paste from system clipboard (async).
   * @returns {Promise<string|null>}
   */
  async pasteFromSystem() {
    try {
      const text = await navigator.clipboard.readText();
      return text || null;
    } catch {
      return null;
    }
  }

  /**
   * Get clipboard history.
   * @returns {Array}
   */
  getHistory() {
    return [...this._history];
  }

  /**
   * Restore from history entry.
   * @param {number} index
   */
  fromHistory(index) {
    const entry = this._history[index];
    if (!entry) return;
    this._state = entry.state;
    this._data = entry.data;
    this._dataType = entry.type;
  }

  _pushHistory() {
    const cloned = this._cloneData(this._data);
    this._history.unshift({
      state: this._state,
      data: cloned,
      type: this._dataType,
      timestamp: Date.now(),
    });
    if (this._history.length > MAX_HISTORY) {
      this._history.length = MAX_HISTORY;
    }
  }

  _cloneData(data) {
    try { return structuredClone(data); }
    catch { try { return JSON.parse(JSON.stringify(data)); }
    catch { return data; } }
  }

  /**
   * Write to system clipboard if possible.
   * @param {*} data
   * @param {string} type
   */
  _writeSystemClipboard(data, type) {
    try {
      let text = '';
      if (type === 'tsv' || type === 'text') {
        text = String(data ?? '');
      } else if (Array.isArray(data)) {
        text = data
          .map((el) => {
            if (el?.text) return el.text;
            if (el?.type) return `[${el.type}]`;
            return String(el?.id || '');
          })
          .join('\t');
      }
      if (text && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
    } catch {
      // System clipboard is optional
    }
  }

  /**
   * Convert current data to TSV string.
   * @returns {string}
   */
  toTSV() {
    if (!this._data) return '';
    if (Array.isArray(this._data)) {
      return this._data
        .map((el) => {
          if (typeof el === 'string') return el;
          return el?.text || el?.id || '';
        })
        .join('\t');
    }
    return String(this._data);
  }
}

if (typeof window !== 'undefined') {
  window.OpenCourseDeck = window.OpenCourseDeck ?? {};
  window.OpenCourseDeck.Clipboard = Clipboard;
}
