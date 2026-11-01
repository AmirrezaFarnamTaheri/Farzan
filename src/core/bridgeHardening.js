const ERROR_STATUS_COLOR = '#b91c1c';
const LEGACY_ERROR_STATUS_COLOR = '#ef4444';

// Catalog recovery stays active; annotation reads now use the canonical DB
// directly, without overlaying prelaunch localStorage snapshots.
function normalizedColor(root, value) {
  const probe = root.document?.createElement?.('span');
  if (!probe) return value;
  probe.style.color = '';
  probe.style.color = value;
  return probe.style.color;
}

function updateSplashStatus(root, status) {
  const element = root.document?.getElementById?.('splash-status');
  if (!element) return;
  if (status === 'degraded') {
    element.style.color = ERROR_STATUS_COLOR;
    return;
  }
  if (status !== 'authoritative') return;
  const errorColors = new Set([
    normalizedColor(root, LEGACY_ERROR_STATUS_COLOR),
    normalizedColor(root, ERROR_STATUS_COLOR),
  ]);
  if (errorColors.has(element.style.color)) element.style.removeProperty('color');
}

function hardenCatalog(root, dataStore) {
  if (!dataStore || dataStore.__catalogResilienceHardened) return dataStore;
  let lastGood = null;

  const capture = () => {
    const state = dataStore.getState?.();
    if (state?.status === 'authoritative') {
      lastGood = {
        courses: dataStore.allCourses?.() || [],
        topics: dataStore.allTopics?.() || [],
        source: state.source,
        lastSuccessfulAt: state.lastSuccessfulAt,
      };
    }
    updateSplashStatus(root, state?.status);
    return state;
  };

  capture();
  const run = async (method, options) => {
    const result = await dataStore[method](options);
    capture();
    return result;
  };

  const facade = {
    ...dataStore,
    init: options => run('init', options),
    retry: options => run('retry', options),
    getState() {
      const state = dataStore.getState();
      if (state.status !== 'degraded' || !lastGood) return state;
      return Object.freeze({
        ...state,
        source: lastGood.source,
        lastSuccessfulAt: lastGood.lastSuccessfulAt,
        courses: lastGood.courses.length,
        topics: lastGood.topics.length,
        usingLastKnownGood: true,
      });
    },
    allCourses() {
      const state = dataStore.getState();
      return state.status === 'degraded' && lastGood ? lastGood.courses.slice() : dataStore.allCourses();
    },
    allTopics() {
      const state = dataStore.getState();
      return state.status === 'degraded' && lastGood ? lastGood.topics.slice() : dataStore.allTopics();
    },
    catalogPath() {
      const state = dataStore.getState();
      return state.status === 'degraded' && lastGood ? lastGood.source : dataStore.catalogPath?.();
    },
  };
  Object.defineProperty(facade, '__catalogResilienceHardened', { value: true });
  return facade;
}

export function installBridgeHardening(root = window) {
  root.OpenCourseDeck = root.OpenCourseDeck || {};
  const currentStore = root.DataStore || root.OpenCourseDeck.DataStore;
  const hardenedStore = hardenCatalog(root, currentStore);
  if (hardenedStore) {
    root.DataStore = hardenedStore;
    root.OpenCourseDeck.DataStore = hardenedStore;
  }
  root.OpenCourseDeck.BridgeHardening = Object.freeze({
    errorStatusColor: ERROR_STATUS_COLOR,
  });
  return { dataStore: hardenedStore, db: root.DB };
}
