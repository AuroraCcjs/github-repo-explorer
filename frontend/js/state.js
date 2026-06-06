// state.js — Chat state management with localStorage persistence

const STORAGE_KEY = 'github-repo-explorer-chat';

/**
 * Create initial state.
 * @returns {{ repoUrl: string|null, messages: Array<{role: string, content: string, timestamp: number}>, isLoading: boolean, error: string|null }}
 */
export function createInitialState() {
  return {
    repoUrl: null,       // Current GitHub repo URL being explored
    messages: [],        // Chat messages: { role: 'user'|'agent', content: string, timestamp: number }
    isLoading: false,    // Whether a request is in flight
    error: null,         // Current error message or null
  };
}

/**
 * Load state from localStorage, or return initial state.
 * @returns {object}
 */
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Validate shape — ensure messages array exists
      if (parsed && Array.isArray(parsed.messages)) {
        return {
          ...createInitialState(),
          ...parsed,
          isLoading: false,  // Never restore loading state
          error: null,       // Never restore error state
        };
      }
    }
  } catch (e) {
    // Corrupted data — fall through to initial state
    console.warn('Failed to load chat state, starting fresh:', e);
  }
  return createInitialState();
}

/**
 * Save state to localStorage.
 * @param {object} state
 */
export function saveState(state) {
  try {
    const toSave = {
      repoUrl: state.repoUrl,
      messages: state.messages,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.warn('Failed to save chat state:', e);
  }
}

/**
 * Add a message and return the new state (immutable update).
 * @param {object} state
 * @param {string} role - 'user' or 'agent'
 * @param {string} content
 * @returns {object} new state
 */
export function addMessage(state, role, content) {
  const newMessage = {
    role,
    content,
    timestamp: Date.now(),
  };
  const newState = {
    ...state,
    messages: [...state.messages, newMessage],
  };
  saveState(newState);
  return newState;
}

/**
 * Append text to the last agent message (for streaming).
 * Returns a new state object.
 * @param {object} state
 * @param {string} text
 * @returns {object} new state
 */
export function appendToLastMessage(state, text) {
  if (state.messages.length === 0) return state;
  const messages = [...state.messages];
  const last = { ...messages[messages.length - 1] };
  last.content += text;
  messages[messages.length - 1] = last;
  const newState = { ...state, messages };
  saveState(newState);
  return newState;
}

/**
 * Clear all chat history and reset state.
 * @returns {object} fresh state
 */
export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
  return createInitialState();
}

/**
 * Check if a string looks like a GitHub URL.
 * @param {string} text
 * @returns {boolean}
 */
export function isGithubUrl(text) {
  return /github\.com\/[^\/]+\/[^\/]+/.test(text);
}

/**
 * Extract owner/repo from a GitHub URL.
 * @param {string} url
 * @returns {{ owner: string, repo: string }|null}
 */
export function parseRepoUrl(url) {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2].replace(/\/$/, ''),
  };
}
