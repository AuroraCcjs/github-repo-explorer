# GitHub Repo Explorer — Design Spec

**Date:** 2026-06-06
**Status:** Approved

## 1. Overview

A web demo that helps users quickly understand any GitHub repository through an Agent conversation system. Users paste a GitHub repo URL, and the AI agent helps them understand the project's goals, architecture, core modules, development workflow, and how to start contributing.

**Core features:**
1. Quickly understand project goals and overall architecture
2. Learn key modules and core code
3. Understand development workflow and code standards
4. Find suitable entry-level contribution tasks
5. Reduce learning cost for new contributors

**Display format:** Agent dialogue system (chat UI)

## 2. Architecture

```
┌─────────────────────────────┐
│   GitHub Pages (Frontend)    │
│   index.html + CSS + JS     │
│   Pure static, zero build    │
└──────────┬──────────────────┘
           │  POST /api/chat (SSE streaming)
           ▼
┌─────────────────────────────┐
│   Cloudflare Worker (Backend)│
│   - Receive chat requests    │
│   - Call Claude API          │
│   - Call GitHub API          │
│   - Stream response via SSE  │
└──────────┬──────────────────┘
           │
    ┌──────┴──────┐
    ▼             ▼
┌────────┐  ┌──────────┐
│ Claude │  │ GitHub   │
│ API    │  │ API      │
└────────┘  └──────────┘
```

**Key decisions:**
- Frontend: Pure HTML/CSS/JS, hosted on GitHub Pages, zero dependencies
- Backend: Cloudflare Workers (free tier: 100K requests/day)
- AI: Claude API (streaming via SSE)
- Data: GitHub API for real repository metadata
- API Key stored in Cloudflare Secrets, never exposed to frontend

## 3. Frontend Design

### 3.1 UI Layout

```
┌─────────────────────────────────────────────┐
│  🤖 GitHub Repo Explorer          [New Chat]│  Header
├─────────────────────────────────────────────┤
│                                             │
│  ┌─ Agent message ───────────────────────┐  │
│  │ Welcome + instructions                │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌─ User message ────────────────────────┐  │
│  │ https://github.com/owner/repo         │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌─ Agent message (streaming) ───────────┐  │
│  │ ✅ Fetch repo info    Done             │  │
│  │ ⏳ Analyze structure   In progress...  │  │
│  │ ⬜ Generate guide      Pending         │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌─ Agent message (result) ──────────────┐  │
│  │ ## Project Overview: React             │  │
│  │ Markdown content...                    │  │
│  │ [Core Modules] [Architecture] [Tasks]  │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  [Suggested: What are the core modules?]    │
│  ┌─────────────────────────────────────┐   │
│  │ 💬 Ask a question or paste URL...  │✈│   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### 3.2 Components

- **Chat messages** — auto-scroll to bottom, typing animation, Markdown rendering (using marked.js or simple regex)
- **Input box** — Enter to send, auto-detect GitHub URL, loading state
- **Quick follow-ups** — clickable preset questions, context-aware
- **State management** — localStorage persistence of chat history

### 3.3 States to Handle

| State | Behavior |
|-------|----------|
| Empty | Welcome message with instructions |
| Loading | Animated progress steps, disabled input |
| Streaming | Text appears character by character, auto-scroll |
| Error | Red error banner, retry button |
| Empty URL | Validation hint |

### 3.4 File Structure

```
frontend/
├── index.html
├── css/
│   └── style.css          # All styles, CSS variables for theming
└── js/
    ├── app.js             # Entry point, event binding
    ├── chat.js            # Chat rendering, typing animation
    ├── api.js             # Worker API calls (SSE handling)
    └── state.js           # State management + localStorage
```

## 4. Backend Design (Cloudflare Worker)

### 4.1 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Send message, receive SSE stream |
| `/api/health` | GET | Health check |

### 4.2 Worker Logic Flow

```
1. Receive POST /api/chat with { repoUrl, history[], question }
2. Parse repoUrl → extract owner/repo
3. Call GitHub API:
   - GET /repos/{owner}/{repo} → repo metadata
   - GET /repos/{owner}/{repo}/readme → README content
   - GET /repos/{owner}/{repo}/contents/ → directory structure
   - GET /repos/{owner}/{repo}/issues?labels=good-first-issue
4. Build System Prompt with repo data + 5-topic requirements
5. Call Claude API (streaming)
6. Forward Claude's SSE stream to frontend chunk by chunk
```

### 4.3 System Prompt Design

The system prompt instructs Claude to:
- Act as a friendly open-source navigator assistant
- Organize responses around the 5 core topics
- Output structured Markdown (headings, code blocks, tables, lists)
- Guide users to explore deeper through follow-up questions
- Use the injected GitHub repo data for accurate analysis
- Suggest 2-3 follow-up questions at the end of each response

### 4.4 Environment Variables (Cloudflare Secrets)

- `ANTHROPIC_API_KEY` — Claude API key
- `GITHUB_TOKEN` — GitHub personal access token (optional, for higher rate limits)

### 4.5 File Structure

```
worker/
├── wrangler.toml           # Cloudflare Wrangler config
└── src/
    └── index.js            # Worker entry point
```

## 5. Data Flow

```
User pastes URL
     │
     ▼
Frontend: POST /api/chat { repoUrl, question: null }
     │
     ▼
Worker: GitHub API → repo metadata + README + structure + issues
     │
     ▼
Worker: Build System Prompt (repo data injected)
     │
     ▼
Worker: Claude API streaming request
     │
     ▼ (SSE chunks)
Frontend: Render chunks with typing animation
     │
     ▼
User asks follow-up question
     │
     ▼
Frontend: POST /api/chat { repoUrl, history[], question }
     │
     ▼
Worker: Claude API (with conversation history)
     │
     ▼ (SSE chunks)
Frontend: Render response
```

## 6. Deployment Plan

| Component | Platform | URL |
|-----------|----------|-----|
| Frontend | GitHub Pages | `https://<username>.github.io/github-repo-explorer` |
| Backend | Cloudflare Workers | `https://github-repo-explorer.<subdomain>.workers.dev` |

**Deployment steps:**
1. Create GitHub repo, push frontend code → auto-deploy via GitHub Pages
2. Run `npx wrangler deploy` → deploy Worker to Cloudflare
3. Configure Worker secrets: `wrangler secret put ANTHROPIC_API_KEY`
4. Update frontend API endpoint to point to Worker URL

## 7. Non-Goals (Out of Scope)

- User authentication / multi-user support
- Persistent chat history on server side (localStorage only)
- Repository index caching (call GitHub API each time)
- Mobile app version
- Dark mode (nice-to-have, not required)
