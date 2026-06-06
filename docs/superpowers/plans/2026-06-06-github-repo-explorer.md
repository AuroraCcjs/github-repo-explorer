# GitHub Repo Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web demo where users paste a GitHub repo URL and an AI agent conversationally guides them through understanding the project.

**Architecture:** Pure HTML/CSS/JS frontend on GitHub Pages communicates via SSE with a Cloudflare Worker backend that fetches GitHub repo metadata and calls Claude API for intelligent analysis.

**Tech Stack:** HTML5, CSS3, Vanilla JS (ES Modules), Cloudflare Workers, Claude API (Anthropic), GitHub REST API

---

## File Map

| File | Responsibility |
|------|---------------|
| `frontend/index.html` | Page structure, meta tags, script/style entry points |
| `frontend/css/style.css` | All visual styles, CSS custom properties for theming, responsive layout |
| `frontend/js/state.js` | Chat state management, localStorage persistence, immutable state updates |
| `frontend/js/api.js` | SSE client for Worker communication, request/response handling |
| `frontend/js/chat.js` | DOM rendering for chat messages, typing animation, Markdown-to-HTML conversion |
| `frontend/js/app.js` | Entry point, event binding, message dispatch, quick-follow-ups |
| `worker/src/index.js` | Cloudflare Worker: routing, GitHub API fetching, Claude API SSE proxy |
| `worker/wrangler.toml` | Cloudflare Wrangler project configuration |

---

### Task 1: Project Scaffold & Git Init

**Files:**
- Create: `frontend/index.html`
- Create: `frontend/css/style.css`
- Create: `frontend/js/state.js`
- Create: `frontend/js/api.js`
- Create: `frontend/js/chat.js`
- Create: `frontend/js/app.js`
- Create: `worker/src/index.js`
- Create: `worker/wrangler.toml`
- Create: `README.md`

- [ ] **Step 1: Initialize git repository**

```bash
cd /c/Users/34249/Desktop/github-repo-explorer
git init
```

- [ ] **Step 2: Create all empty source files**

```bash
mkdir -p frontend/css frontend/js worker/src
touch frontend/index.html frontend/css/style.css frontend/js/state.js frontend/js/api.js frontend/js/chat.js frontend/js/app.js
touch worker/src/index.js worker/wrangler.toml
```

- [ ] **Step 3: Write initial README.md**

```markdown
# GitHub Repo Explorer

An AI-powered agent conversation system that helps you understand any GitHub repository at a glance.

## How it works

1. Paste a GitHub repository URL
2. The AI agent analyzes the repo in real-time
3. Explore through conversation: architecture, core modules, dev workflow, contribution tasks

## Architecture

- **Frontend:** Pure HTML/CSS/JS, hosted on GitHub Pages
- **Backend:** Cloudflare Worker, calling Claude API + GitHub API

## Setup

### Frontend
Push to GitHub, enable GitHub Pages on `main` branch, `/ (root)` directory.

### Backend
```bash
cd worker
npm create cloudflare@latest -- --no-interactive  # or configure manually
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put GITHUB_TOKEN  # optional
npx wrangler deploy
```
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold project structure"
```

---

### Task 2: Backend — Cloudflare Worker Skeleton

**Files:**
- Modify: `worker/wrangler.toml`
- Modify: `worker/src/index.js`

- [ ] **Step 1: Write wrangler.toml**

```toml
name = "github-repo-explorer"
main = "src/index.js"
compatibility_date = "2025-01-01"

[[dependencies]]
# No external dependencies — using built-in fetch API

[vars]
# Non-secret vars can go here

[env.production]
# Production-specific config
```

- [ ] **Step 2: Write Worker skeleton with health endpoint**

Write to `worker/src/index.js`:

```javascript
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS headers for browser requests from any origin
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health check
    if (url.pathname === '/api/health' && request.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Chat endpoint — placeholder for now
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      return new Response(JSON.stringify({ error: 'not implemented yet' }), {
        status: 501,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 404 for everything else
    return new Response(JSON.stringify({ error: 'not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  },
};
```

- [ ] **Step 3: Verify Worker structure is valid**

```bash
cd /c/Users/34249/Desktop/github-repo-explorer/worker
npx wrangler dev --dry-run 2>&1 || echo "Will verify on deploy"
```

- [ ] **Step 4: Commit**

```bash
git add worker/
git commit -m "feat: add Cloudflare Worker skeleton with health endpoint"
```

---

### Task 3: Backend — GitHub API Integration

**Files:**
- Modify: `worker/src/index.js`

- [ ] **Step 1: Add GitHub API fetch function**

Replace the entire file content in `worker/src/index.js`:

```javascript
/**
 * Fetch repository metadata from GitHub API.
 * Returns an object with owner, repo, metadata, readme, directory tree, and issues.
 */
async function fetchRepoData(owner, repo, githubToken) {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'github-repo-explorer',
  };
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }

  const baseUrl = `https://api.github.com/repos/${owner}/${repo}`;

  // Fetch repo metadata, README, root contents, and good-first-issues in parallel
  const [repoRes, readmeRes, contentsRes, issuesRes] = await Promise.allSettled([
    fetch(baseUrl, { headers }),
    fetch(`${baseUrl}/readme`, { headers }),
    fetch(`${baseUrl}/contents/`, { headers }),
    fetch(`${baseUrl}/issues?labels=good-first-issue&state=open&per_page=5`, { headers }),
  ]);

  // Parse responses, gracefully handle failures
  const repoData = repoRes.status === 'fulfilled' && repoRes.value.ok
    ? await repoRes.value.json() : null;
  const readmeData = readmeRes.status === 'fulfilled' && readmeRes.value.ok
    ? await readmeRes.value.json() : null;
  const contentsData = contentsRes.status === 'fulfilled' && contentsRes.value.ok
    ? await contentsRes.value.json() : [];
  const issuesData = issuesRes.status === 'fulfilled' && issuesRes.value.ok
    ? await issuesRes.value.json() : [];

  // Decode base64 README content
  let readmeText = '';
  if (readmeData && readmeData.content) {
    readmeText = atob(readmeData.content.replace(/\n/g, ''));
    // Truncate README to avoid overwhelming the prompt
    if (readmeText.length > 4000) {
      readmeText = readmeText.slice(0, 4000) + '\n\n... (truncated)';
    }
  }

  // Build a tree-like summary of directory structure
  const dirTree = Array.isArray(contentsData)
    ? contentsData.map(item => `${item.type === 'dir' ? '📁' : '📄'} ${item.name}`).join('\n')
    : '';

  // Format issues into a readable list
  const issuesList = issuesData.map((issue, i) =>
    `#${issue.number} ${issue.title} [${issue.labels.map(l => l.name).join(', ')}]`
  ).join('\n');

  return {
    owner,
    repo,
    metadata: repoData ? {
      name: repoData.full_name,
      description: repoData.description || '(no description)',
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      language: repoData.language || 'unknown',
      topics: (repoData.topics || []).join(', '),
      license: repoData.license ? repoData.license.spdx_id : 'unknown',
      open_issues: repoData.open_issues_count,
      default_branch: repoData.default_branch,
    } : null,
    readme: readmeText,
    dirTree,
    issues: issuesList,
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (url.pathname === '/api/chat' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { repoUrl, history, question } = body;

        // Parse owner/repo from GitHub URL
        const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/);
        if (!match) {
          return new Response(JSON.stringify({ error: 'Invalid GitHub URL' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
        const owner = match[1];
        const repo = match[2].replace(/\/$/, '');

        const repoData = await fetchRepoData(owner, repo, env.GITHUB_TOKEN);
        // TODO: Add Claude API call in next task

        return new Response(JSON.stringify({
          status: 'repo_fetched',
          repoData,
          message: 'Repository data fetched successfully. Claude integration pending.',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    return new Response(JSON.stringify({ error: 'not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  },
};
```

- [ ] **Step 2: Verify the Worker parses correctly**

```bash
cd /c/Users/34249/Desktop/github-repo-explorer/worker
node -e "
  // Quick syntax check — just parse the file
  const fs = require('fs');
  const src = fs.readFileSync('src/index.js', 'utf8');
  // Check for obvious syntax issues
  new Function(src);
  console.log('Syntax OK');
"
```

- [ ] **Step 3: Commit**

```bash
git add worker/src/index.js
git commit -m "feat: add GitHub API integration to Worker"
```

---

### Task 4: Backend — Claude API SSE Streaming

**Files:**
- Modify: `worker/src/index.js`

- [ ] **Step 1: Add system prompt builder and Claude SSE proxy**

Replace the entire file content in `worker/src/index.js`:

```javascript
/**
 * Build the system prompt with injected repository data.
 */
function buildSystemPrompt(repoData) {
  const meta = repoData.metadata || {};
  return `You are a friendly open-source navigator assistant. Your goal is to help a developer understand and contribute to a GitHub repository.

## Repository: ${repoData.owner}/${repoData.repo}

### Basic Info
- **Name:** ${meta.name || repoData.owner + '/' + repoData.repo}
- **Description:** ${meta.description || 'N/A'}
- **Language:** ${meta.language || 'N/A'}
- **Stars:** ${meta.stars || 0}
- **Forks:** ${meta.forks || 0}
- **Topics:** ${meta.topics || 'N/A'}
- **License:** ${meta.license || 'N/A'}
- **Default Branch:** ${meta.default_branch || 'main'}
- **Open Issues:** ${meta.open_issues || 0}

### Directory Structure (root level)
${repoData.dirTree || 'Not available'}

### README
${repoData.readme || 'Not available'}

### Good First Issues
${repoData.issues || 'None found'}

## Your Role

You MUST organize your responses around these 5 topics. Always be thorough and specific, referencing actual files and code from the repo data above:

1. **Project Goals & Architecture** — Explain what this project does, its target users, the tech stack, and the high-level architecture. Reference the directory structure and README.
2. **Key Modules & Core Code** — Identify the most important directories/files. Explain what each key module does and how they relate. Point out interesting code patterns.
3. **Development Workflow & Code Standards** — Based on the repo structure, infer the dev workflow: how to set up, how to build, how to test, commit conventions, PR process.
4. **Entry-Level Contribution Tasks** — Highlight good first issues, suggest beginner-friendly areas of the codebase, estimate difficulty levels.
5. **Learning Path** — Provide a step-by-step guide for new contributors: what to learn first, which files to read in order, which documentation to consult.

## Formatting Rules
- Use structured Markdown: headings (##, ###), tables, lists, code blocks
- Be specific — reference actual file paths and function names from the repo
- After each response, suggest 2-3 follow-up questions the user might want to ask
- Keep a friendly, encouraging tone — you're helping a newcomer

## Important
- If you don't know something for certain, say so honestly
- Guide the user to explore deeper — don't dump everything at once
- Focus on what's most important first, allow follow-up questions`;
}

/**
 * Fetch repository metadata from GitHub API.
 */
async function fetchRepoData(owner, repo, githubToken) {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'github-repo-explorer',
  };
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }

  const baseUrl = `https://api.github.com/repos/${owner}/${repo}`;

  const [repoRes, readmeRes, contentsRes, issuesRes] = await Promise.allSettled([
    fetch(baseUrl, { headers }),
    fetch(`${baseUrl}/readme`, { headers }),
    fetch(`${baseUrl}/contents/`, { headers }),
    fetch(`${baseUrl}/issues?labels=good-first-issue&state=open&per_page=5`, { headers }),
  ]);

  const repoData = repoRes.status === 'fulfilled' && repoRes.value.ok
    ? await repoRes.value.json() : null;
  const readmeData = readmeRes.status === 'fulfilled' && readmeRes.value.ok
    ? await readmeRes.value.json() : null;
  const contentsData = contentsRes.status === 'fulfilled' && contentsRes.value.ok
    ? await contentsRes.value.json() : [];
  const issuesData = issuesRes.status === 'fulfilled' && issuesRes.value.ok
    ? await issuesRes.value.json() : [];

  let readmeText = '';
  if (readmeData && readmeData.content) {
    readmeText = atob(readmeData.content.replace(/\n/g, ''));
    if (readmeText.length > 4000) {
      readmeText = readmeText.slice(0, 4000) + '\n\n... (truncated)';
    }
  }

  const dirTree = Array.isArray(contentsData)
    ? contentsData.slice(0, 30).map(item =>
        `${item.type === 'dir' ? '📁' : '📄'} ${item.name}`
      ).join('\n')
    : '';

  const issuesList = issuesData.map((issue) =>
    `#${issue.number} ${issue.title} [${issue.labels.map(l => l.name).join(', ')}]`
  ).join('\n');

  return {
    owner,
    repo,
    metadata: repoData ? {
      name: repoData.full_name,
      description: repoData.description || '(no description)',
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      language: repoData.language || 'unknown',
      topics: (repoData.topics || []).join(', '),
      license: repoData.license ? repoData.license.spdx_id : 'unknown',
      open_issues: repoData.open_issues_count,
      default_branch: repoData.default_branch,
    } : null,
    readme: readmeText,
    dirTree,
    issues: issuesList,
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (url.pathname === '/api/chat' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { repoUrl, history, question } = body;

        // Parse owner/repo from GitHub URL
        const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/);
        if (!match) {
          return new Response(JSON.stringify({ error: 'Invalid GitHub URL' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
        const owner = match[1];
        const repo = match[2].replace(/\/$/, '');

        // Fetch repository data
        const repoData = await fetchRepoData(owner, repo, env.GITHUB_TOKEN);

        // Build the messages array for Claude
        const systemPrompt = buildSystemPrompt(repoData);

        // Build conversation messages
        let messages = [{ role: 'user', content: question || `Please analyze the repository ${owner}/${repo} and help me understand it.` }];

        // Include conversation history if provided
        if (history && history.length > 0) {
          // Only include last 10 messages to stay within context limits
          const recentHistory = history.slice(-10);
          messages = [...recentHistory, ...messages];
        }

        // Call Claude API with streaming
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: systemPrompt,
            messages: messages,
            stream: true,
          }),
        });

        if (!claudeRes.ok) {
          const errText = await claudeRes.text();
          throw new Error(`Claude API error: ${claudeRes.status} ${errText}`);
        }

        // Create a ReadableStream that forwards Claude's SSE chunks
        // Claude sends events like: data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
        // We transform these into our own SSE format: data: {"text":"..."}
        const transformStream = new TransformStream({
          transform(chunk, controller) {
            controller.enqueue(chunk);
          },
        });

        // Stream the response
        return new Response(claudeRes.body, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            ...corsHeaders,
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    return new Response(JSON.stringify({ error: 'not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  },
};
```

- [ ] **Step 2: Verify syntax**

```bash
cd /c/Users/34249/Desktop/github-repo-explorer/worker
node -e "
  const fs = require('fs');
  const src = fs.readFileSync('src/index.js', 'utf8');
  new Function(src);
  console.log('Syntax OK');
"
```

- [ ] **Step 3: Commit**

```bash
git add worker/src/index.js
git commit -m "feat: add Claude API SSE streaming to Worker"
```

---

### Task 5: Frontend — HTML Structure

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Write complete index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GitHub Repo Explorer</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div class="app">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <span class="logo">🤖</span>
        <h1>GitHub Repo Explorer</h1>
      </div>
      <button id="newChatBtn" class="btn btn-secondary" title="Start a new conversation">
        + New Chat
      </button>
    </header>

    <!-- Chat Container -->
    <main class="chat-container" id="chatContainer">
      <!-- Welcome message -->
      <div class="message message--agent" id="welcomeMessage">
        <div class="message__avatar">🤖</div>
        <div class="message__body">
          <div class="message__content">
            <p>👋 你好！我是你的开源项目导航助手。</p>
            <p>请粘贴一个 GitHub 仓库链接，我会帮你：</p>
            <ul>
              <li>🎯 快速理解项目目标与整体架构</li>
              <li>🔍 学习关键模块与核心代码</li>
              <li>📋 了解开发流程与代码规范</li>
              <li>✅ 找到适合入门贡献的任务</li>
              <li>📖 获得新手学习路径建议</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Messages will be appended here -->
      <div id="messagesContainer"></div>
    </main>

    <!-- Quick Follow-ups -->
    <div class="quick-actions" id="quickActions" style="display: none;">
      <span class="quick-actions__label">💡 推荐追问：</span>
      <div id="quickActionsList" class="quick-actions__list"></div>
    </div>

    <!-- Input Area -->
    <footer class="input-area">
      <div class="input-area__wrapper">
        <input
          type="text"
          id="messageInput"
          class="input-area__input"
          placeholder="💬 输入一个 GitHub 仓库链接开始探索..."
          autofocus
        />
        <button id="sendBtn" class="btn btn-primary" title="发送">
          <span id="sendBtnIcon">✈</span>
        </button>
      </div>
      <p class="input-area__hint">
        按 Enter 发送 · 粘贴 GitHub 链接开始分析
      </p>
    </footer>
  </div>

  <!-- Error Banner (hidden by default) -->
  <div id="errorBanner" class="error-banner" style="display: none;">
    <span class="error-banner__text" id="errorBannerText"></span>
    <button class="error-banner__close" id="errorBannerClose">×</button>
  </div>

  <!-- Scripts (ES modules) -->
  <script type="module" src="js/state.js"></script>
  <script type="module" src="js/api.js"></script>
  <script type="module" src="js/chat.js"></script>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/index.html
git commit -m "feat: add HTML structure with chat layout"
```

---

### Task 6: Frontend — CSS Styles

**Files:**
- Modify: `frontend/css/style.css`

- [ ] **Step 1: Write complete CSS**

```css
/* === CSS Custom Properties === */
:root {
  --color-bg: #f8f9fb;
  --color-surface: #ffffff;
  --color-border: #e5e7eb;
  --color-primary: #4f46e5;
  --color-primary-hover: #4338ca;
  --color-secondary: #6b7280;
  --color-text: #1f2937;
  --color-text-muted: #9ca3af;
  --color-error: #ef4444;
  --color-error-bg: #fef2f2;
  --color-agent-bg: #f0f4ff;
  --color-user-bg: #ffffff;
  --color-success: #10b981;
  --color-warning: #f59e0b;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-full: 9999px;

  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.05);

  --max-width: 800px;
  --header-height: 60px;
  --input-height: 80px;

  --font-mono: 'SF Mono', 'Fira Code', 'Consolas', monospace;
}

/* === Reset === */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  font-size: 15px;
  line-height: 1.6;
  color: var(--color-text);
  background: var(--color-bg);
}

/* === App Layout === */
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: var(--max-width);
  margin: 0 auto;
  background: var(--color-bg);
}

/* === Header === */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--header-height);
  padding: 0 20px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo {
  font-size: 24px;
  line-height: 1;
}

.header h1 {
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text);
}

/* === Buttons === */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  justify-content: center;
  flex-shrink: 0;
}

.btn-primary:hover {
  background: var(--color-primary-hover);
  transform: scale(1.05);
}

.btn-primary:disabled {
  background: var(--color-text-muted);
  cursor: not-allowed;
  transform: none;
}

.btn-secondary {
  background: var(--color-bg);
  color: var(--color-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  font-size: 13px;
}

.btn-secondary:hover {
  background: var(--color-border);
}

/* === Chat Container === */
.chat-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  scroll-behavior: smooth;
}

.chat-container::-webkit-scrollbar {
  width: 5px;
}

.chat-container::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: var(--radius-full);
}

/* === Messages === */
.message {
  display: flex;
  gap: 12px;
  animation: messageIn 0.3s ease;
}

@keyframes messageIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message__avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.message--agent .message__avatar {
  background: var(--color-agent-bg);
}

.message--user .message__avatar {
  background: var(--color-primary);
  color: white;
  font-size: 14px;
}

.message__body {
  flex: 1;
  min-width: 0;
}

.message--agent .message__content {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
  border-top-left-radius: var(--radius-sm);
}

.message--user .message__content {
  background: var(--color-primary);
  color: white;
  border-radius: var(--radius-lg);
  padding: 12px 18px;
  border-top-right-radius: var(--radius-sm);
  display: inline-block;
  max-width: 85%;
}

/* === Markdown in messages === */
.message__content h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 18px 0 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.message__content h2:first-child {
  margin-top: 0;
}

.message__content h3 {
  font-size: 15px;
  font-weight: 600;
  margin: 14px 0 6px;
}

.message__content p {
  margin: 8px 0;
}

.message__content ul, .message__content ol {
  margin: 8px 0;
  padding-left: 24px;
}

.message__content li {
  margin: 4px 0;
}

.message__content code {
  font-family: var(--font-mono);
  font-size: 13px;
  background: var(--color-bg);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--color-border);
}

.message__content pre {
  background: #1e293b;
  color: #e2e8f0;
  padding: 16px;
  border-radius: var(--radius-md);
  overflow-x: auto;
  margin: 12px 0;
  font-size: 13px;
  line-height: 1.5;
}

.message__content pre code {
  background: none;
  border: none;
  padding: 0;
  color: inherit;
  font-size: inherit;
}

.message__content table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 14px;
}

.message__content th {
  background: var(--color-bg);
  font-weight: 600;
  text-align: left;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
}

.message__content td {
  padding: 8px 12px;
  border: 1px solid var(--color-border);
}

.message__content blockquote {
  border-left: 3px solid var(--color-primary);
  padding-left: 14px;
  color: var(--color-secondary);
  margin: 10px 0;
}

.message__content a {
  color: var(--color-primary);
  text-decoration: underline;
}

.message__content strong {
  font-weight: 600;
}

/* === Progress Steps === */
.progress-steps {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-step {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--color-secondary);
}

.progress-step--done {
  color: var(--color-success);
}

.progress-step--active {
  color: var(--color-primary);
  font-weight: 500;
}

.progress-step__icon {
  width: 18px;
  text-align: center;
  flex-shrink: 0;
}

/* === Typing Cursor === */
.typing-cursor {
  display: inline-block;
  width: 8px;
  height: 16px;
  background: var(--color-primary);
  margin-left: 2px;
  animation: blink 0.8s infinite;
  vertical-align: text-bottom;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

/* === Quick Actions === */
.quick-actions {
  padding: 8px 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
  flex-shrink: 0;
}

.quick-actions__label {
  font-size: 13px;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.quick-actions__list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.quick-action-chip {
  font-size: 13px;
  padding: 6px 14px;
  background: var(--color-agent-bg);
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  font-family: inherit;
}

.quick-action-chip:hover {
  background: var(--color-primary);
  color: white;
}

/* === Input Area === */
.input-area {
  padding: 12px 20px 16px;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.input-area__wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: 4px 4px 4px 18px;
  transition: border-color 0.15s ease;
}

.input-area__wrapper:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

.input-area__input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 15px;
  padding: 10px 0;
  outline: none;
  font-family: inherit;
  color: var(--color-text);
}

.input-area__input::placeholder {
  color: var(--color-text-muted);
}

.input-area__hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 6px;
  text-align: center;
}

/* === Error Banner === */
.error-banner {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-error-bg);
  border: 1px solid var(--color-error);
  color: var(--color-error);
  padding: 12px 20px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 1000;
  box-shadow: var(--shadow-lg);
  max-width: 600px;
  animation: slideDown 0.3s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.error-banner__text {
  font-size: 14px;
}

.error-banner__close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--color-error);
  padding: 0 4px;
  line-height: 1;
}

/* === Loading Spinner === */
.spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  vertical-align: middle;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* === Empty State === */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--color-text-muted);
  text-align: center;
  gap: 12px;
}

.empty-state__icon {
  font-size: 48px;
  margin-bottom: 8px;
}

.empty-state__title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.empty-state__text {
  font-size: 14px;
  max-width: 400px;
}

/* === Responsive === */
@media (max-width: 640px) {
  .header h1 {
    font-size: 15px;
  }

  .chat-container {
    padding: 12px;
    gap: 12px;
  }

  .message__content {
    padding: 12px 14px !important;
  }

  .input-area {
    padding: 10px 12px 14px;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/css/style.css
git commit -m "feat: add complete CSS styles for chat UI"
```

---

### Task 7: Frontend — State Management

**Files:**
- Modify: `frontend/js/state.js`

- [ ] **Step 1: Write state.js with localStorage persistence**

```javascript
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
```

- [ ] **Step 2: Commit**

```bash
git add frontend/js/state.js
git commit -m "feat: add state management with localStorage persistence"
```

---

### Task 8: Frontend — API Client (SSE)

**Files:**
- Modify: `frontend/js/api.js`

- [ ] **Step 1: Write api.js with SSE streaming support**

```javascript
// api.js — API client for communicating with the Cloudflare Worker via SSE

// Update this to your deployed Worker URL after deployment
let WORKER_BASE_URL = 'http://localhost:8787'; // Default for local dev with wrangler dev

/**
 * Set the Worker base URL (call after deployment to update).
 * @param {string} url
 */
export function setWorkerUrl(url) {
  WORKER_BASE_URL = url;
}

/**
 * Get the current Worker base URL.
 * @returns {string}
 */
export function getWorkerUrl() {
  return WORKER_BASE_URL;
}

/**
 * Send a chat message and receive a streaming response via SSE.
 *
 * @param {object} params
 * @param {string} params.repoUrl - GitHub repository URL
 * @param {Array} params.history - Previous messages for context
 * @param {string|null} params.question - User's question (null for initial analysis)
 * @param {function} params.onChunk - Called with each text chunk as it arrives
 * @param {function} params.onDone - Called when streaming completes
 * @param {function} params.onError - Called with an error message
 * @returns {AbortController} — call .abort() to cancel the request
 */
export function sendChatMessage({ repoUrl, history, question, onChunk, onDone, onError }) {
  const controller = new AbortController();

  fetch(`${WORKER_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      repoUrl,
      history: history || [],
      question: question || null,
    }),
    signal: controller.signal,
  }).then(async (response) => {
    // Handle non-200 responses (these are JSON errors, not streams)
    if (!response.ok) {
      let errMsg = `Request failed (${response.status})`;
      try {
        const errData = await response.json();
        errMsg = errData.error || errMsg;
      } catch (e) {
        // Couldn't parse error JSON
      }
      onError(errMsg);
      return;
    }

    // Read the SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process SSE lines: "data: {...}" or "data: [DONE]"
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6); // Remove "data: " prefix

        // Anthropic stream end signal
        if (data === '[DONE]') {
          onDone();
          return;
        }

        try {
          const parsed = JSON.parse(data);

          // Anthropic SSE format — extract text delta
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            onChunk(parsed.delta.text);
          }
          // Handle other event types that contain text
          else if (parsed.type === 'content_block_start' && parsed.content_block?.text) {
            onChunk(parsed.content_block.text);
          }
          // Message stop event
          else if (parsed.type === 'message_stop') {
            onDone();
            return;
          }
          // Ignore other event types (ping, message_start, etc.)
        } catch (e) {
          // Skip unparseable chunks
        }
      }
    }

    // Stream ended naturally
    onDone();
  }).catch((err) => {
    if (err.name === 'AbortError') return;
    onError(err.message || 'Network error');
  });

  return controller;
}

/**
 * Check if the Worker is reachable.
 * @returns {Promise<boolean>}
 */
export async function checkHealth() {
  try {
    const res = await fetch(`${WORKER_BASE_URL}/api/health`, {
      method: 'GET',
    });
    const data = await res.json();
    return data.status === 'ok';
  } catch (e) {
    return false;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/js/api.js
git commit -m "feat: add SSE API client for Worker communication"
```

---

### Task 9: Frontend — Chat Rendering

**Files:**
- Modify: `frontend/js/chat.js`

- [ ] **Step 1: Write chat.js with DOM rendering and Markdown conversion**

```javascript
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
```

- [ ] **Step 2: Commit**

```bash
git add frontend/js/chat.js
git commit -m "feat: add chat rendering with Markdown and progress animation"
```

---

### Task 10: Frontend — App Entry Point

**Files:**
- Modify: `frontend/js/app.js`

- [ ] **Step 1: Write app.js with event binding and message flow**

```javascript
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
const WORKER_PROD_URL = 'https://github-repo-explorer.REPLACE_ME.workers.dev';
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
```

- [ ] **Step 2: Commit**

```bash
git add frontend/js/app.js
git commit -m "feat: add app entry point with event binding and message flow"
```

---

### Task 11: Integration Test — Local Verification

**Files:**
- No new files

- [ ] **Step 1: Start the Worker locally**

```bash
cd /c/Users/34249/Desktop/github-repo-explorer/worker
npx wrangler dev &
```

- [ ] **Step 2: Start a local HTTP server for the frontend**

```bash
cd /c/Users/34249/Desktop/github-repo-explorer/frontend
python -m http.server 8000 &
# Or use npx serve -l 8000
```

- [ ] **Step 3: Verify health endpoint**

```bash
curl http://localhost:8787/api/health
# Expected: {"status":"ok"}
```

- [ ] **Step 4: Test the chat endpoint (without valid API key, expect Claude error)**

```bash
curl -X POST http://localhost:8787/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"repoUrl":"https://github.com/facebook/react","history":[],"question":null}'
# Expected: error about API key (this is OK — key is set via secrets in production)
```

- [ ] **Step 5: Open the frontend in a browser**

Open `http://localhost:8000` in a browser. Verify:
- Welcome message renders
- Input box is visible
- Styling matches design
- "New Chat" button clears conversation

- [ ] **Step 6: Commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: integration test adjustments"
```

---

### Task 12: Deployment

**Files:**
- Modify: `frontend/js/api.js` (update Worker URL)
- Create: `.gitignore`

- [ ] **Step 1: Create .gitignore**

```
node_modules/
.wrangler/
.DS_Store
Thumbs.db
```

- [ ] **Step 2: Update Worker URL in frontend**

Edit this line in `frontend/js/app.js`:
```javascript
// Change REPLACE_ME to your Cloudflare Workers subdomain
const WORKER_PROD_URL = 'https://github-repo-explorer.YOUR_SUBDOMAIN.workers.dev';
```

- [ ] **Step 3: Create a GitHub repository and push**

```bash
cd /c/Users/34249/Desktop/github-repo-explorer
git remote add origin https://github.com/YOUR_USERNAME/github-repo-explorer.git
git branch -M main
git push -u origin main
```

- [ ] **Step 4: Enable GitHub Pages**

In GitHub repo → Settings → Pages:
- Source: Deploy from a branch
- Branch: `main`, folder: `/frontend`
- Save → wait for deployment

- [ ] **Step 5: Deploy Worker to Cloudflare**

```bash
cd /c/Users/34249/Desktop/github-repo-explorer/worker
npx wrangler deploy
npx wrangler secret put ANTHROPIC_API_KEY
```

- [ ] **Step 6: Verify live deployment**

```bash
# Test health
curl https://github-repo-explorer.YOUR_SUBDOMAIN.workers.dev/api/health

# Test chat
curl -X POST https://github-repo-explorer.YOUR_SUBDOMAIN.workers.dev/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"repoUrl":"https://github.com/facebook/react","history":[],"question":null}'
```

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: finalize deployment configuration"
git push
```

---

## Post-Deployment Verification Checklist

- [ ] GitHub Pages URL loads and renders the chat UI correctly
- [ ] Pasting a GitHub repo URL triggers the Agent response
- [ ] SSE streaming works (text appears progressively)
- [ ] Follow-up questions appear and are clickable
- [ ] "New Chat" button resets the conversation
- [ ] Chat history persists across page refreshes (localStorage)
- [ ] Error banner appears on network failures
- [ ] Worker health endpoint returns `{"status":"ok"}`
- [ ] Worker URL is correctly set for production environment
