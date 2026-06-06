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
 * Parse a settled Promise result, returning parsed JSON or a fallback value.
 */
async function settledJson(result, fallback = null) {
  return (result.status === 'fulfilled' && result.value.ok)
    ? await result.value.json()
    : fallback;
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

  const errors = [];
  [
    { res: repoRes, label: 'repo metadata' },
    { res: readmeRes, label: 'README' },
    { res: contentsRes, label: 'directory contents' },
    { res: issuesRes, label: 'issues' },
  ].forEach(({ res, label }) => {
    if (res.status === 'rejected') {
      errors.push(`Failed to fetch ${label}: ${res.reason?.message || res.reason}`);
    } else if (!res.value.ok) {
      errors.push(`GitHub API error for ${label}: ${res.value.status} ${res.value.statusText}`);
    }
  });

  const repoData = await settledJson(repoRes);
  const readmeData = await settledJson(readmeRes);
  const contentsData = await settledJson(contentsRes, []);
  const issuesData = await settledJson(issuesRes, []);

  let readmeText = '';
  if (readmeData && readmeData.content) {
    const binaryString = atob(readmeData.content.replace(/\n/g, ''));
    const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
    readmeText = new TextDecoder('utf-8').decode(bytes);
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
    errors: errors.length > 0 ? errors : undefined,
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
        const { repoUrl } = body;
        let { history, question } = body;

        // Validate repoUrl
        if (!repoUrl || typeof repoUrl !== 'string') {
          return new Response(JSON.stringify({ error: 'repoUrl is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

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

        // Build the system prompt
        const systemPrompt = buildSystemPrompt(repoData);

        // Build conversation messages for Claude
        let messages = [{ role: 'user', content: question || `Please analyze the repository ${owner}/${repo} and help me understand it.` }];

        // Include conversation history if provided (last 10 messages max for context)
        if (history && history.length > 0) {
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

        // Stream Claude's response directly to the client as SSE
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
