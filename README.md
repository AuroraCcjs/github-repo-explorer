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
