const BUILTIN_TEMPLATES = {
  cornell: {
    id: 'builtin-cornell',
    title: 'Cornell Notes',
    builtin: true,
    content: `<h2>Key Questions</h2>
<p>Write study questions here.</p>
<h2>Notes</h2>
<p>Take detailed notes during the lecture or reading.</p>
<h2>Summary</h2>
<p>Summarize the main ideas in your own words.</p>`,
  },
  meeting: {
    id: 'builtin-meeting',
    title: 'Meeting Notes',
    builtin: true,
    content: `<h2>Attendees</h2>
<ul><li>Person 1</li><li>Person 2</li></ul>
<h2>Agenda</h2>
<ol><li>Topic 1</li><li>Topic 2</li></ol>
<h2>Discussion</h2>
<p>Key points from the meeting.</p>
<h2>Action Items</h2>
<ul><li><input type="checkbox"> Task 1</li><li><input type="checkbox"> Task 2</li></ul>
<h2>Next Meeting</h2>
<p>Date and time TBD.</p>`,
  },
  qa: {
    id: 'builtin-qa',
    title: 'Q&A',
    builtin: true,
    content: `<h2>Question</h2>
<p>State the question clearly.</p>
<h2>Answer</h2>
<p>Provide a detailed answer.</p>
<h2>Related</h2>
<ul><li>Related topic 1</li><li>Related topic 2</li></ul>`,
  },
  summary: {
    id: 'builtin-summary',
    title: 'Summary',
    builtin: true,
    content: `<h2>Key Points</h2>
<ul><li>Point 1</li><li>Point 2</li><li>Point 3</li></ul>
<h2>Details</h2>
<p>Elaborate on each key point.</p>
<h2>Takeaways</h2>
<p>What to remember from this material.</p>`,
  },
  study: {
    id: 'builtin-study',
    title: 'Study Guide',
    builtin: true,
    content: `<h2>Topic</h2>
<p>Main topic or chapter name.</p>
<h2>Key Concepts</h2>
<ul><li>Concept 1: definition and explanation</li><li>Concept 2: definition and explanation</li></ul>
<h2>Examples</h2>
<p>Provide concrete examples.</p>
<h2>Practice Questions</h2>
<ol><li>Question 1</li><li>Question 2</li></ol>
<h2>Connections</h2>
<p>How this relates to other topics.</p>`,
  },
  daily: {
    id: 'builtin-daily',
    title: 'Daily Journal',
    builtin: true,
    // Getter, not a static string: a module-scope template literal froze the
    // date at import time, so an app left open across midnight stamped
    // yesterday into every new journal entry. Formatted from local date
    // parts (toISOString would shift the day for non-UTC users).
    get content() {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      return `<h2>Date</h2>
<p>${today}</p>
<h2>Goals for Today</h2>
<ul><li><input type="checkbox"> Goal 1</li><li><input type="checkbox"> Goal 2</li></ul>
<h2>Notes</h2>
<p>Capture thoughts and observations.</p>
<h2>Reflection</h2>
<p>What went well? What could improve?</p>`;
    },
  },
};

// Template data has an independent lifecycle and no longer competes with the
// primary opencoursedeck database schema.
const DB_NAME = 'opencoursedeck-templates';
const STORE_NAME = 'noteTemplates';
const DB_VERSION = 1;

let _dbPromise = null;

function getDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        _dbPromise = null;
      };
      resolve(db);
    };
    req.onblocked = () => reject(new Error('Opening note template storage was blocked by another tab'));
    req.onerror = () => reject(req.error || new Error('Unable to open note template storage'));
  }).catch((error) => {
    _dbPromise = null;
    throw error;
  });
  return _dbPromise;
}

async function loadUserTemplates() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
    req.onerror = () => reject(req.error || new Error('Unable to read note templates'));
  });
}

async function saveUserTemplates(templates) {
  const db = await getDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    for (const template of templates) store.put(template);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Unable to save note templates'));
    tx.onabort = () => reject(tx.error || new Error('Note template save was aborted'));
  });
  window.OpenCourseDeck?.bus?.emit?.('templates:changed', templates);
  return { committed: true, count: templates.length };
}

export async function getAllTemplates() {
  const builtin = Object.values(BUILTIN_TEMPLATES);
  const user = await loadUserTemplates();
  return [...builtin, ...user];
}

export async function getTemplate(id) {
  if (BUILTIN_TEMPLATES[id]) return BUILTIN_TEMPLATES[id];
  const builtinById = Object.values(BUILTIN_TEMPLATES).find(t => t.id === id);
  if (builtinById) return builtinById;
  const templates = await loadUserTemplates();
  return templates.find(t => t.id === id) || null;
}

export async function saveAsTemplate(title, content) {
  const templates = await loadUserTemplates();
  const id = `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const template = { id, title: title || 'Untitled Template', content: content || '', builtin: false, createdAt: Date.now() };
  templates.push(template);
  await saveUserTemplates(templates);
  return template;
}

export async function updateTemplate(id, updates) {
  if (BUILTIN_TEMPLATES[id] || Object.values(BUILTIN_TEMPLATES).some(t => t.id === id)) return false;
  const templates = await loadUserTemplates();
  const idx = templates.findIndex(t => t.id === id);
  if (idx === -1) return false;
  templates[idx] = { ...templates[idx], ...updates, id: templates[idx].id };
  await saveUserTemplates(templates);
  return templates[idx];
}

export async function deleteTemplate(id) {
  if (BUILTIN_TEMPLATES[id] || Object.values(BUILTIN_TEMPLATES).some(t => t.id === id)) return false;
  const templates = await loadUserTemplates();
  const remaining = templates.filter(t => t.id !== id);
  if (remaining.length === templates.length) return false;
  await saveUserTemplates(remaining);
  return true;
}

export function getTemplatePickerItems() {
  const builtin = Object.values(BUILTIN_TEMPLATES).map((t) => ({
    label: t.title,
    icon: 'file-text',
    id: t.id,
    builtin: true,
  }));
  return loadUserTemplates().then(user => {
    const userItems = user.map(t => ({ label: t.title, icon: 'pen', id: t.id, builtin: false }));
    return [...builtin, ...userItems];
  });
}

export const NoteTemplates = {
  getAllTemplates,
  getTemplate,
  saveAsTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplatePickerItems,
};
window.OpenCourseDeck = window.OpenCourseDeck || {};
window.OpenCourseDeck.NoteTemplates = NoteTemplates;
