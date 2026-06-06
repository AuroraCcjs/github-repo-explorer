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
