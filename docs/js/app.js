// app.js — Entry point: event binding, message dispatch, quick follow-ups

import { createInitialState, loadState, addMessage, appendToLastMessage, clearHistory, isGithubUrl } from './state.js';
import { sendChatMessage, checkHealth, getWorkerUrl, setWorkerUrl } from './api.js';
import { appendMessageToDOM, renderMessages, scrollToBottom, getLastAgentMessageElement, createProgressElement, removeWelcomeMessage, markdownToHtml } from './chat.js';

// --- State ---
let state = loadState();
let currentAbortController = null;

// --- DOM Elements ---
const chatContainer = document.getElementById('chatContainer');
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const sendBtnIcon = document.getElementById('sendBtnIcon');
const newChatBtn = document.getElementById('newChatBtn');
const quickActions = document.getElementById('quickActions');
const quickActionsList = document.getElementById('quickActionsList');
const errorBanner = document.getElementById('errorBanner');
const errorBannerText = document.getElementById('errorBannerText');
const errorBannerClose = document.getElementById('errorBannerClose');

// --- Worker URL Detection ---
// Auto-detect: if running on GitHub Pages, use the production Worker URL.
// For local dev, keep localhost:8787.
const WORKER_PROD_URL = 'https://github-repo-explorer.3424966659.workers.dev';
const currentHostname = window.location.hostname;
if (currentHostname.includes('github.io') || !currentHostname.includes('localhost')) {
  setWorkerUrl(WORKER_PROD_URL);
}

// --- Quick Follow-up Questions ---
const QUICK_QUESTIONS = {
  initial: [
    '核心模块有哪些？它们如何协作？',
    '项目的整体架构是什么样的？',
    '如何搭建本地开发环境？',
  ],
  general: [
    '有哪些适合新手的入门任务？',
    '代码规范和提交流程是怎样的？',
    '请给我一个学习路径建议',
    '关键代码在哪里？请带我阅读',
  ],
};

/**
 * Set quick follow-up questions in the UI.
 * @param {string[]} questions
 */
function setQuickQuestions(questions) {
  quickActionsList.innerHTML = '';
  questions.forEach(q => {
    const chip = document.createElement('button');
    chip.className = 'quick-action-chip';
    chip.textContent = q;
    chip.addEventListener('click', () => {
      messageInput.value = q;
      handleSend();
    });
    quickActionsList.appendChild(chip);
  });
  quickActions.style.display = 'flex';
}

/**
 * Show an error banner.
 * @param {string} msg
 */
function showError(msg) {
  errorBannerText.textContent = msg;
  errorBanner.style.display = 'flex';
  // Auto-hide after 5 seconds
  setTimeout(() => {
    errorBanner.style.display = 'none';
  }, 5000);
}

/**
 * Set loading state (disable input, change button).
 * @param {boolean} loading
 */
function setLoading(loading) {
  state = { ...state, isLoading: loading };
  messageInput.disabled = loading;
  sendBtn.disabled = loading;
  if (loading) {
    sendBtnIcon.textContent = '⏳';
    messageInput.placeholder = 'Agent 正在分析中...';
  } else {
    sendBtnIcon.textContent = '✈';
    messageInput.placeholder = state.repoUrl
      ? '💬 继续提问，深入了解这个项目...'
      : '💬 输入一个 GitHub 仓库链接开始探索...';
    messageInput.focus();
  }
}

/**
 * Main send handler.
 */
async function handleSend() {
  const text = messageInput.value.trim();
  if (!text || state.isLoading) return;

  // Check if input is a GitHub URL
  if (isGithubUrl(text)) {
    // New repo exploration
    state.repoUrl = text;
    // For a new repo, we add the URL as a user message and trigger analysis
  } else if (!state.repoUrl) {
    // Not a URL and no current repo — prompt user
    showError('请先输入一个 GitHub 仓库链接开始分析');
    return;
  }

  // Clear input
  messageInput.value = '';
  setLoading(true);

  // Add user message to state and DOM
  state = addMessage(state, 'user', text);
  appendMessageToDOM('user', text);

  // Determine if this is the initial analysis or a follow-up
  const isInitial = isGithubUrl(text);
  const question = isInitial ? null : text;

  // Create progress element for initial analysis
  let progressEl = null;
  if (isInitial) {
    // Add a placeholder agent message with progress
    const agentPlaceholder = appendMessageToDOM('agent', '', true);
    const contentDiv = agentPlaceholder.querySelector('.message__content');
    progressEl = createProgressElement(0);
    contentDiv.innerHTML = '';
    contentDiv.appendChild(progressEl);
    // Hide quick questions during loading
    quickActions.style.display = 'none';
  }

  // Create the streaming agent message element
  let streamingEl = null;
  let accumulatedText = '';

  // Build conversation history for the API
  const historyMessages = state.messages.slice(0, -1).map(m => ({
    role: m.role === 'agent' ? 'assistant' : 'user',
    content: m.content,
  }));

  currentAbortController = sendChatMessage({
    repoUrl: state.repoUrl,
    history: historyMessages,
    question,
    onChunk: (chunk) => {
      accumulatedText += chunk;

      // Remove progress element if it exists
      if (progressEl) {
        // Update progress steps
        if (accumulatedText.length > 100) {
          const contentDiv = streamingEl?.querySelector('.message__content');
          if (contentDiv && progressEl.parentNode) {
            progressEl.remove();
            progressEl = null;
            contentDiv.innerHTML = markdownToHtml(accumulatedText);
            const cursor = document.createElement('span');
            cursor.className = 'typing-cursor';
            contentDiv.appendChild(cursor);
            scrollToBottom();
            return;
          }
        } else {
          // Update progress indicator
          const step = accumulatedText.length > 30 ? 2 : 1;
          const newProgress = createProgressElement(step);
          const parent = progressEl.parentNode;
          if (parent) {
            parent.replaceChild(newProgress, progressEl);
            progressEl = newProgress;
          }
          scrollToBottom();
          return;
        }
      }

      // Stream text into the existing message element
      if (!streamingEl) {
        streamingEl = getLastAgentMessageElement();
        if (!streamingEl) {
          streamingEl = appendMessageToDOM('agent', accumulatedText, true);
        }
      }

      const contentDiv = streamingEl.querySelector('.message__content');
      if (contentDiv) {
        const cursor = contentDiv.querySelector('.typing-cursor');
        contentDiv.innerHTML = markdownToHtml(accumulatedText);
        // Re-append cursor
        const newCursor = document.createElement('span');
        newCursor.className = 'typing-cursor';
        contentDiv.appendChild(newCursor);
      }
      scrollToBottom();
    },
    onDone: () => {
      // Remove cursor and finalize message
      const lastEl = getLastAgentMessageElement();
      if (lastEl) {
        const contentDiv = lastEl.querySelector('.message__content');
        if (contentDiv) {
          const cursor = contentDiv.querySelector('.typing-cursor');
          if (cursor) cursor.remove();
          contentDiv.innerHTML = markdownToHtml(accumulatedText);
        }
      }

      // Update state with final message content
      state = addMessage(state, 'agent', accumulatedText);

      // Set follow-up questions
      setQuickQuestions(isInitial ? QUICK_QUESTIONS.initial : QUICK_QUESTIONS.general);

      setLoading(false);
      currentAbortController = null;
    },
    onError: (errMsg) => {
      if (progressEl) {
        const contentDiv = progressEl.parentNode;
        if (contentDiv) {
          contentDiv.innerHTML = `<p style="color:var(--color-error)">❌ 分析失败：${escapeHtml(errMsg)}</p>`;
        }
      }
      if (streamingEl) {
        const contentDiv = streamingEl.querySelector('.message__content');
        if (contentDiv) {
          contentDiv.innerHTML = `<p style="color:var(--color-error)">❌ 请求失败：${escapeHtml(errMsg)}</p>`;
        }
      }
      showError(errMsg);
      setLoading(false);
      currentAbortController = null;
    },
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Event Listeners ---

sendBtn.addEventListener('click', handleSend);

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

newChatBtn.addEventListener('click', () => {
  if (state.isLoading && currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  state = clearHistory();
  messagesContainer.innerHTML = '';
  quickActions.style.display = 'none';
  setLoading(false);
  messageInput.value = '';
  messageInput.placeholder = '💬 输入一个 GitHub 仓库链接开始探索...';
  messageInput.focus();
  // Re-show welcome message
  const welcome = document.getElementById('welcomeMessage');
  if (welcome) {
    welcome.style.display = '';
  }
});

errorBannerClose.addEventListener('click', () => {
  errorBanner.style.display = 'none';
});

// --- Init ---

// Render any saved messages on page load
if (state.messages.length > 0) {
  renderMessages(state.messages);
  if (state.repoUrl) {
    setQuickQuestions(QUICK_QUESTIONS.general);
    messageInput.placeholder = '💬 继续提问，深入了解这个项目...';
  }
}

// Check Worker health on load (silent)
checkHealth().then(ok => {
  if (!ok) {
    console.warn('Backend Worker is not reachable at', getWorkerUrl());
  }
});
