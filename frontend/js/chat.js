// chat.js — Chat DOM rendering, typing animation, and Markdown-to-HTML conversion

/**
 * Simple Markdown-to-HTML converter.
 * Supports: headings, bold, italic, code blocks, inline code, lists, links, tables, blockquotes, paragraphs.
 * @param {string} md - Markdown string
 * @returns {string} HTML string
 */
export function markdownToHtml(md) {
  if (!md) return '';

  let html = md;

  // Escape HTML entities first
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (must come before inline code)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Tables — convert each row
  html = html.replace(/^\|(.+)\|$/gm, (match) => {
    const cells = match.split('|').filter(c => c.trim() !== '');
    // Skip separator rows like |---|---|
    if (cells.every(c => /^[-:]+$/.test(c.trim()))) return '';
    const isHeader = cells.every(c => /^[-:]+$/.test(c.trim()) === false);
    const tag = isHeader ? 'th' : 'td';
    return '<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
  });

  html = html.replace(/(<tr>[\s\S]*?<\/tr>)/g, (match) => {
    // Wrap consecutive <tr> groups in <table>
    return `<table>${match}</table>`;
  });

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Merge adjacent blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

  // Headings (after other inline processing)
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Unordered lists
  html = html.replace(/^(\s*)[-*] (.+)$/gm, '<li>$2</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Ordered lists
  html = html.replace(/^(\s*)\d+\. (.+)$/gm, '<li>$2</li>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // Paragraphs — wrap remaining text blocks
  const paragraphs = html.split(/\n\n+/);
  html = paragraphs.map(block => {
    block = block.trim();
    if (!block) return '';
    // Don't wrap elements that are already block-level
    if (/^<(h[1-4]|ul|ol|pre|table|blockquote|hr|li)/.test(block)) {
      return block;
    }
    return `<p>${block.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');

  return html;
}

/**
 * Create a message DOM element.
 * @param {string} role - 'user' or 'agent'
 * @param {string} content - Raw content (may be Markdown for agent, plain text for user)
 * @param {boolean} isStreaming - Whether to show a typing cursor
 * @returns {HTMLElement}
 */
export function createMessageElement(role, content, isStreaming = false) {
  const div = document.createElement('div');
  div.className = `message message--${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message__avatar';
  avatar.textContent = role === 'agent' ? '🤖' : '👤';

  const body = document.createElement('div');
  body.className = 'message__body';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message__content';

  if (role === 'agent') {
    contentDiv.innerHTML = markdownToHtml(content);
  } else {
    contentDiv.textContent = content;
  }

  if (isStreaming && role === 'agent') {
    const cursor = document.createElement('span');
    cursor.className = 'typing-cursor';
    contentDiv.appendChild(cursor);
  }

  body.appendChild(contentDiv);
  div.appendChild(avatar);
  div.appendChild(body);

  return div;
}

/**
 * Create a progress steps element shown during initial analysis.
 * @param {number} currentStep - 0, 1, or 2
 * @returns {HTMLElement}
 */
export function createProgressElement(currentStep = 0) {
  const steps = [
    { label: '获取仓库信息', icon: '📡' },
    { label: '分析项目结构', icon: '🔍' },
    { label: '生成学习指南', icon: '✨' },
  ];

  const container = document.createElement('div');
  container.className = 'progress-steps';

  steps.forEach((step, i) => {
    const stepDiv = document.createElement('div');
    stepDiv.className = 'progress-step';
    if (i < currentStep) {
      stepDiv.classList.add('progress-step--done');
    } else if (i === currentStep) {
      stepDiv.classList.add('progress-step--active');
    }

    const icon = document.createElement('span');
    icon.className = 'progress-step__icon';
    if (i < currentStep) {
      icon.textContent = '✅';
    } else if (i === currentStep) {
      icon.textContent = step.icon;
    } else {
      icon.textContent = '⬜';
    }

    const label = document.createElement('span');
    label.textContent = step.label;

    stepDiv.appendChild(icon);
    stepDiv.appendChild(label);
    container.appendChild(stepDiv);
  });

  return container;
}

/**
 * Scroll the chat container to the bottom.
 */
export function scrollToBottom() {
  const container = document.getElementById('chatContainer');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

/**
 * Remove the welcome message from the chat.
 */
export function removeWelcomeMessage() {
  const welcome = document.getElementById('welcomeMessage');
  if (welcome) {
    welcome.remove();
  }
}

/**
 * Render all messages from state into the DOM (used on page load).
 * @param {Array} messages
 */
export function renderMessages(messages) {
  const container = document.getElementById('messagesContainer');
  if (!container) return;
  container.innerHTML = '';

  if (messages.length > 0) {
    removeWelcomeMessage();
  }

  messages.forEach(msg => {
    const el = createMessageElement(msg.role, msg.content);
    container.appendChild(el);
  });
  scrollToBottom();
}

/**
 * Add a message to the DOM (not to state — that's handled by state.js).
 * @param {string} role
 * @param {string} content
 * @param {boolean} isStreaming
 * @returns {HTMLElement} the created message element (so caller can update it for streaming)
 */
export function appendMessageToDOM(role, content, isStreaming = false) {
  removeWelcomeMessage();
  const container = document.getElementById('messagesContainer');
  const el = createMessageElement(role, content, isStreaming);
  container.appendChild(el);
  scrollToBottom();
  return el;
}

/**
 * Get the last agent message element currently in the DOM.
 * @returns {HTMLElement|null}
 */
export function getLastAgentMessageElement() {
  const messages = document.querySelectorAll('.message--agent');
  if (messages.length === 0) return null;
  return messages[messages.length - 1];
}
