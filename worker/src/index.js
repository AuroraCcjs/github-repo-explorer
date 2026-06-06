/**
 * Fetch repository metadata from GitHub API.
 * Returns an object with owner, repo, metadata, readme, directory tree, and issues.
 */
async function settledJson(result, fallback = null) {
  return (result.status === 'fulfilled' && result.value.ok)
    ? await result.value.json()
    : fallback;
}

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

  // Parse responses, gracefully handle failures, and collect errors
  const errors = [];
  const repoData = await settledJson(repoRes, null);
  if (!repoData) errors.push('repo metadata fetch failed');
  const readmeData = await settledJson(readmeRes, null);
  if (!readmeData) errors.push('README fetch failed');
  const contentsData = await settledJson(contentsRes, []);
  if (!Array.isArray(contentsData) || contentsData.length === 0) errors.push('contents fetch failed or empty');
  const issuesData = await settledJson(issuesRes, []);
  if (!Array.isArray(issuesData) || issuesData.length === 0) errors.push('issues fetch failed or empty');

  // Decode base64 README content with proper UTF-8 handling
  let readmeText = '';
  if (readmeData && readmeData.content) {
    const binaryString = atob(readmeData.content.replace(/\n/g, ''));
    const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
    readmeText = new TextDecoder('utf-8').decode(bytes);
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

        const repoData = await fetchRepoData(owner, repo, env.GITHUB_TOKEN);

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
