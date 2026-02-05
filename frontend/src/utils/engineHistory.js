/* global localStorage */
// Engine history management utilities

const ENGINE_HISTORY_KEY = 'search_engine_history';
const MAX_HISTORY_SIZE = 10;

/**
 * Get engine history from localStorage
 * Returns array of engine names in order of most recently used
 */
export const getEngineHistory = () => {
  try {
    const history = localStorage.getItem(ENGINE_HISTORY_KEY);
    return history ? JSON.parse(history) : [];
  } catch (error) {
    console.error('Failed to load engine history:', error);
    return [];
  }
};

/**
 * Add an engine to history
 * Moves engine to front if already exists, otherwise adds to front
 */
export const addToEngineHistory = (engineName) => {
  if (!engineName) return;

  try {
    let history = getEngineHistory();

    // Remove if already exists
    history = history.filter((name) => name !== engineName);

    // Add to front
    history.unshift(engineName);

    // Keep only MAX_HISTORY_SIZE items
    if (history.length > MAX_HISTORY_SIZE) {
      history = history.slice(0, MAX_HISTORY_SIZE);
    }

    localStorage.setItem(ENGINE_HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to save engine history:', error);
  }
};

/**
 * Get the previous engine from history (excluding the current one)
 * Returns null if no previous engine exists
 */
export const getPreviousEngine = (currentEngine) => {
  const history = getEngineHistory();

  // Find first engine that's not the current one
  const previousEngine = history.find((engine) => engine !== currentEngine);

  return previousEngine || null;
};

/**
 * Get an alternative engine from providers list
 * Returns first provider that's different from currentEngine
 */
export const getAlternativeEngine = (currentEngine, providers) => {
  if (!providers || providers.length === 0) return null;

  // Find first provider different from current
  const alternative = providers.find(
    (provider) => provider.name !== currentEngine
  );

  return alternative ? alternative.name : null;
};
