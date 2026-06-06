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
